"use client";

import { useSyncExternalStore } from "react";
import { absoluteDate, relativeDate, todayStart } from "@/lib/card-meta";

const noop = () => () => {};
const serverToday = () => 0;

// 서버(와 저장해 둔 페이지)는 "10월 15일"처럼 그리고, 기기에서는 그날 기준 "오늘·어제·N일 전"으로 바꾼다.
export function CardDate({ value }: { value: string | Date | null }) {
  const today = useSyncExternalStore(noop, todayStart, serverToday);
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return <time dateTime={d.toISOString()}>{today ? relativeDate(d, today) : absoluteDate(d, d.getTime())}</time>;
}
