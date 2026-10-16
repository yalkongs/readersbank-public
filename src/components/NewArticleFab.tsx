"use client";

import Link from "next/link";
import { useScrollHide } from "@/lib/use-scroll-hide";

// 홈의 새 글 등록 버튼(소유자). 목록을 내려 보는 동안에는 카드를 가리지 않게 아래로 숨는다.
export function NewArticleFab() {
  const { hidden } = useScrollHide();
  return (
    <Link
      href="/admin/new"
      aria-label="새 글 등록"
      title="새 글 등록"
      data-hidden={hidden || undefined}
      className="rb-glass rb-fab fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
    >
      {/* 아이콘은 유리 위 기본 글자색(iOS 방식). 강조색은 유리 틴트와 겹쳐 대비가 낮았다. */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}
