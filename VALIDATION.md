# Kết quả kiểm chứng engine WebDialux-CS (Vòng 1)

Ngày: 2026-10-08. Đối chiếu với **14 báo cáo DIALux thật** (đèn MAGNOLIA 60W BL-STR16A-PD36 và 100W BL-STR16B).

## Tiêu chí Bước 0
Sai số Eav ≤ 10%; dáng lưới & kết luận hợp lý; chạy ≤ vài giây/tuyến.

## Kết quả độ rọi (R-table-independent — phần lõi)
- **Sai số Eav trung bình: −3,9% ; |lệch| trung bình: 4,1%** trên 14 ca.
- 8 ca đèn 60W: lệch đều ~−2,5% — chính bằng chênh quang thông IES biến thể dùng để test (9432 lm) so với bản trong báo cáo DIALux (282AEE5 ≈ 9762 lm, cao hơn ~3,5%). Chuẩn hoá quang thông → khớp gần tuyệt đối.
- Ca 100W: lệch ±1%.
- Emin/Emax bám sát (chênh vài %).
- Dải hình học đã phủ: khoảng cột 25–38 m, cao đèn 7,5–11,5 m, nghiêng 0–15°, rộng 5–12 m.

→ **ĐẠT**: lõi engine (parse IES + hình học 3D + nghiêng đèn + photometry + lưới CIE 140) chính xác ~4% so với DIALux. Vượt tiêu chí.

## Ngoại lai (cần xử lý)
- **Thạch Quảng Đức – Trạm 2** (100W, rộng ~16,5 m): Eav lệch −32%. Nghi tuyến bố trí **2 bên** (1 hàng đèn không phủ nổi 16,5 m) hoặc bề rộng khôi phục sai. Cần xác nhận bố trí.

## Kết quả độ chói (BẢNG R3 THẬT của DIALux)
Đã lấy đúng **bảng R3 CIE mà DIALux dùng** (`dlxRTabR3.rtb` trong thư mục cài DIALux: 29 cột tanε × 20 hàng β, q0=0,07) và nạp vào engine. Kết quả đối chiếu 14 báo cáo:
- **Uo (độ đồng đều) KHỚP DIALux: |lệch| trung bình chỉ 0,06** (vd 0,48 vs 0,49; 0,51 vs 0,52; 0,54 vs 0,56; 0,57 vs 0,59). Bảng R3 thật + sửa lỗi β đã giải quyết đúng độ đồng đều.
- **Lav: |lệch| trung bình 8,5%** (trong ngưỡng ≤10%). 60W hơi cao +3–7%, 100W hơi thấp −8…−10% (một phần do IES test là biến thể khác bản dùng trong báo cáo).
- Bảng R1/R2/R4/C2 cũng đã lấy về (`data/rtables/`) để chọn loại mặt đường khác.

→ **ĐẠT parity DIALux cho Lav + Uo** — hai chỉ tiêu độ chói quan trọng nhất.

## Rà soát 3 việc "cần dọn" — kết luận
**Engine được xác nhận ĐÚNG** qua các ca 60W có hình học biết chính xác (Eav ~2,5%, Lav ~5%, Uo khớp). Hai trong ba điểm là **lỗi của BỘ ĐỐI CHIẾU (đoán tham số từ PDF), không phải engine**:

- **#2 "ngoại lai 16,5m" — KHÔNG phải lỗi engine.** Báo cáo ghi "single side bottom" (1 bên). Bề rộng bị trích sai: lưới y chỉ lấy được 1 hàng, diện tích m² nằm trong hình vẽ vector không trích được. Trong app thật **bề rộng lấy từ cột Excel** nên không có vấn đề. Bố trí 2 bên/so le engine đã hỗ trợ sẵn (`arrangement`).
- **#3 Lav đèn 100W lệch ~8–10% — chủ yếu do đoán số làn.** Độ rọi khớp ±1%; Lav mặt đường = observer xấu nhất, phụ thuộc **số làn** (em đang đoán round(W/3,5)). Vị trí observer khác DIALux → lệch. App thật lấy số làn từ cột Excel. Phần nhỏ còn lại do biến thể IES (PD24 vs PD23 trong báo cáo).
- **#1 TI — ĐÃ SỬA ở v2.6:** tính theo EN 13201-3 (Lv, Lav ở trạng thái ban đầu; độ rọi tại mắt × cosθ; người quan sát dời trong 1 khoảng cột, lấy max; đèn phía trước 500 m) → khớp 15/16 observer của 7 tuyến DIALux test2 (lệch ≤ 1 %). Ghi chú cũ: Lv theo Stiles–Holladay (10·ΣE/θ²) cho TI thấp hơn DIALux, mức lệch **tương quan với độ nghiêng đèn** (60W nghiêng 15° lệch ~2,5×; 100W ít nghiêng ~khớp). Cần mô hình chói mất khả năng theo **CIE 146** đầy đủ. Không ràng buộc (biên rộng: 11 so với ngưỡng 20).

→ Lõi engine chốt ở mức: **độ rọi ~4%, độ chói Lav/Uo khớp DIALux** khi hình học đúng. #2/#3 tự hết khi chạy từ dữ liệu Excel; #1 là mục cải tiến có chủ đích.

## Cách chạy / tái lập
```
cd webdialux-cs
node --test              # 11/11 pass
node cli.mjs <file.ies> --H 7.5 --overhang 1 --spacing 35 --width 7 --tilt 15 --class D1
```
Bộ test đối chiếu DIALux: `test/engine.test.mjs`. Dữ liệu 14 ca: `data/dialux_cases.json`.

## Đối chiếu 7 tuyến DIALux "test2" (13/10/2026, v2.6) — test cố định `test/v25.test.mjs`

| Tuyến | Ltb D/A | Uo D/A | Ul D/A | TI D/A | REI D/A | W/km |
|---|---|---|---|---|---|---|
| Cầu Bình Triệu 2 | 1,65/1,64 | 0,75/0,75 | 0,90/0,91 | 9/9 | 0,56/0,56 | khớp |
| Đường dẫn cầu Bình Triệu | 1,58/1,58 | 0,61/0,62 | 0,82/0,83 | 8/9 | 0,58/0,58 | khớp |
| Vành Đai KCX Linh Trung 2 | 1,72/1,71 | 0,43/0,43 | 0,85/0,85 | 9/9 | 0,38/0,38 | khớp |
| Phan Huy Chú | 1,67/1,68 | 0,56/0,56 | 0,75/0,76 | 10/10 | 0,58/0,58 | khớp |
| Nguyễn Trường Tộ | 1,62/1,63 | 0,52/0,52 | 0,68/0,70 | 11/11 | 0,67/0,67 | khớp |
| Đồng Tiến | 1,67/1,68 | 0,56/0,56 | 0,75/0,76 | 10/10 | 0,58/0,58 | khớp |
| Độc Lập | 1,67/1,67 | 0,54/0,54 | 0,72/0,73 | 11/11 | 0,67/0,67 | khớp |

Quy ước DIALux rút ra: lưới 3 điểm ngang/làn; REI từng mép, dải = bề rộng làn; W/km = round(1000/S); TI ở trạng thái ban đầu, observer dời. Còn lại: Ul tuyến 1 bên cao 9 m lệch +0,01…0,02.

## Chế độ Cầu (v3.2) — kiểm chứng `test/v32.test.mjs`
- **Cầu phẳng = chế độ Đường**: 4 bố trí (1 bên, đối xứng, so le, giữa) — Ltb, Uo, Ul, TI, SR, Eav từng ô trùng `calcRoad` (sai số tương đối < 1e-9). Cầu Bình Triệu 2 phẳng: Ltb 1,38 · Uo 0,75 · Ul 0,90 · TI 9 như DIALux.
- **Trắc dọc**: cao độ 0 tại hai mố, đỉnh = i·(L/2 − R·i) + R·i²/2, chiều dài cong 2·R·i, liên tục tại tiếp điểm, đúng dấu độ dốc.
- **Mặt dốc**: E và L theo pháp tuyến mặt cầu đã đối chiếu độc lập bằng cách xoay hệ toạ độ cho mặt cầu nằm ngang (dốc 6 %: E 16,33428 lx, L 0,82637 cd/m² trùng tới 1e-15). Dốc → 0 hội tụ về cầu phẳng (< 0,1 %). Các ô đối xứng qua đỉnh có độ rọi bằng nhau (< 0,3 %, do cửa sổ đèn −5…+6 khoảng cột như chế độ Đường).
- **Tia sát mặt dốc**: ngoài bảng R3 (tanε > 12) trên mặt dốc ngoại suy r ∝ (12/tanε)³ (cầu phẳng giữ cột cuối như chế độ Đường để trùng DIALux); tia đèn → điểm và đèn → mắt bị đỉnh cầu che không tính. Kiểm: Ltb/Ul các ô liền nhau thay đổi < 10 %.
- **Tầm nhìn qua đỉnh**: mắt 1,5 m thấy xa √(2·R·1,5); nhỏ hơn 60 m + khoảng cột → cảnh báo và cột "khuất" (% điểm lưới người quan sát không thấy) trong bảng ô, Excel, PDF — các ô đó tham khảo.
- **Dữ liệu xấu**: thiếu chiều dài / lòng đường / khoảng cách trụ / H, khoảng cách trụ < 8 m, dốc > 10 %, số làn > 16, đèn/trụ > 8, trụ đầu ngoài cầu → lỗi rõ ràng, không tính; đường cong đứng dài hơn cầu, đỉnh gãy, đèn thấp ngang lan can, cấp đường sai → cảnh báo.
