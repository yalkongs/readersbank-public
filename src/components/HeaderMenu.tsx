"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminHref } from "@/components/AdminLink";
import { ReaderSettingsControls, useReaderSettings } from "@/components/ReaderSettings";
import { MAX_TOPIC_CHARS } from "@/lib/discover";
import { usePresence } from "@/lib/use-presence";

const row =
  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-[var(--line)] active:bg-[var(--line)]";

/** 헤더의 메뉴(햄버거, 열리면 X). 검색·관리(소유자)·읽기 설정을 한 패널에 모은다. */
export function HeaderMenu({ owner }: { owner: boolean }) {
  const [open, setOpen] = useState(false);
  const reader = useReaderSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panel = usePresence(open, 150);
  const admin = adminHref(pathname);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  function discover(e: React.FormEvent) {
    e.preventDefault();
    const t = topic.trim();
    if (!t) return;
    setTopic("");
    close();
    router.push(`/admin/discover?q=${encodeURIComponent(t)}`);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="메뉴"
        title="메뉴"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] transition-colors after:absolute after:-inset-0.5 after:content-[''] hover:bg-[var(--line)] hover:text-[var(--fg)] aria-expanded:bg-[var(--line)] aria-expanded:text-[var(--fg)]"
      >
        <span className="t-icon-swap" data-state={open ? "b" : "a"}>
          <svg className="t-icon" data-icon="a" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <svg className="t-icon" data-icon="b" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </span>
      </button>
      {panel.mounted && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="메뉴"
          aria-hidden={!open || undefined}
          inert={!open || undefined}
          data-origin="top-right"
          className={`t-dropdown ${panel.stateClass} absolute right-0 top-full z-20 mt-2 max-h-[calc(100dvh-6rem)] w-72 max-w-[calc(100vw-2.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2 text-[var(--fg)] shadow-lg`}
        >
          <nav className="flex flex-col">
            <Link href="/search" onClick={close} className={row}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              검색
            </Link>
            {owner && (
              <Link href={admin} onClick={close} className={row}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h10M4 18h7" />
                  <path d="m16 15 2 2 4-4" />
                </svg>
                {admin === "/admin" ? "관리" : "이 글 관리"}
              </Link>
            )}
          </nav>
          {owner && (
            <form onSubmit={discover} role="search" className="mt-2 border-t border-[var(--line)] px-2 pb-1 pt-3">
              <div className="flex gap-1.5">
                <input
                  aria-label="주제로 새 글 찾기"
                  type="search"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  maxLength={MAX_TOPIC_CHARS}
                  placeholder="주제로 새 글 찾기"
                  enterKeyHint="search"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={!topic.trim()}
                  className="h-10 shrink-0 rounded-lg bg-[var(--accent)] px-3.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                >
                  찾기
                </button>
              </div>
            </form>
          )}
          <div className="mt-2 space-y-4 border-t border-[var(--line)] px-2 pb-2 pt-3">
            <p className="text-[13px] font-semibold text-[var(--muted)]">읽기 설정</p>
            <ReaderSettingsControls {...reader} />
          </div>
          <div className="mt-1 border-t border-[var(--line)] pt-1">
            <Link href="/about" onClick={close} className="flex h-10 items-center rounded-lg px-3 text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--line)] hover:text-[var(--fg)] active:bg-[var(--line)]">
              ReadersBank 소개
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
