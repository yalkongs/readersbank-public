// 문서는 경로로만 판단하고 응답의 Cache-Control(private/no-store)은 보지 않는다.
// Next가 동적 페이지에 항상 private/no-store를 붙이기 때문이다. 캐시는 기기별(브라우저 로컬)이며,
// /admin·/api는 절대 캐시하지 않는다. 캐시되는 페이지의 개인화는 소유자 본인의 등록/관리 링크뿐이다.
// src/lib/sw-rules.ts와 동일하게 유지 (shouldCacheRequest / isCacheableDocumentPath / isCacheableDocumentResponse / isPrivateDocumentHtml).
const DOCS = "rb-docs-v3"; // v3: 문서 키를 쿼리 없는 경로로 바꿔 이전 항목(검색 결과 포함)을 비운다
const IMGS = "rb-img-v1";
const STATIC = "rb-static-v5"; // v5: theme-init.js 기본 읽기 설정 변경
const CURRENT = [DOCS, IMGS, STATIC];
const MAX_DOCS = 20;
const MAX_IMGS = 200;
const MAX_STATIC = 300;

function shouldCacheRequest(req, origin) {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  if (url.origin !== origin) {
    if (url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com") && req.destination === "image") return "image";
    return null;
  }
  const path = url.pathname;
  if (path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/.well-known")) return null;
  if (path.startsWith("/_next/static/")) return "static";
  if (path.startsWith("/icons/") || path === "/manifest.webmanifest" || path === "/theme-init.js" || path.endsWith(".woff2")) return "static";
  // 쿼리가 있는 문서(검색/태그 결과 /?q=, 비공개 듣기 링크 /read?t=)는 캐시하지 않는다. 문서 캐시 키는 쿼리 없는 경로다.
  if ((req.mode === "navigate" || req.destination === "document") && isCacheableDocumentPath(path) && url.search === "") return "document";
  return null;
}

// 오프라인 읽기용으로 저장할 수 있는 문서 경로: 홈(/)과 글(/a/<slug>...)뿐이다.
function isCacheableDocumentPath(pathname) {
  return pathname === "/" || (pathname.startsWith("/a/") && pathname.length > 3 && !/\/(opengraph|twitter)-image/.test(pathname));
}

function isCacheableDocumentResponse(res) {
  return res.ok && res.status === 200 && res.type === "basic" && !res.redirected;
}

// 소유자만 보는 비공개 글 화면은 <meta name="rb-private">를 싣는다. 이런 응답은 저장하지 않는다(페이지는 응답 헤더를 못 바꾼다).
function isPrivateDocumentHtml(html) {
  return /<meta[^>]+name="rb-private"/.test(html);
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  // /offline 사전 캐시는 개수 제한에서 제외한다.
  const keys = (await cache.keys()).filter((k) => new URL(k.url).pathname !== "/offline");
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(DOCS).then((c) => c.add("/offline")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !CURRENT.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// 캐시 저장/정리는 응답을 돌려준 뒤 waitUntil 안에서 한다. 저장 실패가 온라인 응답을
// 오프라인 대체 응답으로 바꾸거나 respondWith를 거부시키면 안 된다.
function storeInBackground(event, cacheName, key, res, max) {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.put(key, res))
      .then(() => (max ? trim(cacheName, max) : undefined))
      .catch(() => {}),
  );
}

// 비공개 글이면 저장하지 않고, 공개 때 저장해 둔 사본이 있으면 지운다.
function storeDocument(key, res) {
  return res
    .text()
    .then(async (html) => {
      const cache = await caches.open(DOCS);
      if (isPrivateDocumentHtml(html)) return cache.delete(key);
      await cache.put(key, new Response(html, { status: res.status, statusText: res.statusText, headers: res.headers }));
      await trim(DOCS, MAX_DOCS);
    })
    .catch(() => {});
}

function storeDocumentInBackground(event, key, res) {
  event.waitUntil(storeDocument(key, res));
}

async function networkFirstDocument(event) {
  const request = event.request;
  // 문서 캐시 키는 쿼리 없는 경로다.
  const key = new URL(request.url).pathname;
  let res;
  try {
    res = await fetch(request);
  } catch {
    const cache = await caches.open(DOCS);
    return (await cache.match(key)) ?? (await cache.match("/offline")) ?? Response.error();
  }
  if (isCacheableDocumentResponse(res)) storeDocumentInBackground(event, key, res.clone());
  // 글이 비공개가 되거나 사라져 404가 오면 이전에 저장한 사본도 지운다.
  else if (res.status === 404) event.waitUntil(caches.open(DOCS).then((cache) => cache.delete(key)).catch(() => {}));
  return res;
}

async function cacheFirst(event, cacheName, max) {
  const request = event.request;
  const hit = await caches
    .open(cacheName)
    .then((cache) => cache.match(request))
    .catch(() => undefined);
  if (hit) return hit;
  const res = await fetch(request);
  // 불투명(no-cors) 응답은 상태를 알 수 없어 저장하지 않는다.
  if (res.status === 200 && (res.type === "basic" || res.type === "cors")) storeInBackground(event, cacheName, request, res.clone(), max);
  return res;
}

self.addEventListener("fetch", (event) => {
  const kind = shouldCacheRequest(event.request, self.location.origin);
  if (kind === null) return;
  if (kind === "document") event.respondWith(networkFirstDocument(event));
  else if (kind === "image") event.respondWith(cacheFirst(event, IMGS, MAX_IMGS));
  else event.respondWith(cacheFirst(event, STATIC, MAX_STATIC));
});

// next/link 이동은 RSC 요청이라 문서가 캐시되지 않는다. 글 화면(CachePage)이 경로를 보내면
// 문서와 같은 규칙으로 검사한 뒤 직접 받아 저장한다.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache-page" || typeof data.path !== "string") return;
  let url;
  try {
    url = new URL(data.path, self.location.origin);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || url.search !== "" || !isCacheableDocumentPath(url.pathname)) return;
  const key = url.pathname;
  event.waitUntil(
    fetch(key, { credentials: "same-origin" })
      .then((res) => {
        if (!isCacheableDocumentResponse(res)) return;
        return storeDocument(key, res);
      })
      .catch(() => {}),
  );
});

// 웹 푸시(소유자 알림): 등록 실패·번역 누락·주간 요약. 누르면 해당 관리 화면을 연다.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ReadersBank", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "ReadersBank";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).toString();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
