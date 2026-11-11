// v3.4 — Chuyển Excel thô (bảng tổng hợp nhiều dòng đèn/tuyến, tiêu đề ở dòng bất kỳ) → file dữ liệu theo mẫu DU LIEU TUYEN.
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { normHead, mapHeaders, convertRawSheets } from "../src/rawImport.mjs";
import { buildTemplateWorkbook, TEMPLATE_HEAD } from "../src/template.mjs";
import { COLS, rowToGeometry } from "../src/mapping.mjs";

// tiêu đề đúng như file tổng hợp đề xuất đèn LED (dòng 3), có xuống dòng, khoảng trắng thừa, chú thích trong ngoặc
const RAW_HEAD = ["Stt", "Tuyến Đường", "Phường/ Xã (mới)", "Quận/ Huyện (cũ)", "Tủ điều khiển", "Số lượng đèn Sở duyệt (bộ)", "Số lượng đèn trình Sở (bộ)",
  "Thời điểm thực hiện", "Gói thầu ", "Hạng mục công Tác", "Chiều dài tuyến (m)", "Đầu tuyến", "Cuối tuyến", "Bộ đèn HPS/E-LED hiện hữu",
  "Độ cao bộ đèn\n(m)", "Độ vươn cần đèn\n(m)", "Đường kính đầu cần (D49/ D60…", "Góc nghiêng bộ đèn\n(độ)", "Độ rộng lòng đường\n(m)",
  "Khoảng cách trụ trung bình\n(làm tròn)* (m) ", "Khoảng cách từ trụ đến mép đường\n(m)", "Cách bố trí trụ ", "Dải phân cách giữa (có hoặc không)",
  "Số làn xe", "Lưu lượng xe (nhiều hay ít)", "Fitting", "Loại đèn", "Tên nhà cung cấp", "Công suất đèn LED được chọn (W)", "Cấp đường",
  "Ltb (cd/m2)", "Uo", "Ul", "Ti", "SR", "Ltb (cd/m2)", "Uo", "Ul", "Ti", "SR", "En", "Kết Quả", "Điểm Ltb (cd/m2)", "Điểm Uo", "Điểm Ul", "Điểm Ti", "Điểm SR",
  "Tổng Điểm lần 1", "Tổng Điểm lần 2", "Xếp hạng", "Loại đèn được chọn", "Fitting", "Công suất", "Loại đèn", "Nhà Cung cấp"];
const H = (name) => RAW_HEAD.indexOf(name);
function rawRow(o) { const r = new Array(RAW_HEAD.length).fill(null); for (const [k, v] of Object.entries(o)) r[typeof k === "number" ? k : (/^\d+$/.test(k) ? +k : H(k))] = v; return r; }
const geo = { "Tuyến Đường": "Cầu Chữ Y (Q8)", "Phường/ Xã (mới)": "Chánh Hưng", "Quận/ Huyện (cũ)": 8, "Đầu tuyến": "Tạ Quang Bửu", "Cuối tuyến": "Võ Liêm Sơn",
  "Độ cao bộ đèn\n(m)": 11.5, "Độ vươn cần đèn\n(m)": 1.5, "Độ rộng lòng đường\n(m)": 14, "Khoảng cách trụ trung bình\n(làm tròn)* (m) ": 35,
  "Khoảng cách từ trụ đến mép đường\n(m)": 0.5, "Cách bố trí trụ ": "2 bên đối xứng", "Dải phân cách giữa (có hoặc không)": "không", "Số làn xe": 4, "Cấp đường": "B1" };
const lamp = (fit, model, ncc, W, tilt, extra = {}) => ({ ...geo, "Fitting": fit, "Loại đèn": model, "Tên nhà cung cấp": ncc, "Công suất đèn LED được chọn (W)": W,
  "Góc nghiêng bộ đèn\n(độ)": tilt, "Ltb (cd/m2)": 1.5, "Uo": 0.4, "Kết Quả": "TRUE", ...extra });

function sheetAoa() {
  const group = new Array(RAW_HEAD.length).fill(null); group[1] = "THÔNG TIN TUYẾN ĐƯỜNG"; group[30] = "QCVN 07-7:2023";
  return [
    ["TỔNG HỢP KẾT QUẢ CHẠY DIALUX VÀ ĐỀ XUẤT ĐÈN LED"], group, RAW_HEAD,
    RAW_HEAD.map((_, i) => i + 1),                                   // dòng đánh số cột
    rawRow({ "Số lượng đèn Sở duyệt (bộ)": 1235 }),                 // dòng tổng
    // như file thật: "Loại đèn được chọn" ghi ở dòng STT của tuyến = ô "Xếp hạng" của dòng đèn được chọn
    rawRow({ ...lamp("1 x CARINA 80W", "Carina_Midi", "Thiên Minh", 80, 15), Stt: 1, "Số lượng đèn Sở duyệt (bộ)": 8, "Số lượng đèn trình Sở (bộ)": 8, "Gói thầu ": "Gói 2",
      "Xếp hạng": "3- Carina_Midi", "Loại đèn được chọn": "1- Tembin-D" }),
    rawRow({ ...lamp("1 x SL7B-80W (TEMBIN-D)", "Tembin-D", "Slighting", 80, 5), "Xếp hạng": "1- Tembin-D" }),
    rawRow({ ...lamp("1 x TEMBIN-H 80W", "Tembin-H", "Slighting", 80, 0), "Xếp hạng": "2- Tembin-H" }),
    rawRow({ ...lamp("1 x MAGNOLIA 60W", "MAGNOLIA", "BELED", 60, 10, { "Tuyến Đường": "Tạ Quang Bửu (Đ1)", "Khoảng cách trụ trung bình\n(làm tròn)* (m) ": 32, "Dải phân cách giữa (có hoặc không)": "có" }), Stt: 2 }),
    rawRow({ ...lamp("1 x MAGNOLIA 80W", "MAGNOLIA", "BELED", 80, 10, { "Tuyến Đường": "Tạ Quang Bửu (Đ1)", "Khoảng cách trụ trung bình\n(làm tròn)* (m) ": 33, "Dải phân cách giữa (có hoặc không)": "có" }) }),
    rawRow({}),                                                     // dòng trống cuối
  ];
}

test("chuẩn hoá tiêu đề: xuống dòng, khoảng trắng, chú thích trong ngoặc, dấu cách quanh '/'", () => {
  assert.equal(normHead("Độ cao bộ đèn\n(m)"), normHead("Độ cao bộ đèn (m)"));
  assert.equal(normHead("Phường/ Xã (mới)"), normHead("Phường/Xã (mới)"));
  assert.equal(normHead("Gói thầu "), normHead("Gói thầu"));
  assert.equal(normHead("Hạng mục công Tác"), normHead("Hạng mục công tác"));
});

test("ánh xạ cột: khớp đủ cột thông số đầu vào, bỏ qua cột kết quả & chấm điểm", () => {
  const m = mapHeaders(RAW_HEAD);
  const want = ["STT", COLS.tuyen, "Phường/Xã (mới)", "Quận/Huyện (cũ)", "Tủ điều khiển", "SL đèn Sở duyệt (bộ)", "SL đèn trình Sở (bộ)", "Thời điểm thực hiện",
    "Gói thầu", "Hạng mục công tác", "Chiều dài tuyến (m)", "Đầu tuyến", "Cuối tuyến", "Bộ đèn HPS/E-LED hiện hữu", COLS.H, COLS.vuon, "Đường kính đầu cần",
    COLS.tilt, COLS.width, COLS.spacing, COLS.setback, COLS.arrangement, COLS.dpc, COLS.lanes, COLS.luuluong, COLS.roadClass];
  for (const w of want) assert.ok(Object.values(m.map).includes(w), "thiếu " + w);
  // cột kết quả / chấm điểm không được ánh xạ vào mẫu
  for (const h of ["Ltb (cd/m2)", "Uo", "Kết Quả", "Tổng Điểm lần 1", "Xếp hạng"]) assert.ok(m.ignored.some((x) => x.head === h), "phải bỏ qua " + h);
  assert.equal(m.map[H("Khoảng cách trụ trung bình\n(làm tròn)* (m) ")], COLS.spacing);
});

test("chuyển: mỗi tuyến 1 dòng, bỏ trống bộ đèn, góc nghiêng theo dòng đèn được chọn, không chép kết quả", () => {
  const out = convertRawSheets([{ name: "TONG HOP DE XUAT", aoa: sheetAoa() }]);
  assert.equal(out.info.sheet, "TONG HOP DE XUAT");
  assert.equal(out.info.headerRow, 3);
  assert.equal(out.info.rawRows, 5);
  assert.equal(out.rows.length, 2);
  const [a, b] = out.rows;
  assert.equal(a[COLS.tuyen], "Cầu Chữ Y (Q8)");
  assert.equal(a[COLS.tilt], 5, "góc nghiêng của dòng 'Loại đèn được chọn'");
  assert.equal(a["SL đèn trình Sở (bộ)"], 8);
  assert.equal(a["Gói thầu"], "Gói 2");
  for (const k of [COLS.model, COLS.fitting, COLS.ncc, COLS.power]) assert.equal(a[k] ?? null, null, "bỏ trống " + k);
  assert.equal(a[COLS.arrangement], "đối xứng", "chuẩn hoá về danh sách chọn của mẫu");
  for (const k of Object.keys(a)) assert.ok(TEMPLATE_HEAD.includes(k), "chỉ cột của mẫu: " + k);
  // tuyến 2 không có dòng chọn → lấy dòng đầu; khoảng cách trụ khác nhau giữa các dòng → cảnh báo
  assert.equal(b[COLS.spacing], 32);
  assert.ok(out.warnings.some((w) => /Tạ Quang Bửu \(Đ1\)/.test(w) && /Khoảng cách trụ/.test(w)));
  // đọc lại bằng chính bộ ánh xạ của app → đủ hình học để chạy
  const g = rowToGeometry(a);
  assert.equal(g.input.H, 11.5); assert.equal(g.input.width, 14); assert.equal(g.input.spacing, 35); assert.equal(g.input.lanes, 4);
  assert.equal(g.input.roadClass, "B1");
  assert.ok(!g.warnings.some((w) => /thiếu/.test(w)));
});

test("không tìm thấy bảng dữ liệu → báo lỗi rõ ràng", () => {
  assert.throws(() => convertRawSheets([{ name: "Sheet1", aoa: [["a", "b"], [1, 2]] }]), /Không tìm thấy/);
});

test("file mẫu có dữ liệu: dòng tiêu đề giữ nguyên, không còn 3 dòng mẫu, đúng số dòng", async () => {
  const out = convertRawSheets([{ name: "X", aoa: sheetAoa() }]);
  const wb = await buildTemplateWorkbook(ExcelJS, { rows: out.rows });
  const ws = wb.getWorksheet("DU LIEU TUYEN");
  assert.deepEqual(ws.getRow(1).values.slice(1), TEMPLATE_HEAD);
  const names = []; for (let r = 2; r <= ws.rowCount; r++) { const v = ws.getRow(r).getCell(TEMPLATE_HEAD.indexOf(COLS.tuyen) + 1).value; if (v) names.push(v); }
  assert.deepEqual(names, ["Cầu Chữ Y (Q8)", "Tạ Quang Bửu (Đ1)"]);
  assert.ok(!names.some((n) => /mẫu/i.test(n)));
});

test("thiếu thông số bắt buộc trong file thô (ô trống / #N/A) → cảnh báo, đếm tuyến chưa đủ, tô vàng ô trong file xuất", async () => {
  const aoa = sheetAoa();
  aoa.push(rawRow({ ...geo, Stt: 3, "Tuyến Đường": "Hoàng Sa", "Độ cao bộ đèn\n(m)": null, "Độ rộng lòng đường\n(m)": "#N/A" }));
  const out = convertRawSheets([{ name: "X", aoa }]);
  assert.equal(out.info.incomplete, 1);
  assert.ok(out.warnings.some((w) => /Hoàng Sa/.test(w) && /Độ cao bộ đèn/.test(w) && /Độ rộng lòng đường/.test(w)));
  const wb = await buildTemplateWorkbook(ExcelJS, { rows: out.rows });
  const ws = wb.getWorksheet("DU LIEU TUYEN");
  const c = ws.getRow(4).getCell(TEMPLATE_HEAD.indexOf(COLS.H) + 1);
  assert.equal(c.value, null); assert.equal(c.fill.fgColor.argb, "FFFFE08A");
});

test("file thô có ô gộp, hàng nhóm/tổng, số ghi dạng chữ, bố trí lạ, chọn đèn theo Fitting", () => {
  const aoa = sheetAoa().slice(0, 5);
  aoa.push(rawRow({ Stt: "I", "Tuyến Đường": "QUẬN 1" }));                                  // hàng nhóm → bỏ
  aoa.push(rawRow({ ...lamp("1 x A 60W", "A", "X", 60, 15), Stt: 1, "Loại đèn được chọn": "9- không khớp", 51: "1 x B 80W" }));
  aoa.push(rawRow({ ...lamp("1 x B 80W", "B", "X", 80, 0), "Tuyến Đường": null }));          // tên gộp ô → vẫn thuộc tuyến
  aoa.push(rawRow({ ...lamp("1 x C 60W", "C", "X", 60, 5, { "Tuyến Đường": "Đường lạ", "Cách bố trí trụ ": "2 phía", "Độ rộng lòng đường\n(m)": "9,5" }), Stt: 2 }));
  aoa.push(rawRow({ "Tuyến Đường": "Tổng cộng" }));
  const out = convertRawSheets([{ name: "X", aoa }]);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0][COLS.tilt], 0, "khớp đèn chọn qua cột Fitting thứ hai");
  assert.equal(out.rows[1][COLS.width], 9.5);
  assert.equal(out.rows[1][COLS.arrangement], "2 phía");
  assert.ok(out.warnings.some((w) => /2 phía/.test(w)));
});

test("tuyến ghi chú \"bỏ ra\" ở cột ghi chú (không tiêu đề) → loại khỏi file dữ liệu, liệt kê lại", () => {
  const aoa = sheetAoa().map((r) => r.concat([null, null]));
  aoa[5][RAW_HEAD.length + 1] = "bỏ ra ";                                    // dòng STT 1 (Cầu Chữ Y) ghi chú bỏ ra
  const out = convertRawSheets([{ name: "X", aoa }]);
  assert.deepEqual(out.rows.map((r) => r[COLS.tuyen]), ["Tạ Quang Bửu (Đ1)"]);
  assert.equal(out.info.routes, 1);
  assert.ok(out.info.dropped[0].startsWith("Cầu Chữ Y (Q8)"));
});
