import { lookup } from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

export class FetchStatusError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Resolver = (host: string) => Promise<string[]>;
export type SafeFetchOptions = { maxBytes: number; timeoutMs?: number; resolve?: Resolver; fetchImpl?: typeof fetch };
export type SafeFetchResult = { url: string; status: number; contentType: string; body: Buffer; contentDisposition?: string };

const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; ReadersBank/1.0)";

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const b = ipv6ToBytes(ip);
    const ipv4 = (from: number) => b.slice(from, from + 4).join(".");
    const zeroTo = (n: number) => b.slice(0, n).every((x) => x === 0);
    if (zeroTo(12)) return true; // ::/96 (includes ::, ::1, IPv4-compatible)
    if (zeroTo(10) && b[10] === 0xff && b[11] === 0xff) return isPrivateAddress(ipv4(12)); // ::ffff:0:0/96
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
      return isPrivateAddress(ipv4(12)); // 64:ff9b::/96 (NAT64)
    }
    if (b[0] === 0x20 && b[1] === 0x02) return isPrivateAddress(ipv4(2)); // 2002::/16 (6to4)
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // 2001::/32 (Teredo)
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 (site-local)
    if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7
    if (b[0] === 0xff) return true; // ff00::/8 (multicast)
    return false;
  }
  return true;
}

// Parses a valid IPv6 literal (as accepted by net.isIPv6) into 16 bytes.
function ipv6ToBytes(ip: string): number[] {
  let s = ip.toLowerCase().split("%")[0];
  const lastColon = s.lastIndexOf(":");
  const last = s.slice(lastColon + 1);
  if (last.includes(".")) {
    const q = last.split(".").map(Number);
    s = `${s.slice(0, lastColon + 1)}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }
  const parseGroups = (part: string) => (part ? part.split(":").map((h) => parseInt(h, 16)) : []);
  const halves = s.split("::");
  let groups: number[];
  if (halves.length === 2) {
    const head = parseGroups(halves[0]);
    const rest = parseGroups(halves[1]);
    groups = [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
  } else {
    groups = parseGroups(s);
  }
  return groups.flatMap((g) => [(g >> 8) & 0xff, g & 0xff]);
}

async function defaultResolve(host: string): Promise<string[]> {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
}

export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolve): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("올바른 URL이 아닙니다");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new UnsafeUrlError("http(s) 주소만 허용됩니다");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = net.isIP(host) ? [host] : await resolve(host);
  } catch {
    throw new UnsafeUrlError("주소를 찾을 수 없습니다");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new UnsafeUrlError("내부망 주소로는 요청할 수 없습니다");
  }
  return u;
}

async function readLimited(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > maxBytes) throw new Error("응답이 너무 큽니다");
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("응답이 너무 큽니다");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function safeFetch(raw: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertPublicUrl(current, opts.resolve);
    const res = await fetchImpl(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`리다이렉트 위치가 없습니다 (HTTP ${res.status})`);
      current = new URL(location, u).toString();
      continue;
    }
    if (!res.ok) throw new FetchStatusError(res.status, `페이지 요청 실패 (HTTP ${res.status})`);
    const body = await readLimited(res, opts.maxBytes);
    return {
      url: u.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
      contentDisposition: res.headers.get("content-disposition") ?? undefined,
    };
  }
  throw new UnsafeUrlError("리다이렉트가 너무 많습니다");
}
