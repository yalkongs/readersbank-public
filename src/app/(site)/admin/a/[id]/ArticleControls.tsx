"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ReprocessMode } from "@/lib/articles/admin-ops";
import { deleteArticleAction, generateAudioAction, generateCoverAction, refreshRelatedAction, removeAudioAction, removeCoverAction, reprocessAction, saveTagsAction, setVisibilityAction, type ActionResult } from "../../actions";
import { getListenLinkAction } from "@/lib/actions/listen-link";
import { mergeTagInput } from "@/lib/tags";
import { AlertIcon, Icon, LockIcon, focusRing } from "../../ui";

const MAX_TAGS = 6;
const CONFIRM_MS = 5000;

const Spinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-[var(--accent)]">
      <span className="mt-px shrink-0">
        <AlertIcon />
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{message}</span>
    </p>
  );
}

// 서버 액션을 transition 안에서 실행하고 실패 메시지를 상태로 들고 있는다.
function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<ActionResult>, onDone?: (r: ActionResult) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error);
        onDone?.(r);
      } catch {
        setError("서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        onDone?.({ ok: false, error: "network" });
      }
    });
  }
  return { pending, error, run };
}

// 두 번 누르기 확인: 첫 클릭에 무장하고 5초 안에 다시 누르면 실행한다.
function useArmed() {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  function arm() {
    setArmed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), CONFIRM_MS);
  }
  function disarm() {
    setArmed(false);
    if (timer.current) clearTimeout(timer.current);
  }
  return { armed, arm, disarm };
}

export function VisibilityToggle({ id, isPublic: initial }: { id: string; isPublic: boolean }) {
  const [isPublic, setIsPublic] = useState(initial);
  const { pending, error, run } = useAction();

  function choose(next: boolean) {
    if (next === isPublic || pending) return;
    const prev = isPublic;
    setIsPublic(next);
    run(
      () => setVisibilityAction(id, next),
      (r) => {
        if (!r.ok) setIsPublic(prev);
      },
    );
  }

  return (
    <div>
      <div role="group" aria-label="공개 범위" className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--bg)] p-1">
        {[
          { value: true, label: "공개" },
          { value: false, label: "비공개" },
        ].map((opt) => {
          const active = isPublic === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => choose(opt.value)}
              disabled={pending}
              className={`flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-progress ${
                active ? "bg-[var(--summary-bg)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--line)]" : "text-[var(--muted)] hover:text-[var(--fg)]"
              } ${focusRing}`}
            >
              {!opt.value && <LockIcon />}
              {opt.label}
            </button>
          );
        })}
      </div>
      <ErrorText message={error} />
    </div>
  );
}

export function ListenLinkCopy({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);

  function click() {
    setError(null);
    setCopied(false);
    setFallback(null);
    startTransition(async () => {
      try {
        const r = await getListenLinkAction(id);
        if (!r.ok) return setError(r.error);
        const url = location.origin + r.path;
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          setFallback(url); // 클립보드를 못 쓰면 직접 복사할 수 있게 보여 준다
        }
      } catch {
        setError("서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className={`flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-4 text-sm font-medium transition-colors hover:border-[var(--muted)] disabled:cursor-progress disabled:opacity-60 ${focusRing}`}
      >
        {pending && <Spinner />}
        듣기 링크 복사(24시간)
      </button>
      <p className="mt-2 text-[13px] text-[var(--muted)]" aria-live="polite">
        {copied ? "복사했어요" : ""}
      </p>
      {fallback && (
        <input readOnly value={fallback} onFocus={(e) => e.currentTarget.select()} aria-label="듣기 링크" className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 font-mono text-[13px]" />
      )}
      <ErrorText message={error} />
    </div>
  );
}

export function TagEditor({ id, initial }: { id: string; initial: string[] }) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useAction();
  const dirty = tags.join("\u0000") !== initial.join("\u0000");

  // 쉼표로 여러 개를 한 번에 붙여넣어도 모두 더한다(합친 목록에서 중복 제거·최대 개수 적용).
  function add(raw: string) {
    if (!raw.trim()) return;
    const r = mergeTagInput(tags, raw, MAX_TAGS);
    setTags(r.tags);
    setHint(r.hint);
    setSaved(false);
  }

  function remove(t: string) {
    setTags(tags.filter((x) => x !== t));
    setHint(null);
    setSaved(false);
  }

  function save() {
    const next = draft.trim() ? mergeTagInput(tags, draft, MAX_TAGS).tags : tags;
    if (next !== tags) {
      setTags(next);
      setDraft("");
    }
    run(
      () => saveTagsAction(id, next),
      (r) => setSaved(r.ok),
    );
  }

  return (
    <div>
      {tags.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t} className="flex min-h-9 max-w-full items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)] py-0.5 pl-3 pr-1 text-sm [overflow-wrap:anywhere]">
              {t}
              <button
                type="button"
                onClick={() => remove(t)}
                disabled={pending}
                aria-label={`${t} 태그 빼기`}
                className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-[var(--line)] hover:text-[var(--fg)] disabled:opacity-40 ${focusRing}`}
              >
                <Icon size={14}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </Icon>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-[var(--muted)]">태그가 없어요.</p>
      )}
      <div className="flex gap-2">
        <label htmlFor="tag-input" className="sr-only">
          태그 추가
        </label>
        <input
          id="tag-input"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) {
              const cut = v.lastIndexOf(",");
              add(v.slice(0, cut));
              setDraft(v.slice(cut + 1));
            } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(draft);
              setDraft("");
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
          disabled={pending || tags.length >= MAX_TAGS}
          maxLength={30}
          placeholder={tags.length >= MAX_TAGS ? `최대 ${MAX_TAGS}개` : "태그 입력 후 Enter"}
          className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 text-base text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--muted)] disabled:opacity-60"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || (!dirty && !draft.trim())}
          className={`flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
        >
          {pending && <Spinner />}
          저장
        </button>
      </div>
      <p className="mt-2 text-[13px] text-[var(--muted)]" aria-live="polite">
        {hint ?? (saved && !dirty ? "저장했어요" : "한글·영어로 최대 6개. 한자·일본어 가나는 쓸 수 없어요.")}
      </p>
      <ErrorText message={error} />
    </div>
  );
}

const REPROCESS: { mode: ReprocessMode; label: string; confirm: boolean }[] = [
  { mode: "resume", label: "이어서 처리", confirm: false },
  { mode: "fill", label: "누락 부분만 번역", confirm: false },
  { mode: "retranslate", label: "번역 다시 하기", confirm: true },
  { mode: "full", label: "처음부터 다시", confirm: true },
];

export function ReprocessSection({
  id,
  options,
  busy,
  isEnglish,
}: {
  id: string;
  options: Record<ReprocessMode, boolean>;
  busy: boolean;
  isEnglish: boolean;
}) {
  const { pending, error, run } = useAction();
  const [armedMode, setArmedMode] = useState<ReprocessMode | null>(null);
  const [running, setRunning] = useState<ReprocessMode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function click(mode: ReprocessMode, confirm: boolean) {
    if (confirm && armedMode !== mode) {
      setArmedMode(mode);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmedMode(null), CONFIRM_MS);
      return;
    }
    setArmedMode(null);
    setRunning(mode);
    run(
      () => reprocessAction(id, mode),
      () => setRunning(null),
    );
  }

  return (
    <div>
      <ul className="flex flex-col gap-2">
        {REPROCESS.filter((r) => (r.mode !== "retranslate" || isEnglish) && (r.mode !== "fill" || options.fill)).map((r) => {
          const enabled = options[r.mode] && !pending;
          const armed = armedMode === r.mode;
          return (
            <li key={r.mode} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={`text-[15px] font-medium ${options[r.mode] ? "" : "text-[var(--muted)]"}`}>{r.label}</p>
                {armed && <p className="text-[13px] text-[var(--muted)]">한 번 더 누르면 시작해요.</p>}
              </div>
              <button
                type="button"
                onClick={() => click(r.mode, r.confirm)}
                disabled={!enabled}
                className={`flex h-11 min-w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  armed
                    ? "bg-[var(--accent)] text-[var(--bg)]"
                    : "border border-[var(--accent)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
                } ${focusRing}`}
              >
                {running === r.mode && pending && <Spinner />}
                {armed ? "확인" : "시작"}
              </button>
            </li>
          );
        })}
      </ul>
      <ErrorText message={error} />
    </div>
  );
}

export function DeleteSection({ id, busy }: { id: string; busy: boolean }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const { armed, arm, disarm } = useArmed();

  return (
    <div>
      {!busy && <p className="mb-3 text-sm text-[var(--muted)]">글과 올린 파일·이미지를 모두 지워요. 되돌릴 수 없어요.</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || pending}
          onClick={() => {
            if (!armed) return arm();
            disarm();
            run(
              () => deleteArticleAction(id),
              (r) => {
                if (r.ok) router.push("/admin");
              },
            );
          }}
          className={`flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            armed || pending
              ? "bg-[#dc2626] text-white hover:brightness-110"
              : "border border-[color-mix(in_srgb,#dc2626_60%,var(--line))] text-[color-mix(in_srgb,#dc2626_85%,var(--fg))] hover:bg-[color-mix(in_srgb,#dc2626_8%,transparent)]"
          } ${focusRing}`}
        >
          {pending && <Spinner />}
          {pending ? "삭제 중…" : armed ? "한 번 더 누르면 삭제" : "글 삭제"}
        </button>
        {armed && !pending && (
          <button
            type="button"
            onClick={disarm}
            className={`flex h-11 items-center justify-center rounded-xl border border-[var(--line)] px-5 text-sm font-medium transition-colors hover:border-[var(--muted)] ${focusRing}`}
          >
            취소
          </button>
        )}
      </div>
      <ErrorText message={error} />
    </div>
  );
}

export function RelatedRefresh({ id, count, enabled }: { id: string; count: number | null; enabled: boolean }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <div>
      {!count && <p className="mb-3 text-sm text-[var(--muted)]">{count == null ? "아직 찾지 않았어요." : "찾은 글이 없어요."}</p>}
      <button
        type="button"
        onClick={() => run(() => refreshRelatedAction(id), (r) => r.ok && router.refresh())}
        disabled={!enabled || pending}
        className={`flex h-11 items-center gap-2 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
      >
        {pending && <Spinner />}
        {pending ? "찾는 중…" : "추천 다시 찾기"}
      </button>
      <ErrorText message={error} />
    </div>
  );
}

export function CoverGenerator({
  id,
  cover,
  generated,
  hasSource,
  enabled,
}: {
  id: string;
  cover: string | null;
  generated: boolean;
  hasSource: boolean;
  enabled: boolean;
}) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const [doing, setDoing] = useState<"gen" | "del" | null>(null);
  const act = (kind: "gen" | "del") => {
    setDoing(kind);
    run(
      () => (kind === "gen" ? generateCoverAction(id) : removeCoverAction(id)),
      (r) => {
        setDoing(null);
        if (r.ok) router.refresh();
      },
    );
  };
  const fromSource = Boolean(cover) && !generated;
  return (
    <div>
      {cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="mb-3 aspect-[3/2] w-full rounded-xl border border-[var(--line)] object-cover" />
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => act("gen")}
          disabled={!enabled || pending}
          className={`flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
        >
          {pending && doing === "gen" && <Spinner />}
          {pending && doing === "gen" ? "그리는 중…" : generated ? "다시 생성" : fromSource ? "AI 표지 만들기" : "이미지 생성"}
        </button>
        {generated && (
          <button
            type="button"
            onClick={() => act("del")}
            disabled={pending}
            className={`flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm disabled:opacity-40 ${focusRing}`}
          >
            {pending && doing === "del" && <Spinner />}
            {hasSource ? "원문 표지로 되돌리기" : "AI 표지 지우기"}
          </button>
        )}
      </div>
      <ErrorText message={error} />
    </div>
  );
}

// 한국어 낭독은 초당 6~7자 안팎이다(분량 어림용).
const CHARS_PER_MINUTE = 400;
// gpt-4o-mini-tts 비용 어림(분당 약 $0.015). 실제 청구는 OpenAI 사용량 화면 기준이다.
const USD_PER_MINUTE = 0.015;
const fmtMinutes = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))}초` : `${Math.round(sec / 60)}분`);

export function AudioGenerator({
  id,
  audio,
  stale,
  chars,
  status,
  progress,
  error: lastError,
  enabled,
}: {
  id: string;
  audio: string | null;
  stale: boolean;
  chars: number;
  status: "generating" | "failed" | null;
  progress: string | null;
  error: string | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const { armed, arm, disarm } = useArmed();
  const [doing, setDoing] = useState<"gen" | "del" | null>(null);
  const generating = status === "generating";
  const act = (kind: "gen" | "del") => {
    setDoing(kind);
    run(
      () => (kind === "gen" ? generateAudioAction(id) : removeAudioAction(id)),
      (r) => {
        setDoing(null);
        if (r.ok) router.refresh();
      },
    );
  };
  const minutes = chars / CHARS_PER_MINUTE;
  const estimate = `본문 ${chars.toLocaleString("ko-KR")}자 · 약 ${fmtMinutes(minutes * 60)} 분량 · OpenAI 비용 약 $${Math.max(0.01, minutes * USD_PER_MINUTE).toFixed(2)}(추정)`;
  return (
    <div>
      {audio && !generating && (
        <audio controls preload="none" src={audio} className="mb-3 w-full" />
      )}
      {(generating || (audio && stale)) && (
        <p className="mb-3 text-sm text-[var(--muted)]">
          {generating
            ? `${progress ?? "낭독 만드는 중"}… 긴 글은 몇 분 걸려요. 이 화면을 닫아도 계속 만들어요.`
            : "본문이 바뀌어 지금 오디오는 읽기 화면에 나오지 않아요. 다시 만들어 주세요."}
        </p>
      )}
      {!generating && <p className="mb-3 text-xs text-[var(--muted)]">{estimate}</p>}
      {status === "failed" && lastError && <ErrorText message={lastError} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (!armed) return arm();
            disarm();
            act("gen");
          }}
          disabled={!enabled || generating || pending}
          className={`flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--bg)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
        >
          {(generating || (pending && doing === "gen")) && <Spinner />}
          {generating ? "만드는 중…" : armed ? "한 번 더 누르면 비용을 써서 만들어요" : audio ? "다시 만들기" : "오디오 만들기"}
        </button>
        {armed && !pending && (
          <button
            type="button"
            onClick={disarm}
            className={`flex h-11 items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-medium ${focusRing}`}
          >
            취소
          </button>
        )}
        {(audio || generating) && !armed && (
          <button
            type="button"
            onClick={() => act("del")}
            disabled={pending}
            className={`flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] px-4 text-sm disabled:opacity-40 ${focusRing}`}
          >
            {pending && doing === "del" && <Spinner />}
            {generating ? "생성 취소" : "오디오 지우기"}
          </button>
        )}
      </div>
      <ErrorText message={error} />
    </div>
  );
}
