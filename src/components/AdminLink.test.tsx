import { describe, expect, it } from "vitest";
import { adminHref } from "./AdminLink";

describe("adminHref", () => {
  it("points to the article's admin page while reading it", () => {
    expect(adminHref("/a/20261012-diqgek")).toBe("/admin/a/20261012-diqgek");
    expect(adminHref("/a/20261012-diqgek/")).toBe("/admin/a/20261012-diqgek");
  });
  it("falls back to the admin list elsewhere", () => {
    expect(adminHref("/")).toBe("/admin");
    expect(adminHref("/search")).toBe("/admin");
    expect(adminHref(null)).toBe("/admin");
  });
});
