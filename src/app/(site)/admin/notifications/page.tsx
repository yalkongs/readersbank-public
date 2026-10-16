import Link from "next/link";
import { countSubscriptions } from "@/lib/notify";
import { ChevronLeftIcon, focusRing } from "../ui";
import { NotificationSettings } from "./NotificationSettings";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const devices = await countSubscriptions();
  return (
    <main className="mx-auto max-w-[640px] px-5 pb-16 pt-8 md:pt-12">
      <Link
        href="/admin"
        className={`mb-4 inline-flex h-11 items-center gap-1 rounded-lg text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--fg)] ${focusRing}`}
      >
        <ChevronLeftIcon />
        관리
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">알림</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--muted)]">
          등록 실패, 번역 누락, 매주 월요일 아침 주간 요약(새 글·실패·추정 비용)을 이 기기로 보내요. 아이폰은 홈 화면에 추가한 ReadersBank 앱에서만 받을 수
          있어요.
        </p>
      </header>
      <NotificationSettings publicKey={process.env.VAPID_PUBLIC_KEY ?? ""} devices={devices} />
    </main>
  );
}
