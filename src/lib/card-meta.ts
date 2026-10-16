// 글 카드 아래 정보 줄: 날짜(오늘·어제·N일 전)와 출처 도메인.

const DAY = 86_400_000;
const KST = 9 * 3_600_000;

// 한국 시간 기준 자정부터 센 날짜 번호. 서버(UTC)와 기기 시간대가 달라도 같은 날로 센다.
const kstDay = (t: number) => Math.floor((t + KST) / DAY);

// 오늘(한국 시간) 0시의 시각. 하루 동안 같은 값이라 화면 상태로 쓰기 좋다.
export function todayStart(): number {
  return kstDay(Date.now()) * DAY - KST;
}

export function absoluteDate(d: Date, now: number): string {
  const k = new Date(d.getTime() + KST);
  const thisYear = new Date(now + KST).getUTCFullYear();
  const md = `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
  return k.getUTCFullYear() === thisYear ? md : `${k.getUTCFullYear()}년 ${md}`;
}

export function relativeDate(d: Date, now: number): string {
  const days = kstDay(now) - kstDay(d.getTime());
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return absoluteDate(d, now);
}

// 글쓴이마다 하위 도메인을 주는 블로그 플랫폼. 이런 주소는 하위 도메인(글쓴이 이름)만 보여 준다.
const PLATFORMS = [
  "substack.com",
  "medium.com",
  "hatenablog.com",
  "hatenablog.jp",
  "hateblo.jp",
  "hatenadiary.com",
  "hatenadiary.jp",
  "tistory.com",
  "github.io",
  "blogspot.com",
  "wordpress.com",
  "notion.site",
  "ghost.io",
  "beehiiv.com",
  "bearblog.dev",
  "note.com",
];

// 출처 주소를 짧게(www. 제외, 블로그 플랫폼은 글쓴이 이름). 주소가 없거나 http(s)가 아니면 null.
export function sourceDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "");
    for (const p of PLATFORMS) {
      if (host.endsWith(`.${p}`)) {
        const sub = host.slice(0, -p.length - 1);
        if (sub && !sub.includes(".")) return sub;
      }
    }
    return host || null;
  } catch {
    return null;
  }
}
