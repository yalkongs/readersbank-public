import { Fragment, type ReactNode } from "react";
import { safeHref, type Block, type Inline } from "@/lib/blocks";
import { headingId } from "@/lib/reading";
import { isPublicBlobImage } from "@/lib/sw-rules";
import { mathKey, splitMath, type MathMap } from "@/lib/math";
import { YouTubeEmbed } from "./YouTubeEmbed";

// 텍스트 속 수식을 서버에서 미리 그린 KaTeX HTML로 바꾼다. 표에 없는 수식은 원문 표기 그대로 둔다.
function MathText({ text, math }: { text: string; math?: MathMap }) {
  if (!math || Object.keys(math).length === 0) return <>{text}</>;
  const segs = splitMath(text);
  if (segs.length === 1 && segs[0].kind === "text") return <>{text}</>;
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === "text") return <Fragment key={i}>{s.text}</Fragment>;
        const html = math[mathKey(s.display, s.tex)];
        if (!html) return <Fragment key={i}>{s.raw}</Fragment>;
        return <span key={i} className={s.display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </>
  );
}

// 서식 없는 조각이 이어지면 하나로 합친다. 추출 과정에서 줄바꿈마다 조각이 나뉘어
// 수식의 여는 \[ 와 닫는 \] 가 서로 다른 조각에 들어가는 경우가 있기 때문이다.
function mergePlain(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    const plain = !it.bold && !it.italic && !it.href;
    if (plain && prev && !prev.bold && !prev.italic && !prev.href) out[out.length - 1] = { text: prev.text + it.text };
    else out.push(plain ? { text: it.text } : it);
  }
  return out;
}

function Inlines({ items, math }: { items: Inline[]; math?: MathMap }) {
  const list = math && Object.keys(math).length > 0 ? mergePlain(items) : items;
  return (
    <>
      {list.map((it, i) => {
        let node: ReactNode = <MathText text={it.text} math={math} />;
        if (it.bold) node = <strong>{node}</strong>;
        if (it.italic) node = <em>{node}</em>;
        const href = safeHref(it.href);
        if (href)
          node = (
            <a href={href} target="_blank" rel="noopener nofollow">
              {node}
            </a>
          );
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

type FigureClick = (src: string, caption?: string) => void;

function renderBlock(block: Block, i: number, onFigureClick?: FigureClick, mark = true, anchors = true, math?: MathMap): ReactNode {
  const d = mark ? { "data-block-index": i } : {};
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h2" | "h3" | "h4";
      return (
        <Tag id={anchors ? headingId(i) : undefined} {...d}>
          <MathText text={block.text} math={math} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p {...d}>
          <Inlines items={block.text} math={math} />
        </p>
      );
    case "quote":
      return (
        <blockquote {...d}>
          <p>
            <Inlines items={block.text} math={math} />
          </p>
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List {...d}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines items={item} math={math} />
            </li>
          ))}
        </List>
      );
    }
    case "code":
      return (
        <pre {...d}>
          <code>{block.text}</code>
        </pre>
      );
    case "figure": {
      const src = safeHref(block.src);
      if (!src) return null;
      // 외부 이미지 도메인이 다양해 next/image 대신 img 사용 (Plan 2에서 Blob 재호스팅)
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={block.alt ?? block.caption ?? ""} crossOrigin={isPublicBlobImage(src) ? "anonymous" : undefined} loading="lazy" width={block.width} height={block.height} />
      );
      return (
        <figure {...d}>
          {onFigureClick ? (
            <button
              type="button"
              className="figure-zoom"
              aria-label={`그림 확대${block.caption ? `: ${block.caption}` : ""}`}
              onClick={() => onFigureClick(src, block.caption)}
            >
              {img}
            </button>
          ) : (
            img
          )}
          {block.caption && (
            <figcaption>
              <MathText text={block.caption} math={math} />
            </figcaption>
          )}
        </figure>
      );
    }
    case "table":
      return (
        <div className="table-wrap" {...d}>
          <table>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <MathText text={cell} math={math} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "divider":
      return <hr {...d} />;
    case "video":
      return <YouTubeEmbed id={block.id} start={block.start} index={mark ? i : undefined} />;
  }
}

export function BlockList({
  blocks,
  untranslated = [],
  onFigureClick,
  startIndex = 0,
  anchors = true,
  math,
}: {
  blocks: Block[];
  untranslated?: number[];
  onFigureClick?: FigureClick;
  startIndex?: number;
  anchors?: boolean;
  math?: MathMap;
}) {
  const missing = new Set(untranslated);
  return (
    <>
      {blocks.map((block, n) => {
        const i = startIndex + n;
        return missing.has(i) ? (
          <div key={i} className="untranslated" data-block-index={anchors ? i : undefined}>
            <span className="untranslated-badge">번역 누락</span>
            {renderBlock(block, i, onFigureClick, false, anchors, math)}
          </div>
        ) : (
          <Fragment key={i}>{renderBlock(block, i, onFigureClick, anchors, anchors, math)}</Fragment>
        );
      })}
    </>
  );
}
