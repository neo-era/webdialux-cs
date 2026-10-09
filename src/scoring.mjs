// Chấm điểm & xếp hạng nhiều phương án đèn trong CÙNG một tuyến.
// Đặc tả theo macro gốc `TinhDiem_Minh_UuTienHang1_HienThiAU` (SRS F5.2 / F5.3).
//
// Vào:  options = [{ ...tuỳ ý, power, Ltb, Uo, Ul, TI, SR, pass }]
// Ra :  bản sao từng option + { d_Ltb,d_Uo,d_Ul,d_TI,d_SR, tong1, tong2, diemXet, rank, chosen }
//       - Chỉ phương án ĐẠT (pass=true) mới được chấm điểm & xếp hạng.
//       - Phương án KHÔNG ĐẠT: điểm = null, rank = null, chosen = false.

const CRIT_HI = ["Ltb", "Uo", "Ul", "SR"]; // cao hơn = tốt hơn
// TI: thấp hơn = tốt hơn

/** So 1 cặp phương án a,b: a thắng b ở bao nhiêu / 5 tiêu chí. */
function winsOver(a, b) {
  let w = 0;
  for (const k of CRIT_HI) if (a[k] > b[k]) w++;
  if (a.TI < b.TI) w++;
  return w;
}

export function scoreOptions(options) {
  const out = options.map((o) => ({
    ...o,
    d_Ltb: null, d_Uo: null, d_Ul: null, d_TI: null, d_SR: null,
    tong1: null, tong2: null, diemXet: null, rank: null, chosen: false,
  }));
  const pass = out.filter((o) => o.pass);
  if (pass.length === 0) return out;

  // Điểm từng tiêu chí (Borda) — chỉ trong nhóm ĐẠT
  for (const o of pass) {
    o.d_Ltb = pass.filter((x) => x.Ltb <= o.Ltb).length;
    o.d_Uo  = pass.filter((x) => x.Uo  <= o.Uo ).length;
    o.d_Ul  = pass.filter((x) => x.Ul  <= o.Ul ).length;
    o.d_SR  = pass.filter((x) => x.SR  <= o.SR ).length;
    o.d_TI  = pass.filter((x) => x.TI  >= o.TI ).length; // TI thấp hơn tốt hơn
    o.tong1 = o.d_Ltb + o.d_Uo + o.d_Ul + o.d_SR + o.d_TI;
  }

  // Tổng điểm lần 2: chỉ cho nhóm đồng hạng tong1 cao nhất
  const maxT1 = Math.max(...pass.map((o) => o.tong1));
  const top = pass.filter((o) => o.tong1 === maxT1);
  for (const o of pass) {
    if (o.tong1 === maxT1 && top.length > 1) {
      o.tong2 = top.filter((x) => x !== o && winsOver(o, x) >= 3).length;
    } else {
      o.tong2 = 0;
    }
    o.diemXet = o.tong1 + o.tong2 * 0.01;
  }

  // Xếp hạng: (1) công suất NHỎ hơn trên; (2) điểm xét cao hơn; (3) Ltb cao hơn
  const ranked = pass.slice().sort((a, b) => {
    const pa = a.power ?? Infinity, pb = b.power ?? Infinity;
    if (pa !== pb) return pa - pb;
    if (b.diemXet !== a.diemXet) return b.diemXet - a.diemXet;
    return b.Ltb - a.Ltb;
  });
  ranked.forEach((o, i) => { o.rank = i + 1; o.chosen = i === 0; });

  return out;
}
