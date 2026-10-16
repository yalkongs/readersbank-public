"use client";

import { useEffect, useState } from "react";

// 열림·닫힘 전환용: 닫힐 때 closeMs 동안 그대로 그려 둔 채 is-closing을 주고,
// 열릴 때는 한 프레임 뒤 is-open을 붙여 시작 상태에서 전환이 재생되게 한다.
export function usePresence(open: boolean, closeMs: number): { mounted: boolean; stateClass: "" | "is-open" | "is-closing" } {
  const [mounted, setMounted] = useState(open);
  const [stateClass, setStateClass] = useState<"" | "is-open" | "is-closing">("");

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 전환 시작 상태를 한 번 그린 뒤 열림 클래스를 붙인다
      setMounted(true);
      setStateClass("");
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setStateClass("is-open"));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setStateClass((c) => (c === "" ? "" : "is-closing"));
    const t = setTimeout(() => {
      setMounted(false);
      setStateClass("");
    }, closeMs);
    return () => clearTimeout(t);
  }, [open, closeMs]);

  return { mounted, stateClass };
}
