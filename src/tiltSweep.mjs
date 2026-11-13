// Góc nghiêng bộ đèn tự chọn: ô trống → thử 0/5/10/15/20° cho từng bộ đèn, chọn góc theo quy tắc:
//  - có góc Đạt → góc NHỎ NHẤT Đạt (nghiêng chỉ khi cần: góc lớn tăng chói & ánh sáng hắt lên trời);
//  - không góc nào Đạt → ít chỉ tiêu rớt nhất → biên m lớn nhất (chênh ≤ 0,02 coi là hoà) → góc nhỏ hơn.
export const TILT_STEPS = [0, 5, 10, 15, 20];
export const TILT_WARN = 15;            // góc tự chọn lớn hơn → cảnh báo
export const TILT_TIE = 0.02;
export const tiltWarning = (t) => `góc ${t}° lớn — tăng chói/ánh sáng hắt lên trời, kiểm tra khả năng chỉnh của cần/khớp đèn`;

const r2 = (x) => Math.round(x * 100) / 100;
/** Biên an toàn & số chỉ tiêu rớt, tính trên số đã làm tròn như engine xét Đạt (m ≥ 1 ⇔ Đạt). */
export function tiltMargin(r) {
  const q = r.req || {}, d = r.road || {};
  const ratios = [];
  const ge = (v, y) => { if (y == null || v == null || !isFinite(v)) return; ratios.push(y > 0 ? r2(v) / y : Infinity); };
  ge(d.Lav, q.Ltb); ge(d.Uo, q.Uo); ge(d.Ul, q.Ul); ge(d.SR, q.SR);
  if (q.TI != null && d.TI != null && isFinite(d.TI)) { const t = Math.round(d.TI); ratios.push(t <= 0 ? Infinity : q.TI / t); }
  const nfail = r.checks ? Object.values(r.checks).filter((x) => !x).length : ratios.filter((x) => x < 1).length;
  return { m: ratios.length ? Math.min(...ratios) : 0, nfail };
}

/** list: [{tilt, r}] (r = kết quả calcRoad) → phần tử được chọn. */
export function pickBestTilt(list) {
  const ok = list.filter((x) => x && x.r);
  if (!ok.length) return null;
  const pass = ok.filter((x) => x.r.pass).sort((a, b) => a.tilt - b.tilt);
  if (pass.length) return pass[0];
  const sc = ok.map((x) => ({ x, ...tiltMargin(x.r) }));
  const minFail = Math.min(...sc.map((s) => s.nfail));
  const lvl = sc.filter((s) => s.nfail === minFail);
  const best = Math.max(...lvl.map((s) => s.m));
  return lvl.filter((s) => s.m >= best - TILT_TIE).sort((a, b) => a.x.tilt - b.x.tilt)[0].x;
}

/**
 * calc(tilt) → kết quả calcRoad. tilt là số → tính 1 lần; null → quét TILT_STEPS.
 * Trả {tilt, r, auto, warn}. Mọi góc đều lỗi → ném lỗi cuối cùng.
 */
export function calcWithTilt(calc, tilt) {
  if (tilt != null) return { tilt, r: calc(tilt), auto: false, warn: null, near: false };
  const list = []; let err = null;
  for (const t of TILT_STEPS) {
    try { const r = calc(t); list.push({ tilt: t, r }); if (r.pass) break; }   // góc tăng dần: góc Đạt đầu tiên là góc được chọn
    catch (e) { err = e; }
  }
  const b = pickBestTilt(list);
  if (!b) throw err || new Error("không tính được góc nghiêng nào");
  const near = !b.r.pass;   // không góc nào Đạt → góc GẦN ĐẠT NHẤT, không phải góc khuyến nghị lắp đặt
  const warns = [b.tilt > TILT_WARN ? tiltWarning(b.tilt) : null, near ? "không góc nào Đạt — đây là góc gần đạt nhất, không phải góc khuyến nghị lắp đặt" : null].filter(Boolean);
  return { tilt: b.tilt, r: b.r, auto: true, warn: warns.length ? warns.join("; ") : null, near };
}
