// File Excel MẪU nhập dữ liệu tuyến (ExcelJS, định dạng chuyên nghiệp).
// Sheet 1 "DU LIEU TUYEN"        : app đọc sheet này — header PHẢI ở dòng 1 (sheet_to_json).
// Sheet 2 "CAP DUONG QCVN07-7-23" : bảng cấp đường lấy từ QCVN của engine (một nguồn) + quy đổi Loại tuyến → cấp.
// Sheet 3 "HUONG DAN"             : cách điền ngắn gọn.

import { VERSION } from "./version.mjs";
import { QCVN } from "./engine.mjs";
import { COLS, classifyFromType } from "./mapping.mjs";

// Nhóm cột (màu header) — thứ tự = thứ tự cột trong file
const GROUPS = [
  { key: "id", label: "THÔNG TIN TUYẾN", argb: "FF44546A", cols: [
    ["STT", "Số thứ tự tuyến.", 6],
    [COLS.tuyen, "Tên tuyến đường (bắt buộc).", 30],
    ["Phường/Xã (mới)", "", 16], ["Quận/Huyện (cũ)", "", 14], ["Tủ điều khiển", "", 12],
    ["Đầu tuyến", "", 16], ["Cuối tuyến", "", 16],
    ["Chiều dài tuyến (m)", "Dùng ước tính số bộ đèn khi không ghi SL đèn trình Sở.", 11],
    ["SL đèn Sở duyệt (bộ)", "", 10], ["SL đèn trình Sở (bộ)", "Số bộ đèn — dùng cho sheet Tổng hợp đèn của file kết quả.", 10],
    ["Bộ đèn HPS/E-LED hiện hữu", "", 18], ["Gói thầu", "", 12], ["Hạng mục công tác", "", 16], ["Thời điểm thực hiện", "", 12],
  ] },
  { key: "class", label: "PHÂN CẤP ĐƯỜNG", argb: "FF0E7C7B", cols: [
    [COLS.loaituyen, "Chọn theo tên loại đường QCVN 07 (danh sách) — app quy đổi sang cấp. Xem sheet CAP DUONG QCVN07-7-23.", 24],
    [COLS.roadClass, "A/B1/B2/C1/C2/D1/D2/E. Ghi ô này thì app dùng thẳng, bỏ qua Loại tuyến. Để trống cả hai → app tự đoán theo hình học.", 9],
    [COLS.luuluong, "nhiều / ít (tham khảo).", 10],
  ] },
  { key: "geo", label: "HÌNH HỌC — BẮT BUỘC", argb: "FF1F4E79", cols: [
    [COLS.H, "Chiều cao treo đèn H (m). Bắt buộc.", 10],
    [COLS.vuon, "Chiều dài cần đèn (m).", 10],
    [COLS.tilt, "Góc nghiêng bộ đèn so với phương ngang (độ).", 10],
    [COLS.width, "Bề rộng lòng đường W (m) = tổng các làn xe, không gồm dải phân cách. Bắt buộc.", 11],
    [COLS.lanes, "Tổng số làn xe (cả hai chiều).", 7],
    [COLS.spacing, "Khoảng cách trụ trung bình S (m). Bắt buộc.", 11],
    [COLS.setback, "Từ tim trụ đến mép lòng đường (m) — trụ đứng trên vỉa hè. Điểm sáng vươn vào = vươn − khoảng cách này.", 12],
    [COLS.sidewalk, "Bề rộng vỉa hè mỗi bên (m). Giới hạn dải tính SR = min(5 m, W/2, vỉa hè); vẽ vỉa hè trong phối cảnh 3D. Để trống: SR theo min(5 m, W/2).", 10],
    [COLS.arrangement, "1 bên / đối xứng / so le.", 12],
    [COLS.dpc, "có / không — dùng phân cấp (B1/C1 khi có) và vẽ dải phân cách trong 3D.", 10],
    [COLS.medianW, "Bề rộng dải phân cách giữa (m) — để vẽ phối cảnh 3D và mặt bằng. Trống mà có dải → vẽ 2 m.", 11],
    ["Đường kính đầu cần", "Thông tin.", 10],
  ] },
  { key: "lum", label: "BỘ ĐÈN — TUỲ CHỌN", argb: "FFB7791F", cols: [
    [COLS.fitting, "Tên đầy đủ bộ đèn. Để trống cả nhóm này → app tự chọn bộ đèn công suất nhỏ nhất vẫn Đạt.", 20],
    [COLS.model, "Model (vd MAGNOLIA, CARINA) — app chỉ xét các file IES cùng model.", 12],
    [COLS.ncc, "", 14],
    [COLS.power, "Công suất (W) muốn dùng.", 10],
    ["CCT (K)", "Nhiệt độ màu — in báo cáo, tô màu ánh sáng phối cảnh 3D (trống = 4000 K).", 9],
    ["CRI", "Chỉ số hoàn màu — in báo cáo.", 7],
  ] },
];
export const TEMPLATE_HEAD = GROUPS.flatMap((g) => g.cols.map((c) => c[0]));

const NUM1 = new Set([COLS.H, COLS.vuon, COLS.width, COLS.spacing, COLS.setback, COLS.sidewalk, COLS.medianW, "Chiều dài tuyến (m)"]);
const NUM0 = new Set([COLS.tilt, COLS.lanes, COLS.power, "CCT (K)", "CRI", "SL đèn Sở duyệt (bộ)", "SL đèn trình Sở (bộ)", "STT"]);

const CLASS_DESC = {
  A: "Đường cao tốc đô thị",
  B1: "Trục chính/liên khu vực — có dải phân cách",
  B2: "Trục chính/liên khu vực — không dải phân cách",
  C1: "Khu vực có buôn bán — có dải phân cách",
  C2: "Khu vực có buôn bán — không dải phân cách",
  D1: "Cấp khu vực — hè sáng",
  D2: "Cấp khu vực — hè tối",
  E: "Cấp nội bộ",
};
// Tên loại tuyến (QCVN 07) cho danh sách chọn — cấp quy đổi tính bằng classifyFromType (một nguồn với app)
export const LOAI_TUYEN = [
  "Đường cao tốc đô thị", "Đường trục chính đô thị", "Đường chính đô thị", "Đường liên khu vực",
  "Đường chính khu vực", "Đường có buôn bán, thương mại", "Đường khu vực", "Đường phân khu vực",
  "Đường khu vực hè tối", "Đường nhóm nhà ở", "Đường nội bộ", "Ngõ, hẻm",
];

const SAMPLES = [
  { STT: 1, [COLS.tuyen]: "Đường mẫu A — 1 bên, chỉ hình học (xoá dòng này)", "Chiều dài tuyến (m)": 700,
    [COLS.loaituyen]: "Đường khu vực", [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.tilt]: 15, [COLS.width]: 7, [COLS.lanes]: 2,
    [COLS.spacing]: 35, [COLS.setback]: 0.5, [COLS.sidewalk]: 3, [COLS.arrangement]: "1 bên", [COLS.dpc]: "không" },
  { STT: 2, [COLS.tuyen]: "Đường mẫu B — đối xứng, có dải phân cách (xoá dòng này)", "Chiều dài tuyến (m)": 1200, "SL đèn trình Sở (bộ)": 70,
    [COLS.loaituyen]: "Đường trục chính đô thị", [COLS.H]: 10.5, [COLS.vuon]: 1.5, [COLS.tilt]: 5, [COLS.width]: 14, [COLS.lanes]: 4,
    [COLS.spacing]: 35, [COLS.setback]: 1, [COLS.sidewalk]: 4, [COLS.arrangement]: "đối xứng", [COLS.dpc]: "có", [COLS.medianW]: 3 },
  { STT: 3, [COLS.tuyen]: "Đường mẫu C — ghi cấp + chỉ định đèn (xoá dòng này)", "Chiều dài tuyến (m)": 640,
    [COLS.roadClass]: "C2", [COLS.H]: 9, [COLS.vuon]: 1.5, [COLS.tilt]: 10, [COLS.width]: 10.5, [COLS.lanes]: 3,
    [COLS.spacing]: 32, [COLS.setback]: 0.8, [COLS.sidewalk]: 3.5, [COLS.arrangement]: "so le", [COLS.dpc]: "không",
    [COLS.model]: "MAGNOLIA", [COLS.power]: 100, "CCT (K)": 4000, "CRI": 70 },
];

const thin = { style: "thin", color: { argb: "FFD0D7E2" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const MAXROW = 1000;

export async function buildTemplateWorkbook(ExcelJS, { version = VERSION } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = `WebDialux-CS ${version}`; wb.created = new Date();

  // ---------------- Sheet 1: DU LIEU TUYEN ----------------
  const ws = wb.addWorksheet("DU LIEU TUYEN", { views: [{ state: "frozen", xSplit: 2, ySplit: 1, zoomScale: 90 }], properties: { defaultRowHeight: 18 },
    pageSetup: { paperSize: 8, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" } });
  let c = 1; const colOf = {};
  for (const g of GROUPS) {
    for (const [name, note, width] of g.cols) {
      colOf[name] = c;
      const cell = ws.getCell(1, c);
      cell.value = name;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = fill(g.argb);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = BORDER;
      const optional = g.key === "geo" && (name === COLS.sidewalk || name === COLS.medianW || name === "Đường kính đầu cần" || name === COLS.vuon || name === COLS.tilt);
      cell.note = { texts: [{ font: { bold: true, size: 9 }, text: `${g.label}${optional ? " (tuỳ chọn)" : ""}\n` }, { font: { size: 9 }, text: note || "" }] };
      ws.getColumn(c).width = width;
      c++;
    }
  }
  ws.getRow(1).height = 54;
  const last = c - 1;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: last } };

  SAMPLES.forEach((s, i) => {
    const row = ws.getRow(i + 2);
    for (const name of TEMPLATE_HEAD) row.getCell(colOf[name]).value = s[name] ?? null;
  });
  // định dạng vùng nhập (dòng 2..MAXROW cho số/căn lề; viền + nền chỉ cho dòng mẫu để file nhẹ)
  for (const name of TEMPLATE_HEAD) {
    const col = ws.getColumn(colOf[name]);
    if (NUM1.has(name)) col.numFmt = "0.0#";
    else if (NUM0.has(name)) col.numFmt = "0";
    col.alignment = { vertical: "middle", horizontal: (NUM1.has(name) || NUM0.has(name) || name === COLS.roadClass) ? "center" : "left" };
  }
  // căn lề cột ở trên áp cả vào dòng 1 → đặt lại kiểu tiêu đề (xuống dòng, căn giữa)
  ws.getRow(1).eachCell((cell) => { cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.numFmt = "@"; });
  for (let r = 2; r <= SAMPLES.length + 1; r++) {
    const row = ws.getRow(r);
    for (let k = 1; k <= last; k++) {
      const cell = row.getCell(k); cell.border = BORDER;
      cell.font = { size: 10, italic: true, color: { argb: "FF5B6676" } };
      cell.fill = fill("FFFFF8E7");          // tô vàng nhạt = dòng mẫu, xoá trước khi dùng
    }
  }
  // danh sách chọn + kiểm số
  const rng = (name) => { const L = ws.getColumn(colOf[name]).letter; return `${L}2:${L}${MAXROW}`; };
  const list = (name, items, title) => ws.dataValidations.add(rng(name), {
    type: "list", allowBlank: true, formulae: [Array.isArray(items) ? `"${items.join(",")}"` : items],
    showErrorMessage: true, errorStyle: "warning", errorTitle: title, error: "Chọn giá trị trong danh sách.",
  });
  list(COLS.roadClass, Object.keys(QCVN), "Cấp đường");
  list(COLS.arrangement, ["1 bên", "đối xứng", "so le"], "Cách bố trí trụ");
  list(COLS.dpc, ["có", "không"], "Dải phân cách giữa");
  list(COLS.luuluong, ["nhiều", "ít"], "Lưu lượng xe");
  for (const name of [COLS.H, COLS.vuon, COLS.width, COLS.spacing, COLS.setback, COLS.sidewalk, COLS.medianW, COLS.tilt, COLS.lanes]) {
    ws.dataValidations.add(rng(name), {
      type: "decimal", operator: "between", allowBlank: true, formulae: [0, name === COLS.tilt ? 45 : 200],
      showErrorMessage: true, errorStyle: "stop", errorTitle: name, error: "Nhập số ≥ 0 (đơn vị m; góc nghiêng 0–45°).",
    });
  }

  // ---------------- Sheet 2: CAP DUONG QCVN07-7-23 ----------------
  const wq = wb.addWorksheet("CAP DUONG QCVN07-7-23", { views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true } });
  [9, 46, 13, 9, 10, 11, 9].forEach((w, i) => { wq.getColumn(i + 1).width = w; });
  wq.mergeCells("A1:G1");
  wq.getCell("A1").value = "BẢNG PHÂN CẤP ĐƯỜNG CHIẾU SÁNG — QCVN 07-7:2023/BXD";
  wq.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F4E79" } };
  wq.mergeCells("A2:G2");
  wq.getCell("A2").value = "Yêu cầu độ chói mặt đường (phương pháp CIE 140). App dùng đúng các ngưỡng này để đánh giá Đạt/Không đạt.";
  wq.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF5B6676" } };
  const head = (r, vals, argb = "FF1F4E79") => {
    const row = wq.getRow(r);
    vals.forEach((v, i) => { const cl = row.getCell(i + 1); cl.value = v; cl.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; cl.fill = fill(argb); cl.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cl.border = BORDER; });
    row.height = 32;
  };
  head(4, ["Ký hiệu", "Mô tả", "Ltb (cd/m²)", "Uo", "Ud (Ul)", "TI max (%)", "SR"]);
  Object.entries(QCVN).forEach(([k, q], i) => {
    const row = wq.getRow(5 + i);
    [k, CLASS_DESC[k], q.Ltb, q.Uo, q.Ul, q.TI, q.SR].forEach((v, j) => {
      const cl = row.getCell(j + 1); cl.value = v; cl.border = BORDER;
      cl.alignment = { horizontal: j === 1 ? "left" : "center", vertical: "middle" };
      cl.font = { size: 10, bold: j === 0 };
      if (i % 2 === 1) cl.fill = fill("FFF7F9FC");
    });
    row.getCell(3).numFmt = "0.0"; [4, 5, 7].forEach((j) => { row.getCell(j).numFmt = "0.0"; }); row.getCell(6).numFmt = "0";
    row.height = 20;
  });
  wq.getRow(13).getCell(1).value = "Điều kiện Đạt: Ltb ≥, Uo ≥, Ud ≥, SR ≥ ngưỡng và TI ≤ ngưỡng (so trên giá trị làm tròn: 2 số lẻ, TI số nguyên).";
  wq.getRow(13).getCell(1).font = { italic: true, size: 9, color: { argb: "FF5B6676" } };

  const r0 = 15;
  wq.mergeCells(`A${r0}:G${r0}`);
  wq.getCell(`A${r0}`).value = "QUY ĐỔI \"LOẠI TUYẾN\" (TÊN THEO QCVN 07) → CẤP ĐƯỜNG";
  wq.getCell(`A${r0}`).font = { bold: true, size: 12, color: { argb: "FF0E7C7B" } };
  head(r0 + 1, ["STT", "Loại tuyến (ghi đúng tên)", "Cấp quy đổi", "Ghi chú", "", "", ""], "FF0E7C7B");
  wq.mergeCells(`D${r0 + 1}:G${r0 + 1}`);  // gộp SAU khi ghi (ghi ô phụ sẽ đè ô chính)
  LOAI_TUYEN.forEach((name, i) => {
    const r = r0 + 2 + i, c1 = classifyFromType(name, { median: true }), c2 = classifyFromType(name, { median: false });
    const row = wq.getRow(r);
    for (let j = 1; j <= 7; j++) { const cl = row.getCell(j); cl.border = BORDER; cl.font = { size: 10, bold: j === 3 }; cl.alignment = { horizontal: (j === 1 || j === 3) ? "center" : "left", vertical: "middle" }; if (i % 2 === 1) cl.fill = fill("FFF2F8F7"); }
    row.getCell(1).value = i + 1;
    row.getCell(2).value = name;
    row.getCell(3).value = c1 === c2 ? c1 : `${c1} / ${c2}`;
    row.getCell(4).value = c1 === c2 ? "" : `${c1} khi có dải phân cách giữa, ${c2} khi không`;
    wq.mergeCells(`D${r}:G${r}`);
  });
  const rEnd = r0 + 1 + LOAI_TUYEN.length;
  wq.getRow(rEnd + 1).getCell(1).value = "Không khớp tên nào và không ghi Cấp đường → app tự đoán theo bề rộng/số làn/dải phân cách (đánh dấu • để rà lại).";
  wq.getRow(rEnd + 1).getCell(1).font = { italic: true, size: 9, color: { argb: "FF5B6676" } };
  list(COLS.loaituyen, `'CAP DUONG QCVN07-7-23'!$B$${r0 + 2}:$B$${rEnd}`, "Loại tuyến");

  // ---------------- Sheet 3: HUONG DAN ----------------
  const wh = wb.addWorksheet("HUONG DAN", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  wh.getColumn(1).width = 4; wh.getColumn(2).width = 110;
  wh.getCell("B1").value = "HƯỚNG DẪN ĐIỀN DỮ LIỆU — WebDialux-CS"; wh.getCell("B1").font = { bold: true, size: 14, color: { argb: "FF1F4E79" } };
  const lines = [
    "Mỗi dòng ở sheet DU LIEU TUYEN là một tuyến. Giữ nguyên dòng tiêu đề (dòng 1) và tên sheet; xoá 3 dòng mẫu tô vàng trước khi dùng.",
    "Màu tiêu đề: xám = thông tin tuyến · xanh ngọc = phân cấp đường · xanh đậm = hình học · vàng nâu = bộ đèn (tuỳ chọn). Rê chuột vào tiêu đề để xem giải thích.",
    "Bắt buộc: Độ cao bộ đèn, Độ rộng lòng đường, Khoảng cách trụ TB. Nên có: vươn cần, góc nghiêng, khoảng cách trụ đến mép, cách bố trí, số làn.",
    "Cấp đường: ghi ô Cấp đường (A…E) HOẶC chọn Loại tuyến theo tên QCVN 07; để trống cả hai thì app tự đoán theo hình học.",
    "Độ rộng lòng đường = tổng các làn xe (không gồm dải phân cách). Dải phân cách giữa ghi 'có' + bề rộng để phối cảnh 3D vẽ đúng.",
    "Độ rộng vỉa hè giới hạn dải tính SR (≤ 5 m) và được vẽ trong phối cảnh 3D; trụ đứng trên vỉa hè cách mép theo cột Khoảng cách trụ đến mép.",
    "Bộ đèn: để trống thì app quét toàn bộ thư mục IES, chấm điểm và chọn bộ công suất nhỏ nhất vẫn Đạt.",
    "Bảng ngưỡng QCVN 07-7:2023 và bảng quy đổi Loại tuyến xem ở sheet CAP DUONG QCVN07-7-23.",
    "Mọi tính toán chạy trên máy anh — file không được gửi lên mạng. Kết quả tải về là file mới, file này không bị sửa.",
  ];
  lines.forEach((t, i) => { const cl = wh.getCell(`B${i + 3}`); cl.value = `${i + 1}. ${t}`; cl.alignment = { wrapText: true, vertical: "top" }; cl.font = { size: 11 }; wh.getRow(i + 3).height = 30; });
  wh.getCell(`B${lines.length + 4}`).value = `Mẫu tạo bởi WebDialux-CS ${version}.`;
  wh.getCell(`B${lines.length + 4}`).font = { italic: true, size: 9, color: { argb: "FF7B8695" } };
  return wb;
}
