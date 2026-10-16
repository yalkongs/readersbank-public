import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }));
vi.mock("workflow/api", () => ({ start: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ isOwner: vi.fn(async () => true) }));
vi.mock("@/lib/auth/api-token", () => ({ verifyApiToken: vi.fn() }));
vi.mock("@/lib/articles/repo", () => ({ createArticle: vi.fn(), findBySourceUrl: vi.fn(), updateArticle: vi.fn() }));
vi.mock("@/workflows/process-article", () => ({ processArticle: vi.fn() }));

import { del, put } from "@vercel/blob";
import { start } from "workflow/api";
import { createArticle } from "@/lib/articles/repo";
import { POST } from "@/app/api/ingest/route";

const BLOB_URL = "https://abc.public.blob.vercel-storage.com/uploads/a-xyz.md";

function multipart(name: string) {
  const form = new FormData();
  form.set("file", new File(["# 제목\n\n본문"], name, { type: "text/markdown" }));
  return new Request("http://localhost/api/ingest", { method: "POST", body: form });
}

beforeEach(() => {
  vi.mocked(put).mockReset().mockResolvedValue({ url: BLOB_URL } as never);
  vi.mocked(del).mockReset().mockResolvedValue(undefined);
  vi.mocked(createArticle).mockReset().mockResolvedValue({ id: "id1", slug: "s1" });
  vi.mocked(start).mockReset().mockResolvedValue({} as never);
});

describe("POST /api/ingest multipart", () => {
  it("keeps the uploaded blob when the article is created", async () => {
    const res = await POST(multipart("a.md"));
    expect(res.status).toBe(202);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes the uploaded blob when validation fails after the upload", async () => {
    const res = await POST(multipart(`${"a".repeat(310)}.md`));
    expect(res.status).toBe(400);
    expect(put).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith(BLOB_URL);
  });

  it("deletes the uploaded blob when creating the article fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createArticle).mockRejectedValue(new Error("db down"));
    const res = await POST(multipart("a.md"));
    expect(res.status).toBe(500);
    expect(del).toHaveBeenCalledWith(BLOB_URL);
    err.mockRestore();
  });

  it("does not fail the response when deleting the blob fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(del).mockRejectedValue(new Error("blob down"));
    const res = await POST(multipart(`${"a".repeat(310)}.md`));
    expect(res.status).toBe(400);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
