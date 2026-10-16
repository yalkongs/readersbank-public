// Browser-safe (no jsdom/pdf deps): shared by the upload form and the server extractors.
export type FileKind = "text" | "md" | "html" | "docx" | "pdf";

const BY_EXT: Record<string, FileKind> = {
  txt: "text",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  docx: "docx",
  pdf: "pdf",
};

const BY_TYPE: Record<string, FileKind> = {
  "text/plain": "text",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
};

export function fileKind(name: string, contentType: string): FileKind | null {
  const dot = name.lastIndexOf(".");
  if (dot >= 0) {
    const byExt = BY_EXT[name.slice(dot + 1).toLowerCase()];
    if (byExt) return byExt;
  }
  return BY_TYPE[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

const CANONICAL_TYPE: Record<FileKind, string> = {
  text: "text/plain",
  md: "text/markdown",
  html: "text/html",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

// 브라우저마다 다른 file.type 대신, 판별한 종류에 맞는 표준 MIME 형식을 쓴다.
export function canonicalContentType(kind: FileKind): string {
  return CANONICAL_TYPE[kind];
}
