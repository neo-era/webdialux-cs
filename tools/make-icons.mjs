// Sinh icon PWA (icons/*.png) bằng @napi-rs/canvas: cột đèn đường + vùng sáng trên mặt đường.
// Chạy: node tools/make-icons.mjs
import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const out = join(dirname(fileURLToPath(import.meta.url)), "../icons");
mkdirSync(out, { recursive: true });

// maskable: nền tràn viền, hình nằm trong vùng an toàn 80% → thu nhỏ hình
function draw(S, { maskable = false } = {}) {
  const cv = createCanvas(S, S), c = cv.getContext("2d");
  const bg = c.createLinearGradient(0, 0, 0, S); bg.addColorStop(0, "#2a6fbd"); bg.addColorStop(1, "#173f6e");
  c.fillStyle = bg;
  if (maskable) c.fillRect(0, 0, S, S);
  else { const r = S * 0.22; c.beginPath(); c.roundRect(0, 0, S, S, r); c.fill(); }
  const k = maskable ? 0.78 : 1; // co hình vào vùng an toàn
  c.translate(S / 2, S / 2); c.scale(k, k); c.translate(-S / 2, -S / 2);
  const u = S / 100;
  // mặt đường + vùng sáng
  c.fillStyle = "#0f2a4a"; c.fillRect(8 * u, 78 * u, 84 * u, 12 * u);
  const pool = c.createRadialGradient(58 * u, 80 * u, 1 * u, 58 * u, 80 * u, 30 * u);
  pool.addColorStop(0, "rgba(255,226,140,0.95)"); pool.addColorStop(1, "rgba(255,226,140,0)");
  c.fillStyle = pool; c.fillRect(8 * u, 78 * u, 84 * u, 12 * u);
  // chùm sáng
  const beam = c.createLinearGradient(0, 30 * u, 0, 80 * u);
  beam.addColorStop(0, "rgba(255,230,150,0.55)"); beam.addColorStop(1, "rgba(255,230,150,0.05)");
  c.fillStyle = beam; c.beginPath(); c.moveTo(52 * u, 31 * u); c.lineTo(66 * u, 31 * u); c.lineTo(84 * u, 80 * u); c.lineTo(34 * u, 80 * u); c.closePath(); c.fill();
  // cột + cần
  c.strokeStyle = "#e9eef5"; c.lineCap = "round"; c.lineWidth = 6 * u;
  c.beginPath(); c.moveTo(28 * u, 84 * u); c.lineTo(28 * u, 24 * u); c.quadraticCurveTo(28 * u, 18 * u, 36 * u, 18 * u); c.lineTo(56 * u, 22 * u); c.stroke();
  // bộ đèn
  c.fillStyle = "#e9eef5"; c.beginPath(); c.roundRect(48 * u, 22 * u, 22 * u, 8 * u, 3 * u); c.fill();
  c.fillStyle = "#ffe08a"; c.beginPath(); c.roundRect(51 * u, 29 * u, 16 * u, 3 * u, 1.5 * u); c.fill();
  return cv.toBuffer("image/png");
}

writeFileSync(join(out, "icon-192.png"), draw(192));
writeFileSync(join(out, "icon-512.png"), draw(512));
writeFileSync(join(out, "icon-maskable-512.png"), draw(512, { maskable: true }));
writeFileSync(join(out, "apple-touch-icon.png"), draw(180, { maskable: true })); // iOS tự bo góc
console.log("đã tạo icons/ (192, 512, maskable 512, apple 180)");
