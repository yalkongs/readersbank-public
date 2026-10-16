"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { removePushAction, savePushAction, testPushAction } from "../actions";
import { focusRing } from "../ui";

type Support = "checking" | "unsupported" | "needs-install" | "ok";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "기기";
}

const btn = `flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export function NotificationSettings({ publicKey, devices }: { publicKey: string; devices: number }) {
  const router = useRouter();
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const iOS = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 기능은 마운트 후에만 알 수 있다
      setSupport(iOS && !standalone ? "needs-install" : "unsupported");
      return;
    }
    setSupport("ok");
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setSubscribed(Boolean(s)));
  }, []);

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setMessage("알림 권한이 꺼져 있어요. 기기 설정에서 ReadersBank 알림을 허용해 주세요.");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
        const r = await savePushAction(sub.toJSON(), deviceLabel());
        if (!r.ok) {
          setMessage(r.error);
          return;
        }
        setSubscribed(true);
        setMessage("이 기기에서 알림을 받아요.");
        router.refresh();
      } catch {
        setMessage("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await removePushAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        setMessage("이 기기의 알림을 껐어요.");
        router.refresh();
      } catch {
        setMessage("알림을 끄지 못했어요.");
      }
    });
  }

  function test() {
    setMessage(null);
    start(async () => {
      const r = await testPushAction();
      setMessage(r.ok ? "시험 알림을 보냈어요." : r.error);
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--summary-bg)] p-4 md:p-5">
      <p className="mb-4 text-sm text-[var(--muted)]">알림을 받는 기기: {devices}대</p>
      {support === "checking" && <p className="text-sm text-[var(--muted)]">확인 중…</p>}
      {support === "needs-install" && (
        <p className="text-sm leading-relaxed">
          아이폰 Safari에서는 알림을 받을 수 없어요. 공유 버튼 → <strong>홈 화면에 추가</strong>로 설치한 뒤, 홈 화면의 ReadersBank에서 이 페이지를 열어 주세요.
        </p>
      )}
      {support === "unsupported" && <p className="text-sm">이 브라우저는 웹 푸시 알림을 지원하지 않아요.</p>}
      {support === "ok" && (
        <div className="flex flex-wrap gap-2">
          {subscribed ? (
            <>
              <button type="button" onClick={test} disabled={pending} className={`${btn} bg-[var(--accent)] text-[var(--bg)]`}>
                시험 알림 보내기
              </button>
              <button type="button" onClick={disable} disabled={pending} className={`${btn} border border-[var(--line)]`}>
                이 기기 알림 끄기
              </button>
            </>
          ) : (
            <button type="button" onClick={enable} disabled={pending || !publicKey} className={`${btn} bg-[var(--accent)] text-[var(--bg)]`}>
              이 기기에서 알림 받기
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-[var(--muted)]">
          {message}
        </p>
      )}
    </section>
  );
}
