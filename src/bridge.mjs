// Chế độ "Cầu" — chiếu sáng mặt cầu giao thông theo QCVN 07-7:2023 (lòng đường) + TCVN 13608:2023 Bảng 4 (lề bộ hành).
// Cùng phương pháp CIE 140 với chế độ Đường (lưới 3 điểm/làn, observer cách 60 m, R3, TI EN 13201-3) nhưng mặt cầu có
// TRẮC DỌC: dốc dọc hai phía đối xứng + đường cong đứng lồi (parabol) ở giữa. Trụ thẳng đứng, đứng trên mặt cầu, nên
// cao độ đèn = cao độ mặt cầu tại chân trụ + H; độ rọi/độ chói tính theo pháp tuyến mặt cầu tại từng điểm; người quan sát
// và hướng nhìn (TI) bám theo mặt cầu. Cầu cả dốc 0 % cho kết quả TRÙNG chế độ Đường cùng hình học (test v32).
//
// Toạ độ: x dọc cầu (0 = mố đầu, L = mố cuối, theo phương ngang), y ngang (0 = mép lòng đường phía gần, W = mép xa),
// z cao độ (0 = cao độ mặt cầu tại hai mố).

import { makeIntensity } from "./ies.mjs";
import { QCVN } from "./engine.mjs";
import { buildGrid, angleLumToPoint, arrangementKind } from "./geometry.mjs";
import { stats, longitudinalUniformity } from "./metrics.mjs";
import { makeRTableFromData, scaleRTable } from "./rtable.mjs";
import { findReq } from "./areaReq.mjs";
import { classifyRoadClass } from "./mapping.mjs";
import R3DATA from "./r3data.mjs";

const R3 = makeRTableFromData(R3DATA);
const DEG = Math.PI / 180;
const TMAX = R3DATA.tanEps[R3DATA.tanEps.length - 1];

export const POLE_SITES = { lancan: "trên lan can ngoài", go: "trên gờ chắn (giữa lề và lòng đường)", giua: "trên dải phân cách giữa" };
export const WALK_REQS = ["TCVN13608-B4-cao", "TCVN13608-B4-tb", "TCVN13608-B4-thap"];

/** Giá trị mặc định một cầu (cũng là cầu mẫu khi chưa nạp Excel). */
export const BRIDGE_DEFAULTS = {
  name: "Cầu mới", roadClass: "C1", length: 240, width: 10.5, lanes: 3, medianW: 0, walk: 2.5, guard: 0.3, parapetH: 1.1,
  site: "lancan", setback: null, arrangement: "so le", spacing: 30, poleStart: null, grade: 4, Rv: 1500, approachLit: true,
  H: 10, arm: 1.5, tilt: 5, rot: 0, perPole: 1, iesName: "", MF: null, walkReq: "TCVN13608-B4-tb", q0: null,
};

// ------------------------------------------------------------------ trắc dọc
/**
 * Trắc dọc đối xứng: hai đoạn dốc i (%) lên tới đỉnh ở giữa cầu, nối bằng đường cong đứng lồi bán kính Rv (m).
 * Chiều dài đường cong = 2·Rv·i (khi nhỏ hơn chiều dài cầu); Rv trống/0 → đỉnh gãy. Ngoài hai mố (đường dẫn) kéo dài dốc.
 */
export function makeProfile({ length: L, grade = 0, Rv = 0 }) {
  const g = Math.max(0, grade || 0) / 100, M = L / 2;
  if (!(g > 0)) return { z: () => 0, slope: () => 0, crest: 0, curveLen: 0, grade: 0, L, flat: true };
  const R = Rv > 0 ? Rv : 0, half = R > 0 ? R * g : 0;           // nửa chiều dài đường cong
  const drop = (u) => (u <= half ? u * u / (2 * R) : (half > 0 ? half * half / (2 * R) : 0) + (u - half) * g);
  const zEnd = drop(M);
  return {
    z: (x) => zEnd - drop(Math.abs(x - M)),
    slope: (x) => { const u = Math.abs(x - M), s = x >= M ? -1 : 1; return s * (u <= half ? u / R : g); },
    crest: zEnd, curveLen: 2 * half, grade: g * 100, L, flat: false,
  };
}

// ------------------------------------------------------------------ hình học
const n0 = (v, d) => (v == null || v === "" || !Number.isFinite(+v) ? d : +v);

/** Chuẩn hoá thông số cầu + suy ra khoảng cách trụ-mép, độ vươn ra lòng đường, trụ đầu. */
export function bridgeGeometry(b) {
  const W = +b.width, S = +b.spacing, L = +b.length;
  const kind = b.site === "giua" ? "center" : arrangementKind(b.arrangement);
  const walk = Math.max(0, n0(b.walk, 0)), guard = Math.max(0, n0(b.guard, 0.3));
  const medianW = kind === "center" ? (n0(b.medianW, 0) > 0 ? +b.medianW : 2) : Math.max(0, n0(b.medianW, 0));
  const autoSet = b.site === "go" ? guard / 2 : walk + guard;     // tim trụ → mép lòng đường
  const setback = b.setback != null && b.setback !== "" && Number.isFinite(+b.setback) ? +b.setback : autoSet;
  const arm = n0(b.arm, 0);
  const overhang = kind === "center" ? arm - medianW / 2 : arm - setback;
  // trụ đầu: trống → canh giữa dãy trụ trong chiều dài cầu
  const nIn = S > 0 && L > 0 ? Math.floor(L / S + 1e-9) : 0;
  const poleStart = b.poleStart != null && b.poleStart !== "" && Number.isFinite(+b.poleStart) ? +b.poleStart : (L - nIn * S) / 2;
  return { W, S, L, kind, walk, guard, medianW, setback, overhang, arm, poleStart, nIn,
    lanes: Math.max(1, Math.round(n0(b.lanes, Math.max(1, Math.round(W / 3.5))))), H: +b.H, tilt: n0(b.tilt, 0), rot: n0(b.rot, 0),
    perPole: Math.max(1, Math.round(n0(b.perPole, 1))), approachLit: b.approachLit !== false };
}

/** Bộ đèn của các vị trí trụ k ∈ [kFrom, kTo] (x = poleStart + k·S), cao độ đèn bám mặt cầu. */
export function bridgeLums(G, prof, kFrom, kTo) {
  const { S, W, kind, overhang, H, tilt, rot, perPole, poleStart, L, approachLit } = G;
  const out = [];
  const put = (x, y, c0dir) => {
    if (!approachLit && (x < -1e-9 || x > L + 1e-9)) return;
    const l = { x, y, H: prof.z(x) + H, tilt, rot, c0dir, hPole: H };
    for (let i = 0; i < perPole; i++) out.push(l);
  };
  for (let k = kFrom; k <= kTo; k++) {
    const x = poleStart + k * S;
    if (kind === "center") { put(x, W / 2 - overhang, -1); put(x, W / 2 + overhang, +1); continue; }
    put(x, overhang, +1);
    if (kind === "opposite") put(x, W - overhang, -1);
    else if (kind === "staggered") put(x + S / 2, W - overhang, -1);
  }
  return out;
}

/** Vị trí trụ trên cầu (để vẽ): [{x, side: 'near'|'far'|'mid'}]. */
export function polePositions(b) {
  const G = bridgeGeometry(b), out = [];
  if (!(G.S > 0 && G.L > 0)) return out;
  for (let k = -1; G.poleStart + k * G.S <= G.L + G.S; k++) {
    const x = G.poleStart + k * G.S;
    const add = (xx, side) => { if (xx >= -1e-6 && xx <= G.L + 1e-6) out.push({ x: xx, side }); };
    if (G.kind === "center") add(x, "mid");
    else { add(x, "near"); if (G.kind === "opposite") add(x, "far"); else if (G.kind === "staggered") add(x + G.S / 2, "far"); }
  }
  return out;
}

// ------------------------------------------------------------------ quang học trên mặt dốc
/** Tia A→B bị đỉnh cầu che? (mặt cầu lồi: kiểm 24 điểm trên đoạn; cầu phẳng không bao giờ che). */
export function crestBlocked(prof, A, B) {
  if (!prof || prof.flat) return false;
  const za = A.z || 0, zb = B.H ?? B.z;
  for (let i = 1; i < 24; i++) {
    const t = i / 24, x = A.x + (B.x - A.x) * t;
    if (za + (zb - za) * t < prof.z(x) - 1e-6) return true;
  }
  return false;
}
/** Độ rọi trên mặt cầu (theo pháp tuyến mặt cầu) tại P (có z), độ dốc sl = dz/dx tại P. */
export function illumSurface(P, lums, I, MF, sl = 0, prof = null) {
  const nl = Math.sqrt(1 + sl * sl);
  let E = 0;
  for (const L of lums) {
    const { C, gamma, dist } = angleLumToPoint(L, P);
    const hn = (-(L.x - P.x) * sl + (L.H - (P.z || 0))) / nl;      // khoảng cách đèn tới mặt phẳng tiếp xúc
    if (hn <= 0) continue;
    if (prof && crestBlocked(prof, P, L)) continue;                 // đỉnh cầu che (đèn bên kia dốc)
    const Iv = I(C, gamma);
    if (Iv <= 0) continue;
    E += Iv * hn / (dist * dist * dist);
  }
  return E * MF;
}

/** Độ chói tại P theo người quan sát obs — góc ε, β đo trong hệ mặt phẳng tiếp xúc mặt cầu tại P. */
export function lumSurface(P, lums, I, rfn, obs, MF, sl = 0, prof = null) {
  const nl = Math.sqrt(1 + sl * sl), n = [-sl / nl, 0, 1 / nl], t1 = [1 / nl, 0, sl / nl];
  const ox = P.x - obs.x, oy = P.y - obs.y, oz = (P.z || 0) - obs.z;
  const obsAz = Math.atan2(ox * t1[0] + oz * t1[2], oy) / DEG;
  let Lsum = 0;
  for (const L of lums) {
    const { C, gamma, dist } = angleLumToPoint(L, P);
    if (gamma >= 90) continue;
    const Iv = I(C, gamma);
    if (Iv <= 0) continue;
    const dx = L.x - P.x, dy = L.y - P.y, dz = L.H - (P.z || 0);
    const hn = dx * n[0] + dz * n[2];
    if (hn <= 0) continue;
    if (prof && crestBlocked(prof, P, L)) continue;
    const horiz = Math.sqrt(Math.max(0, dist * dist - hn * hn));
    const tanEps = horiz / hn;
    const lumAz = Math.atan2(dx * t1[0] + dz * t1[2], dy) / DEG;
    let beta = Math.abs(lumAz - obsAz);
    if (beta > 180) beta = 360 - beta;
    // mặt dốc: ngoài bảng R (tanε > 12, tia gần sát mặt cầu) ngoại suy r ∝ cos³ε ≈ (12/tanε)³ thay vì giữ nguyên cột cuối
    // (giữ cột cuối + hn rất nhỏ → độ chói ảo rất lớn). Cầu phẳng giữ đúng cách của chế độ Đường (đã đối chiếu DIALux).
    const ext = prof && !prof.flat && tanEps > TMAX ? Math.pow(TMAX / tanEps, 3) : 1;
    Lsum += Iv * rfn(beta, tanEps) * ext / (hn * hn);
  }
  return Lsum * 1e-4 * MF;
}

/** TI (EN 13201-3 như chế độ Đường) với mắt người lái bám mặt cầu, hướng nhìn theo tiếp tuyến trắc dọc cúi 1°. */
export function tiMovingProfile(lums, I, observer, LavMaint, MF, spacing, steps, prof) {
  const Lav = LavMaint / (MF || 1);
  let best = { Lv: 0, TI: 0 };
  for (let s = 0; s < steps; s++) {
    const ex = observer.x + s * spacing / steps;
    const eye = { x: ex, y: observer.y, z: prof.z(ex) + 1.5 };
    const a = Math.atan(prof.slope(ex)) - 1 * DEG, look = { x: Math.cos(a), z: Math.sin(a) };
    let Lv = 0;
    for (const L of lums) {
      const dx = L.x - eye.x, dy = L.y - eye.y, dz = L.H - eye.z;
      if (dx <= 0) continue;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const cos = (dx * look.x + dz * look.z) / d;
      const theta = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
      if (theta < 1.5 || theta > 60) continue;
      const { C, gamma } = angleLumToPoint(L, eye);
      if (gamma >= 90) continue;
      if (!prof.flat && crestBlocked(prof, eye, L)) continue;          // người lái không thấy đèn khuất sau đỉnh cầu
      Lv += 10 * (I(C, gamma) * cos / (d * d)) / (theta * theta);
    }
    let TI = 0;
    if (Lav >= 0.05 && Lav <= 5) TI = 65 * Lv / Math.pow(Lav, 0.8);
    else if (Lav > 5) TI = 95 * Lv / Math.pow(Lav, 1.05);
    if (TI > best.TI) best = { Lv, TI };
  }
  return best;
}

// ------------------------------------------------------------------ kiểm tra dữ liệu
/** Trả {errors[], warnings[]} — errors chặn tính. */
export function validateBridge(b, { hasIes = true } = {}) {
  const errors = [], warnings = [];
  const pos = (v) => Number.isFinite(+v) && +v > 0 && v !== "" && v != null;
  if (!pos(b.length)) errors.push("Chiều dài cầu phải > 0");
  if (!pos(b.width)) errors.push("Lòng đường phải > 0");
  if (!pos(b.spacing)) errors.push("Khoảng cách trụ phải > 0");
  if (!pos(b.H)) errors.push("Độ cao đèn H phải > 0");
  if (pos(b.spacing) && +b.spacing < 8) errors.push(`Khoảng cách trụ ${b.spacing} m quá nhỏ (tối thiểu 8 m)`);
  if (pos(b.length) && +b.length > 5000) errors.push("Chiều dài cầu > 5000 m — chia thành nhiều cầu/đoạn");
  if (pos(b.width) && +b.width > 60) errors.push("Lòng đường > 60 m — kiểm tra lại số liệu");
  if (b.lanes != null && b.lanes !== "" && (+b.lanes < 1 || +b.lanes > 16)) errors.push("Số làn phải từ 1 đến 16");
  if (b.perPole != null && b.perPole !== "" && (+b.perPole < 1 || +b.perPole > 8)) errors.push("Số đèn/trụ phải từ 1 đến 8");
  if (pos(b.H) && +b.H > 40) errors.push("Độ cao đèn > 40 m — kiểm tra lại số liệu");
  if (b.poleStart != null && b.poleStart !== "" && pos(b.length) && pos(b.spacing)) {
    const ps = +b.poleStart, room = Math.max(0, +b.length - +b.spacing);
    if (!(ps >= 0)) errors.push("Trụ đầu cách mố phải ≥ 0");
    else if (ps > room + 1e-9) errors.push(`Trụ đầu cách mố ${ps} m — phải ≤ ${room.toFixed(1)} m để còn ít nhất một khoảng cột trên cầu`);
  }
  const g = n0(b.grade, 0);
  if (g < 0) errors.push("Dốc dọc không được âm (nhập độ lớn dốc, cầu đối xứng)");
  if (g > 10) errors.push(`Dốc dọc ${g}% > 10% — ngoài phạm vi cầu đường bộ, kiểm tra lại số liệu`);
  if (!hasIes) errors.push("Chưa có file IES cho bộ đèn — chọn thư mục IES");
  if (!errors.length) {
    const G = bridgeGeometry(b), P = makeProfile({ length: G.L, grade: g, Rv: n0(b.Rv, 0) });
    if (g > 0 && !(n0(b.Rv, 0) > 0)) warnings.push("Không có bán kính đường cong đứng — đỉnh dốc gãy góc ở giữa cầu");
    if (P.curveLen > G.L + 1e-6) warnings.push(`Đường cong đứng dài ${P.curveLen.toFixed(0)} m > chiều dài cầu — dốc thực tế tại mố chỉ ${(100 * Math.abs(P.slope(0))).toFixed(2)}%`);
    if (G.S > G.L) warnings.push("Khoảng cách trụ lớn hơn chiều dài cầu — chỉ tính được 1 ô lưới");
    if (G.H <= n0(b.parapetH, 1.1) + 0.5) warnings.push(`Đèn cao ${G.H} m, chỉ nhỉnh hơn lan can ${n0(b.parapetH, 1.1)} m — lan can có thể che sáng`);
    if (G.kind === "center" && G.overhang < 0) warnings.push(`Trụ giữa: cần vươn ${G.arm} m ngắn hơn ½ dải phân cách — điểm sáng nằm trên dải`);
    if (b.site === "giua" && arrangementKind(b.arrangement) !== "center") warnings.push("Vị trí trụ trên dải phân cách → tính như bố trí 'giữa'");
    if (b.roadClassNote) warnings.push(`${b.roadClassNote} — app tự xác định cấp ${b.roadClass} theo hình học`);
    // tầm nhìn qua đỉnh cầu: mắt cao 1,5 m thấy mặt đường xa √(2·R·1,5) (đỉnh gãy: rất ngắn)
    if (P.grade > 0) {
      const sight = n0(b.Rv, 0) > 0 ? Math.sqrt(2 * +b.Rv * 1.5) : 1.5 / (P.grade / 100);
      if (sight < 60 + G.S) warnings.push(`Đỉnh cầu che tầm nhìn: người quan sát (60 m, mắt 1,5 m) chỉ thấy khoảng ${sight.toFixed(0)} m mặt đường qua đỉnh — các ô có điểm khuất (cột "khuất" trong bảng ô) chỉ mang tính tham khảo`);
    }
    if (G.kind !== "center" && G.overhang < -G.walk - G.guard - 0.5) warnings.push("Điểm sáng nằm xa ngoài mép lòng đường — kiểm tra độ vươn / vị trí trụ");
    if (G.walk > 0 && !findReq(b.walkReq)) warnings.push("Chưa chọn yêu cầu lề bộ hành — dùng mật độ trung bình (20 lx)");
  }
  return { errors, warnings };
}

// ------------------------------------------------------------------ tính
/**
 * Tính một cầu. input = thông số cầu (BRIDGE_DEFAULTS) + ies (ph đã parse) + MF chung, q0, detail.
 * Trả kết quả theo từng ô tính dọc cầu (fields) và tổng hợp xấu nhất (road), lề bộ hành (walk), lưới mặt bằng (plan).
 */
export function calcBridge(input) {
  const { ies, detail = false } = input;
  const v = validateBridge(input, { hasIes: !!ies });
  if (v.errors.length) throw new Error(v.errors.join("; "));
  const G = bridgeGeometry(input);
  const prof = makeProfile({ length: G.L, grade: n0(input.grade, 0), Rv: n0(input.Rv, 0) });
  const MF = n0(input.MF, 0.8), q0 = input.q0 || null;
  const rfn = input.rfn || (q0 && q0 !== R3.q0 ? scaleRTable(R3, q0) : R3);
  const I = makeIntensity(ies);
  const { S, W } = G, sw = 5, swTI = Math.min(2000, Math.max(sw, Math.ceil(500 / S)));
  const g0 = buildGrid({ spacing: S, width: W, lanes: G.lanes });

  // ô tính: mỗi khoảng cột nằm trọn trên cầu, bắt đầu từ trụ đầu
  const nF = Math.max(1, Math.floor((G.L - G.poleStart) / S + 1e-9));
  const walkW = G.walk > 0 ? G.walk : null;
  const srW = Math.min(5, W / 2, walkW ?? Infinity), reiW = Math.min(g0.laneWidth, W / 2, walkW ?? Infinity);
  const fields = [];
  for (let f = 0; f < nF; f++) {
    const xs = G.poleStart + f * S;
    const lums = bridgeLums(G, prof, f - sw, f + sw + 1);
    const lumsTI = bridgeLums(G, prof, f - swTI, f + swTI + 1);
    const pts = g0.points.map((p) => ({ x: p.x + xs, y: p.y, z: prof.z(p.x + xs), li: p.li }));
    const Evals = pts.map((P) => illumSurface(P, lums, I, MF, prof.slope(P.x), prof));
    const obsRes = g0.laneCenters.map((y, k) => {
      const ox = xs - 60, obs = { x: ox, y, z: prof.z(ox) + 1.5 };
      const Lvals = pts.map((P) => lumSurface(P, lums, I, rfn, obs, MF, prof.slope(P.x), prof));
      const s = stats(Lvals);
      const Ul = longitudinalUniformity(Lvals, g0, k);
      const { Lv, TI } = tiMovingProfile(lumsTI, I, obs, s.avg, MF, S, g0.nLong, prof);
      const o = { pos: obs, Lav: s.avg, Uo: s.avg > 0 ? s.min / s.avg : 0, Ul, Lmin: s.min, Lmax: s.max, Lv, TI };
      if (detail) o.Lvals = Lvals;
      return o;
    });
    const strip = (y0, y1) => {
      let s = 0, n = 0;
      for (let i = 0; i < g0.nLong; i++) { const x = xs + g0.dL / 2 + i * g0.dL; for (let j = 0; j < 5; j++) {
        const P = { x, y: y0 + (y1 - y0) * (j + 0.5) / 5, z: prof.z(x) }; s += illumSurface(P, lums, I, MF, prof.slope(x), prof); n++; } }
      return s / n;
    };
    let SR = null, REI = null;
    if (walkW) {
      SR = (strip(-srW, 0) + strip(W, W + srW)) / (strip(0, srW) + strip(W - srW, W));
      REI = Math.min(strip(-reiW, 0) / strip(0, reiW), strip(W, W + reiW) / strip(W - reiW, W));
    }
    const E = stats(Evals);
    const hidden = prof.flat ? 0 : g0.laneCenters.reduce((m, y) => { const ox = xs - 60, eye = { x: ox, y, z: prof.z(ox) + 1.5 };
      return Math.max(m, pts.filter((P) => crestBlocked(prof, P, { x: eye.x, H: eye.z })).length / pts.length); }, 0);
    const fr = { f, hidden, x0: xs, x1: xs + S, zMid: prof.z(xs + S / 2), slopeMid: prof.slope(xs + S / 2), E, SR, REI, observers: obsRes,
      Lav: Math.min(...obsRes.map((o) => o.Lav)), Uo: Math.min(...obsRes.map((o) => o.Uo)), Ul: Math.min(...obsRes.map((o) => o.Ul)), TI: Math.max(...obsRes.map((o) => o.TI)) };
    if (detail) fr.Evals = Evals;
    fields.push(fr);
  }
  const worst = (k, fn) => fields.reduce((a, b) => (fn(b[k], a[k]) ? b : a));
  const road = {
    Lav: Math.min(...fields.map((f) => f.Lav)), Uo: Math.min(...fields.map((f) => f.Uo)), Ul: Math.min(...fields.map((f) => f.Ul)),
    TI: Math.max(...fields.map((f) => f.TI)),
    SR: walkW ? Math.min(...fields.map((f) => f.SR)) : null, REI: walkW ? Math.min(...fields.map((f) => f.REI)) : null,
    Eav: fields.reduce((s, f) => s + f.E.avg, 0) / fields.length,
    worstField: { Lav: worst("Lav", (a, b) => a < b).f, Uo: worst("Uo", (a, b) => a < b).f, Ul: worst("Ul", (a, b) => a < b).f, TI: worst("TI", (a, b) => a > b).f },
  };
  const roadClass = QCVN[input.roadClass] ? input.roadClass : "D1";
  const req = QCVN[roadClass];
  const r2 = (x) => Math.round(x * 100) / 100;
  const checks = { Ltb: r2(road.Lav) >= req.Ltb, Uo: r2(road.Uo) >= req.Uo, Ul: r2(road.Ul) >= req.Ul, TI: Math.round(road.TI) <= req.TI,
    SR: road.SR == null ? null : r2(road.SR) >= req.SR };

  // lề bộ hành: toàn chiều dài cầu, 3 hàng điểm mỗi bên
  let walk = null;
  if (walkW) {
    const lumsAll = bridgeLums(G, prof, -swTI, Math.ceil(G.L / S) + swTI);
    const nx = Math.max(10, Math.round(G.L / (S / 10))), dx = G.L / nx, rows = 3;
    const side = (yOf) => { const v = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < nx; i++) { const x = dx / 2 + i * dx, y = yOf(walkW * (j + 0.5) / rows);
        v.push(illumSurface({ x, y, z: prof.z(x) }, lumsAll, I, MF, prof.slope(x), prof)); }
      const s = stats(v); return { Eav: s.avg, Emin: s.min, Emax: s.max, Uo: s.min / s.avg }; };
    const L1 = side((d) => -G.guard - d), R1 = side((d) => W + G.guard + d);
    const wreq = findReq(input.walkReq) || findReq("TCVN13608-B4-tb");
    const worstSide = L1.Eav <= R1.Eav ? L1 : R1;
    const pass = r2(worstSide.Eav) + 1e-9 >= wreq.Eav && (wreq.Uo == null || r2(Math.min(L1.Uo, R1.Uo)) >= wreq.Uo);
    walk = { left: L1, right: R1, req: wreq, pass, Eav: Math.min(L1.Eav, R1.Eav), Uo: Math.min(L1.Uo, R1.Uo) };
  }
  const pass = Object.values(checks).every((c) => c !== false) && (!walk || walk.pass);

  // lưới mặt bằng toàn cầu (để vẽ): E trên mặt cầu, cả lề bộ hành
  let plan = null;
  if (detail) {
    const lumsAll = bridgeLums(G, prof, -swTI, Math.ceil(G.L / S) + swTI);
    const nx = Math.min(400, Math.max(40, Math.round(G.L / 1))), dxp = G.L / nx;
    const ys = [];
    const wv = (walkW || 0) + (walkW ? G.guard : 0);
    const ny = Math.max(12, Math.round((W + 2 * wv) / 0.5));
    for (let j = 0; j < ny; j++) ys.push(-wv + (W + 2 * wv) * (j + 0.5) / ny);
    const E = new Float32Array(nx * ny);
    for (let i = 0; i < nx; i++) { const x = dxp / 2 + i * dxp, z = prof.z(x), sl = prof.slope(x);
      for (let j = 0; j < ny; j++) E[j * nx + i] = illumSurface({ x, y: ys[j], z }, lumsAll, I, MF, sl, prof); }
    plan = { nx, ny, dx: dxp, ys, y0: -wv, y1: W + wv, E };
  }

  return { geometry: G, profile: { crest: prof.crest, curveLen: prof.curveLen, grade: prof.grade, flat: prof.flat },
    fields, road, checks, req, roadClass, walk, pass, warnings: v.warnings, plan, MF, q0: q0 || R3.q0, srWidth: walkW ? srW : null, grid: g0 };
}

/** Tự chọn bộ đèn: thử mọi IES (loại C) theo công suất tăng dần, trả bộ nhỏ nhất Đạt (hoặc bộ có Ltb cao nhất nếu không bộ nào Đạt). */
export function pickBridgeIes(input, iesIndex) {
  const cands = iesIndex.filter((e) => e.ph && (!e.ph.photometricType || e.ph.photometricType === 1)).slice()
    .sort((a, b) => (a.power ?? 1e9) - (b.power ?? 1e9));
  let best = null; const tried = [];
  for (const e of cands) {
    let r; try { r = calcBridge({ ...input, ies: e.ph, detail: false }); } catch { continue; }
    tried.push({ name: e.name, power: e.power, pass: r.pass, Lav: r.road.Lav });
    if (r.pass) return { ies: e, result: r, tried, auto: true };
    if (!best || r.road.Lav > best.result.road.Lav) best = { ies: e, result: r };
  }
  return best ? { ...best, tried, auto: true, none: true } : null;
}

// ------------------------------------------------------------------ Excel
export const BRIDGE_COLS = [
  ["STT", "stt", "Số thứ tự cầu.", 6],
  ["Tên cầu", "name", "Bắt buộc.", 26],
  ["Cấp đường", "roadClass", "A/B1/B2/C1/C2/D1/D2/E — cấp của tuyến đi qua cầu (QCVN 07-7:2023).", 9],
  ["Chiều dài cầu (m)", "length", "Từ mố đến mố (theo phương ngang).", 10],
  ["Lòng đường (m)", "width", "Tổng bề rộng các làn xe, không gồm dải phân cách và lề bộ hành.", 10],
  ["Số làn", "lanes", "Tổng số làn cả hai chiều. Trống → ước lượng W/3,5.", 7],
  ["Dải phân cách (m)", "medianW", "0/trống = không có. Trụ đặt trên dải: trống → coi 2 m.", 10],
  ["Lề bộ hành mỗi bên (m)", "walk", "0 = không có lề bộ hành (khi đó không xét SR).", 10],
  ["Gờ chắn (m)", "guard", "Bề rộng gờ chắn bánh giữa lề và lòng đường (mặc định 0,3).", 8],
  ["Chiều cao lan can (m)", "parapetH", "Để cảnh báo đèn quá thấp (mặc định 1,1).", 9],
  ["Vị trí trụ", "site", "lan can / gờ chắn / dải phân cách.", 13],
  ["Khoảng cách trụ đến mép lòng đường (m)", "setback", "Trống = tự tính: lan can → lề + gờ; gờ chắn → ½ gờ.", 12],
  ["Cách bố trí trụ", "arrangement", "1 bên / đối xứng / so le / giữa.", 11],
  ["Khoảng cách trụ (m)", "spacing", "Bắt buộc.", 10],
  ["Trụ đầu cách mố (m)", "poleStart", "Trống = canh giữa dãy trụ trên cầu.", 10],
  ["Dốc dọc (%)", "grade", "Độ dốc hai phía (đối xứng), 0 = cầu phẳng. Tối đa 10%.", 8],
  ["Bán kính cong đứng (m)", "Rv", "Đường cong đứng lồi ở đỉnh. Trống = đỉnh gãy.", 10],
  ["Đường dẫn có chiếu sáng", "approachLit", "có / không — dãy đèn kéo dài sang đường dẫn hai đầu cầu.", 10],
  ["Độ cao đèn (m)", "H", "Từ mặt cầu tại chân trụ tới đèn. Bắt buộc.", 9],
  ["Độ vươn cần đèn (m)", "arm", "", 9],
  ["Góc nghiêng (độ)", "tilt", "", 8],
  ["Góc xoay (độ)", "rot", "Quanh trục đứng, 0 = chiếu vuông góc vào đường.", 8],
  ["Số đèn/trụ", "perPole", "", 7],
  ["Bộ đèn (file IES)", "iesName", "Tên file IES; trống = app tự chọn bộ công suất nhỏ nhất vẫn Đạt.", 26],
  ["Hệ số bảo trì MF", "MF", "Trống = MF chung trên app.", 9],
  ["Yêu cầu lề bộ hành", "walkReq", "Mã TCVN 13608 Bảng 4: TCVN13608-B4-cao (30 lx) / -tb (20 lx) / -thap (10 lx).", 20],
];
export const BRIDGE_HEAD = BRIDGE_COLS.map((c) => c[0]);
export const BRIDGE_SHEET = "DU LIEU CAU";

const SITE_IN = (s) => { const t = String(s || "").toLowerCase(); if (/phân cách|phan cach|giữa|giua|dpc/.test(t)) return "giua"; if (/gờ|go chan|gờ chắn|bó vỉa/.test(t)) return "go"; return "lancan"; };
const SITE_OUT = { lancan: "lan can", go: "gờ chắn", giua: "dải phân cách" };
const NUMK = new Set(["stt", "length", "width", "lanes", "medianW", "walk", "guard", "parapetH", "setback", "spacing", "poleStart", "grade", "Rv", "H", "arm", "tilt", "rot", "perPole", "MF"]);
const num = (v) => { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

const ROW_BLANK = { name: "", roadClass: "", length: null, width: null, lanes: null, medianW: 0, walk: 0, guard: 0.3, parapetH: 1.1,
  site: "lancan", setback: null, arrangement: "1 bên", spacing: null, poleStart: null, grade: 0, Rv: null, approachLit: true,
  H: null, arm: 0, tilt: 0, rot: 0, perPole: 1, iesName: "", MF: null, walkReq: "TCVN13608-B4-tb" };
/** Dòng sheet DU LIEU CAU (sheet_to_json) → cầu. */
export function parseBridgeRows(rows) {
  const out = [];
  for (const r of rows || []) {
    // ô trống: thông số bắt buộc (tên, chiều dài, lòng đường, khoảng cách trụ, H) để trống → báo lỗi khi tính;
    // tuỳ chọn → giá trị trung tính (dốc 0, không lề, không dải phân cách, số làn ước lượng W/3,5…)
    const b = { ...ROW_BLANK };
    let any = false;
    for (const [head, key] of BRIDGE_COLS) {
      const v = r[head];
      if (v == null || v === "") continue;
      if (key !== "stt") any = true;
      if (NUMK.has(key)) b[key] = num(v);
      else if (key === "site") b.site = SITE_IN(v);
      else if (key === "approachLit") b.approachLit = !/^\s*(không|khong|no|0|false|ko)\s*$/i.test(String(v));
      else if (key === "roadClass") b.roadClass = String(v).trim().toUpperCase();
      else b[key] = String(v).trim();
    }
    if (!any || !b.name) continue;
    if (arrangementKind(b.arrangement) === "center") b.site = "giua";
    else if (b.site === "giua") b.arrangement = "giữa";
    if (!QCVN[b.roadClass]) { b.roadClassNote = b.roadClass ? `cấp "${b.roadClass}" không hợp lệ` : "chưa ghi cấp"; b.roadClass = classifyRoadClass({ width: b.width, lanes: b.lanes, median: (b.medianW || 0) > 0 }); }
    out.push(b);
  }
  return out;
}

/** Cầu → giá trị ô Excel theo BRIDGE_COLS. */
export function bridgeToRow(b, i = 0) {
  return BRIDGE_COLS.map(([, key]) => {
    if (key === "stt") return b.stt ?? i + 1;
    if (key === "site") return SITE_OUT[b.site] || "lan can";
    if (key === "approachLit") return b.approachLit === false ? "không" : "có";
    const v = b[key]; return v == null || v === "" ? null : v;
  });
}

/** Cầu mẫu (dùng cho nút "Cầu mẫu" và Excel mẫu). */
export const BRIDGE_SAMPLES = [
  { ...BRIDGE_DEFAULTS, name: "Cầu mẫu 1 — dốc 4%, so le, trụ trên lan can", roadClass: "C1" },
  { ...BRIDGE_DEFAULTS, name: "Cầu mẫu 2 — phẳng, đối xứng (đối chiếu chế độ Đường)", roadClass: "D1", length: 210, width: 13, lanes: 3,
    walk: 2, site: "go", setback: 0, arrangement: "đối xứng", spacing: 35, grade: 0, Rv: null, H: 10.5, arm: 0, tilt: 15, MF: 0.67, walkReq: "TCVN13608-B4-thap" },
  { ...BRIDGE_DEFAULTS, name: "Cầu mẫu 3 — có dải phân cách, trụ giữa cần đôi", roadClass: "B1", length: 360, width: 15, lanes: 4,
    medianW: 1.5, walk: 1.5, site: "giua", arrangement: "giữa", spacing: 35, grade: 3, Rv: 3000, H: 11, arm: 2.5, tilt: 10 },
];

/** Workbook Excel mẫu / kết quả cho chế độ Cầu (ExcelJS). results: [{b, r, iesName}] (tuỳ chọn). */
export async function buildBridgeWorkbook(ExcelJS, { bridges = BRIDGE_SAMPLES, results = null, version = "" } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WebDialux-CS " + version;
  const ws = wb.addWorksheet(BRIDGE_SHEET, { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const thin = { style: "thin", color: { argb: "FFD0D7E2" } }, B = { top: thin, left: thin, bottom: thin, right: thin };
  ws.addRow(BRIDGE_HEAD);
  BRIDGE_COLS.forEach(([h, , note, w], i) => {
    const c = ws.getRow(1).getCell(i + 1);
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = B;
    if (note) c.note = { texts: [{ font: { size: 9 }, text: note }] };
    ws.getColumn(i + 1).width = w;
  });
  ws.getRow(1).height = 48;
  bridges.forEach((b, i) => { const row = ws.addRow(bridgeToRow(b, i)); row.eachCell({ includeEmpty: true }, (c) => { c.border = B; c.font = { size: 10 }; }); });
  const col = (key) => ws.getColumn(BRIDGE_COLS.findIndex((c) => c[1] === key) + 1).letter;
  const list = (key, items) => ws.dataValidations.add(`${col(key)}2:${col(key)}500`, { type: "list", allowBlank: true, formulae: [`"${items.join(",")}"`] });
  list("site", ["lan can", "gờ chắn", "dải phân cách"]);
  list("arrangement", ["1 bên", "đối xứng", "so le", "giữa"]);
  list("approachLit", ["có", "không"]);
  list("roadClass", Object.keys(QCVN));
  list("walkReq", WALK_REQS);

  if (results && results.length) {
    const wr = wb.addWorksheet("KET QUA CAU", { views: [{ state: "frozen", ySplit: 1 }] });
    const head = ["STT", "Tên cầu", "Cấp", "Bộ đèn", "Công suất (W)", "Ltb (cd/m²)", "Ltb YC", "Uo", "Uo YC", "Ul", "Ul YC", "TI (%)", "TI YC", "SR", "SR YC",
      "Lề BH Eav (lx)", "Lề BH Uo", "Lề BH YC", "Kết quả", "Ô tính xấu nhất (Ltb)", "Cảnh báo"];
    wr.addRow(head);
    wr.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } }; c.alignment = { wrapText: true, horizontal: "center" }; c.border = B; });
    results.forEach(({ b, r, iesName, power, err }, i) => {
      if (!r) { wr.addRow([i + 1, b.name, b.roadClass, iesName || "", power ?? "", "lỗi dữ liệu: " + (err || []).join("; ")]); return; }
      const q = r.req, w = r.walk;
      const row = wr.addRow([i + 1, b.name, r.roadClass, iesName || "", power ?? "", +r.road.Lav.toFixed(3), q.Ltb, +r.road.Uo.toFixed(3), q.Uo, +r.road.Ul.toFixed(3), q.Ul,
        Math.round(r.road.TI), q.TI, r.road.SR == null ? "—" : +r.road.SR.toFixed(3), r.road.SR == null ? "không xét" : q.SR,
        w ? +w.Eav.toFixed(1) : "—", w ? +w.Uo.toFixed(2) : "—", w ? `${w.req.Eav} lx, Uo ${w.req.Uo}` : "—",
        r.pass ? "ĐẠT" : "KHÔNG ĐẠT", `ô ${r.road.worstField.Lav + 1}`, (r.warnings || []).join("; ")]);
      row.eachCell({ includeEmpty: true }, (c) => { c.border = B; });
      row.getCell(19).font = { bold: true, color: { argb: r.pass ? "FF1F8A4C" : "FFC0392B" } };
    });
    head.forEach((h, i) => { wr.getColumn(i + 1).width = i === 1 ? 30 : i === 3 ? 26 : i === 20 ? 50 : 11; });
    // từng ô tính dọc cầu
    const wf = wb.addWorksheet("O TINH DOC CAU");
    wf.addRow(["Cầu", "Ô", "Từ x (m)", "Đến x (m)", "Cao độ giữa ô (m)", "Dốc giữa ô (%)", "Ltb", "Uo", "Ul", "TI", "SR", "Eav (lx)", "Điểm khuất tầm nhìn (%)"]);
    wf.getRow(1).font = { bold: true };
    for (const { b, r } of results) if (r) for (const f of r.fields)
      wf.addRow([b.name, f.f + 1, +f.x0.toFixed(2), +f.x1.toFixed(2), +f.zMid.toFixed(3), +(f.slopeMid * 100).toFixed(2), +f.Lav.toFixed(3), +f.Uo.toFixed(3), +f.Ul.toFixed(3), Math.round(f.TI), f.SR == null ? "—" : +f.SR.toFixed(3), +f.E.avg.toFixed(2), Math.round((f.hidden || 0) * 100)]);
    wf.columns.forEach((c, i) => { c.width = i === 0 ? 30 : 11; });
  }
  const wh = wb.addWorksheet("HUONG DAN");
  [["CHẾ ĐỘ CẦU — cách điền sheet DU LIEU CAU"], ["Mỗi dòng là một cầu. Toạ độ dọc cầu tính từ mố đầu; cao độ mặt cầu tại hai mố = 0."],
    ["Trắc dọc: hai đoạn dốc đối xứng lên tới đỉnh ở giữa cầu, nối bằng đường cong đứng lồi bán kính R (chiều dài cong = 2·R·i)."],
    ["Lòng đường: Ltb, Uo, Ul, TI, SR theo QCVN 07-7:2023 (CIE 140, bảng R3), tính trên từng khoảng cột dọc cầu, lấy ô xấu nhất."],
    ["Lề bộ hành: độ rọi Eav, Uo trên toàn chiều dài cầu, yêu cầu theo TCVN 13608:2023 Bảng 4."],
    ["Cầu dốc 0% cho kết quả trùng chế độ Đường cùng hình học."]].forEach((r) => wh.addRow(r));
  wh.getColumn(1).width = 120; wh.getRow(1).font = { bold: true, size: 13 };
  return wb;
}
