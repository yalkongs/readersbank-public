import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ImageResponse } from "next/og";
import { getPublishedBySlugCached } from "@/lib/articles/cached";
import { OG_SIZE, type OgFormat, type OgText, SITE_TAGLINE, prepareOgText, supportedCoverType } from "@/lib/og";
import { isPublicBlobImage } from "@/lib/sw-rules";
import { SITE_AUTHOR } from "@/lib/site";

export { OG_SIZE } from "@/lib/og";

const FONT_DIR = path.join(process.cwd(), "node_modules/pretendard/dist/public/static");
const FONT_FILES = [
  { weight: 400, file: "Pretendard-Regular.otf" },
  { weight: 500, file: "Pretendard-Medium.otf" },
  { weight: 800, file: "Pretendard-ExtraBold.otf" },
] as const;

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 800; style: "normal" }[]> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async ({ weight, file }) => ({
      name: "Pretendard",
      data: await fs.readFile(path.join(FONT_DIR, file)),
      weight,
      style: "normal" as const,
    })),
  ).catch((e) => {
    fontsPromise = null;
    throw e;
  });
  return fontsPromise;
}

const COVER_TIMEOUT_MS = 5000;
const COVER_MAX_BYTES = 8 * 1024 * 1024;

/** 우리 Blob의 표지만 받아 카드 크기에 맞춰 잘라 JPEG data URL로 만든다(avif/webp도 canvas가 읽는다). 실패하면 null(= 타이포그래피 카드로 대체). */
async function loadCover(src: string | null, f: OgFormat): Promise<string | null> {
  if (!src || !isPublicBlobImage(src)) return null;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(COVER_TIMEOUT_MS), redirect: "error" });
    if (!res.ok) return null;
    if (!supportedCoverType(res.headers.get("content-type"))) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > COVER_MAX_BYTES) return null;
    const img = await loadImage(buf);
    const { width, height } = OG_SIZE[f];
    const scale = Math.max(width / img.width, height / img.height);
    const sw = width / scale;
    const sh = height / scale;
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, width, height);
    return `data:image/jpeg;base64,${canvas.toBuffer("image/jpeg", 88).toString("base64")}`;
  } catch {
    return null;
  }
}

const AMBER = "#f59e0b";

// Satori는 자식이 둘 이상인 div에 display:flex를 요구한다. 줄 수 제한은 lineClamp + 미리 자른 글자 수로 이중 방어한다.
function clampStyle(lines: number) {
  return { display: "block", lineClamp: lines, wordBreak: "keep-all", overflow: "hidden" } as const;
}

function Handle({ color, right, bottom }: { color: string; right: number; bottom: number }) {
  if (!SITE_AUTHOR) return null;
  return (
    <div style={{ position: "absolute", right, bottom, display: "flex", fontSize: 30, fontWeight: 500, color }}>@{SITE_AUTHOR}</div>
  );
}

function CoverCard({ cover, text, f }: { cover: string; text: OgText; f: OgFormat }) {
  const P = f === "portrait";
  const { width, height } = OG_SIZE[f];
  const M = P ? 80 : 56;
  return (
    <div style={{ width, height, display: "flex", position: "relative", background: "#111", fontFamily: "Pretendard" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori는 next/image를 못 쓴다 */}
      <img src={cover} width={width} height={height} alt="" style={{ position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" }} />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width,
          height,
          display: "flex",
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.92) 100%)",
        }}
      />
      <div style={{ position: "absolute", top: M, left: M, display: "flex", fontSize: P ? 40 : 34, fontWeight: 800, color: "#fff" }}>ReadersBank</div>
      <div style={{ position: "absolute", left: M, right: M, bottom: P ? 200 : 96, display: "flex", flexDirection: "column" }}>
        <div style={{ ...clampStyle(P ? 3 : 2), fontSize: P ? 68 : 52, lineHeight: P ? "88px" : "66px", fontWeight: 800, color: "#fff" }}>{text.title}</div>
        {text.lead && (
          <div style={{ ...clampStyle(P ? 2 : 1), marginTop: P ? 20 : 14, fontSize: P ? 32 : 26, lineHeight: P ? "46px" : "36px", fontWeight: 400, color: "rgba(255,255,255,0.8)" }}>
            {text.lead}
          </div>
        )}
      </div>
      <Handle color="rgba(255,255,255,0.75)" right={M} bottom={P ? 80 : 32} />
    </div>
  );
}

function TypeCard({ text, f }: { text: OgText; f: OgFormat }) {
  const P = f === "portrait";
  const { width, height } = OG_SIZE[f];
  const M = P ? 80 : 56;
  const hasSummary = P && text.summary.length > 0;
  return (
    <div style={{ width, height, display: "flex", position: "relative", background: "#111", fontFamily: "Pretendard" }}>
      <div style={{ position: "absolute", top: M, left: M, display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", width: P ? 12 : 10, height: P ? 56 : 44, background: AMBER }} />
        <div style={{ display: "flex", marginLeft: P ? 20 : 16, fontSize: P ? 40 : 34, fontWeight: 800, color: "#ececec" }}>ReadersBank</div>
      </div>
      <div style={{ position: "absolute", top: P ? 240 : 170, left: M, right: M, display: "flex", flexDirection: "column" }}>
        <div style={{ ...clampStyle(P ? 4 : 3), fontSize: P ? 76 : 60, lineHeight: P ? "100px" : "78px", fontWeight: 800, color: "#ececec" }}>{text.title}</div>
        {hasSummary ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 50 }}>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#a3a3a3", marginBottom: 20 }}>TL;DR</div>
            {text.summary.map((s, i) => (
              <div key={i} style={{ display: "flex", marginBottom: 22 }}>
                <div style={{ display: "flex", width: 50, fontSize: 32, lineHeight: "46px", color: AMBER }}>•</div>
                <div style={{ ...clampStyle(2), flex: 1, fontSize: 32, lineHeight: "46px", fontWeight: 400, color: "#d4d4d4" }}>{s}</div>
              </div>
            ))}
          </div>
        ) : (
          text.lead && (
            <div style={{ ...clampStyle(P ? 4 : 2), marginTop: P ? 50 : 28, fontSize: P ? 34 : 28, lineHeight: P ? "50px" : "40px", fontWeight: 400, color: "#d4d4d4" }}>{text.lead}</div>
          )
        )}
      </div>
      {P && <div style={{ position: "absolute", left: M, right: M, bottom: M + 60, height: 2, display: "flex", background: "#2a2a2a" }} />}
      <Handle color="#a3a3a3" right={M} bottom={P ? 80 : 32} />
    </div>
  );
}

async function render(node: React.ReactElement, f: OgFormat) {
  return new ImageResponse(node, { ...OG_SIZE[f], fonts: await loadFonts() });
}

/** 글 한 편의 미리보기. 표지가 쓸 만하면 풀블리드(B), 아니면 타이포그래피(C). 글이 없으면 사이트 기본 카드. */
export async function renderArticleOg(slug: string, f: OgFormat) {
  const a = await getPublishedBySlugCached(slug);
  if (!a) return renderSiteOg(f);
  const text = prepareOgText(a, f);
  const cover = await loadCover(a.coverImage, f);
  return render(cover ? <CoverCard cover={cover} text={text} f={f} /> : <TypeCard text={text} f={f} />, f);
}

export async function renderSiteOg(f: OgFormat) {
  return render(<TypeCard text={{ title: "ReadersBank", lead: SITE_TAGLINE, summary: [] }} f={f} />, f);
}

// 빌드 중 페이지 정보를 모을 때도 불린다. DB를 아직 연결하지 않은 첫 배포에서도 빌드가 멈추지 않게 기본 문구로 둔다.
export async function articleOgAlt(slug: string): Promise<string> {
  try {
    const a = await getPublishedBySlugCached(slug);
    return a?.titleKo ?? a?.titleOriginal ?? "ReadersBank";
  } catch {
    return "ReadersBank";
  }
}
