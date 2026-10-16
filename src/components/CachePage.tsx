"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// next/link 이동은 RSC 요청이라 서비스 워커가 문서를 캐시하지 못한다.
// 화면이 뜬 뒤 현재 경로를 서비스 워커에 알려 오프라인 읽기용으로 저장하게 한다.
export function CachePage() {
  const pathname = usePathname();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const message = { type: "cache-page", path: location.pathname };
    const controller = navigator.serviceWorker.controller;
    if (controller) {
      controller.postMessage(message);
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (!cancelled) reg.active?.postMessage(message);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
