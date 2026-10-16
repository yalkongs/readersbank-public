"use client";

import { useScrollHide } from "@/lib/use-scroll-hide";

// 아래로 읽어 내려가면 헤더를 숨기고, 위로 올리거나 맨 위에 오면 다시 보인다.
// 메뉴가 열려 있거나 헤더 안에 포커스가 있으면 숨기지 않는다(globals.css의 .rb-header).
export function AutoHideHeader({ children }: { children: React.ReactNode }) {
  const { hidden, scrolled } = useScrollHide();
  return (
    <header
      data-hidden={hidden || undefined}
      data-scrolled={scrolled || undefined}
      className="rb-header sticky top-0 z-10 border-b bg-[var(--bg)]/90 backdrop-blur"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {children}
    </header>
  );
}
