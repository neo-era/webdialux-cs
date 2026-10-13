// Phối cảnh 3D ban đêm cho chế độ "Khu vực tự do" — DATA-DRIVEN: mặt vùng tô từ chính lưới độ rọi đã tính,
// trụ/cần/đèn đúng toạ độ, cao độ, hướng chiếu từng đèn. Camera quỹ đạo (xoay/nghiêng/thu phóng) quanh tâm khu vực.
import { poleLamps, lampToLum } from "./area.mjs";
import { worldBounds } from "./areaDraw.mjs";

const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Camera mặc định: nhìn từ phía nam-tây, nghiêng 32°, khoảng cách theo kích thước khu vực. */
export function defaultCamera(poles, areas, objects = []) {
  const b = worldBounds(poles, areas, 2, objects);
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 10);
  // nhìn từ phía Tây Nam; nếu có tòa nhà có mặt được đánh giá thì nhìn chếch vào mặt đó (pháp tuyến hướng về camera)
  let az = 60;
  const B = (objects || []).find((o) => o.type === "building" && o.faces && o.faces.length);
  if (B) {
    const i = B.faces[0] - 1, A = B.pts[i], C2 = B.pts[(i + 1) % B.pts.length];
    if (A && C2) { const ccw = B.pts.reduce((s, [x, y], k) => { const [x2, y2] = B.pts[(k + 1) % B.pts.length]; return s + x * y2 - x2 * y; }, 0) > 0;
      const dx = C2[0] - A[0], dy = C2[1] - A[1], n = ccw ? [dy, -dx] : [-dy, dx];
      az = Math.atan2(-n[1], -n[0]) * 180 / Math.PI + 25; }                     // camera đứng phía trước mặt, lệch 25°
  }
  return { tx: (b.x0 + b.x1) / 2, ty: (b.y0 + b.y1) / 2, az, el: 26, dist: span * 1.05 };
}

/** Phép chiếu phối cảnh. Trả {P(x,y,z) → [sx, sy, depth] | null}. */
export function makeProjector(cam, Wpx, Hpx) {
  const T = [cam.tx, cam.ty, 0];
  const fwd = nrm([Math.cos(cam.el * DEG) * Math.cos(cam.az * DEG), Math.cos(cam.el * DEG) * Math.sin(cam.az * DEG), -Math.sin(cam.el * DEG)]);
  const C = sub(T, fwd.map((v) => v * cam.dist));
  const right = nrm(cross(fwd, [0, 0, 1])), up = cross(right, fwd);
  const f = Math.min(Wpx, Hpx) * 1.15, cx = Wpx / 2, cy = Hpx * 0.52;
  const NEAR = 0.3;
  const V = (x, y, z = 0) => { const v = [x - C[0], y - C[1], z - C[2]]; return [dot(v, right), dot(v, up), dot(v, fwd)]; };   // toạ độ camera
  const S = ([a, b, d]) => [cx + f * a / d, cy - f * b / d, d];
  /** Cắt đa giác theo mặt phẳng gần (Sutherland–Hodgman) rồi chiếu — phần sau lưng camera bị cắt, không mất cả hình. */
  const poly = (pts) => {
    const v = pts.map(([x, y, z]) => V(x, y, z || 0)), out = [];
    for (let i = 0; i < v.length; i++) {
      const A = v[i], B = v[(i + 1) % v.length], ia = A[2] >= NEAR, ib = B[2] >= NEAR;
      if (ia) out.push(A);
      if (ia !== ib) { const t = (NEAR - A[2]) / (B[2] - A[2]); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR]); }
    }
    return out.length >= 2 ? out.map(S) : null;
  };
  return { C, f, poly, P: (x, y, z = 0) => { const q = V(x, y, z); return q[2] < NEAR ? null : S(q); } };
}

function cctRGB(K = 4000) {                                    // nhiệt độ màu → RGB (xấp xỉ Tanner Helland)
  const t = K / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  return [r, g, b].map((v) => Math.max(0, Math.min(255, v)));
}

/**
 * Vẽ phối cảnh 3D. state: {poles, areas}; result: calcArea (có thể null). opts: {cam, px (hệ số điểm ảnh), labels, cct}.
 * Trả {cam, range:[lo,hi]}.
 */
const colorCache = new WeakMap();                               // màu ô theo kết quả tính — tính 1 lần, dùng lại khi xoay
export function rampCss(cct = 4000) {                             // dải màu chú giải khớp đúng thang tô 3D
  const LC = cctRGB(cct), mix = (A, B, u) => A.map((v, i) => Math.round(v + (B[i] - v) * u));
  const st = [[0, [32, 36, 44]], [30, mix([32, 36, 44], LC, 0.4)], [65, mix([32, 36, 44], LC, 0.82)], [90, LC.map(Math.round)], [100, mix(LC, [255, 252, 245], 0.55)]];
  return st.map(([p, c]) => `rgb(${c.join(",")}) ${p}%`).join(",");
}
export function drawArea3D(ctx, Wpx, Hpx, { poles, areas, result = null, objects = [], arch = null }, opts = {}) {
  const k = opts.px || 1, cam = opts.cam || defaultCamera(poles, areas, objects);
  const pr = makeProjector(cam, Wpx, Hpx), P = pr.P;
  const LC = cctRGB(opts.cct || 4000), white = [255, 252, 245], ground = [20, 24, 30];
  const mix = (A, B, u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
  const ramp = (t) => { t = Math.max(0, Math.min(1, t));
    const st = [[0, [32, 36, 44]], [0.3, mix([32, 36, 44], LC, 0.4)], [0.65, mix([32, 36, 44], LC, 0.82)], [0.9, LC], [1, mix(LC, white, 0.55)]];
    for (let i = 0; i < st.length - 1; i++) if (t <= st[i + 1][0]) { const u = (t - st[i][0]) / (st[i + 1][0] - st[i][0]); return mix(st[i][1], st[i + 1][1], u); }
    return st[st.length - 1][1]; };

  // bầu trời đêm
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, Hpx);
  sky.addColorStop(0, "#060b18"); sky.addColorStop(0.55, "#111c30"); sky.addColorStop(1, "#1b2738");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  for (let i = 0; i < 60; i++) { ctx.globalAlpha = 0.25 + ((i * 7) % 10) / 16; ctx.fillRect((i * 137.5) % Wpx, (i * 61.7) % (Hpx * 0.35), 1.3 * k, 1.3 * k); }
  ctx.globalAlpha = 1;

  // mặt đất xung quanh (tấm nền tối + lưới 5 m)
  const b0 = worldBounds(poles, areas, 0, objects), ext = Math.max(b0.x1 - b0.x0, b0.y1 - b0.y0, 20) * 1.5;
  const b = { x0: b0.x0 - ext, y0: b0.y0 - ext, x1: b0.x1 + ext, y1: b0.y1 + ext };
  const quad = (pts, fill, stroke, closed = true) => {
    const s = pr.poly(pts); if (!s) return false;
    ctx.beginPath(); s.forEach(([sx, sy], i) => (i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy))); if (closed) ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } return true;
  };
  quad([[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], `rgb(${ground.join(",")})`);
  ctx.lineWidth = 0.6 * k;
  if (!opts.fast) {
    for (let x = Math.ceil(b.x0 / 5) * 5; x <= b.x1; x += 5) quad([[x, b.y0], [x, b.y1]], null, "rgba(120,140,170,0.10)", false);
    for (let y = Math.ceil(b.y0 / 5) * 5; y <= b.y1; y += 5) quad([[b.x0, y], [b.x1, y]], null, "rgba(120,140,170,0.10)", false);
  }

  // các vùng: tô từng ô lưới theo E (vẽ xa trước)
  let lo = Infinity, hi = -Infinity;
  if (result) for (const a of result.areas) if (!a.empty) { lo = Math.min(lo, a.Emin); hi = Math.max(hi, a.Emax); }
  if (arch) for (const f of arch.surfaces) if (f.E.length) { lo = Math.min(lo, f.Emin); hi = Math.max(hi, f.Emax); }
  if (!isFinite(lo)) { lo = 0; hi = 0; }
  // thang tô: chuẩn theo phân vị 95% (không để vài điểm sát chân đèn làm tối cả cảnh), nén gamma 0,7 như mắt cảm nhận
  const all = [];
  if (result) for (const a of result.areas) if (!a.empty) for (let i = 0; i < a.E.length; i += Math.max(1, Math.floor(a.E.length / 4000))) all.push(a.E[i]);
  if (arch) for (const f of arch.surfaces) for (let i = 0; i < f.E.length; i += Math.max(1, Math.floor(f.E.length / 2000))) all.push(f.E[i]);
  all.sort((x, y) => x - y);
  const p95 = all.length ? Math.max(1e-6, all[Math.min(all.length - 1, Math.floor(all.length * 0.95))]) : 1;
  const tone = (e) => Math.pow(Math.max(0, Math.min(1, e / p95)), 0.7);
  // ô lưới + màu: dựng 1 lần cho mỗi kết quả (WeakMap), khi xoay chỉ chiếu lại
  const ck = `${opts.cct || 4000}|${p95}`;
  let cache = result && colorCache.get(result);
  if (result && (!cache || cache.ck !== ck)) {
    const list = [];
    for (const a of result.areas) {
      if (a.empty) continue; const g = a.grid;
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
        const c = g.cell[j * g.nx + i]; if (c < 0) continue;
        const col = ramp(tone(a.E[c]));
        list.push({ x0: g.x0 + g.dx * i, y0: g.y0 + g.dy * j, dx: g.dx, dy: g.dy, fill: `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`, d: 0 });
      }
    }
    // bản thô (≤ ~3000 khối) để xoay mượt: gộp b×b ô, màu theo E trung bình
    const total = result.areas.reduce((n, a) => n + (a.empty ? 0 : a.E.length), 0), f = Math.max(1, Math.ceil(Math.sqrt(total / 3000)));
    let coarse = list;
    if (f > 1) {
      coarse = [];
      for (const a of result.areas) {
        if (a.empty) continue; const g = a.grid;
        for (let J = 0; J < g.ny; J += f) for (let I = 0; I < g.nx; I += f) {
          let sum = 0, n = 0;
          for (let j = J; j < Math.min(g.ny, J + f); j++) for (let i = I; i < Math.min(g.nx, I + f); i++) { const c = g.cell[j * g.nx + i]; if (c >= 0) { sum += a.E[c]; n++; } }
          if (!n) continue;
          const col = ramp(tone(sum / n));
          coarse.push({ x0: g.x0 + g.dx * I, y0: g.y0 + g.dy * J, dx: g.dx * Math.min(f, g.nx - I), dy: g.dy * Math.min(f, g.ny - J), fill: `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`, d: 0 });
        }
      }
    }
    cache = { ck, list, coarse }; colorCache.set(result, cache);
  }
  const items = [];                                                  // đa giác 3D cần vẽ (sắp theo độ sâu, vẽ xa trước)
  const Cm = pr.C;
  if (cache) for (const c of (opts.fast ? cache.coarse : cache.list))
    items.push({ q: [[c.x0, c.y0, 0], [c.x0 + c.dx, c.y0, 0], [c.x0 + c.dx, c.y0 + c.dy, 0], [c.x0, c.y0 + c.dy, 0]], fill: c.fill, seam: !opts.fast });
  // bề mặt vật thể (tô theo độ rọi đã tính); mặt quay lưng camera thì bỏ
  const colE = (e) => { const c = ramp(tone(e)); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; };
  if (arch) for (const f of arch.surfaces) {
    if (f.kind === "face") {
      const mx = (f.A[0] + f.B[0]) / 2, my = (f.A[1] + f.B[1]) / 2;
      if ((Cm[0] - mx) * f.n[0] + (Cm[1] - my) * f.n[1] <= 0) continue;
      const ux = (f.B[0] - f.A[0]) / f.nu, uy = (f.B[1] - f.A[1]) / f.nu;
      for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
        const x0 = f.A[0] + ux * i, y0 = f.A[1] + uy * i, z0 = f.dv * j, z1 = z0 + f.dv;
        items.push({ q: [[x0, y0, z0], [x0 + ux, y0 + uy, z0], [x0 + ux, y0 + uy, z1], [x0, y0, z1]], fill: colE(f.E[j * f.nu + i]), seam: true });
      }
    } else if (f.kind === "crown") {
      const [cx, cy, cz] = f.center, R = f.R, n = f.nLat;
      f.points.forEach((p, i) => {
        if ((Cm[0] - p.x) * p.n[0] + (Cm[1] - p.y) * p.n[1] + (Cm[2] - p.z) * p.n[2] <= 0) return;
        const t0 = Math.PI * p.lat / n, t1 = Math.PI * (p.lat + 1) / n, f0 = 2 * Math.PI * p.lon / p.nLon, f1 = 2 * Math.PI * (p.lon + 1) / p.nLon;
        const S3 = (t, ph) => [cx + R * Math.sin(t) * Math.cos(ph), cy + R * Math.sin(t) * Math.sin(ph), cz + R * Math.cos(t)];
        const e = f.E[i], c = ramp(tone(e)), leaf = [26, 54, 30];
        const g = [leaf[0] + (c[0] - leaf[0]) * 0.75, leaf[1] + (c[1] - leaf[1]) * 0.85, leaf[2] + (c[2] - leaf[2]) * 0.6];   // ánh xanh lá
        items.push({ q: [S3(t0, f0), S3(t0, f1), S3(t1, f1), S3(t1, f0)], fill: `rgb(${g[0] | 0},${g[1] | 0},${g[2] | 0})`, seam: true });
      });
    }
  }
  for (const o of objects || []) {
    if (o.type === "building") items.push({ q: o.pts.map(([x, y]) => [x, y, o.H]), fill: "rgb(30,33,40)", stroke: "rgba(150,160,175,0.35)" });   // mái
    if (o.type === "wall") for (let i = 0; i + 1 < o.pts.length; i++) {                                                        // đỉnh tường
      const [A, B] = [o.pts[i], o.pts[i + 1]]; items.push({ q: [[A[0], A[1], o.H], [B[0], B[1], o.H]], line: "rgba(190,195,205,0.7)", w: 1.6 * k });
    }
    if (o.type === "tree") { const [x, y] = o.pts[0], R = o.crownR || Math.max(0.5, o.H / 3); items.push({ q: [[x, y, 0], [x, y, o.H - 2 * R + 0.2]], line: "#4a3a2a", w: Math.max(2, 3 * k) }); }
  }
  for (const it of items) { let dz = 0; for (const p of it.q) { const v = [p[0] - Cm[0], p[1] - Cm[1], p[2] - Cm[2]]; dz += Math.hypot(...v); } it.d = dz / it.q.length; }
  items.sort((p, q) => q.d - p.d);
  ctx.lineWidth = 0.8;
  for (const it of items) {
    const s2 = pr.poly(it.q); if (!s2) continue;
    ctx.beginPath(); ctx.moveTo(s2[0][0], s2[0][1]); for (let n = 1; n < s2.length; n++) ctx.lineTo(s2[n][0], s2[n][1]);
    if (it.line) { ctx.strokeStyle = it.line; ctx.lineWidth = it.w; ctx.stroke(); ctx.lineWidth = 0.8; continue; }
    ctx.closePath(); ctx.fillStyle = it.fill; ctx.fill();
    if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.stroke(); } else if (it.seam) { ctx.strokeStyle = it.fill; ctx.stroke(); }   // khử khe hở giữa ô
  }
  // viền vùng + tên
  ctx.lineWidth = 1.4 * k; ctx.font = `600 ${11.5 * k}px sans-serif`; ctx.textAlign = "center";
  const placed = [];                                               // nhãn đã đặt — đẩy xuống nếu chồng nhau
  areas.forEach((a, n) => {
    const pts = a.poly || [[a.x0 || 0, a.y0 || 0], [(a.x0 || 0) + a.L, a.y0 || 0], [(a.x0 || 0) + a.L, (a.y0 || 0) + a.W], [a.x0 || 0, (a.y0 || 0) + a.W]];
    quad(pts.map(([x, y]) => [x, y, 0.02]), null, "rgba(255,255,255,0.55)");
    if (opts.labels !== false) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length, q = P(cx, cy, 0.1);
      if (q) { const t = a.name || `Vùng ${n + 1}`, w = ctx.measureText(t).width;
        let ly = q[1];
        const hitL = () => placed.some((r) => Math.abs(r[0] - q[0]) < (r[2] + w) / 2 + 8 * k && Math.abs(r[1] - ly) < 17 * k);
        for (let tries = 0; tries < 8 && hitL(); tries++) ly += 18 * k;
        placed.push([q[0], ly, w]);
        ctx.fillStyle = "rgba(8,12,22,0.62)"; ctx.fillRect(q[0] - w / 2 - 5 * k, ly - 12 * k, w + 10 * k, 16 * k);
        ctx.fillStyle = "#e8edf5"; ctx.fillText(t, q[0], ly); }
    }
  });

  // trụ + cần + đèn (vẽ xa trước), quầng sáng và chùm sáng mờ
  const poleOrder = poles.map((p) => ({ p, d: (P(p.x, p.y) || [0, 0, 1e9])[2] })).sort((a, b) => b.d - a.d);
  ctx.globalCompositeOperation = "lighter";
  for (const { p } of poleOrder) for (const l of poleLamps(p)) {           // chùm sáng: nón mờ từ đèn xuống điểm ngắm
    if (!l.ies) continue;
    // trục quang theo hướng + nghiêng (0° xuống, 90° ngang, 180° lên); chùm đi tới mặt đất, hoặc dài 8 m nếu hắt ngang/lên
    const L = lampToLum(p, l), a = (l.aim || 0) * DEG, t = (l.tilt || 0) * DEG;
    const dir = [Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), -Math.cos(t)];
    const len = dir[2] < -0.3 ? Math.min(40, L.H / -dir[2]) : 8, rad = Math.max(1.2, len * 0.42);
    const ex = L.x + dir[0] * len, ey = L.y + dir[1] * len, ez = Math.max(0, L.H + dir[2] * len);
    const top = P(L.x, L.y, L.H), g1 = P(ex - rad * Math.sin(a), ey + rad * Math.cos(a), ez), g2 = P(ex + rad * Math.sin(a), ey - rad * Math.cos(a), ez);
    if (!top || !g1 || !g2) continue;
    const gr = ctx.createLinearGradient(top[0], top[1], (g1[0] + g2[0]) / 2, (g1[1] + g2[1]) / 2);
    gr.addColorStop(0, `rgba(${LC.map((v) => v | 0).join(",")},0.20)`); gr.addColorStop(1, `rgba(${LC.map((v) => v | 0).join(",")},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(g1[0], g1[1]); ctx.lineTo(g2[0], g2[1]); ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  for (const { p } of poleOrder) {
    const base = P(p.x, p.y), topP = P(p.x, p.y, p.H); if (!base || !topP) continue;
    const s = pr.f / base[2];                                         // px trên 1 m tại chân trụ
    ctx.strokeStyle = "#9aa4b2"; ctx.lineWidth = Math.max(1.2 * k, Math.min(6 * k, 0.16 * s)); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(topP[0], topP[1]); ctx.stroke();
    for (const l of poleLamps(p)) {
      const L = lampToLum(p, l), hd = P(L.x, L.y, L.H), at = P(p.x, p.y, L.H); if (!hd || !at) continue;
      ctx.lineWidth = Math.max(1 * k, Math.min(4 * k, 0.09 * s)); ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(hd[0], hd[1]); ctx.stroke();
      if (Math.abs(L.H - p.H) > 0.05) { const t2 = P(p.x, p.y, Math.max(p.H, L.H)); if (t2) { ctx.beginPath(); ctx.moveTo(topP[0], topP[1]); ctx.lineTo(t2[0], t2[1]); ctx.stroke(); } }
      const r = Math.max(3 * k, Math.min(26 * k, 0.9 * pr.f / hd[2]));
      const on = !!l.ies, col = on ? LC.map((v) => v | 0).join(",") : "192,57,43";
      const gl = ctx.createRadialGradient(hd[0], hd[1], 0, hd[0], hd[1], r * 2.4);
      gl.addColorStop(0, `rgba(255,255,250,${on ? 0.95 : 0.8})`); gl.addColorStop(0.25, `rgba(${col},${on ? 0.55 : 0.5})`); gl.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(hd[0], hd[1], r * 2.4, 0, 2 * Math.PI); ctx.fill();
    }
    if (opts.labels !== false) { ctx.fillStyle = "#cfd6e2"; ctx.font = `bold ${10.5 * k}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(p.id, topP[0], topP[1] - 9 * k); }
  }
  ctx.restore();
  return { cam, range: [lo, hi], p95 };
}
