import { describe, expect, it, vi } from "vitest";
import { FetchStatusError, UnsafeUrlError, assertPublicUrl, isPrivateAddress, safeFetch } from "@/lib/net/safe-fetch";

const resolve = async (host: string) =>
  ({ "public.example": ["93.184.216.34"], "internal.example": ["10.0.0.5"], "v6.example": ["::1"] })[host] ?? [];

describe("isPrivateAddress", () => {
  it.each(["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.0.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"])("%s is public", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
});

describe("assertPublicUrl", () => {
  it("rejects non-http schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", resolve)).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects literal private IPs and hosts resolving to private IPs", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/", resolve)).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("http://[::1]/", resolve)).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("http://internal.example/", resolve)).rejects.toThrow(UnsafeUrlError);
  });
  it("accepts public hosts", async () => {
    await expect(assertPublicUrl("https://public.example/a", resolve)).resolves.toBeInstanceOf(URL);
  });
});

describe("safeFetch", () => {
  it("blocks redirect to private address", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://internal.example/admin" } }));
    await expect(safeFetch("https://public.example/", { maxBytes: 1000, resolve, fetchImpl })).rejects.toThrow(UnsafeUrlError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("follows public redirects and returns body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/final" } }))
      .mockResolvedValueOnce(new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    const res = await safeFetch("https://public.example/start", { maxBytes: 1000, resolve, fetchImpl });
    expect(res.url).toBe("https://public.example/final");
    expect(res.contentType).toContain("text/html");
    expect(res.body.toString()).toBe("<html>ok</html>");
  });
  it("stops after 5 redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    await expect(safeFetch("https://public.example/", { maxBytes: 1000, resolve, fetchImpl })).rejects.toThrow("리다이렉트가 너무 많습니다");
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
  it("enforces maxBytes", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(2000), { status: 200 }));
    await expect(safeFetch("https://public.example/", { maxBytes: 1000, resolve, fetchImpl })).rejects.toThrow("응답이 너무 큽니다");
  });
  it("throws FetchStatusError with status on 4xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 403 }));
    const err = await safeFetch("https://public.example/", { maxBytes: 1000, resolve, fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(FetchStatusError);
    expect(err.status).toBe(403);
  });
});

describe("IPv6 blocklist (fix round 1)", () => {
  it.each(["febf::1", "fe90::", "fec0::1", "64:ff9b::7f00:1", "2002:7f00:1::", "::7f00:1", "::ffff:7f00:1", "fc00::1", "ff02::1", "2001:0:1::1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["::ffff:808:808", "2606:4700::1111", "64:ff9b::808:808", "2002:808:808::"])("%s is public", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false),
  );
  it("rejects IPv4-compatible loopback after URL normalisation", async () => {
    await expect(assertPublicUrl("http://[::127.0.0.1]/", resolve)).rejects.toThrow(UnsafeUrlError);
  });
  it("rejects IPv4-mapped loopback after URL normalisation", async () => {
    await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/", resolve)).rejects.toThrow(UnsafeUrlError);
  });
});
