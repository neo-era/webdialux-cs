// Phối cảnh 3D ban đêm cho chế độ "Khu vực tự do" — DATA-DRIVEN: mặt vùng tô từ chính lưới độ rọi đã tính,
// trụ/cần/đèn đúng toạ độ, cao độ, hướng chiếu từng đèn. Camera quỹ đạo (xoay/nghiêng/thu phóng) quanh tâm khu vực.
import { poleLamps, lampToLum } from "./area.mjs";
import { worldBounds } from "./areaDraw.mjs";
import { liveLums, segmentBlocked } from "./arch.mjs";
import { illuminanceAtPoint } from "./photometry.mjs";

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
  return { C, f, cx, cy, fwd, right, up, poly, P: (x, y, z = 0) => { const q = V(x, y, z); return q[2] < NEAR ? null : S(q); } };
}

function cctRGB(K = 4000) {                                    // nhiệt độ màu → RGB (xấp xỉ Tanner Helland)
  const t = K / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  return [r, g, b].map((v) => Math.max(0, Math.min(255, v)));
}

export function rampCss(cct = 4000) {                             // dải màu chú giải khớp thang tô 3D (tối → màu đèn → trắng)
  const LC = cctRGB(cct), mix = (A, B, u) => A.map((v, i) => Math.round(v + (B[i] - v) * u));
  const st = [[0, [12, 14, 20]], [35, mix([12, 14, 20], LC, 0.45)], [75, LC.map(Math.round)], [100, mix(LC, [255, 252, 245], 0.6)]];
  return st.map(([p, c]) => `rgb(${c.join(",")}) ${p}%`).join(",");
}

// ------------------------------------------------------------------ trường độ rọi mặt đất toàn cảnh (cùng engine)
const fieldCache = new WeakMap();
function groundField(state, key, MF) {
  if (key && fieldCache.has(key)) return fieldCache.get(key);
  const { poles, areas = [], objects = [] } = state;
  const b0 = worldBounds(poles, areas, 0, objects), span = Math.max(b0.x1 - b0.x0, b0.y1 - b0.y0, 20), pad = Math.max(15, span * 0.35);
  const x0 = b0.x0 - pad, y0 = b0.y0 - pad, Wd = b0.x1 - b0.x0 + 2 * pad, Hd = b0.y1 - b0.y0 + 2 * pad;
  const step = Math.max(0.4, Math.sqrt(Wd * Hd / 30000));
  const nx = Math.ceil(Wd / step) + 1, ny = Math.ceil(Hd / step) + 1;
  const lums = liveLums(poles), occ = (objects || []).filter((o) => o.type !== "tree");
  const E = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const P = { x: x0 + i * step, y: y0 + j * step };
    let e = 0;
    for (const { L, I } of lums) {
      const v = illuminanceAtPoint(P, [L], I, MF);
      if (v > 0 && (!occ.length || !segmentBlocked({ x: P.x, y: P.y, z: 0.01 }, { x: L.x, y: L.y, z: L.H }, occ))) e += v;
    }
    E[j * nx + i] = e;
  }
  // vùng có MF riêng (khai trong Excel): mặt đất trong vùng đó dùng đúng MF của vùng như kết quả tính
  for (const a of areas) {
    if (a.MF == null || !(MF > 0)) continue;
    const k = a.MF / MF, Q = a.poly || null;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, y = y0 + j * step;
      const inside = Q ? (() => { let c = false; for (let m = 0, n = Q.length - 1; m < Q.length; n = m++) { const [xi, yi] = Q[m], [xj, yj] = Q[n]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; })()
        : x >= (a.x0 || 0) && x <= (a.x0 || 0) + a.L && y >= (a.y0 || 0) && y <= (a.y0 || 0) + a.W;
      if (inside) E[j * nx + i] *= k;
    }
  }
  const f = { x0, y0, step, nx, ny, E };
  if (key) fieldCache.set(key, f);
  return f;
}
const sampleField = (f, x, y) => {
  const fx = (x - f.x0) / f.step, fy = (y - f.y0) / f.step;
  if (fx < 0 || fy < 0 || fx > f.nx - 1 || fy > f.ny - 1) return 0;
  const i = Math.min(f.nx - 2, Math.floor(fx)), j = Math.min(f.ny - 2, Math.floor(fy)), tx = fx - i, ty = fy - j, E = f.E, n = f.nx;
  const a = E[j * n + i] + (E[j * n + i + 1] - E[j * n + i]) * tx, b = E[(j + 1) * n + i] + (E[(j + 1) * n + i + 1] - E[(j + 1) * n + i]) * tx;
  return a + (b - a) * ty;
};

/**
 * Phối cảnh 3D ban đêm — DÒ TIA từng điểm ảnh: mặt đất (trường độ rọi toàn cảnh), mặt đứng, mái, tán cây.
 * Độ sáng hiển thị theo độ chói L = ρ·E/π (nội suy mượt, khử răng cưa), cộng ánh trời mờ để thấy hình khối.
 * state: {poles, areas, objects, arch, result}; opts: {cam, px, fast, ss, fieldKey, MF, cct, labels}. Trả {cam, range, p95}.
 */
export function drawArea3D(ctx, Wpx, Hpx, state, opts = {}) {
  const { poles, areas = [], result = null, objects = [], arch = null } = state;
  const k = opts.px || 1, cam = opts.cam || defaultCamera(poles, areas, objects);
  const pr = makeProjector(cam, Wpx, Hpx), P = pr.P, C = pr.C, F = pr.fwd, R = pr.right, U = pr.up;
  const LC = cctRGB(opts.cct || 4000).map((v) => v / 255);
  const field = groundField(state, opts.fieldKey || null, opts.MF ?? 0.8);
  const RHO_G = 0.2;

  // ---- bề mặt vật thể cho dò tia (kèm khung bao trên màn hình để lọc nhanh)
  const sbox = (pts3) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, z] of pts3) { const q = P(x, y, z); if (!q) return [-Infinity, -Infinity, Infinity, Infinity]; x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return [x0 - 2, y0 - 2, x1 + 2, y1 + 2];
  };
  const faces = [], roofs = [], crowns = [];
  if (arch) for (const f of arch.surfaces) {
    if (f.kind === "face") {
      const L = Math.hypot(f.B[0] - f.A[0], f.B[1] - f.A[1]), ux = (f.B[0] - f.A[0]) / L, uy = (f.B[1] - f.A[1]) / L;
      faces.push({ f, ux, uy, L, H: f.height, dbl: false, box: sbox([[f.A[0], f.A[1], 0], [f.B[0], f.B[1], 0], [f.A[0], f.A[1], f.height], [f.B[0], f.B[1], f.height]]) });
    } else if (f.kind === "crown") {
      const rows = []; f.points.forEach((p, i) => { (rows[p.lat] = rows[p.lat] || []).push([p.lon, p.nLon, f.E[i]]); });
      const [cx, cy, cz] = f.center;
      crowns.push({ f, rows, c: f.center, R: f.R, box: sbox([[cx - f.R, cy - f.R, cz - f.R], [cx + f.R, cy + f.R, cz + f.R], [cx - f.R, cy + f.R, cz + f.R], [cx + f.R, cy - f.R, cz - f.R], [cx - f.R, cy - f.R, cz + f.R], [cx + f.R, cy + f.R, cz - f.R]]) });
    }
  }
  for (const o of objects) if (o.type === "building") roofs.push({ o, box: sbox(o.pts.map(([x, y]) => [x, y, o.H])) });
  const inPoly = (x, y, Q) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

  // ---- thang hiển thị: phân vị 95% của độ chói các bề mặt (không để điểm sát chân đèn làm tối cả cảnh)
  const Ls = [];
  for (let i = 0; i < field.E.length; i += Math.max(1, Math.floor(field.E.length / 6000))) if (field.E[i] > 0) Ls.push(RHO_G * field.E[i] / Math.PI);
  if (arch) for (const f of arch.surfaces) for (let i = 0; i < f.E.length; i += Math.max(1, Math.floor(f.E.length / 1500))) Ls.push(f.rho * f.E[i] / Math.PI);
  Ls.sort((a, b) => a - b);
  const Lref = Ls.length ? Math.max(0.03, Ls[Math.floor(Ls.length * 0.95)]) : 1;
  let lo = Infinity, hi = -Infinity;
  if (result) for (const a of result.areas) if (!a.empty) { lo = Math.min(lo, a.Emin); hi = Math.max(hi, a.Emax); }
  if (arch) for (const f of arch.surfaces) if (f.E.length) { lo = Math.min(lo, f.Emin); hi = Math.max(hi, f.Emax); }
  if (!isFinite(lo)) { lo = 0; hi = 0; }

  // màu ánh sáng: tối → màu đèn (CCT) → trắng khi quá sáng
  const lit = (L, tint) => {
    const t = Math.pow(Math.max(0, L / Lref), 0.62);
    const base = Math.min(t, 1), over = Math.max(0, Math.min(0.85, (t - 1) / 1.6));      // quá sáng: chuyển dịu sang trắng, không cháy
    return [(LC[0] * base * (1 - over) + over) * tint[0], (LC[1] * base * (1 - over) + over) * tint[1], (LC[2] * base * (1 - over) + over) * tint[2]];
  };
  const MOON = nrm([-0.35, 0.45, 0.82]);                            // ánh trời/trăng mờ để thấy hình khối
  const span = Math.max(30, cam.dist * 2.2), HZ = [0.10, 0.13, 0.19];
  const NOT = [1, 1, 1], LEAF = [0.62, 1.0, 0.55];

  // ---- dò tia 1 tia
  const trace = (dx, dy, dz, px, py) => {
    let t = Infinity, kind = 0, obj = null, extra = 0;
    if (dz < -1e-6) { t = -C[2] / dz; kind = 1; }                                       // mặt đất
    for (const fc of faces) {
      const b = fc.box; if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) continue;
      const n = fc.f.n, den = dx * n[0] + dy * n[1]; if (Math.abs(den) < 1e-9 || (!fc.dbl && den >= 0)) continue;
      const tt = ((fc.f.A[0] - C[0]) * n[0] + (fc.f.A[1] - C[1]) * n[1]) / den; if (tt <= 0 || tt >= t) continue;
      const hx = C[0] + dx * tt, hy = C[1] + dy * tt, hz = C[2] + dz * tt, u = (hx - fc.f.A[0]) * fc.ux + (hy - fc.f.A[1]) * fc.uy;
      if (u < 0 || u > fc.L || hz < 0 || hz > fc.H) continue;
      t = tt; kind = 2; obj = fc; extra = u;
    }
    for (const rf of roofs) {
      const b = rf.box; if (px < b[0] || px > b[2] || py < b[1] || py > b[3] || Math.abs(dz) < 1e-9) continue;
      const tt = (rf.o.H - C[2]) / dz; if (tt <= 0 || tt >= t) continue;
      if (inPoly(C[0] + dx * tt, C[1] + dy * tt, rf.o.pts)) { t = tt; kind = 3; obj = rf; }
    }
    for (const cr of crowns) {
      const b = cr.box; if (px < b[0] || px > b[2] || py < b[1] || py > b[3]) continue;
      const ox = C[0] - cr.c[0], oy = C[1] - cr.c[1], oz = C[2] - cr.c[2], bb = ox * dx + oy * dy + oz * dz, cc = ox * ox + oy * oy + oz * oz - cr.R * cr.R, disc = bb * bb - cc;
      if (disc < 0) continue; const tt = -bb - Math.sqrt(disc); if (tt <= 0 || tt >= t) continue;
      if (C[2] + dz * tt < 0) continue; t = tt; kind = 4; obj = cr;
    }
    if (kind === 0) return null;
    const hx = C[0] + dx * t, hy = C[1] + dy * t, hz = C[2] + dz * t;
    let rgb, nz = 1, nx = 0, ny = 0;
    if (kind === 1) { const E = sampleField(field, hx, hy); rgb = lit(RHO_G * E / Math.PI, NOT); nz = 1; }
    else if (kind === 2) {
      const f = obj.f, fu = Math.max(0, Math.min(f.nu - 1, extra / f.du - 0.5)), fv = Math.max(0, Math.min(f.nv - 1, hz / f.dv - 0.5));
      const i = Math.min(f.nu - 2, Math.floor(fu)), j = Math.min(f.nv - 2, Math.floor(fv));
      let E;
      if (f.nu < 2 || f.nv < 2) E = f.E[Math.round(fv) * f.nu + Math.round(fu)] || 0;
      else { const tx = fu - i, ty = fv - j, e = f.E, n = f.nu; const a = e[j * n + i] + (e[j * n + i + 1] - e[j * n + i]) * tx, b2 = e[(j + 1) * n + i] + (e[(j + 1) * n + i + 1] - e[(j + 1) * n + i]) * tx; E = a + (b2 - a) * ty; }
      rgb = lit(f.rho * E / Math.PI, NOT); nx = f.n[0]; ny = f.n[1]; nz = 0;
    } else if (kind === 3) { rgb = [0, 0, 0]; nz = 1; }
    else {
      const cr = obj, vx = (hx - cr.c[0]) / cr.R, vy = (hy - cr.c[1]) / cr.R, vz = (hz - cr.c[2]) / cr.R; nx = vx; ny = vy; nz = vz;
      const th = Math.acos(Math.max(-1, Math.min(1, vz))), ph = (Math.atan2(vy, vx) + 2 * Math.PI) % (2 * Math.PI);
      const fl = th / Math.PI * cr.f.nLat - 0.5, j0 = Math.max(0, Math.floor(fl)), tj = Math.max(0, Math.min(1, fl - j0));
      const rowE = (j) => { const r = cr.rows[Math.max(0, Math.min(cr.rows.length - 1, j))]; if (!r || !r.length) return 0; const n = r[0][1], fi = ph / (2 * Math.PI) * n - 0.5, i0 = ((Math.floor(fi) % n) + n) % n, ti = fi - Math.floor(fi); const a = r.find((q) => q[0] === i0), b2 = r.find((q) => q[0] === (i0 + 1) % n); return (a ? a[2] : 0) * (1 - ti) + (b2 ? b2[2] : a ? a[2] : 0) * ti; };
      const E = rowE(j0) * (1 - tj) + rowE(j0 + 1) * tj;
      rgb = lit(cr.f.rho * E / Math.PI * 1.6, LEAF);                  // tán lá: tán xạ nhiều lớp nên trông sáng hơn ρ đơn lớp
    }
    // ánh trời mờ: khối đặc thấy rõ hình, mặt đất tối xanh
    const sky = Math.max(0, nx * MOON[0] + ny * MOON[1] + nz * MOON[2]);
    const amb = kind === 1 ? [0.035, 0.042, 0.06] : kind === 4 ? [0.03, 0.06, 0.035] : kind === 3 ? [0.05, 0.055, 0.07] : [0.045, 0.05, 0.065];
    const a2 = 0.55 + 0.75 * sky;
    let out = [rgb[0] + amb[0] * a2, rgb[1] + amb[1] * a2, rgb[2] + amb[2] * a2];
    const fog = 1 - Math.exp(-t / span);                                                  // xa thì hoà vào chân trời
    out = [out[0] * (1 - fog * 0.85) + HZ[0] * fog * 0.85, out[1] * (1 - fog * 0.85) + HZ[1] * fog * 0.85, out[2] * (1 - fog * 0.85) + HZ[2] * fog * 0.85];
    return [out[0], out[1], out[2], t];
  };

  // ---- bầu trời
  ctx.save();
  const sky = ctx.createLinearGradient(0, 0, 0, Hpx);
  sky.addColorStop(0, "#04070f"); sky.addColorStop(0.5, "#0b1426"); sky.addColorStop(1, "#1a2538");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 90; i++) { ctx.globalAlpha = 0.15 + ((i * 7) % 10) / 18; const r = (i % 7 === 0 ? 1.6 : 1.0) * k; ctx.fillRect((i * 137.5 + 31) % Wpx, (i * 61.7 + 7) % (Hpx * 0.45), r, r); }
  ctx.globalAlpha = 1;

  // ---- dò tia (khử răng cưa SS×SS; khi đang xoay: thưa 3 điểm ảnh)
  const img = ctx.getImageData(0, 0, Wpx, Hpx), D = img.data, depth = new Float32Array(Wpx * Hpx).fill(Infinity);
  const step = opts.fast ? 3 : 1, SS = opts.fast ? 1 : (opts.ss ?? (k >= 2 ? 1 : 2));
  const toByte = (v) => Math.max(0, Math.min(255, Math.round(255 * Math.pow(Math.max(0, v), 1 / 1.25))));
  for (let py = 0; py < Hpx; py += step) for (let px = 0; px < Wpx; px += step) {
    let r = 0, g = 0, b = 0, hits = 0, dmin = Infinity;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const qx = px + (sx + 0.5) / SS * step, qy = py + (sy + 0.5) / SS * step;
      const ax = (qx - pr.cx) / pr.f, ay = -(qy - pr.cy) / pr.f;
      let dx = F[0] + R[0] * ax + U[0] * ay, dy = F[1] + R[1] * ax + U[1] * ay, dz = F[2] + R[2] * ax + U[2] * ay;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const hit = trace(dx, dy, dz, qx, qy);
      if (hit) { r += hit[0]; g += hit[1]; b += hit[2]; hits++; dmin = Math.min(dmin, hit[3]); }
    }
    if (!hits) continue;
    const n = SS * SS, cov = hits / n;
    for (let yy = py; yy < Math.min(Hpx, py + step); yy++) for (let xx = px; xx < Math.min(Wpx, px + step); xx++) {
      const o = (yy * Wpx + xx) * 4;
      D[o] = D[o] * (1 - cov) + toByte(r / hits) * cov; D[o + 1] = D[o + 1] * (1 - cov) + toByte(g / hits) * cov; D[o + 2] = D[o + 2] * (1 - cov) + toByte(b / hits) * cov; D[o + 3] = 255;
      depth[yy * Wpx + xx] = dmin;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (opts.overlays === false) { ctx.restore(); return { cam, range: [lo, hi], p95: Lref }; }   // chỉ ảnh dò tia (dùng cho kiểm thử)

  // ---- viền vùng tính (mảnh, mờ) + tên vùng
  const visible = (x, y, z) => { const q = P(x, y, z); if (!q) return null; const ix = Math.round(q[0]), iy = Math.round(q[1]); if (ix < 0 || iy < 0 || ix >= Wpx || iy >= Hpx) return q;
    const dd = Math.hypot(x - C[0], y - C[1], z - C[2]); return depth[iy * Wpx + ix] + 0.35 >= dd ? q : null; };
  ctx.lineWidth = 1.1 * k; ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.setLineDash([6 * k, 5 * k]);
  for (const a of areas) {
    const pts = a.poly || [[a.x0 || 0, a.y0 || 0], [(a.x0 || 0) + a.L, a.y0 || 0], [(a.x0 || 0) + a.L, (a.y0 || 0) + a.W], [a.x0 || 0, (a.y0 || 0) + a.W]];
    const s2 = pr.poly(pts.map(([x, y]) => [x, y, 0.02])); if (!s2) continue;
    ctx.beginPath(); s2.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (opts.labels !== false) {
    ctx.font = `600 ${11 * k}px sans-serif`; ctx.textAlign = "center"; const placed = [];
    for (const a of areas) {
      const pts = a.poly || [[a.x0 || 0, a.y0 || 0], [(a.x0 || 0) + a.L, (a.y0 || 0) + a.W]];
      const cx = pts.reduce((s2, p) => s2 + p[0], 0) / pts.length, cy = pts.reduce((s2, p) => s2 + p[1], 0) / pts.length, q = visible(cx, cy, 0.1);
      if (!q) continue; const t = a.name || "", w = ctx.measureText(t).width; let ly = q[1];
      for (let tries = 0; tries < 8 && placed.some((r) => Math.abs(r[0] - q[0]) < (r[2] + w) / 2 + 8 * k && Math.abs(r[1] - ly) < 17 * k); tries++) ly += 18 * k;
      placed.push([q[0], ly, w]);
      ctx.fillStyle = "rgba(6,10,20,0.55)"; ctx.fillRect(q[0] - w / 2 - 5 * k, ly - 12 * k, w + 10 * k, 16 * k);
      ctx.fillStyle = "rgba(232,237,245,0.92)"; ctx.fillText(t, q[0], ly);
    }
  }

  // ---- thân cây, trụ, cần, đèn (có che khuất theo bộ đệm độ sâu)
  for (const o of objects) if (o.type === "tree") {
    const [x, y] = o.pts[0], Rr = Math.min(o.H / 2, o.crownR || Math.max(0.5, o.H / 3)), b = visible(x, y, 0.05), top = P(x, y, Math.max(0.2, o.H - 2 * Rr));
    if (!b || !top) continue; const s = pr.f / b[2];
    ctx.strokeStyle = "#3a2c20"; ctx.lineWidth = Math.max(1.5 * k, Math.min(8 * k, 0.3 * s)); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
  }
  const order = poles.map((p) => ({ p, d: Math.hypot(p.x - C[0], p.y - C[1]) })).sort((a, b) => b.d - a.d);
  for (const { p } of order) {
    const base = visible(p.x, p.y, 0.05), topP = P(p.x, p.y, p.H); if (!topP) continue;
    const s = pr.f / topP[2];
    if (base && p.H > 0.2) {
      ctx.strokeStyle = "#6f7987"; ctx.lineWidth = Math.max(1 * k, Math.min(6 * k, 0.15 * s)); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(topP[0], topP[1]); ctx.stroke();
    }
    for (const l of poleLamps(p)) {
      const Lm = lampToLum(p, l), hd = visible(Lm.x, Lm.y, Math.max(0.05, Lm.H)), at = P(p.x, p.y, Lm.H);
      if (!hd) continue;
      if (base && at && (l.arm || 0) > 0.05) { ctx.lineWidth = Math.max(0.8 * k, Math.min(3.5 * k, 0.08 * s)); ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(hd[0], hd[1]); ctx.stroke(); }
      const r = Math.max(2.2 * k, Math.min(22 * k, 0.55 * pr.f / hd[2])), on = !!l.ies, col = on ? LC.map((v) => (v * 255) | 0).join(",") : "220,70,60";
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const gl = ctx.createRadialGradient(hd[0], hd[1], 0, hd[0], hd[1], r * 3);
      gl.addColorStop(0, `rgba(255,255,250,${on ? 0.95 : 0.7})`); gl.addColorStop(0.18, `rgba(${col},0.55)`); gl.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(hd[0], hd[1], r * 3, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
    }
    if (opts.labels !== false && opts.poleLabels !== false && base) { ctx.fillStyle = "rgba(205,214,226,0.6)"; ctx.font = `600 ${9.5 * k}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(p.id, topP[0], topP[1] - 10 * k); }
  }
  ctx.restore();
  return { cam, range: [lo, hi], p95: Lref };
}
