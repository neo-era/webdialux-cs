import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { VERSION } from "../src/version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const html = read("index.html");

// kích thước PNG từ header IHDR
const pngSize = (p) => { const b = readFileSync(join(root, p)); assert.equal(b.toString("ascii", 1, 4), "PNG", p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test("manifest: tên, start_url/scope tương đối, standalone, icon 192/512 + maskable đúng kích thước", () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  const m = JSON.parse(read("manifest.webmanifest"));
  assert.equal(m.name, "WebDialux-CS"); assert.ok(m.short_name);
  assert.equal(m.start_url, "./"); assert.equal(m.scope, "./"); assert.equal(m.display, "standalone");
  assert.ok(m.theme_color && m.background_color);
  const need = [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]];
  for (const [sizes, purpose] of need) {
    const ic = m.icons.find((i) => i.sizes === sizes && (i.purpose || "any").split(" ").includes(purpose));
    assert.ok(ic, `thiếu icon ${sizes} ${purpose}`);
    assert.ok(!ic.src.startsWith("/"), "icon dùng đường dẫn tương đối");
    assert.deepEqual(pngSize(ic.src), sizes.split("x").map(Number));
  }
  assert.match(html, /<meta name="theme-color"/);
  assert.match(html, /<link rel="apple-touch-icon"/);
});

// lấy mảng PRECACHE / CDN và VERSION từ sw.js (không chạy được SW trong Node → đọc tĩnh)
const sw = read("sw.js");
const arr = (name) => JSON.parse(sw.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`))[1].replace(/,\s*\]/, "]"));

test("sw.js: VERSION khớp src/version.mjs (đổi phiên bản → SW mới)", () => {
  assert.equal(sw.match(/const VERSION = "([^"]+)"/)[1], VERSION);
});

test("sw.js: precache đủ mọi src/*.mjs, trang, manifest, icon — và không liệt kê file không tồn tại", () => {
  const pre = arr("PRECACHE");
  for (const f of readdirSync(join(root, "src")).filter((f) => f.endsWith(".mjs"))) assert.ok(pre.includes(`./src/${f}`), `thiếu ./src/${f}`);
  for (const f of ["./", "./index.html", "./manifest.webmanifest"]) assert.ok(pre.includes(f), `thiếu ${f}`);
  const m = JSON.parse(read("manifest.webmanifest"));
  for (const ic of m.icons) assert.ok(pre.includes("./" + ic.src), `thiếu icon ${ic.src}`);
  for (const p of pre) if (p !== "./") assert.ok(existsSync(join(root, p)), `không có file ${p}`);
});

test("sw.js: cache đủ các thư viện CDN mà index.html nạp", () => {
  const cdn = arr("CDN");
  const tags = [...html.matchAll(/<script src="(https:[^"]+)"/g)].map((x) => x[1]);
  assert.ok(tags.length >= 3);
  assert.deepEqual([...cdn].sort(), [...tags].sort());
});

test("index.html: đăng ký SW có điều kiện + thanh 'Có bản mới'", () => {
  assert.match(html, /"serviceWorker" in navigator/);
  assert.match(html, /location\.protocol !== "file:"/);
  assert.match(html, /register\("\.\/sw\.js"\)/);
  assert.match(html, /id="updBar"[^>]*hidden/);
  assert.match(html, /SKIP_WAITING/);
});

test("PWA chuẩn: nút 'Cài đặt ứng dụng' (beforeinstallprompt), hướng dẫn iOS, meta Apple", () => {
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="WebDialux">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /id="mInstall"[^>]*hidden/);
  assert.match(html, /id="mIosHint"[^>]*hidden/);
  assert.match(html, /addEventListener\("beforeinstallprompt"/);
  assert.match(html, /addEventListener\("appinstalled"/);
  assert.match(html, /Thêm vào MH chính/);
});

test("index.html: xuất PDF dựng mục lục (addToc) trước finalizeDoc, tên bộ đèn qua luminaireLabel", () => {
  assert.match(html, /addToc\(doc, info\.entries, info\); finalizeDoc\(doc\)/);
  assert.match(html, /lamp: luminaireLabel\(e\.name\)/);
});

test("index.html: mục lục + trang PDF lấy đèn từ pickReportIes; CS mục lục = CS file IES đã tính", () => {
  assert.match(html, /pickReportIes\(res, g\.meta, iesIndex\)/);
  assert.match(html, /power: e\.power \?\? null/);
  assert.match(html, /iesNote: note/);
  assert.doesNotMatch(html, /\(res\.options\|\|\[\]\)\)\[0\]/, "không còn lấy options[0]");
});
