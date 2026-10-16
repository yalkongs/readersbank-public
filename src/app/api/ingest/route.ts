import { del, put } from "@vercel/blob";
import { start } from "workflow/api";
import { duplicateResponse } from "@/lib/articles/dedup";
import { createArticle, findBySourceUrl, updateArticle } from "@/lib/articles/repo";
import { verifyApiToken } from "@/lib/auth/api-token";
import { isOwner } from "@/lib/auth/session";
import { fileKind } from "@/lib/extract/file";
import { canonicalContentType } from "@/lib/extract/file-kind";
import { bodyTooLarge, sanitizeUploadName } from "@/lib/multipart";
import { classifyInput, IngestBodySchema, isBlobUrl } from "@/lib/input";
import { processArticle } from "@/workflows/process-article";

const UNSUPPORTED_FILE = "지원하지 않는 파일 형식입니다. txt, md, html, docx, pdf만 올릴 수 있습니다.";

// Vercel 함수 본문 한도(4.5MB) 안쪽. 더 큰 파일은 관리 화면의 직접 업로드를 쓴다.
const MAX_MULTIPART_FILE_BYTES = 4 * 1024 * 1024;

async function authorized(request: Request): Promise<boolean> {
  if (await isOwner()) return true;
  try {
    return (await verifyApiToken(request.headers.get("authorization"))) !== null;
  } catch (err) {
    console.error("[ingest] 토큰 확인 중 오류", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

// multipart 본문(필드 input 또는 file)을 JSON 본문과 같은 모양으로 바꾼다. 파일은 Blob에 올려 주소로 대체한다.
async function readMultipart(request: Request): Promise<{ body: unknown; uploadedUrl?: string } | { response: Response }> {
  if (bodyTooLarge(request.headers.get("content-length"))) {
    return { response: Response.json({ error: "파일이 너무 큽니다. 4MB 이하로 보내 주세요." }, { status: 413 }) };
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { response: Response.json({ error: "multipart 본문을 읽지 못했습니다" }, { status: 400 }) };
  }
  const input = form.get("input");
  const file = form.get("file");
  const visibility = form.get("isPublic");
  const base: Record<string, unknown> = {};
  if (visibility === "true" || visibility === "false") base.isPublic = visibility === "true";
  if (file instanceof File) {
    if (typeof input === "string" && input) {
      return { response: Response.json({ error: "input과 file 중 하나만 보내 주세요" }, { status: 400 }) };
    }
    if (file.size > MAX_MULTIPART_FILE_BYTES) {
      return { response: Response.json({ error: "파일이 너무 큽니다. 4MB 이하로 보내 주세요." }, { status: 413 }) };
    }
    const kind = fileKind(file.name, file.type);
    if (!kind) return { response: Response.json({ error: UNSUPPORTED_FILE }, { status: 400 }) };
    const contentType = canonicalContentType(kind);
    try {
      const blob = await put(`uploads/${sanitizeUploadName(file.name)}`, file, { access: "public", addRandomSuffix: true, contentType });
      return { body: { ...base, file: { url: blob.url, name: file.name, contentType } }, uploadedUrl: blob.url };
    } catch {
      return { response: Response.json({ error: "파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 }) };
    }
  }
  return { body: { ...base, input: typeof input === "string" ? input : undefined } };
}

// 등록에 실패해 아무 글도 가리키지 않게 된 업로드 파일을 지운다(best-effort).
async function discardUpload(url: string) {
  try {
    await del(url);
  } catch (err) {
    console.error("[ingest] 업로드 파일 정리 실패", err instanceof Error ? err.message : "unknown");
  }
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return Response.json({ error: "로그인이 필요합니다" }, { status: 401 });

  let body: unknown;
  let uploadedUrl: string | undefined;
  if ((request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    const r = await readMultipart(request);
    if ("response" in r) return r.response;
    body = r.body;
    uploadedUrl = r.uploadedUrl;
  } else {
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "JSON 또는 multipart 본문이 필요합니다" }, { status: 400 });
    }
  }
  // 여기서 올린 파일은 글 행이 그 주소를 갖게 된 뒤에만 남긴다. 검증·생성에 실패하면 지운다.
  let keepUpload = false;
  try {
    return await ingest(body, () => {
      keepUpload = true;
    });
  } catch (err) {
    console.error("[ingest] 글 등록 실패", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "글을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  } finally {
    if (uploadedUrl && !keepUpload) await discardUpload(uploadedUrl);
  }
}

async function ingest(body: unknown, onFileSaved: () => void): Promise<Response> {
  const parsed = IngestBodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "입력이 올바르지 않습니다. 텍스트 또는 파일 중 하나만 보내 주세요" }, { status: 400 });

  const isPublic = parsed.data.isPublic ?? true;
  let created: { id: string; slug: string };
  if (parsed.data.file) {
    const file = parsed.data.file;
    const kind = fileKind(file.name, file.contentType);
    if (!kind) return Response.json({ error: UNSUPPORTED_FILE }, { status: 400 });
    if (!isBlobUrl(file.url)) {
      return Response.json({ error: "업로드한 파일 주소가 올바르지 않습니다" }, { status: 400 });
    }
    created = await createArticle({
      sourceType: kind === "docx" ? "docx" : kind === "pdf" ? "pdf" : "text",
      sourceUrl: null,
      sourceText: null,
      sourceFileBlob: file.url,
      fileName: file.name,
      fileContentType: file.contentType,
      isPublic,
    });
    onFileSaved();
  } else {
    const kind = classifyInput(parsed.data.input ?? "");
    if (kind.type === "url" || kind.type === "notion") {
      const existing = await findBySourceUrl(kind.url);
      const dup = duplicateResponse(existing);
      if (dup) return Response.json(dup.body, { status: dup.status });
    }
    created = await createArticle({
      sourceType: kind.type,
      sourceUrl: kind.type === "text" ? null : kind.url,
      sourceText: kind.type === "text" ? kind.text : null,
      isPublic,
    });
  }
  try {
    await start(processArticle, [created.id]);
  } catch {
    const error = "처리를 시작하지 못했습니다. 잠시 후 다시 등록해 주세요.";
    await updateArticle(created.id, { status: "failed", error });
    return Response.json({ error }, { status: 500 });
  }
  return Response.json({ ...created, status: "queued" }, { status: 202 });
}
