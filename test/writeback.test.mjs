import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

// Khoá lỗi C1: ghi kết quả phải dùng __rowNum__ thật, không dùng chỉ số mảng,
// vì sheet_to_json bỏ qua dòng trống -> chỉ số mảng lệch khỏi hàng sheet.
test("ghi ngược: __rowNum__ khớp hàng thật khi có dòng trống", () => {
  const aoa = [
    ["STT", "Kết quả"],   // hàng 0 (tiêu đề)
    ["A", null],          // hàng 1
    [null, null],         // hàng 2 (TRỐNG)
    ["C", null],          // hàng 3
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  assert.equal(rows.length, 2);            // dòng trống bị bỏ
  assert.equal(rows[0].__rowNum__, 1);     // "A"
  assert.equal(rows[1].__rowNum__, 3);     // "C" (KHÔNG phải 2)

  // ghi "x" cho dòng thứ 2 (C) theo __rowNum__ -> phải vào hàng 3, không phải 2
  const rn = rows[1].__rowNum__;
  ws[XLSX.utils.encode_cell({ r: rn, c: 1 })] = { t: "s", v: "x" };
  assert.equal(ws[XLSX.utils.encode_cell({ r: 3, c: 1 })].v, "x");
  assert.equal(ws[XLSX.utils.encode_cell({ r: 2, c: 1 })], undefined); // hàng trống không bị ghi đè
});
