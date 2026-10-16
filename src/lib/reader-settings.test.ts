import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, migrateLegacyTheme, parseSettings, settingsToAttrs } from "./reader-settings";

describe("parseSettings", () => {
  it("returns defaults for null, garbage and non-objects", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps valid fields and defaults invalid ones", () => {
    expect(parseSettings(JSON.stringify({ size: 5, bg: "sepia", font: "serif", leading: "loose" }))).toEqual({
      size: 5,
      bg: "sepia",
      font: "serif",
      leading: "loose",
    });
    expect(parseSettings(JSON.stringify({ size: 9, bg: "pink", font: 1, leading: "x" }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ size: 2.5, bg: "gray" }))).toEqual({ ...DEFAULT_SETTINGS, bg: "gray" });
  });
});

describe("settingsToAttrs", () => {
  it("omits bg and theme for auto", () => {
    expect(settingsToAttrs({ ...DEFAULT_SETTINGS, bg: "auto", font: "sans" })).toEqual({ "data-size": "3", "data-font": "sans", "data-leading": "normal" });
  });
  it("defaults to gray background with serif type", () => {
    expect(settingsToAttrs(DEFAULT_SETTINGS)).toEqual({
      "data-size": "3",
      "data-font": "serif",
      "data-leading": "normal",
      "data-bg": "gray",
      "data-theme": "light",
    });
  });
  it("maps black to dark theme", () => {
    const a = settingsToAttrs({ ...DEFAULT_SETTINGS, bg: "black" });
    expect(a["data-bg"]).toBe("black");
    expect(a["data-theme"]).toBe("dark");
  });
  it.each(["white", "sepia", "gray"] as const)("maps %s to light theme", (bg) => {
    const a = settingsToAttrs({ ...DEFAULT_SETTINGS, bg, size: 1 });
    expect(a["data-bg"]).toBe(bg);
    expect(a["data-theme"]).toBe("light");
    expect(a["data-size"]).toBe("1");
  });
});

describe("migrateLegacyTheme", () => {
  it("maps legacy values", () => {
    expect(migrateLegacyTheme("dark")).toEqual({ bg: "black" });
    expect(migrateLegacyTheme("light")).toEqual({ bg: "white" });
    expect(migrateLegacyTheme("system")).toEqual({});
    expect(migrateLegacyTheme(null)).toEqual({});
  });
});

import { LEGACY_KEY, applyThemeColor, clearStoredSettings, type MetaLike } from "./reader-settings";

function fakeMeta(content: string): MetaLike {
  const attrs: Record<string, string> = {};
  return {
    content,
    getAttribute: (n) => attrs[n] ?? null,
    setAttribute: (n, v) => {
      attrs[n] = v;
    },
  };
}

describe("applyThemeColor", () => {
  it("overrides every meta and restores originals on auto", () => {
    const a = fakeMeta("#ffffff");
    const b = fakeMeta("#111111");
    applyThemeColor([a, b], "sepia");
    expect([a.content, b.content]).toEqual(["#f6efe1", "#f6efe1"]);
    applyThemeColor([a, b], "black");
    expect([a.content, b.content]).toEqual(["#111111", "#111111"]);
    applyThemeColor([a, b], "auto");
    expect([a.content, b.content]).toEqual(["#ffffff", "#111111"]);
  });
  it("auto without prior override leaves content alone", () => {
    const a = fakeMeta("#ffffff");
    applyThemeColor([a], "auto");
    expect(a.content).toBe("#ffffff");
  });
});

describe("clearStoredSettings", () => {
  it("removes both new and legacy keys", () => {
    const removed: string[] = [];
    clearStoredSettings({ removeItem: (k) => void removed.push(k) });
    expect(removed).toEqual(["rb-reader", LEGACY_KEY]);
  });
});
