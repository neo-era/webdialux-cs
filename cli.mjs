#!/usr/bin/env node
// CLI: node cli.mjs <file.ies> [--H 7.5 --overhang 1 --spacing 35 --width 7 --lanes 2
//                               --tilt 15 --MF 0.8 --class D1 --arrangement "1 bên"]
import { parseIES } from "./src/ies.mjs";
import { calcRoad } from "./src/engine.mjs";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length === 0) { console.error("Dùng: node cli.mjs <file.ies> [--H.. --spacing.. --class D1]"); process.exit(1); }
const file = args[0];
const opt = {};
for (let i = 1; i < args.length; i += 2) opt[args[i].replace(/^--/, "")] = args[i + 1];

const ph = parseIES(readFileSync(file, "utf8"));
const r = calcRoad({
  ies: ph,
  H: +(opt.H ?? 8), overhang: +(opt.overhang ?? 0), spacing: +(opt.spacing ?? 30),
  width: +(opt.width ?? 7), lanes: +(opt.lanes ?? 2), tilt: +(opt.tilt ?? 0),
  MF: +(opt.MF ?? 0.8), roadClass: opt.class ?? "C2", arrangement: opt.arrangement ?? "1 bên",
});
const f = (x, d = 2) => Number(x).toFixed(d);
console.log(`IES: ${file.split("/").pop()}  (${ph.totalLumens} lm, ${ph.inputWatts} W)`);
console.log(`Cấp đường ${r.roadClass} — yêu cầu:`, r.req);
console.log(`Độ rọi:  Eav=${f(r.E.avg)}  Emin=${f(r.E.min)}  Emax=${f(r.E.max)}  Uo(g1)=${f(r.E.g1)}  g2=${f(r.E.g2)}`);
console.log(`Độ chói: Lav=${f(r.road.Lav)}  Uo=${f(r.road.Uo)}  Ul=${f(r.road.Ul)}  TI=${f(r.road.TI,1)}%  SR=${f(r.road.SR)}`);
console.log(`Kết luận: ${r.pass ? "ĐẠT" : "KHÔNG ĐẠT"}  checks=`, r.checks);
if (r.provisionalLuminance) console.log("⚠ Độ chói dùng R-table TẠM (khuếch tán) — cần bảng R3 chuẩn để chính xác.");
