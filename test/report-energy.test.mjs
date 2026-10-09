import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseIES, makeIntensity } from "../src/ies.mjs";
import { energyIndicators, maxIntensityPerKlm } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ph = parseIES(readFileSync(join(here, "../data/ies/MAGNOLIA-BL-STR16B-PD24-100W.ies"), "utf8"));

test("energyIndicators: khớp quy ước DIALux (ca Cầu Bình Triệu 2)", () => {
  // DIALux: P=92,8W, S=35, W=13, Eav≈25,5, đối xứng, 4000h
  const e = energyIndicators({ P: 92.8, spacing: 35, width: 13, Eav: 25.5, arrangement: "đối xứng", hours: 4000 });
  assert.equal(e.nSide, 2);
  assert.ok(Math.abs(e.Dp - 0.016) < 0.0005, "Dp ≈ 0,016 W/lx·m²");
  assert.ok(Math.abs(e.De - 1.63) < 0.05, "De ≈ 1,6 kWh/m²·yr");
  assert.ok(Math.abs(e.annualKwh - 742.4) < 1, "annual ≈ 742,4 kWh/yr");
});

test("energyIndicators: 1 bên -> nSide=1", () => {
  const e = energyIndicators({ P: 60, spacing: 35, width: 7, Eav: 15, arrangement: "1 bên" });
  assert.equal(e.nSide, 1);
  assert.ok(Math.abs(e.Wkm - (1000 / 35) * 60) < 1e-6);
});

test("energyIndicators: thiếu dữ liệu -> null, không vỡ", () => {
  const e = energyIndicators({ P: null, spacing: 35, width: 7, Eav: 15, arrangement: "1 bên" });
  assert.equal(e.Dp, null); assert.equal(e.Wkm, null);
});

test("maxIntensityPerKlm: trả cd/klm hợp lý, giảm dần ở góc cao", () => {
  const i70 = maxIntensityPerKlm(ph, makeIntensity, 70);
  const i80 = maxIntensityPerKlm(ph, makeIntensity, 80);
  const i90 = maxIntensityPerKlm(ph, makeIntensity, 90);
  assert.ok(i70 > 0 && isFinite(i70));
  assert.ok(i90 < i70, "cường độ góc 90° nhỏ hơn 70°");
  assert.ok(i80 <= i70 && i90 <= i80, "giảm dần 70->80->90");
});
