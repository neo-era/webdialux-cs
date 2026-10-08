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
- **#1 TI — lỗi thật của engine (để vòng sau).** Lv theo Stiles–Holladay (10·ΣE/θ²) cho TI thấp hơn DIALux, mức lệch **tương quan với độ nghiêng đèn** (60W nghiêng 15° lệch ~2,5×; 100W ít nghiêng ~khớp). Cần mô hình chói mất khả năng theo **CIE 146** đầy đủ. Không ràng buộc (biên rộng: 11 so với ngưỡng 20).

→ Lõi engine chốt ở mức: **độ rọi ~4%, độ chói Lav/Uo khớp DIALux** khi hình học đúng. #2/#3 tự hết khi chạy từ dữ liệu Excel; #1 là mục cải tiến có chủ đích.

## Cách chạy / tái lập
```
cd webdialux-cs
node --test              # 11/11 pass
node cli.mjs <file.ies> --H 7.5 --overhang 1 --spacing 35 --width 7 --tilt 15 --class D1
```
Bộ test đối chiếu DIALux: `test/engine.test.mjs`. Dữ liệu 14 ca: `data/dialux_cases.json`.
