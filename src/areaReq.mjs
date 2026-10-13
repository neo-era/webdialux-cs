// Bảng yêu cầu chiếu sáng cho chế độ "Khu vực tự do".
// Eav = độ rọi ngang trung bình duy trì tối thiểu (lx); Uo = Emin/Eav tối thiểu (null = văn bản không quy định).
// Nguồn: TCVN 13608:2023 "Chiếu sáng nhân tạo bên ngoài các công trình công cộng và hạ tầng kỹ thuật — Yêu cầu thiết kế"
//        (Bảng 4, 6, 7, 12–15) và EN 12193:2018 (cấp I–III). Người dùng sửa được ngưỡng ở sheet VUNG TINH.

const T = "TCVN 13608:2023";
const r = (id, group, label, Eav, Uo, source) => ({ id, group, label, Eav, Uo, source });

const park = [];
// Bảng 7 — công viên (cv), vườn hoa (vh); 3 nhóm khu vực; không quy định độ đồng đều
const B7 = {
  I: { name: "đô thị loại I, II (trung tâm)", cv: { congchinh: 50, congphu: 20, truc: 20, nhanh: 10, santhoatdong: 20 }, vh: { truc: 15, nhanh: 7, santhoatdong: 10 } },
  NT: { name: "ngoại thành đô thị loại I, II", cv: { congchinh: 30, congphu: 15, truc: 10, nhanh: 5, santhoatdong: 15 }, vh: { truc: 10, nhanh: 5, santhoatdong: 10 } },
  III: { name: "đô thị loại III, IV, V", cv: { congchinh: 30, congphu: 10, truc: 10, nhanh: 5, santhoatdong: 10 }, vh: { truc: 7, nhanh: 5, santhoatdong: 7 } },
};
const OBJ = { congchinh: "cổng chính", congphu: "cổng phụ", truc: "đường trục chính", nhanh: "đường nhánh, đường dạo", santhoatdong: "sân hoạt động ngoài trời" };
for (const [g, v] of Object.entries(B7)) for (const kind of ["cv", "vh"]) for (const [o, E] of Object.entries(v[kind]))
  park.push(r(`TCVN13608-B7-${g}-${kind}-${o}`, kind === "cv" ? "Công viên" : "Vườn hoa",
    `${kind === "cv" ? "Công viên" : "Vườn hoa"} · ${OBJ[o]} · ${v.name}`, E, null, `${T} Bảng 7`));

export const AREA_REQS = [
  // Sân thể thao ngoài trời — TCVN 13608:2023
  r("TCVN13608-B12-luyentap", "Bóng đá / SVĐ đa chức năng", "Bóng đá, SVĐ đa chức năng · luyện tập", 300, 0.4, `${T} Bảng 12`),
  r("TCVN13608-B12-thidau", "Bóng đá / SVĐ đa chức năng", "Bóng đá, SVĐ đa chức năng · thi đấu", 500, 0.5, `${T} Bảng 12`),
  r("TCVN13608-B12-chinhthuc", "Bóng đá / SVĐ đa chức năng", "Bóng đá, SVĐ đa chức năng · thi đấu chính thức", 750, 0.6, `${T} Bảng 12`),
  r("TCVN13608-B12-truyenhinh", "Bóng đá / SVĐ đa chức năng", "Bóng đá, SVĐ đa chức năng · thi đấu có truyền hình", 1000, 0.6, `${T} Bảng 12`),
  r("TCVN13608-B13-luyentap", "Quần vợt", "Quần vợt · luyện tập", 300, 0.4, `${T} Bảng 13`),
  r("TCVN13608-B13-thidau", "Quần vợt", "Quần vợt · thi đấu thông thường", 750, 0.5, `${T} Bảng 13`),
  r("TCVN13608-B13-chinhthuc", "Quần vợt", "Quần vợt · thi đấu chính thức, có truyền hình", 1000, 0.6, `${T} Bảng 13`),
  r("TCVN13608-B14-luyentap", "Bóng chuyền / bóng rổ / cầu lông", "Bóng chuyền, bóng rổ, cầu lông · luyện tập", 300, 0.4, `${T} Bảng 14`),
  r("TCVN13608-B14-thidau", "Bóng chuyền / bóng rổ / cầu lông", "Bóng chuyền, bóng rổ, cầu lông · thi đấu thông thường", 500, 0.5, `${T} Bảng 14`),
  r("TCVN13608-B14-chinhthuc", "Bóng chuyền / bóng rổ / cầu lông", "Bóng chuyền, bóng rổ, cầu lông · thi đấu chính thức", 750, 0.6, `${T} Bảng 14`),
  r("TCVN13608-B15-luyentap", "Bể bơi ngoài trời", "Bể bơi ngoài trời · luyện tập (độ rọi đứng 300 lx chưa tính)", 300, 0.4, `${T} Bảng 15`),
  r("TCVN13608-B15-thidau", "Bể bơi ngoài trời", "Bể bơi ngoài trời · thi đấu thông thường (độ rọi đứng 300 lx chưa tính)", 500, 0.5, `${T} Bảng 15`),
  r("TCVN13608-B15-chinhthuc", "Bể bơi ngoài trời", "Bể bơi ngoài trời · thi đấu chính thức (độ rọi đứng 300 lx chưa tính)", 750, 0.5, `${T} Bảng 15`),
  // Công viên, vườn hoa — Bảng 7
  ...park,
  // Hè phố, đường đi bộ — Bảng 4 (Uo ≥ 0,25 theo 5.5.2)
  r("TCVN13608-B4-cao", "Đường đi bộ / hè phố", "Hè phố, đường đi bộ · trung tâm, thương mại, mật độ cao", 30, 0.25, `${T} Bảng 4, 5.5.2`),
  r("TCVN13608-B4-tb", "Đường đi bộ / hè phố", "Hè phố, đường đi bộ · mật độ trung bình", 20, 0.25, `${T} Bảng 4, 5.5.2`),
  r("TCVN13608-B4-thap", "Đường đi bộ / hè phố", "Hè phố, đường đi bộ · mật độ thấp", 10, 0.25, `${T} Bảng 4, 5.5.2`),
  // Bãi đỗ xe ngoài trời — Bảng 6 (Uo ≥ 0,2 theo 5.6.2.2)
  r("TCVN13608-B6-benxe", "Bãi đỗ xe", "Bến xe buýt, xe khách liên tỉnh", 50, 0.2, `${T} Bảng 6, 5.6.2.2`),
  r("TCVN13608-B6-trungtam", "Bãi đỗ xe", "Bãi đỗ xe khu vực trung tâm đô thị", 30, 0.2, `${T} Bảng 6, 5.6.2.2`),
  r("TCVN13608-B6-ngoaithanh", "Bãi đỗ xe", "Bãi đỗ xe ngoại thành, nông thôn", 15, 0.2, `${T} Bảng 6, 5.6.2.2`),
  // EN 12193:2018 — thể thao ngoài trời, cấp I (thi đấu cao), II (thi đấu trung bình), III (tập luyện, phong trào)
  r("EN12193-bongda-I", "EN 12193 · bóng đá", "Bóng đá · EN 12193 cấp I", 500, 0.7, "EN 12193:2018"),
  r("EN12193-bongda-II", "EN 12193 · bóng đá", "Bóng đá · EN 12193 cấp II", 200, 0.6, "EN 12193:2018"),
  r("EN12193-bongda-III", "EN 12193 · bóng đá", "Bóng đá · EN 12193 cấp III", 75, 0.5, "EN 12193:2018"),
  r("EN12193-tennis-I", "EN 12193 · quần vợt", "Quần vợt ngoài trời · EN 12193 cấp I", 500, 0.7, "EN 12193:2018"),
  r("EN12193-tennis-II", "EN 12193 · quần vợt", "Quần vợt ngoài trời · EN 12193 cấp II", 300, 0.7, "EN 12193:2018"),
  r("EN12193-tennis-III", "EN 12193 · quần vợt", "Quần vợt ngoài trời · EN 12193 cấp III", 200, 0.6, "EN 12193:2018"),
  r("EN12193-danang-I", "EN 12193 · sân đa năng", "Sân đa năng · EN 12193 cấp I", 500, 0.7, "EN 12193:2018"),
  r("EN12193-danang-II", "EN 12193 · sân đa năng", "Sân đa năng · EN 12193 cấp II", 200, 0.6, "EN 12193:2018"),
  r("EN12193-danang-III", "EN 12193 · sân đa năng", "Sân đa năng · EN 12193 cấp III", 75, 0.5, "EN 12193:2018"),
];

const BY_ID = new Map(AREA_REQS.map((x) => [x.id.toUpperCase(), x]));
/** Tìm yêu cầu theo mã (không phân biệt hoa/thường); null nếu không có. */
export function findReq(id) {
  return id ? BY_ID.get(String(id).trim().toUpperCase()) || null : null;
}
