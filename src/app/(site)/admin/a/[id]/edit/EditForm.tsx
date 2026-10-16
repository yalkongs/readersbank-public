"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { MAX_BODY, MAX_TITLE } from "@/lib/articles/edit";
import { saveEditAction } from "../../../actions";
import { AlertIcon, focusRing } from "../../../ui";

const inputBase =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--muted)]";

const SYNTAX: [string, string][] = [
  ["빈 줄", "문단 나누기"],
  ["## 소제목", "소제목 (### 작은 소제목)"],
  ["**굵게** *기울임*", "강조"],
  ["[글자](https://…)", "링크"],
  ["> 인용", "인용문"],
  ["- 항목 / 1. 항목", "목록 · 번호 목록"],
  ["![설명](https://…)", "그림"],
  ["https://youtu.be/…", "유튜브 영상 (주소만 한 줄에)"],
  ["---", "구분선"],
  ["```", "코드 (앞뒤로 감싸기)"],
];

export function EditForm({ id, slug, initialTitle, initialBody }: { id: string; slug: string; initialTitle: string; initialBody: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const titleChanged = title !== initialTitle;
  const bodyChanged = body !== initialBody;
  const dirty = titleChanged || bodyChanged;

  // 본문 칸을 내용 높이에 맞춘다. 스크롤 위치가 튀지 않게 페이지 스크롤로 읽는다.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const y = window.scrollY;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
    window.scrollTo({ top: y });
  }, [body]);

  // 저장하지 않은 편집이 있으면 창을 닫을 때 확인한다.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const r = await saveEditAction(id, title, body);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setSaved(true);
        router.push(`/admin/a/${id}`);
        router.refresh();
      } catch {
        setError("서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !pending) save();
      }}
    >
      <label htmlFor="edit-title" className="mb-1.5 block text-[13px] font-semibold text-[var(--muted)]">
        제목
      </label>
      <textarea
        id="edit-title"
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
        maxLength={MAX_TITLE}
        rows={2}
        className={`${inputBase} resize-none py-2.5 text-lg font-bold leading-snug`}
      />

      <div className="mb-1.5 mt-8 flex items-baseline justify-between gap-3">
        <label htmlFor="edit-body" className="text-[13px] font-semibold text-[var(--muted)]">
          본문
        </label>
        {bodyChanged && <span className="text-[12px] font-semibold text-[var(--accent)]">수정됨</span>}
      </div>
      <details className="mb-3 rounded-xl border border-[var(--line)] px-3 py-2 text-[13px]">
        <summary className="cursor-pointer text-[var(--muted)]">쓰는 법</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 pb-1">
          {SYNTAX.map(([code, desc]) => (
            <div key={code} className="contents">
              <dt>
                <code className="rounded bg-[var(--line)] px-1.5 py-0.5 font-mono text-[12px]">{code}</code>
              </dt>
              <dd className="text-[var(--muted)]">{desc}</dd>
            </div>
          ))}
        </dl>
      </details>
      <textarea
        id="edit-body"
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_BODY}
        rows={12}
        spellCheck={false}
        className={`${inputBase} resize-none overflow-hidden py-3 text-[15px] leading-relaxed ${bodyChanged ? "border-[var(--accent)]" : ""}`}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-5 py-3">
          <p className="min-w-0 flex-1 text-[13px] text-[var(--muted)]" aria-live="polite">
            {error ? (
              <span role="alert" className="flex items-start gap-1.5 text-[var(--accent)]">
                <span className="mt-px shrink-0">
                  <AlertIcon />
                </span>
                {error}
              </span>
            ) : saved ? (
              "저장했어요"
            ) : dirty ? (
              [titleChanged && "제목", bodyChanged && "본문"].filter(Boolean).join("·") + " 수정됨"
            ) : (
              "바뀐 내용이 없어요"
            )}
          </p>
          <Link href={`/a/${slug}`} target="_blank" className={`flex h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm ${focusRing}`}>
            글 보기
          </Link>
          <button
            type="submit"
            disabled={!dirty || pending}
            className={`flex h-11 items-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </form>
  );
}
