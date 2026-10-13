// Chiếu sáng mỹ thuật (trong chế độ "Khu vực tự do"): tòa nhà, tường rào, cây xanh.
// Tính độ rọi trên bề mặt theo pháp tuyến E = Σ I(C,γ)·cosθ/d²·MF, có che khuất bởi tòa nhà/tường; độ chói L = ρ·E/π.
// Toạ độ như mặt bằng khu vực: x phải, y lên, z cao độ (m). Đèn: dùng chung trụ nhiều đèn (src/area.mjs).
import { makeIntensity } from "./ies.mjs";
import { angleLumToPoint } from "./geometry.mjs";
import { poleLamps, lampToLum } from "./area.mjs";

export const OBJ_COLS = {
  id: "Mã", type: "Loại", pts: "Toạ độ (x y; x y; …)", H: "Cao (m)", crownR: "Bán kính tán (m)",
  mat: "Vật liệu", rho: "Hệ số phản xạ ρ", zone: "Vùng môi trường", reqE: "Eav yêu cầu (lx)", reqL: "L tối đa (cd/m²)",
  faces: "Mặt đánh giá (cạnh/đoạn số)", step: "Bước lưới (m)",
};
export const OBJ_HEAD = ["id", "type", "pts", "H", "crownR", "mat", "rho", "zone", "reqE", "reqL", "faces", "step"].map((k) => OBJ_COLS[k]);
export const TYPE_LABEL = { building: "Tòa nhà", wall: "Tường rào", tree: "Cây xanh" };

/** Vật liệu bề mặt (hệ số phản xạ khuếch tán điển hình). */
export const MATERIALS = [
  { name: "Sơn trắng, đá trắng", rho: 0.75, type: "building" },
  { name: "Đá, bê tông sáng", rho: 0.5, type: "building" },
  { name: "Bê tông, vữa xám", rho: 0.35, type: "building" },
  { name: "Gạch đỏ, đá sẫm", rho: 0.25, type: "building" },
  { name: "Kính, kim loại sẫm", rho: 0.1, type: "building" },
  { name: "Tường rào sơn sáng", rho: 0.5, type: "wall" },
  { name: "Tán lá cây", rho: 0.15, type: "tree" },
];
export const DEFAULT_RHO = { building: 0.5, wall: 0.5, tree: 0.15 };

/**
 * Yêu cầu theo vùng môi trường. Lmax: giới hạn độ chói trung bình mặt công trình (ILP GN01:2011, theo CIE 150) — số chính thức.
 * Emin[nhóm ρ: sáng > 0,6 / trung bình 0,3–0,6 / sẫm < 0,3]: độ rọi tối thiểu THAM KHẢO cho chiếu sáng hắt mặt đứng theo độ sáng khu vực
 * (bảng thường dẫn từ CIE 094:1993 — kiểm lại với văn bản gốc; sửa theo yêu cầu dự án). Đã đối chiếu không mâu thuẫn với Lmax.
 */
export const ARCH_REQS = [
  { zone: "E1", label: "E1 — vùng tự nhiên (không nên chiếu sáng mặt công trình)", Lmax: 0, Emin: { light: 0, medium: 0, dark: 0 } },
  { zone: "E2", label: "E2 — nông thôn, ngoại ô thưa, độ sáng xung quanh thấp", Lmax: 5, Emin: { light: 20, medium: 40, dark: 60 } },
  { zone: "E3", label: "E3 — khu dân cư đô thị, độ sáng xung quanh trung bình", Lmax: 10, Emin: { light: 30, medium: 60, dark: 100 } },
  { zone: "E4", label: "E4 — trung tâm đô thị, thương mại, độ sáng xung quanh cao", Lmax: 25, Emin: { light: 60, medium: 120, dark: 200 } },
];
const rhoClass = (rho) => (rho > 0.6 ? "light" : rho >= 0.3 ? "medium" : "dark");
export function archReq(obj) {
  const z = ARCH_REQS.find((r) => r.zone === obj.zone) || null;
  if (!z && obj.reqE == null && obj.reqL == null) return null;
  const Emin = obj.reqE ?? (z && obj.type !== "tree" ? z.Emin[rhoClass(obj.rho)] : null);
  const Lmax = obj.reqL ?? (z && obj.type !== "tree" ? z.Lmax : null);
  if (Emin == null && Lmax == null) return null;                    // cây: không có mức chuẩn → chỉ tính số
  return { zone: z ? z.zone : null, Emin, Lmax, label: z ? z.label : "Yêu cầu tự nhập" };
}

const num = (v) => { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
export function parsePts(s) {
  if (!s) return null;
  const pts = String(s).split(";").map((t) => t.trim()).filter(Boolean).map((t) =>
    (/\s/.test(t) ? t.split(/\s+/).map((v) => v.replace(",", ".")) : t.split(",")).filter(Boolean).map(Number));
  return pts.length && pts.every((p) => p.length === 2 && p.every(Number.isFinite)) ? pts : null;
}
const ptsText = (pts) => pts.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join("; ");
const signedArea = (P) => P.reduce((s, [x, y], i) => { const [x2, y2] = P[(i + 1) % P.length]; return s + x * y2 - x2 * y; }, 0) / 2;
const DIR = (nx, ny) => { const a = (Math.atan2(nx, ny) * 180 / Math.PI + 360) % 360; return ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"][Math.round(a / 45) % 8]; };

/** Lưới điểm trên một mặt đứng chữ nhật: từ A→B (2D), cao z0→z1, pháp tuyến n. */
function faceGrid(A, B, z0, z1, n, step) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), Hh = z1 - z0;
  const s = step > 0 ? step : Math.max(0.5, Math.ceil(2 * Math.sqrt(L * Hh / 3000)) / 2);
  const nu = Math.max(1, Math.round(L / s)), nv = Math.max(1, Math.round(Hh / s));
  const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, du = L / nu, dv = Hh / nv;
  const points = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const u = du * (i + 0.5); points.push({ x: A[0] + ux * u, y: A[1] + uy * u, z: z0 + dv * (j + 0.5), n });
  }
  return { points, nu, nv, du, dv, width: L, height: Hh, area: L * Hh };
}

/** Các bề mặt cần tính của danh sách vật thể. */
export function archSurfaces(objects) {
  const out = [];
  for (const o of objects) {
    if (o.type === "building") {
      const P = o.pts, ccw = signedArea(P) > 0;
      P.forEach((A, i) => {
        const B = P[(i + 1) % P.length], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (L < 1e-6) return;
        const n = ccw ? [dy / L, -dx / L, 0] : [-dy / L, dx / L, 0];
        out.push({ objId: o.id, obj: o, kind: "face", edge: i + 1, name: `${o.id} · mặt ${DIR(n[0], n[1])} (cạnh ${i + 1})`, A, B, n, ...faceGrid(A, B, 0, o.H, n, o.step) });
      });
    } else if (o.type === "wall") {
      for (let i = 0; i + 1 < o.pts.length; i++) {
        const A = o.pts[i], B = o.pts[i + 1], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (L < 1e-6) continue;
        for (const sgn of [1, -1]) {
          const n = [sgn * dy / L, -sgn * dx / L, 0];
          out.push({ objId: o.id, obj: o, kind: "face", edge: i + 1, name: `${o.id} · đoạn ${i + 1} phía ${DIR(n[0], n[1])}`, A, B, n, ...faceGrid(A, B, 0, o.H, n, o.step) });
        }
      }
    } else if (o.type === "tree") {
      const [cx, cy] = o.pts[0], R = Math.min(o.H / 2, o.crownR || Math.max(0.5, o.H / 3)), cz = o.H - R;
      const nLat = Math.max(6, Math.round(Math.PI * R / (o.step > 0 ? o.step : 0.5))), points = [];
      for (let j = 0; j < nLat; j++) {
        const th = Math.PI * (j + 0.5) / nLat, nLon = Math.max(6, Math.round(2 * Math.PI * R * Math.sin(th) / (Math.PI * R / nLat)));
        for (let i = 0; i < nLon; i++) {
          const ph = 2 * Math.PI * (i + 0.5) / nLon, n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
          if (cz + R * n[2] < 0) continue;                                // phần tán dưới mặt đất: bỏ
          points.push({ x: cx + R * n[0], y: cy + R * n[1], z: cz + R * n[2], n, lat: j, lon: i, nLon });
        }
      }
      out.push({ objId: o.id, obj: o, kind: "crown", name: `${o.id} · tán cây`, n: [0, 0, 0], points, nLat, center: [cx, cy, cz], R, area: 4 * Math.PI * R * R });
    }
  }
  return out;
}

// ------------------------------------------------------------------ che khuất
function inPoly(x, y, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// giao 2 đoạn 2D: trả t trên đoạn PQ (0..1) nếu cắt đoạn AB, ngược lại null
function segT(px, py, qx, qy, ax, ay, bx, by) {
  const rx = qx - px, ry = qy - py, sx = bx - ax, sy = by - ay, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((ax - px) * sy - (ay - py) * sx) / den, u = ((ax - px) * ry - (ay - py) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
/** Đoạn thẳng P→Q có bị tòa nhà (lăng trụ đa giác 0..H) hoặc tường (mặt đứng mỏng 0..H) chắn không. Cây không chắn. */
const bboxCache = new WeakMap();
const bboxOf = (o) => { let b = bboxCache.get(o.pts); if (!b) { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of o.pts) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } bboxCache.set(o.pts, b); } return b; };
export function segmentBlocked(P, Q, objects) {
  const EPS = 1e-6, zAt = (t) => P.z + (Q.z - P.z) * t;
  const sx0 = Math.min(P.x, Q.x), sx1 = Math.max(P.x, Q.x), sy0 = Math.min(P.y, Q.y), sy1 = Math.max(P.y, Q.y), zlo = Math.min(P.z, Q.z);
  for (const o of objects) {
    if (zlo >= o.H) continue;                                          // cả đoạn cao hơn vật thể
    const b = bboxOf(o); if (sx1 < b[0] || sx0 > b[2] || sy1 < b[1] || sy0 > b[3]) continue;   // không chồng khung bao
    if (o.type === "wall") {
      for (let i = 0; i + 1 < o.pts.length; i++) {
        const t = segT(P.x, P.y, Q.x, Q.y, o.pts[i][0], o.pts[i][1], o.pts[i + 1][0], o.pts[i + 1][1]);
        if (t != null && t > EPS && t < 1 - EPS && zAt(t) < o.H) return true;
      }
    } else if (o.type === "building") {
      const B = o.pts, ts = [0, 1];
      for (let i = 0; i < B.length; i++) { const t = segT(P.x, P.y, Q.x, Q.y, B[i][0], B[i][1], B[(i + 1) % B.length][0], B[(i + 1) % B.length][1]); if (t != null) ts.push(t); }
      ts.sort((a, b) => a - b);
      for (let k = 0; k + 1 < ts.length; k++) {
        const a = Math.max(ts[k], EPS), b = Math.min(ts[k + 1], 1 - EPS); if (b - a < 1e-9) continue;
        const m = (a + b) / 2;
        if (inPoly(P.x + (Q.x - P.x) * m, P.y + (Q.y - P.y) * m, B) && Math.min(zAt(a), zAt(b)) < o.H) return true;
      }
    }
  }
  return false;
}

/** Danh sách bộ đèn (vị trí + I(C,γ)) từ các trụ; đèn thiếu IES bỏ qua. */
export function liveLums(poles) {
  const cache = new Map(), out = [];
  for (const p of poles) for (const l of poleLamps(p)) {
    if (!l.ies || !l.ies.ph) continue;
    if (!cache.has(l.ies.name)) cache.set(l.ies.name, makeIntensity(l.ies.ph));
    out.push({ L: lampToLum(p, l), I: cache.get(l.ies.name) });
  }
  return out;
}

/** Độ rọi tại điểm P (có z) trên mặt có pháp tuyến n; occluders: vật thể chắn sáng. */
export function illumNormal(P, n, lums, MF, occluders = []) {
  let E = 0;
  const Po = { x: P.x + n[0] * 0.02, y: P.y + n[1] * 0.02, z: P.z + n[2] * 0.02 };   // nhích khỏi mặt để không tự chắn
  for (const { L, I } of lums) {
    const vx = L.x - P.x, vy = L.y - P.y, vz = L.H - P.z, d = Math.hypot(vx, vy, vz); if (d < 1e-6) continue;
    const cos = (vx * n[0] + vy * n[1] + vz * n[2]) / d; if (cos <= 0) continue;
    const { C, gamma } = angleLumToPoint(L, P);
    const Iv = I(C, gamma); if (Iv <= 0) continue;                      // tính cường độ trước, kiểm tra che khuất sau (đắt hơn)
    if (occluders.length && segmentBlocked(Po, { x: L.x, y: L.y, z: L.H }, occluders)) continue;
    E += Iv * cos / (d * d);
  }
  return E * MF;
}

/** Tính tất cả bề mặt. state: {poles, objects}. Trả {surfaces:[…, E[], Eav, Emin, Emax, Uo, Lav, req, okE, okL, pass]}. */
export function calcArch({ poles, objects = [] }, { MF = 0.8 } = {}) {
  const lums = liveLums(poles), occ = objects.filter((o) => o.type !== "tree");
  const surfaces = archSurfaces(objects).map((s) => {
    const E = s.points.map((p) => illumNormal(p, p.n, lums, s.obj.MF ?? MF, occ));
    let Emin = Infinity, Emax = -Infinity, sum = 0;
    for (const v of E) { if (v < Emin) Emin = v; if (v > Emax) Emax = v; sum += v; }
    const Eav = E.length ? sum / E.length : 0;
    const rho = s.obj.rho ?? DEFAULT_RHO[s.obj.type];
    const evaluated = !(s.obj.faces && s.obj.faces.length) || (s.edge != null && s.obj.faces.includes(s.edge));
    const Lav = rho * Eav / Math.PI, req = evaluated ? archReq(s.obj) : null;
    const okE = !req || req.Emin == null || Math.round(Eav * 10) / 10 >= req.Emin;
    const okL = !req || req.Lmax == null || Math.round(Lav * 100) / 100 <= req.Lmax;
    return { ...s, E, Eav, Emin: E.length ? Emin : 0, Emax: E.length ? Emax : 0, Uo: Eav > 0 ? Emin / Eav : 0, Lav, rho, req, okE, okL, pass: okE && okL };
  });
  const warnings = [];
  for (const p of poles) for (const [k, l] of poleLamps(p).entries()) {
    const L = lampToLum(p, l);
    const B = objects.find((o) => o.type === "building" && L.H < o.H && inPoly(L.x, L.y, o.pts));
    if (B) warnings.push(`Trụ ${p.id} đèn ${k + 1} nằm trong chân tòa nhà ${B.id} và thấp hơn mái — ánh sáng bị chắn hết; dời đèn ra ngoài mặt nhà (≥ 2 cm).`);
  }
  return { surfaces, warnings };
}

// ------------------------------------------------------------------ Excel
const typeOf = (s) => { const t = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  return /nha|building|cong trinh/.test(t) ? "building" : /tuong|rao|wall|fence/.test(t) ? "wall" : /cay|tree/.test(t) ? "tree" : null; };

/** Đọc sheet VAT THE (mảng object theo tiêu đề). */
export function parseObjRows(rows = []) {
  const objects = [], warnings = [], C = OBJ_COLS;
  rows.forEach((row, i) => {
    const id = String(row[C.id] ?? "").trim() || `VT${i + 1}`;
    if (!row[C.type] && !row[C.pts] && row[C.H] == null) return;                       // dòng trống
    const type = typeOf(row[C.type]);
    if (!type) { warnings.push(`Vật thể ${id}: loại "${row[C.type] ?? ""}" không rõ — ghi Tòa nhà / Tường rào / Cây xanh`); return; }
    const pts = parsePts(row[C.pts]);
    const need = type === "building" ? 3 : type === "wall" ? 2 : 1;
    if (!pts || pts.length < need) { warnings.push(`Vật thể ${id}: toạ độ "${row[C.pts] ?? ""}" không hợp lệ — ${TYPE_LABEL[type]} cần ít nhất ${need} điểm dạng "x y; x y"`); return; }
    const H = num(row[C.H]);
    if (!(H > 0)) { warnings.push(`Vật thể ${id}: thiếu chiều cao — bỏ qua`); return; }
    if (type === "building" && Math.abs(signedArea(pts)) < 1e-6) { warnings.push(`Vật thể ${id}: đa giác chân có diện tích 0 — bỏ qua`); return; }
    const matName = row[C.mat] ? String(row[C.mat]).trim() : null, mat = MATERIALS.find((m) => m.name === matName);
    let rho = num(row[C.rho]);
    if (rho != null && !(rho > 0 && rho < 1)) { warnings.push(`Vật thể ${id}: hệ số phản xạ ${rho} ngoài khoảng 0–1 — dùng mặc định`); rho = null; }
    rho = rho ?? (mat ? mat.rho : DEFAULT_RHO[type]);
    const zone = row[C.zone] ? String(row[C.zone]).trim().toUpperCase().slice(0, 2) : null;
    if (zone && !ARCH_REQS.some((r) => r.zone === zone)) warnings.push(`Vật thể ${id}: vùng môi trường "${row[C.zone]}" không có — dùng E1–E4`);
    const crownR = type === "tree" ? Math.min(H / 2, num(row[C.crownR]) > 0 ? num(row[C.crownR]) : Math.max(0.5, H / 3)) : null;
    objects.push({ id, type, pts: type === "tree" ? [pts[0]] : pts, H, crownR, mat: mat ? mat.name : matName, rho,
      zone: ARCH_REQS.some((r) => r.zone === zone) ? zone : null, reqE: num(row[C.reqE]), reqL: num(row[C.reqL]),
      faces: row[C.faces] != null && row[C.faces] !== "" ? String(row[C.faces]).split(/[;,\s]+/).map(Number).filter((v) => Number.isInteger(v) && v > 0) : null, step: num(row[C.step]) });
  });
  const ids = new Set();
  for (const o of objects) { if (ids.has(o.id)) warnings.push(`Vật thể ${o.id}: trùng mã`); ids.add(o.id); }
  return { objects, warnings };
}
export function objectsSheetRows(objects) {
  return objects.map((o) => [o.id, TYPE_LABEL[o.type], ptsText(o.pts), o.H, o.type === "tree" ? o.crownR : null, o.mat || null, o.rho, o.zone || null, o.reqE ?? null, o.reqL ?? null,
    o.faces && o.faces.length ? o.faces.join("; ") : null, o.step ?? null]);
}
