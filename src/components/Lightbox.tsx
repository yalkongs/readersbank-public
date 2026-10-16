"use client";

import { useEffect, useRef, useState } from "react";
import { isPublicBlobImage } from "@/lib/sw-rules";

export function Lightbox({ src, caption, onClose }: { src: string; caption?: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<"" | "is-open" | "is-closing">("");
  const closingRef = useRef(false);
  // 닫힘 전환(150ms)을 보여 준 뒤 부모에게 닫기를 알린다.
  const requestClose = useRef(() => {});
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
    requestClose.current = () => {
      if (closingRef.current) return;
      closingRef.current = true;
      setPhase("is-closing");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => onCloseRef.current(), reduce ? 0 : 150);
    };
  }, [onClose]);

  useEffect(() => {
    // 시작 상태를 한 번 그린 뒤 열림 클래스를 붙여야 Safari에서도 전환이 재생된다(usePresence와 같은 방식).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("is-open"));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose.current();
      if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={caption ?? "그림 확대"}
      className={`lightbox t-backdrop ${phase}`}
      onClick={() => requestClose.current()}
    >
      <button ref={closeRef} type="button" className="lightbox-close" onClick={() => requestClose.current()}>
        닫기
      </button>
      <figure className={`t-modal ${phase}`} onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption ?? ""} crossOrigin={isPublicBlobImage(src) ? "anonymous" : undefined} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    </div>
  );
}
