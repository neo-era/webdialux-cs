// v3.1 — giao diện điện thoại: thanh hành động dưới đáy, menu dạng tấm trượt, vùng chạm ≥ 44 px,
// kết quả đường dạng thẻ, nhãn mặt bằng không chồng nhau.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drawAreaPlan } from "../src/areaDraw.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
const mobileCss = [...css.matchAll(/@media \(max-width:640px\)\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");

test("thanh hành động dưới đáy chứa Excel, IES, Chạy, Kết quả, Thêm (menu)", () => {
  const dock = (html.match(/<div class="dock"[^>]*>([\s\S]*?)<\/div>\s*<!-- \/dock -->/) || [])[1];
  assert.ok(dock, "có khối .dock");
  for (const id of ["btnXlsx", "btnIes", "btnRun", "btnSave", "btnMenu"]) assert.match(dock, new RegExp(`id="${id}"`), id);
  assert.ok(dock.indexOf('id="btnRun"') > dock.indexOf('id="btnIes"') && dock.indexOf('id="btnRun"') < dock.indexOf('id="btnSave"'), "Chạy ở giữa");
});

test("CSS điện thoại: dock cố định đáy, menu tấm trượt, vùng chạm ≥ 44 px, safe-area", () => {
  assert.ok(mobileCss.length > 200, "có khối @media (max-width:640px)");
  assert.match(mobileCss, /\.dock\{[^}]*position:fixed[^}]*bottom:0/);
  assert.match(mobileCss, /\.menu\{[^}]*position:fixed[^}]*bottom:0/);
  assert.match(mobileCss, /min-height:44px/);
  assert.match(mobileCss, /safe-area-inset-bottom/);
  assert.match(mobileCss, /#tbl thead\{display:none\}/, "bảng kết quả đổi sang thẻ");
  // dock không được dùng backdrop-filter/transform (làm menu position:fixed bị giam trong dock)
  assert.doesNotMatch(mobileCss, /\.dock\{[^}]*(backdrop-filter|transform)/);
});

test("menu có mục Xuất PDF cho điện thoại và nhãn ngắn trên nút", () => {
  assert.match(html, /id="mPdf"/);
  assert.match(html, /\$\("mPdf"\)\.onclick/);
  assert.match(html, /<span class="short">Excel<\/span>/);
});

test("ô kết quả được gắn data-k theo cột để hiển thị dạng thẻ", () => {
  assert.match(html, /function cardify\(/);
  assert.match(html, /cardify\(tb\)/);
});

// ---- nhãn mặt bằng ----
function mockCtx() {
  const texts = [];
  const ctx = new Proxy({ texts }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "fillText") return (s, x, y) => texts.push({ s: String(s), x, y });
      if (k === "measureText") return (s) => ({ width: String(s).length * 7 });
      return () => {};
    },
    set() { return true; },
  });
  return ctx;
}
const pole = (id, x, y) => ({ id, x, y, H: 8, lamps: [{ aim: 90, tilt: 0, arm: 0, H: null, ies: { name: "a.ies" } }] });

test("nhãn trụ dày đặc: tự ẩn bớt nhãn chồng nhau, trụ đang chọn luôn có nhãn", () => {
  const poles = Array.from({ length: 30 }, (_, i) => pole("T" + (i + 1), (i % 10) * 0.4, Math.floor(i / 10) * 0.4));
  const ctx = mockCtx();
  drawAreaPlan(ctx, 360, 220, { poles, areas: [] }, { declutter: true, sel: "T17", bounds: { x0: -40, y0: -40, x1: 44, y1: 41 } });
  const ids = ctx.texts.filter((t) => /^T\d+$/.test(t.s)).map((t) => t.s);
  assert.ok(ids.length < 30, `ẩn bớt nhãn (đang vẽ ${ids.length})`);
  assert.ok(ids.includes("T17"), "trụ đang chọn có nhãn");
  assert.equal(new Set(ids).size, ids.length);
});

test("nhãn trụ thưa: vẽ đủ tất cả", () => {
  const poles = Array.from({ length: 6 }, (_, i) => pole("T" + (i + 1), i * 20, 0));
  const ctx = mockCtx();
  drawAreaPlan(ctx, 900, 400, { poles, areas: [] }, {});
  assert.equal(ctx.texts.filter((t) => /^T\d+$/.test(t.s)).length, 6);
});

test("PDF (không declutter): vẽ đủ mọi nhãn trụ dù dày đặc", () => {
  const poles = Array.from({ length: 30 }, (_, i) => pole("T" + (i + 1), (i % 10) * 0.4, Math.floor(i / 10) * 0.4));
  const ctx = mockCtx();
  drawAreaPlan(ctx, 360, 220, { poles, areas: [{ name: "Vùng", x0: 0, y0: 0, L: 4, W: 1 }] }, { bounds: { x0: -40, y0: -40, x1: 44, y1: 41 } });
  assert.equal(ctx.texts.filter((t) => /^T\d+$/.test(t.s)).length, 30);
});

test("declutter: tên trụ được ưu tiên hơn tên vùng", () => {
  const ctx = mockCtx();
  drawAreaPlan(ctx, 400, 300, { poles: [pole("T1", 0, 10)], areas: [{ name: "Quảng trường", x0: 0, y0: 0, L: 20, W: 10 }] }, { declutter: true });
  assert.ok(ctx.texts.some((t) => t.s === "T1"));
});

test("bấm ra ngoài menu chỉ đóng menu (bắt ở pha capture, chặn click lan xuống)", () => {
  assert.match(html, /e\.preventDefault\(\); e\.stopPropagation\(\); \$\("menu"\)\.hidden = true;\s*\}, true\);/);
});
