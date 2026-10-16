"use client";

import { useEffect, useState } from "react";

// 아래로 내려가면 hidden, 위로 올리거나 맨 위에 오면 다시 보인다. 헤더와 새 글 버튼이 같이 쓴다.
const TOP = 64;
const DELTA = 6;

export function useScrollHide(): { hidden: boolean; scrolled: boolean } {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setScrolled(y > 4);
        if (y < TOP) setHidden(false);
        else if (y > last + DELTA) setHidden(true);
        else if (y < last - DELTA) setHidden(false);
        else return;
        last = y;
      });
    }
    onScroll(); // 새로고침으로 중간 위치에서 열려도 상태를 맞춘다.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return { hidden, scrolled };
}
