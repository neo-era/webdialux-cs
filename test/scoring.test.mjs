import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreOptions } from "../src/scoring.mjs";

const opt = (power, Ltb, Uo, Ul, TI, SR, pass = true) => ({ power, Ltb, Uo, Ul, TI, SR, pass });

test("scoreOptions: chỉ chấm phương án ĐẠT", () => {
  const r = scoreOptions([opt(60, 1.0, 0.5, 0.6, 8, 0.6), opt(80, 1.5, 0.6, 0.7, 7, 0.7, false)]);
  assert.equal(r[0].tong1 > 0, true);
  assert.equal(r[1].tong1, null);
  assert.equal(r[1].rank, null);
  assert.equal(r[1].chosen, false);
});

test("scoreOptions: Borda điểm từng tiêu chí", () => {
  // 2 phương án đạt: A nhỉnh hơn mọi tiêu chí cao-hơn-tốt, TI thấp hơn
  const A = opt(80, 1.6, 0.6, 0.7, 6, 0.7);
  const B = opt(60, 1.2, 0.5, 0.6, 9, 0.6);
  const r = scoreOptions([A, B]);
  const a = r[0], b = r[1];
  // A lớn nhất Ltb -> d_Ltb=2; B nhỏ nhất -> d_Ltb=1
  assert.equal(a.d_Ltb, 2); assert.equal(b.d_Ltb, 1);
  // TI: A=6 (tốt) -> số option TI>=6 = 2; B=9 -> số TI>=9 =1
  assert.equal(a.d_TI, 2); assert.equal(b.d_TI, 1);
  assert.equal(a.tong1, 10); assert.equal(b.tong1, 5);
});

test("scoreOptions: chọn CÔNG SUẤT NHỎ NHẤT khi cùng điểm xét", () => {
  // Hai phương án điểm bằng nhau -> công suất nhỏ hơn hạng 1
  const r = scoreOptions([opt(100, 1.5, 0.5, 0.6, 8, 0.6), opt(60, 1.5, 0.5, 0.6, 8, 0.6)]);
  const chosen = r.find((o) => o.chosen);
  assert.equal(chosen.power, 60);
  assert.equal(r.find((o) => o.power === 100).rank, 2);
});

test("scoreOptions: đèn mạnh hơn (điểm cao hơn) KHÔNG thắng nếu công suất lớn hơn", () => {
  // A: 100W rất tốt; B: 60W kém hơn nhưng vẫn đạt -> B hạng 1 (ưu tiên CS nhỏ)
  const A = opt(100, 2.0, 0.7, 0.8, 5, 0.8);
  const B = opt(60, 1.1, 0.45, 0.55, 12, 0.55);
  const r = scoreOptions([A, B]);
  assert.equal(r.find((o) => o.power === 60).chosen, true);
  assert.equal(r.find((o) => o.power === 100).rank, 2);
});

test("scoreOptions: cùng công suất -> điểm xét cao hơn thắng", () => {
  const A = opt(60, 1.8, 0.6, 0.7, 6, 0.7); // tốt hơn
  const B = opt(60, 1.1, 0.45, 0.55, 12, 0.55);
  const r = scoreOptions([A, B]);
  const chosen = r.find((o) => o.chosen);
  assert.equal(chosen.Ltb, 1.8);
});

test("scoreOptions: không phương án nào đạt -> không ai có rank", () => {
  const r = scoreOptions([opt(60, 0.5, 0.2, 0.3, 25, 0.3, false)]);
  assert.equal(r[0].rank, null);
  assert.equal(r.some((o) => o.chosen), false);
});

test("scoreOptions: đồng hạng tong1 -> tính tong2, chọn theo điểm xét rồi Ltb", () => {
  // A thắng Ltb,Uo; B thắng TI,SR; Ul bằng nhau -> tong1 bằng nhau (8-8)
  const A = opt(60, 1.8, 0.7, 0.7, 10, 0.55);
  const B = opt(60, 1.5, 0.6, 0.7, 6, 0.75);
  const r = scoreOptions([A, B]);
  const a = r.find((o) => o.Ltb === 1.8), b = r.find((o) => o.Ltb === 1.5);
  assert.equal(a.tong1, b.tong1);            // đồng hạng tong1
  assert.equal(typeof a.tong2, "number");    // tong2 được tính (không null)
  // không ai thắng >=3/5 -> tong2 = 0 cả hai; cùng CS & điểm xét -> Ltb cao hơn (A) hạng 1
  assert.equal(a.chosen, true);
  assert.equal(b.rank, 2);
});
