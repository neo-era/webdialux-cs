// Các mẫu dựng sẵn cho chế độ "Khu vực tự do": sân bóng mini, quảng trường (trụ 4 đèn), công viên (Bảng 7 TCVN 13608:2023).
// Dữ liệu thuần (tên IES dạng chuỗi); sampleState() khớp tên với thư viện IES đã nạp, không có thì dùng bộ đèn đầu tiên.
import { matchAreaIes, spreadLamps } from "./area.mjs";
import { findReq } from "./areaReq.mjs";

const IES70 = "242AEE3-NHB-SL-70W", IES90 = "238AEE3-NHB-SL-90W";
const L = (aim, tilt, ies = IES70, arm = 0.5, H = null) => ({ aim, tilt, arm, H, iesWant: ies });

export const SAMPLES = {
  san: {
    name: "Sân bóng mini mẫu", label: "Sân bóng mẫu 40 × 20 m",
    poles: [[-3, -2, 35], [20, -2, 90], [43, -2, 145], [-3, 22, -35], [20, 22, -90], [43, 22, -145]]
      .map(([x, y, aim], i) => ({ id: `T${i + 1}`, x, y, H: 12, lamps: [L(aim, 35, IES70, 0), L(aim, 35, IES70, 0)] })),
    areas: [{ name: "Sân bóng đá mini", x0: 0, y0: 0, L: 40, W: 20, step: 1, req: "TCVN13608-B12-luyentap" }],
  },
  quangtruong: {
    name: "Quảng trường mẫu", label: "Quảng trường mẫu (trụ 4 đèn)", select: "T1",
    poles: [
      { id: "T1", x: 30, y: 25, H: 12, lamps: spreadLamps(Array.from({ length: 4 }, () => L(0, 30, IES70, 0.6)), 45) },
      ...[[6, 6, 45], [54, 6, 135], [54, 44, -135], [6, 44, -45]].map(([x, y, aim], i) => ({ id: `T${i + 2}`, x, y, H: 10, lamps: [L(aim - 30, 30), L(aim + 30, 30)] })),
    ],
    areas: [{ name: "Quảng trường", x0: 0, y0: 0, L: 60, W: 50, step: 1, req: "TCVN13608-B7-I-cv-santhoatdong" }],
  },
  congvien: {
    name: "Công viên mẫu", label: "Công viên mẫu (Bảng 7)", select: "C1",
    // công viên 80 × 60 m, đô thị loại I–II: cổng chính, đường trục chính 6 m, đường dạo 3 m, sân hoạt động 24 × 18 m
    poles: [
      { id: "C1", x: 33, y: 4, H: 8, lamps: [L(0, 25), L(70, 20)] },               // trụ cổng: 1 đèn rọi cổng, 1 đèn rọi lối vào trục
      { id: "C2", x: 47, y: 4, H: 8, lamps: [L(180, 25), L(110, 20)] },
      ...[20, 36, 52].map((y, i) => ({ id: `D${i + 1}`, x: 36, y, H: 8, lamps: [L(0, 5, IES70, 1)] })),   // trục chính: 1 bên, cách 16 m
      ...[10, 64].map((x, i) => ({ id: `V${i + 1}`, x, y: 27.5, H: 6, lamps: [L(90, 0, IES70, 0.3)] })),  // đường dạo
      { id: "S1", x: 49, y: 47, H: 10, lamps: [L(-35, 35, IES90), L(35, 35, IES90)] },                  // sân: 2 trụ 2 đèn xoè
      { id: "S2", x: 75, y: 47, H: 10, lamps: [L(145, 35, IES90), L(215, 35, IES90)] },
    ],
    areas: [
      { name: "Cổng chính", x0: 34, y0: 0, L: 12, W: 8, step: 0.5, req: "TCVN13608-B7-I-cv-congchinh" },
      { name: "Đường trục chính", x0: 37, y0: 8, L: 6, W: 52, step: 1, req: "TCVN13608-B7-I-cv-truc" },
      { name: "Đường dạo", x0: 2, y0: 28, L: 76, W: 3, step: 1, req: "TCVN13608-B7-I-cv-nhanh" },
      { name: "Sân hoạt động", x0: 50, y0: 38, L: 24, W: 18, step: 1, req: "TCVN13608-B7-I-cv-santhoatdong" },
    ],
  },
  mythuat: {
    name: "Chiếu sáng mỹ thuật mẫu", label: "Mỹ thuật mẫu (tòa nhà, cây, tường rào)", select: "H1", tab: "obj",
    // tòa nhà 24 × 12 m cao 18 m, mặt Nam sơn trắng (ρ 0,75) được đánh giá; 4 đèn âm đất cách mặt nhà 1,5 m, mỗi 6 m, hắt lên;
    // 2 cây có đèn âm đất hắt tán; tường rào chỉ tính để xem (không đặt yêu cầu)
    poles: [
      ...[0, 1, 2, 3].map((i) => ({ id: `H${i + 1}`, x: 11 + 6 * i, y: 8.5, H: 0, lamps: [L(90, 160, IES70, 0)] })),
      { id: "U1", x: 2.5, y: 16, H: 0, lamps: [L(0, 175, IES70, 0), L(180, 175, IES70, 0)] },
      { id: "U2", x: 37.5, y: 16, H: 0, lamps: [L(0, 175, IES70, 0), L(180, 175, IES70, 0)] },
      ...[[4, 0], [20, 0], [36, 0]].map(([x, y], i) => ({ id: `T${i + 1}`, x, y, H: 6, lamps: [L(90, 20, IES70, 0.5)] })),
    ],
    areas: [{ name: "Sân trước", x0: 0, y0: 1, L: 40, W: 9, step: 1, req: "TCVN13608-B7-I-cv-santhoatdong" }],
    objects: [
      { id: "NH1", type: "building", pts: [[8, 10], [32, 10], [32, 22], [8, 22]], H: 18, mat: "Sơn trắng, đá trắng", rho: 0.75, zone: "E3", faces: [1], step: 1 },
      { id: "TR1", type: "wall", pts: [[0, 0.5], [40, 0.5]], H: 2.2, mat: "Tường rào sơn sáng", rho: 0.5, step: 0.5 },
      { id: "C1", type: "tree", pts: [[4, 16]], H: 8, crownR: 3, mat: "Tán lá cây", rho: 0.15 },
      { id: "C2", type: "tree", pts: [[36, 16]], H: 8, crownR: 3, mat: "Tán lá cây", rho: 0.15 },
    ],
  },
};

const reqOf = (id) => { const r = findReq(id); return r ? { id: r.id, Eav: r.Eav, Uo: r.Uo, label: r.label } : null; };

/** Dựng state {poles, areas, warnings, name, select} từ mẫu; khớp IES theo tên, thiếu thì dùng bộ đèn đầu tiên của thư viện. */
export function sampleState(kind, iesIndex = []) {
  const S = SAMPLES[kind] || SAMPLES.san;
  const fallback = iesIndex[0] || null, warnings = [];
  const pick = (want) => matchAreaIes(want, iesIndex) || fallback;
  const poles = S.poles.map((p) => {
    const lamps = p.lamps.map((l) => { const ies = pick(l.iesWant); return { ...l, ies, iesWant: ies ? ies.name : l.iesWant }; });
    const l0 = lamps[0];
    return { id: p.id, x: p.x, y: p.y, H: p.H, aim: l0.aim, tilt: l0.tilt, n: lamps.length, ies: l0.ies, iesWant: l0.iesWant, lamps };
  });
  if (!fallback) warnings.push("Chưa chọn thư mục IES — chọn để tính độ rọi.");
  else if (S.poles.some((p) => p.lamps.some((l) => !matchAreaIes(l.iesWant, iesIndex))))
    warnings.push(`Mẫu dùng bộ đèn ${IES70} / ${IES90}; thư viện không có nên tạm dùng ${fallback.name.replace(/\.ies$/i, "")} — chọn lại IES từng đèn nếu cần.`);
  const areas = S.areas.map((a) => ({ poly: null, MF: null, ...a, req: reqOf(a.req) }));
  const objects = (S.objects || []).map((o) => ({ crownR: null, reqE: null, reqL: null, step: null, ...o, pts: o.pts.map((p) => [...p]) }));
  return { poles, areas, objects, warnings, name: S.name, select: S.select || null, tab: S.tab || null };
}
