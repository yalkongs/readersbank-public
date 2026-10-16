import { describe, expect, it } from "vitest";
import { shouldShowIntro } from "@/lib/intro";

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const req = (headers: Record<string, string>, extra: Partial<Parameters<typeof shouldShowIntro>[0]> = {}) => ({
  method: "GET",
  headers: new Headers({ "user-agent": SAFARI, "sec-fetch-mode": "navigate", ...headers }),
  hasIntroCookie: false,
  signedIn: false,
  ...extra,
});

describe("shouldShowIntro", () => {
  it("sends a first-time browser visit to the intro", () => {
    expect(shouldShowIntro(req({}))).toBe(true);
  });
  it("skips returning visitors and the signed-in owner", () => {
    expect(shouldShowIntro(req({}, { hasIntroCookie: true }))).toBe(false);
    expect(shouldShowIntro(req({}, { signedIn: true }))).toBe(false);
  });
  it("skips in-app navigations and prefetches", () => {
    expect(shouldShowIntro(req({ "sec-fetch-mode": "cors" }))).toBe(false);
    expect(shouldShowIntro(req({ "sec-purpose": "prefetch" }))).toBe(false);
    const noFetchMeta = req({});
    noFetchMeta.headers.delete("sec-fetch-mode");
    expect(shouldShowIntro(noFetchMeta)).toBe(false);
    expect(shouldShowIntro(req({}, { method: "HEAD" }))).toBe(false);
  });
  it("still shows the intro inside KakaoTalk, LINE, and Daum in-app browsers", () => {
    for (const ua of [`${SAFARI} KAKAOTALK 10.8.0`, `${SAFARI} Line/14.0.0`, `${SAFARI} DaumApps/7.0`]) {
      expect(shouldShowIntro(req({ "user-agent": ua }))).toBe(true);
    }
  });
  it("skips crawlers and link-preview bots", () => {
    for (const ua of ["Googlebot/2.1", "TelegramBot (like TwitterBot)", "facebookexternalhit/1.1", "kakaotalk-scrap/1.0", "Mozilla/5.0 (compatible; Yeti/1.1)", "Mozilla/5.0 (compatible; Daumoa/4.0)", "facebookexternalhit/1.1;line-poker/1.0", "Slackbot-LinkExpanding 1.0", "WhatsApp/2.23", "curl/8.4.0"]) {
      expect(shouldShowIntro(req({ "user-agent": ua }))).toBe(false);
    }
  });
});
