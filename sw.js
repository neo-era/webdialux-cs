// Service worker WebDialux-CS: cài như ứng dụng + chạy offline (xem DESIGN.md mục PWA).
// VERSION phải bằng src/version.mjs (test/pwa.test.mjs kiểm) — đổi phiên bản thì byte file này đổi,
// trình duyệt cài SW mới và trang hiện thanh "Có bản mới".
const VERSION = "v2.0";
const CACHE = "webdialux-" + VERSION;
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./src/batch.mjs",
  "./src/engine.mjs",
  "./src/font.mjs",
  "./src/geometry.mjs",
  "./src/ies.mjs",
  "./src/mapping.mjs",
  "./src/metrics.mjs",
  "./src/pdfparts.mjs",
  "./src/photometry.mjs",
  "./src/r3data.mjs",
  "./src/report.mjs",
  "./src/rtable.mjs",
  "./src/scoring.mjs",
  "./src/version.mjs",
  "./src/xlsxpro.mjs"
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"
];
const NET_TIMEOUT_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
    // CDN tải dạng cors (cdnjs có ACAO *) để kiểm được res.ok — opaque thì 404 cũng bị lưu, lại bị đệm ~7 MB/mục.
    // Lỗi CDN không làm hỏng cài đặt: thiếu mục nào sẽ được tải bù ở lần dùng có mạng.
    await Promise.all(CDN.map((u) => cacheCdn(c, u).catch(() => {})));
  })());
});

async function cacheCdn(c, url) {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await c.put(url, res.clone());
  return res;
}

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("webdialux-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebDialux-CS — offline</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#1c2430;background:#f3f5f8">
<h2>Chưa có bản lưu để chạy offline</h2><p>Máy đang mất mạng và trình duyệt chưa lưu ứng dụng (lần đầu mở, hoặc dữ liệu trang vừa bị xoá).
Kết nối mạng rồi mở lại một lần — sau đó WebDialux-CS chạy được cả khi không có mạng.</p></body>`;

const offlinePage = () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });

// Cùng origin: mạng trước (no-cache = hỏi lại server, bỏ qua max-age 600 s của GitHub Pages), lưu bản mới;
// quá NET_TIMEOUT_MS thì dùng cache nếu có, chưa có thì vẫn chờ mạng (không trả trang offline khi đang online).
async function networkFirst(e) {
  const req = e.request, c = await caches.open(CACHE);
  // Request navigate không tạo lại được với init → fetch theo URL
  const net = (req.mode === "navigate" ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req, { cache: "no-cache" }))
    .then((res) => { if (res.status === 200) e.waitUntil(c.put(req, res.clone()).catch(() => {})); return res; });
  net.catch(() => {}); // đã trả bản cache vì chậm mà mạng hỏng sau đó: không để rejection trôi
  const fromCache = async () => (await c.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await c.match("./") : undefined);
  const timeout = new Promise((r) => setTimeout(() => r("timeout"), NET_TIMEOUT_MS));
  try {
    const first = await Promise.race([net, timeout]);
    if (first !== "timeout") return first;
    return (await fromCache()) || (await net);
  } catch (_) {
    return (await fromCache()) || (req.mode === "navigate" ? offlinePage() : Response.error());
  }
}

// CDN: cache trước (URL có số phiên bản, không đổi); chưa có thì tải và lưu bù
async function cdnFirst(e) {
  const c = await caches.open(CACHE), hit = await c.match(e.request.url);
  if (hit) return hit;
  try { return await cacheCdn(c, e.request.url); } catch (_) { return fetch(e.request); }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(e)); return; }
  if (CDN.includes(req.url)) e.respondWith(cdnFirst(e));
});
