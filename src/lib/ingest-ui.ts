// Client-safe display helpers for the ingest (새 글) screen.
import type { FileKind } from "@/lib/extract/file-kind";
import { classifyInput, parseGoogleDocId } from "@/lib/input";

export type RecentStatus = "queued" | "processing" | "published" | "failed";
export type StatusTone = "muted" | "accent" | "success" | "danger";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function describeInput(raw: string): { kind: "url" | "notion" | "text"; label: string } | null {
  if (!raw.trim()) return null;
  const c = classifyInput(raw);
  if (c.type === "url") return { kind: "url", label: parseGoogleDocId(c.url) ? "Google 문서" : "웹 페이지" };
  if (c.type === "notion") return { kind: "notion", label: "Notion" };
  return { kind: "text", label: `텍스트 · ${groupDigits(Array.from(c.text).length)}자` };
}

const STATUS: Record<RecentStatus, { label: string; tone: StatusTone }> = {
  queued: { label: "대기", tone: "muted" },
  processing: { label: "처리 중", tone: "accent" },
  published: { label: "게시됨", tone: "success" },
  failed: { label: "실패", tone: "danger" },
};

export function statusLabel(row: { status: RecentStatus; progress: string | null }): { label: string; tone: StatusTone } {
  const s = STATUS[row.status];
  if (row.status === "processing" && row.progress) return { ...s, label: `${s.label} · ${row.progress}` };
  return s;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

export function recentTitle(row: {
  slug: string;
  titleKo: string | null;
  titleOriginal: string | null;
  sourceUrl: string | null;
  sourceFileName: string | null;
}): string {
  if (row.titleKo) return row.titleKo;
  if (row.titleOriginal) return row.titleOriginal;
  if (row.sourceUrl) return hostOf(row.sourceUrl) ?? row.sourceUrl;
  if (row.sourceFileName) return row.sourceFileName;
  return row.slug;
}

export function previewTitle(input: string, fileName: string | null): string {
  if (fileName) return fileName;
  const c = classifyInput(input);
  if (c.type !== "text") return hostOf(c.url) ?? c.url;
  const flat = c.text.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length > 40 ? `${chars.slice(0, 40).join("")}…` : flat;
}

const BADGE: Record<FileKind, string> = { pdf: "PDF", docx: "DOCX", html: "HTML", md: "MD", text: "TXT" };

export function fileBadge(kind: FileKind): string {
  return BADGE[kind];
}

// 등록 폼이 성공 후 보내는 window 이벤트. 최근 등록 목록이 듣고 새로고침한다.
export const INGEST_SUBMITTED_EVENT = "readersbank:ingest-submitted";
