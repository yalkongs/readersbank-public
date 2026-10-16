"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTokenAction, revokeTokenAction } from "../actions";
import { AlertIcon, focusRing, formatDateTime } from "../ui";

type TokenRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

const btn = `h-11 rounded-xl px-4 text-sm font-semibold transition ${focusRing}`;

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[var(--accent)]">
      <span className="mt-px shrink-0">
        <AlertIcon />
      </span>
      {message}
    </p>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" onClick={copy} className={`${btn} border border-[var(--line)] text-[var(--fg)] hover:border-[var(--muted)]`}>
      <span aria-live="polite">{state === "done" ? "복사했어요" : state === "fail" ? "복사하지 못했어요" : label}</span>
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--line)] text-xs font-semibold text-[var(--muted)]">
        {n}
      </span>
      <div className="min-w-0 text-[15px] leading-relaxed">{children}</div>
    </li>
  );
}

const code = "break-all rounded bg-[var(--summary-bg)] px-1.5 py-0.5 font-mono text-[13px]";

export function TokenManager({ tokens, origin }: { tokens: TokenRow[]; origin: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; plaintext: string } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const r = await createTokenAction(name);
        if (!r.ok) return setError(r.error);
        setFresh({ name: name.trim(), plaintext: r.plaintext });
        setName("");
        router.refresh();
      } catch {
        setError("서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  function revoke(id: string) {
    if (armed !== id) {
      setArmed(id);
      setTimeout(() => setArmed((cur) => (cur === id ? null : cur)), 5000);
      return;
    }
    setArmed(null);
    setError(null);
    startTransition(async () => {
      try {
        const r = await revokeTokenAction(id);
        if (!r.ok) return setError(r.error);
        router.refresh();
      } catch {
        setError("서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="space-y-8">
      {fresh && (
        <section aria-labelledby="fresh-h" className="rounded-2xl border border-[var(--accent)] p-4">
          <h2 id="fresh-h" className="text-base font-semibold">
            “{fresh.name}” 토큰이 만들어졌어요
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">이 토큰은 지금 한 번만 보여 드려요. 창을 닫으면 다시 볼 수 없으니 바로 복사해 두세요.</p>
          <p className={`${code} mt-3 block select-all py-2`} data-testid="new-token">
            {fresh.plaintext}
          </p>
          <div className="mt-3 flex gap-2">
            <CopyButton text={fresh.plaintext} label="토큰 복사" />
            <button type="button" onClick={() => setFresh(null)} className={`${btn} text-[var(--muted)] hover:text-[var(--fg)]`}>
              복사했어요, 닫기
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="new-h">
        <h2 id="new-h" className="mb-3 text-base font-semibold">
          새 토큰
        </h2>
        <form onSubmit={create} className="flex gap-2">
          <label htmlFor="token-name" className="sr-only">
            토큰 이름
          </label>
          <input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="예: 내 아이폰 단축어"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--summary-bg)] px-3 text-base text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className={`${btn} shrink-0 bg-[var(--accent)] text-[var(--bg)] hover:brightness-110 disabled:opacity-50`}
          >
            만들기
          </button>
        </form>
        <ErrorText message={error} />
      </section>

      <section aria-labelledby="list-h">
        <h2 id="list-h" className="mb-3 text-base font-semibold">
          토큰 목록
        </h2>
        {tokens.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">아직 만든 토큰이 없어요</div>
        ) : (
          <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[15px] font-medium ${t.revokedAt ? "text-[var(--muted)] line-through" : ""}`}>{t.name}</p>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">
                    만든 날 {formatDateTime(new Date(t.createdAt))} · {t.lastUsedAt ? `마지막 사용 ${formatDateTime(new Date(t.lastUsedAt))}` : "아직 안 썼어요"}
                  </p>
                </div>
                {t.revokedAt ? (
                  <span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)]">폐기됨</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => revoke(t.id)}
                    disabled={pending}
                    className={`${btn} shrink-0 border border-[var(--line)] ${armed === t.id ? "border-[var(--accent)] text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
                  >
                    {armed === t.id ? "한 번 더 눌러 폐기" : "폐기"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ios-h">
        <h2 id="ios-h" className="mb-4 text-base font-semibold">
          iOS 단축어 만드는 법
        </h2>
        <ol className="space-y-4">
          <Step n={1}>
            위에서 토큰을 만들고 복사해 두세요.
          </Step>
          <Step n={2}>
            단축어 앱에서 새 단축어를 만들고, <b>단축어 세부사항(ⓘ)</b>에서 <b>공유 시트에서 보기</b>를 켠 뒤 받을 항목을 <b>URL, 텍스트</b>로 고르세요(4MB 이하 파일도 받으려면 <b>파일</b>도 고르세요).
          </Step>
          <Step n={3}>
            <b>URL의 콘텐츠 가져오기</b> 동작을 추가하고 이렇게 채우세요.
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              <li>
                URL: <span className={code}>{origin}/api/ingest</span>
              </li>
              <li>
                방법: <b>POST</b>
              </li>
              <li>
                헤더: <span className={code}>Authorization</span> = <span className={code}>Bearer 복사한토큰</span>
              </li>
              <li>
                요청 본문: <b>JSON</b>, 키 <span className={code}>input</span>(텍스트)에 <b>공유 시트 입력</b>을 넣으세요. 공개하지 않으려면 키 <span className={code}>isPublic</span>(불리언)을 끄세요.
              </li>
            </ul>
          </Step>
          <Step n={4}>
            <b>알림 보기</b> 동작을 추가하고 앞 단계의 <b>URL의 콘텐츠</b>를 보여 주세요. 등록되면 <span className={code}>queued</span> 상태가 오고, 이미 있는 글이면 안내가 와요.
          </Step>
          <Step n={5}>
            Safari나 다른 앱의 공유 버튼에서 이 단축어를 고르면 글이 등록돼요. 4MB 이하 파일은 본문을 <b>양식</b>으로 바꾸고 <span className={code}>file</span> 필드로 보내도 돼요.
          </Step>
        </ol>
      </section>
    </div>
  );
}
