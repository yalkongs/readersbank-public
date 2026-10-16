import Link from "next/link";
import { SITE_AUTHOR } from "@/lib/site";

export const metadata = {
  title: "소개",
  description: "읽은 것들을 흘려버리지 않고 붙잡고 나누기 위하여 만들었다.",
};

// 흘러가는 물결선. 한 주기(600)를 이어 붙여 그리고 그만큼 옮기면 끊김 없이 반복된다.
const PERIOD = 600;
function wave(y: number, amp: number, phase: number): string {
  const x0 = -PERIOD + phase;
  let d = `M ${x0} ${y} Q ${x0 + PERIOD / 4} ${y - amp} ${x0 + PERIOD / 2} ${y}`;
  for (let x = x0 + PERIOD; x <= 2400; x += PERIOD / 2) d += ` T ${x} ${y}`;
  return d;
}

const LINES = Array.from({ length: 15 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * n) + 1) / 2); // 고정된 의사 난수(렌더마다 같다)
  return {
    d: wave(30 + i * 52, 6 + r(12.9898) * 18, Math.round(r(78.233) * PERIOD)),
    opacity: 0.07 + r(39.425) * 0.1,
    duration: 26 + Math.round(r(4.1414) * 30),
  };
});

export default function AboutPage() {
  return (
    <main className="rb-about-stage">
      <svg className="rb-about-stream" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        {LINES.map((l, i) => (
          <path key={i} className="rb-about-flow" d={l.d} style={{ opacity: l.opacity, animationDuration: `${l.duration}s` }} />
        ))}
      </svg>

      <div className="rb-about-copy">
        <p className="rb-about-eyebrow t-stagger-line">About ReadersBank</p>
        <h1 className="rb-about-statement">
          <span className="t-stagger-line t-stagger-line--2">읽은 것들을</span>
          <span className="rb-about-fading t-stagger-line t-stagger-line--3">흘려버리지 않고</span>
          <span className="rb-about-caught t-stagger-line t-stagger-line--4">붙잡고</span>
          <span className="t-stagger-line t-stagger-line--5">나누기 위하여</span>
          <span className="t-stagger-line t-stagger-line--6">만들었다.</span>
        </h1>
        <svg className="rb-about-thread" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M 2 36 C 140 6, 230 58, 360 30 S 600 14, 760 30 S 1000 32, 1198 30" />
        </svg>
        {SITE_AUTHOR && <p className="rb-about-signature t-stagger-line t-stagger-line--7">by {SITE_AUTHOR}</p>}
        <Link href="/" className="rb-about-home t-stagger-line t-stagger-line--8">
          붙잡아 둔 글 보러 가기 <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  );
}
