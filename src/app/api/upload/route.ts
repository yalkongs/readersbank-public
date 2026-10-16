import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isOwner } from "@/lib/auth/session";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async () => {
        if (!(await isOwner())) throw new Error("로그인이 필요합니다");
        return {
          allowedContentTypes: [
            "text/plain",
            "text/markdown",
            "text/html",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/octet-stream",
          ],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "업로드 준비에 실패했습니다" }, { status: 400 });
  }
}
