import { describe, expect, it } from "vitest";
import { parseYouTubeUrl, youTubeWatchUrl } from "@/lib/youtube";

describe("parseYouTubeUrl", () => {
  it("reads the common URL forms", () => {
    const id = "dQw4w9WgXcQ";
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://m.youtube.com/watch?v=${id}&feature=share`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}?rel=0`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      `https://www.youtube.com/live/${id}`,
    ]) {
      expect(parseYouTubeUrl(u)).toEqual({ id });
    }
    expect(parseYouTubeUrl(`https://youtu.be/${id}?t=90`)).toEqual({ id, start: 90 });
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${id}&t=1h2m3s`)).toEqual({ id, start: 3723 });
    expect(parseYouTubeUrl(`https://www.youtube.com/embed/${id}?start=30`)).toEqual({ id, start: 30 });
  });

  it("rejects other hosts, bad ids and non-URLs", () => {
    expect(parseYouTubeUrl("https://vimeo.com/123")).toBeNull();
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseYouTubeUrl("https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeUrl("javascript:alert(1)")).toBeNull();
    expect(parseYouTubeUrl("그냥 글")).toBeNull();
  });

  it("builds a watch URL that parses back", () => {
    expect(parseYouTubeUrl(youTubeWatchUrl("dQw4w9WgXcQ", 42))).toEqual({ id: "dQw4w9WgXcQ", start: 42 });
  });
});
