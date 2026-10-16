// 처음 온 사람은 홈 대신 소개(/about)부터 보여 준다. 판단은 proxy가 요청 헤더만 보고 한다.

export const INTRO_COOKIE = "rb_intro";
export const INTRO_MAX_AGE = 60 * 60 * 24 * 365;

// 검색엔진·링크 미리보기·명령줄 도구. 이들에게 소개를 보내면 검색 결과와 공유 카드가 소개 화면이 된다.
const BOT = /bot|crawl|spider|slurp|preview|scrap|facebookexternalhit|embedly|daumoa|yeti|whatsapp|slack|curl|wget|python|node-fetch|headless/i;

export function introCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: INTRO_MAX_AGE };
}

// 브라우저가 홈 문서를 직접 여는 요청(Sec-Fetch-Mode: navigate)만 본다. 사이트 안에서 누른 링크(RSC fetch)는
// 이미 둘러보는 중이므로 넘기지 않는다. 그래서 쿠키를 막은 브라우저도 소개의 "들어가기"로 홈에 갈 수 있다.
// Next는 rsc 헤더와 _rsc 쿼리를 proxy에 넘기지 않으므로 이 헤더로 가린다. 헤더가 없는 오래된 브라우저·봇은 홈을 그대로 본다.
export function shouldShowIntro(req: { method: string; headers: Headers; hasIntroCookie: boolean; signedIn: boolean }): boolean {
  if (req.method !== "GET" || req.hasIntroCookie || req.signedIn) return false;
  const h = req.headers;
  if (h.get("sec-fetch-mode") !== "navigate" || h.get("sec-purpose") || h.get("purpose") === "prefetch") return false;
  return !BOT.test(h.get("user-agent") ?? "");
}
