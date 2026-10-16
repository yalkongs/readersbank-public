"use client";

import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { useLayoutEffect, useRef, useState } from "react";
import { canonicalContentType, fileKind, type FileKind } from "@/lib/extract/file-kind";
import { describeInput, fileBadge, formatBytes, INGEST_SUBMITTED_EVENT, previewTitle } from "@/lib/ingest-ui";

type Result = { ok: true; title: string } | { ok: false; error: string; slug?: string };

const FILE_LABEL: Record<FileKind, string> = { text: "텍스트 파일", md: "텍스트 파일", html: "HTML 파일", docx: "Word 파일", pdf: "PDF 파일" };
const MAX_BYTES = 25 * 1024 * 1024;

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";
const iconButton = `flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--line)] hover:text-[var(--fg)] disabled:opacity-40 ${focusRing}`;

function Icon({ children, size = 16, className }: { children: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

const ClipboardIcon = () => (
  <Icon size={15}>
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M16 5h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
  </Icon>
);
const LinkIcon = () => (
  <Icon size={14}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);
const TextIcon = () => (
  <Icon size={14}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Icon>
);
const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
const UploadIcon = () => (
  <Icon size={20}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m17 8-5-5-5 5M12 3v12" />
  </Icon>
);
const LockIcon = ({ size = 14 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);
const CheckIcon = () => (
  <Icon size={24} className="stroke-[2]">
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const AlertIcon = () => (
  <Icon size={18}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>
);
const Spinner = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export function IngestForm() {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);

  const detected = !file ? describeInput(input) : null;
  const kind = file ? fileKind(file.name, file.type) : null;
  const canSubmit = !busy && (file !== null || input.trim() !== "");
  const done = result?.ok === true;

  // 내용에 맞춰 textarea 높이를 늘린다(최대 높이는 CSS max-h가 정한다).
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input, file, done]);

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!fileKind(f.name, f.type)) {
      setFile(null);
      setResult({ ok: false, error: "지원하지 않는 파일 형식입니다. txt, md, html, docx, pdf만 올릴 수 있습니다." });
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setResult({ ok: false, error: "파일이 너무 큽니다. 25MB 이하만 올릴 수 있습니다." });
      return;
    }
    setResult(null);
    setFile(f);
  }

  function clearFile() {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function paste() {
    setPasteHint(false);
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        setResult(null);
      }
      textarea.current?.focus();
    } catch {
      setPasteHint(true);
      textarea.current?.focus();
    }
  }

  function reset() {
    setResult(null);
    setInput("");
    clearFile();
    setPasteHint(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    const title = previewTitle(input, file?.name ?? null);
    try {
      let payload: object;
      if (file) {
        const kind = fileKind(file.name, file.type);
        const contentType = kind ? canonicalContentType(kind) : "application/octet-stream";
        setProgress(0);
        const blob = await upload(`uploads/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          contentType,
          onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
        });
        payload = { file: { url: blob.url, name: file.name, contentType }, isPublic };
      } else payload = { input, isPublic };
      setProgress(null);
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, title });
        setInput("");
        clearFile();
        window.dispatchEvent(new Event(INGEST_SUBMITTED_EVENT));
      } else setResult({ ok: false, error: data.error ?? "등록에 실패했습니다", slug: data.slug });
    } catch (err) {
      setResult({ ok: false, error: file ? `파일을 올리지 못했습니다${err instanceof Error ? `: ${err.message}` : ""}` : "네트워크 오류로 등록하지 못했습니다" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--summary-bg)] px-6 py-10 text-center" role="status">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,#16a34a_14%,transparent)] text-[color-mix(in_srgb,#16a34a_80%,var(--fg))]">
          <CheckIcon />
        </span>
        <h2 className="mt-4 text-lg font-bold">등록했어요</h2>
        <p className="mx-auto mt-1 max-w-sm truncate text-[15px]">{result.title}</p>
        <p className="mt-2 text-[13px] text-[var(--muted)]">처리 중이에요. 보통 1–3분 걸려요.</p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/admin"
            className={`flex h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--bg)] px-5 text-sm font-medium transition-colors hover:border-[var(--muted)] ${focusRing}`}
          >
            관리 목록에서 보기
          </Link>
          <button
            type="button"
            onClick={reset}
            className={`flex h-11 items-center justify-center rounded-xl border border-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] ${focusRing}`}
          >
            하나 더 등록
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current += 1;
        if (!busy) setDragging(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (busy) return;
        pickFile(e.dataTransfer.files[0]);
      }}
      className="flex flex-col gap-6"
    >
      <input
        ref={fileInput}
        type="file"
        accept=".txt,.md,.markdown,.html,.htm,.docx,.pdf"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

      <div className="flex flex-col gap-3">
        {file ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--summary-bg)] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[10px] font-bold tracking-wider text-[var(--accent)]">
                {kind ? fileBadge(kind) : "FILE"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                  {formatBytes(file.size)} · {FILE_LABEL[kind ?? "text"]}
                </p>
              </div>
              <button type="button" onClick={clearFile} disabled={busy} aria-label="파일 빼기" title="파일 빼기" className={iconButton}>
                <CloseIcon />
              </button>
            </div>
            {progress !== null && (
              <div className="mt-4 flex items-center gap-3">
                <div
                  className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--line)]"
                  role="progressbar"
                  aria-label="업로드 진행률"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${progress}%` }} />
                </div>
                <span className="w-10 text-right text-xs tabular-nums text-[var(--muted)]">{progress}%</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--summary-bg)] transition-colors focus-within:border-[var(--muted)]">
            <div className="flex items-center justify-end pl-4 pr-2 pt-2">
              <button
                type="button"
                onClick={paste}
                disabled={busy}
                className={`flex h-8 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 text-[13px] font-medium text-[var(--fg)] transition-colors hover:border-[var(--muted)] disabled:opacity-40 ${focusRing}`}
              >
                <ClipboardIcon />
                붙여넣기
              </button>
            </div>
            <textarea
              id="ingest-input"
              aria-label="링크 · 글"
              ref={textarea}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setPasteHint(false);
              }}
              rows={6}
              placeholder="링크나 글을 붙여넣으세요"
              disabled={busy}
              className="block max-h-[27rem] w-full resize-none overflow-y-auto bg-transparent px-4 py-2 text-base leading-relaxed text-[var(--fg)] outline-none placeholder:text-[var(--muted)] disabled:opacity-60"
            />
            <div className="flex h-12 items-center justify-between gap-2 pl-3 pr-2">
              {detected ? (
                <span className="flex h-7 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--bg)] px-2.5 text-[13px] text-[var(--muted)]">
                  {detected.kind === "text" ? <TextIcon /> : <LinkIcon />}
                  {detected.label}
                </span>
              ) : (
                <span className="px-1 text-[13px] text-[var(--muted)]" aria-live="polite">
                  {pasteHint ? "클립보드를 읽을 수 없어요. 직접 붙여넣어 주세요." : ""}
                </span>
              )}
              {input && (
                <button
                  type="button"
                  onClick={() => {
                    setInput("");
                    textarea.current?.focus();
                  }}
                  disabled={busy}
                  aria-label="내용 지우기"
                  title="내용 지우기"
                  className={iconButton}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>
        )}

        {!file && (
          <>
            <div className="flex items-center gap-3 text-xs text-[var(--muted)]" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--line)]" />
              또는
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-dashed px-6 py-7 text-center transition-colors disabled:opacity-40 ${
                dragging
                  ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                  : "border-[var(--line)] hover:border-[var(--muted)]"
              } ${focusRing}`}
            >
              <span
                className={`mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--summary-bg)] ${dragging ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
              >
                <UploadIcon />
              </span>
              <span className="text-[15px] font-semibold">{dragging ? "여기에 놓으세요" : "파일 올리기"}</span>
              <span className="text-[13px] text-[var(--muted)]">PDF · Word · HTML · 텍스트, 최대 25MB</span>
            </button>
          </>
        )}
      </div>

      {result && !result.ok && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-l-[3px] border-[var(--line)] border-l-[var(--accent)] bg-[var(--summary-bg)] px-4 py-3 text-sm leading-relaxed"
        >
          <span className="mt-0.5 shrink-0 text-[var(--accent)]">
            <AlertIcon />
          </span>
          <div className="min-w-0">
            <p>{result.error}</p>
            {result.slug && (
              <Link href={`/a/${result.slug}`} className="mt-1 inline-block font-medium text-[var(--accent)] underline-offset-2 hover:underline">
                기존 글 보기 →
              </Link>
            )}
          </div>
        </div>
      )}

      <div>
        <div role="group" aria-label="공개 범위" className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--summary-bg)] p-1">
          {[
            { value: true, label: "공개" },
            { value: false, label: "비공개" },
          ].map((opt) => {
            const active = isPublic === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={active}
                onClick={() => setIsPublic(opt.value)}
                disabled={busy}
                className={`flex h-9 min-w-20 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors ${
                  active ? "bg-[var(--bg)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--line)]" : "text-[var(--muted)] hover:text-[var(--fg)]"
                } ${focusRing}`}
              >
                {!opt.value && <LockIcon />}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-[var(--line)] bg-[var(--bg)]/90 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <button
          type="submit"
          disabled={!canSubmit}
          aria-busy={busy}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-[15px] font-semibold text-[var(--bg)] transition ${
            busy ? "cursor-progress" : canSubmit ? "hover:brightness-110 active:brightness-95" : "cursor-not-allowed opacity-40"
          } ${focusRing}`}
        >
          {busy && <Spinner />}
          {busy ? (progress !== null ? `업로드 중 ${progress}%` : "등록 중…") : "등록"}
        </button>
      </div>
    </form>
  );
}
