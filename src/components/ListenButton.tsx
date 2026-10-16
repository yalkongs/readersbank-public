"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Block } from "@/lib/blocks";
import { pickVoice, speechSegments } from "@/lib/speech";
import { getListenLinkAction } from "@/lib/actions/listen-link";
import { articleUrl, readerUrl } from "@/lib/share-urls";
import { scrollBehavior } from "@/lib/motion";

// 저장된 낭독 오디오. cues는 [블록 번호, 시작 초].
export type ListenAudio = { url: string; cues: [number, number][] };
type Props = { blocks: Block[]; title?: string; audio?: ListenAudio | null };
// articleId는 비공개 글에만 넘긴다(공개 글 HTML에 내부 UUID를 싣지 않는다).
type TitleProps = { slug: string; title: string; blocks: Block[]; articleId?: string; isPrivate: boolean };

/** 터치 기기이면서 Web Share를 쓸 수 있는지. 마운트 후에만 판별 가능. */
function canShare(): boolean {
  return window.matchMedia("(pointer: coarse)").matches && "share" in navigator;
}
type Mode = "pending" | "share" | "speech" | "unsupported";
type PlayState = "idle" | "playing" | "paused";

const LINK_MAX_AGE_MS = 23 * 60 * 60 * 1000; // 서명 링크는 24시간 유효 — 23시간이 지나면 새로 받는다
const LINK_RETRY_MS = 3000;
type LinkState = "loading" | "ready" | "error";
type FetchOutcome = "ok" | "failed" | "busy";
const RATES = [0.8, 1, 1.2, 1.5];
// 제목 글줄 높이에 맞춘 인라인 아이콘. 패딩 + 음수 마진으로 탭 영역(44px)만 키우고 줄 배치는 그대로 둔다.
const inlineBtn =
  "relative -my-4 inline-flex h-[0.6em] w-[0.6em] box-content items-center justify-center px-[0.3rem] py-[0.75rem] align-[-0.02em] text-[var(--muted)] hover:text-[var(--fg)]";
const btn =
  "relative rounded-full border border-[var(--line)] px-3 py-1 text-sm font-semibold hover:bg-[var(--summary-bg)] after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']";

// 저장된 오디오가 있으면 그것을, 없으면 브라우저 음성 읽기를 쓴다.
export function ListenButton({ blocks, title, audio }: Props) {
  if (audio) return <AudioListen audio={audio} title={title} />;
  return <SpeechListen blocks={blocks} />;
}

function highlightBlock(activeRef: { current: Element | null }, index: number | null) {
  activeRef.current?.classList.remove("speaking");
  activeRef.current = null;
  if (index === null) return;
  const el = document.querySelector(`[data-block-index="${index}"]`);
  if (!el) return;
  el.classList.add("speaking");
  el.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  activeRef.current = el;
}

// 재생 위치 t에서 읽고 있는 블록. cues는 시작 시각 순이다.
export function cueAt(cues: [number, number][], t: number): number | null {
  let lo = 0;
  let hi = cues.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid][1] <= t) {
      found = cues[mid][0];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function AudioListen({ audio, title }: { audio: ListenAudio; title?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<Element | null>(null);
  const currentRef = useRef<number | null>(null);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const active = activeRef;
    return () => active.current?.classList.remove("speaking");
  }, []);

  function sync() {
    const el = ref.current;
    if (!el) return;
    // 멈췄거나 끝났으면 하이라이트를 거둔다.
    const index = el.paused && (el.ended || el.currentTime === 0) ? null : cueAt(audio.cues, el.currentTime);
    if (index === currentRef.current) return;
    currentRef.current = index;
    highlightBlock(activeRef, index);
  }

  function onPlay() {
    // 잠금 화면·알림 영역에 글 제목을 보여 준다.
    if (title && "mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "ReadersBank" });
    sync();
  }

  function changeRate(r: number) {
    setRate(r);
    if (ref.current) ref.current.playbackRate = r;
  }

  return (
    <div className="mt-3" role="group" aria-label="낭독 듣기">
      <audio
        ref={ref}
        src={audio.url}
        controls
        preload="none"
        onPlay={onPlay}
        onTimeUpdate={sync}
        onSeeked={sync}
        onEnded={sync}
        onLoadedMetadata={(e) => (e.currentTarget.playbackRate = rate)}
        className="w-full"
      />
      <label className="mt-2 flex items-center gap-1 text-sm text-[var(--muted)]">
        속도
        <select
          value={rate}
          onChange={(e) => changeRate(Number(e.target.value))}
          className="rounded border border-[var(--line)] bg-transparent px-1.5 py-1.5"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}x
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SpeechListen({ blocks }: { blocks: Block[] }) {
  const [mode, setMode] = useState<Mode>("pending");
  const [state, setState] = useState<PlayState>("idle");
  const [rate, setRate] = useState(1);
  const [noKoVoice, setNoKoVoice] = useState(false);
  const segments = useMemo(() => speechSegments(blocks), [blocks]);
  const posRef = useRef(0);
  const rateRef = useRef(1);
  const runRef = useRef(0); // invalidates callbacks of cancelled utterances
  const activeRef = useRef<Element | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const next: Mode = canShare() ? "share" : "speechSynthesis" in window ? "speech" : "unsupported";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 기기 판별은 마운트 후에만 할 수 있다
    setMode(next);
    if (next !== "speech") return;
    // 음성 목록은 비동기로 채워질 수 있어 voiceschanged 때마다 갱신한다.
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      voicesRef.current = synth.getVoices();
    };
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    return () => synth.removeEventListener("voiceschanged", updateVoices);
  }, []);

  const highlight = (index: number | null) => highlightBlock(activeRef, index);

  function stop() {
    runRef.current++;
    window.speechSynthesis?.cancel();
    posRef.current = 0;
    highlight(null);
    setState("idle");
  }

  useEffect(() => {
    // 언마운트 시 남은 발화 콜백을 무효화한다. 같은 ref 객체를 잡아 두고 정리 시점의 값을 쓴다.
    const run = runRef;
    const active = activeRef;
    return () => {
      run.current++;
      window.speechSynthesis?.cancel();
      active.current?.classList.remove("speaking");
    };
  }, []);

  function speakFrom(pos: number) {
    const synth = window.speechSynthesis;
    const run = ++runRef.current;
    synth.cancel();
    if (pos >= segments.length) {
      stop();
      return;
    }
    posRef.current = pos;
    const seg = segments[pos];
    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang = "ko-KR";
    u.rate = rateRef.current;
    if (voicesRef.current.length === 0) voicesRef.current = synth.getVoices();
    const voices = voicesRef.current;
    const voice = pickVoice(voices);
    if (voice) u.voice = voice;
    // 목록이 아직 비어 있으면 한국어 음성이 없다고 단정하지 않는다.
    setNoKoVoice(voices.length > 0 && !voice);
    u.onend = () => {
      if (run === runRef.current) speakFrom(pos + 1);
    };
    u.onerror = (e) => {
      if (run === runRef.current && e.error !== "interrupted" && e.error !== "canceled") stop();
    };
    highlight(seg.index);
    setState("playing");
    // 일시정지 중 속도를 바꾸면 엔진이 멈춘 상태로 남아 있으므로 먼저 재개한다.
    synth.resume();
    synth.speak(u);
  }

  function toggle() {
    const synth = window.speechSynthesis;
    if (state === "idle") speakFrom(0);
    else if (state === "playing") {
      synth.pause();
      setState("paused");
    } else {
      synth.resume();
      setState("playing");
    }
  }

  function changeRate(r: number) {
    setRate(r);
    rateRef.current = r;
    if (state !== "idle") speakFrom(posRef.current); // rate applies per utterance
  }

  if (mode === "pending") return null;
  if (mode === "unsupported")
    return <p className="mt-3 text-sm text-[var(--muted)]">이 브라우저는 음성 읽기를 지원하지 않습니다</p>;
  if (segments.length === 0) return null;

  if (mode === "share") return null; // 모바일 공유 아이콘은 제목 끝(TitleShareIcons)에 있다

  return (
    <div className="mt-3" role="group" aria-label="음성 읽기">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={toggle} className={btn}>
          {state === "playing" ? "일시정지" : state === "paused" ? "이어 듣기" : "듣기"}
        </button>
        <button type="button" onClick={stop} disabled={state === "idle"} className={`${btn} disabled:opacity-40`}>
          정지
        </button>
        <label className="flex items-center gap-1 text-sm text-[var(--muted)]">
          속도
          <select
            value={rate}
            onChange={(e) => changeRate(Number(e.target.value))}
            className="rounded border border-[var(--line)] bg-transparent px-1.5 py-1.5"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>
      </div>
      {noKoVoice && state !== "idle" && (
        <p className="mt-2 text-xs text-[var(--muted)]">한국어 음성이 없어 기본 음성으로 읽습니다</p>
      )}
    </div>
  );
}

/** 제목(h1) 끝에 이어 붙는 공유·링크 복사 아이콘. 터치 기기에서 Web Share를 쓸 수 있을 때만 보인다. */
export function TitleShareIcons({ slug, title, blocks, articleId, isPrivate }: TitleProps) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("loading");
  const linkReady = linkState === "ready";
  const segments = useMemo(() => speechSegments(blocks), [blocks]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkRef = useRef<{ url: string; fetchedAt: number } | null>(null);
  const fetchingRef = useRef(false);
  // 클릭·다시 시도에서 부르는 새로 받기. 효과가 살아 있는 동안만 실제 동작을 가리킨다.
  const refreshRef = useRef<() => Promise<FetchOutcome>>(async () => "busy");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 기기 판별은 마운트 후에만 할 수 있다
    setShow(canShare());
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 비공개 글은 24시간짜리 서명 링크(서버가 소유자 확인)를 미리 받아 둔다.
  // iOS는 await 뒤에서 navigator.share를 부르면 사용자 활성화가 풀려 거부하므로, 클릭 때는 동기로 공유한다.
  useEffect(() => {
    if (!isPrivate || !show || !articleId) return;
    const id = articleId;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    async function refresh(reportFailure = true): Promise<FetchOutcome> {
      const cur = linkRef.current;
      if (cur && Date.now() - cur.fetchedAt < LINK_MAX_AGE_MS) return "ok";
      if (fetchingRef.current) return "busy";
      fetchingRef.current = true;
      setLinkState("loading");
      try {
        const r = await getListenLinkAction(id);
        if (cancelled) return "busy";
        if (r.ok) {
          linkRef.current = { url: location.origin + r.path, fetchedAt: Date.now() };
          setLinkState("ready");
          return "ok";
        }
        console.error(r.error);
      } catch (e) {
        console.error(e instanceof Error ? e.message : "듣기 링크를 받지 못했습니다");
      } finally {
        fetchingRef.current = false;
      }
      if (!cancelled && reportFailure) setLinkState("error");
      return "failed";
    }
    refreshRef.current = () => refresh();
    // 첫 준비가 실패하면 3초 뒤 한 번만 다시 시도한다. 그동안은 준비 중으로 보인다.
    void refresh(false).then((outcome) => {
      if (outcome !== "failed" || cancelled) return;
      retryTimer = setTimeout(() => void refresh(), LINK_RETRY_MS);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      refreshRef.current = async () => "busy";
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isPrivate, show, articleId]);

  async function share() {
    try {
      let url = readerUrl(location.origin, slug);
      if (isPrivate) {
        const cur = linkRef.current;
        if (!cur || Date.now() - cur.fetchedAt >= LINK_MAX_AGE_MS) {
          // 오래된 링크로는 공유하지 않는다. 새로 받는 동안 버튼을 막고 준비 중으로 보인다.
          setLinkState("loading");
          void refreshRef.current();
          return;
        }
        url = cur.url;
      }
      await navigator.share({ title, url });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) console.error(e);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(articleUrl(location.origin, slug));
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  }

  if (!show || segments.length === 0) return null;
  const shareLabel = !isPrivate || linkReady ? "ElevenReader로 듣기" : linkState === "error" ? "링크를 준비하지 못했어요" : "링크 준비 중…";

  return (
    <>
    {" "}
    <span className="whitespace-nowrap">
      <button
        type="button"
        onClick={share}
        disabled={isPrivate && !linkReady}
        aria-label={shareLabel}
        title={shareLabel}
        className={`${inlineBtn} disabled:opacity-40`}
      >
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      </button>
      <button type="button" onClick={copy} aria-label="링크 복사" title="링크 복사" className={inlineBtn}>
        <span className="t-icon-swap h-full w-full" data-state={copied ? "b" : "a"}>
          <svg className="t-icon" data-icon="a" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
          </svg>
          <svg className="t-icon" data-icon="b" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "복사됨" : isPrivate && linkState === "loading" ? "링크 준비 중…" : ""}
      </span>
    </span>
    {isPrivate && linkState === "error" && (
      <button
        type="button"
        onClick={() => void refreshRef.current()}
        className="ml-1 align-middle text-xs font-normal text-[var(--muted)] underline underline-offset-2"
      >
        링크를 준비하지 못했어요 · 다시 시도
      </button>
    )}
    </>
  );
}
