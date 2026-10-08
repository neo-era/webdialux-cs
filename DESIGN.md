# WebDialux-CS — Thiết kế lõi engine (Vòng 1)

Mục tiêu vòng 1: lõi tính toán CIE 140 chạy được + test + đối chiếu DIALux. Chưa làm UI/PDF/ghi Excel.

## Ngôn ngữ & chạy
- JavaScript ESM thuần (`.mjs`), **không build step** → chạy được cả Node (test, CLI) và trình duyệt (vòng sau).
- Test bằng `node:test` (có sẵn trong Node), chạy `node --test`.

## Module
| File | Trách nhiệm |
|---|---|
| `src/ies.mjs` | Parse IESNA LM-63-2002 → {lumens, watts, vAngles[], hAngles[], candela[h][v], symmetry}. Nội suy `intensity(C,γ)` song tuyến + xử lý đối xứng C (0/90/180/360). |
| `src/geometry.mjs` | Dựng vị trí bộ đèn theo bố trí (1 bên/đối xứng/so le/giữa), sinh lưới điểm CIE 140 (dọc×ngang), vị trí observer. Hàm hình học: vector đèn→điểm, (C,γ). |
| `src/rtable.mjs` | R-table R1–R4, hàm `r(beta, tanEps)` nội suy. **R3 nạp từ `data/R3.json` — cần đối chiếu CIE 144 bản chuẩn.** |
| `src/photometry.mjs` | Độ rọi ngang E(P); độ chói L(P) theo observer; độ chói màn chắn Lv; TI. |
| `src/metrics.mjs` | Ltb, Uo, Ul(Ud), SR, Eav/Emin/Emax, Uo(g1)=Emin/Eav, g2=Emin/Emax. |
| `src/engine.mjs` | Ghép: input (IES + hình học + cấp đường) → kết quả + lưới E,L. |
| `cli.mjs` | Chạy 1 tuyến từ dòng lệnh, in kết quả. |

## Hệ toạ độ
- X: dọc đường (chiều xe chạy). Y: ngang đường (0 = mép gần, W = mép xa). Z: lên.
- Đèn: điểm sáng tại cao độ H. "Overhang" = vị trí ngang điểm sáng so với mép gần, dương về phía tim đường.
- IES Type C: mặt C0–C180 = ngang đường (lan sáng hai bên), C90–C270 = dọc đường (khớp polar LDC của bộ đèn đường). Tilt (góc nghiêng cần) xoay phân bố trong mặt ngang (C0–C180).

## Công thức (CIE 140)
- E_h(P) = Σ I(C,γ)·cos³γ / H² · MF   (lux)
- L(P)  = Σ I(C,γ)·r(β,tanε) / (H²·10⁴) · MF   (cd/m²)
- Lưới dọc: N điểm giữa 2 đèn (S≤30→N=10; else bước≤3m), điểm đầu cách đèn d/2.
- Lưới ngang: mỗi làn ≥3 điểm, điểm tại (W/n)(i−0,5).
- Observer: mỗi làn, x=−60 m, y=tâm làn, z=1,5 m. Kết quả mặt đường = xấu nhất qua observer.
- TI% = 65·Lv/Ltb^0.8 (0,05≤Ltb≤5); Lv = 10·Σ E_eye,k/θ_k²  (θ 1,5°–60°).

## Kế hoạch (task kiểm chứng được)
1. IES parser + nội suy → **test: tích phân candela ≈ quang thông (≤5%)**, kích thước ma trận đúng.
2. Geometry: lưới CIE 140 đúng số điểm/vị trí; (C,γ) đúng cho ca đơn giản (đèn ngay trên điểm → γ=0).
3. Photometry E: **test nghịch đảo bình phương + cos³** trên ca tổng hợp; đối chiếu lưới E của ĐX-073 (khi có IES khớp).
4. R-table + L: test hình dạng r, L>0 hợp lý; đối chiếu Ltb sau khi có R3 chuẩn + IES khớp.
5. Metrics: test Uo/Ul/SR/g1/g2 trên dữ liệu bịa biết trước kết quả.

## Ranh giới đã biết (nợ kỹ thuật)
- **R3 table**: đang dùng bản nạp ngoài, cần xác nhận với CIE 144 chính thức.
- **Tilt/định hướng IES**: dùng convention chuẩn; cần calib với lưới độ rọi ĐX-073 (cần IES khớp).
- Chưa xử lý dải phân cách giữa, bố trí "giữa" cần đôi (để vòng sau).
