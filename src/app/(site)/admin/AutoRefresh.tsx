"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// 처리 중인 글이 있을 때만 주기적으로 서버 데이터를 다시 불러온다.
export function AutoRefresh({ active, intervalMs = 5000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
