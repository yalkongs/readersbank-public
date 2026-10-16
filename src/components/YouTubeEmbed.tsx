"use client";

import { useState } from "react";
import { isYouTubeId } from "@/lib/youtube";

// 처음에는 썸네일만 보여 주고, 누를 때 플레이어를 불러온다(글이 무거워지지 않고 추적 쿠키도 없다).
export function YouTubeEmbed({ id, start, index }: { id: string; start?: number; index?: number }) {
  const [playing, setPlaying] = useState(false);
  if (!isYouTubeId(id)) return null;
  const params = new URLSearchParams({ autoplay: "1", rel: "0" });
  if (start) params.set("start", String(start));
  return (
    <figure className="rb-video" data-block-index={index}>
      <div className="rb-video-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
            title="YouTube 동영상"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button type="button" className="rb-video-poster" onClick={() => setPlaying(true)} aria-label="YouTube 동영상 재생">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className="rb-video-play" aria-hidden="true">
              <svg width="68" height="48" viewBox="0 0 68 48">
                <path d="M66.5 7.7a8.5 8.5 0 0 0-6-6C55.2.3 34 .3 34 .3s-21.2 0-26.5 1.4a8.5 8.5 0 0 0-6 6C.1 13 .1 24 .1 24s0 11 1.4 16.3a8.5 8.5 0 0 0 6 6C12.8 47.7 34 47.7 34 47.7s21.2 0 26.5-1.4a8.5 8.5 0 0 0 6-6C67.9 35 67.9 24 67.9 24s0-11-1.4-16.3z" fill="#f00" />
                <path d="M45 24 27 14v20z" fill="#fff" />
              </svg>
            </span>
          </button>
        )}
      </div>
    </figure>
  );
}
