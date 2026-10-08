# WebDialux-CS

Công cụ mô phỏng chiếu sáng đường (kiểu DIALux) theo **QCVN 07-7:2023**, chạy client-side, hướng tới GitHub Pages + data local.

**Trạng thái:** Vòng 1 — lõi engine CIE 140 (kiểm chứng 14 báo cáo DIALux: độ rọi ~4%, Lav ~8,5%, Uo khớp). Vòng 2 — **web app** (`index.html`) đọc Excel + thư mục IES, chạy hàng loạt, hiện bảng kết quả, ghi ngược Excel, chế độ tự dò. Dùng **bảng R3 CIE thật của DIALux**.

## Chạy web app
- **GitHub Pages / local server** (ghi đè file .xlsx tại chỗ qua File System Access, Chrome/Edge):
  `cd webdialux-cs && python -m http.server 8080` → mở http://localhost:8080
- Chọn file `DATA_TUYEN_DEN_LED_SACH.xlsx` + thư mục chứa .ies → Chạy → Ghi/Tải Excel → **Xuất PDF** (báo cáo kiểu DIALux, 1 trang/tuyến: thông số đèn + Polar LDC, lắp đặt, bảng Symbol/Calculated/Target/Check, false-color độ rọi, kết quả theo observer).
- Module engine + báo cáo nằm trong `src/`; app nạp qua ES module + SheetJS + jsPDF (CDN). Font tiếng Việt nhúng trong `src/font.mjs`.

## Cấu trúc
- `src/ies.mjs` — parse IESNA LM-63 + nội suy cường độ.
- `src/geometry.mjs` — bố trí đèn + lưới CIE 140 + góc (C,γ,β).
- `src/rtable.mjs` + `src/r3data.mjs` — R-table; **R3 là bảng CIE thật của DIALux** (`data/rtables/dlxRTabR3.rtb`).
- `src/photometry.mjs` — E, L, TI.
- `src/metrics.mjs` — Ltb, Uo, Ul, SR, g1, g2.
- `src/engine.mjs` — ghép 1 tuyến + đánh giá QCVN.
- `cli.mjs` — chạy dòng lệnh.
- `test/` — bộ test (11/11 pass), fixtures IES.
- `data/ies/` — IES mẫu; `data/dialux_cases.json` — 14 ca đối chiếu.

## Chạy
```bash
node --test
node cli.mjs data/ies/MAGNOLIA-BL-STR16A-PD36-60W.ies --H 7.5 --overhang 1 --spacing 35 --width 7 --tilt 15 --class D1
```

## Nợ kỹ thuật
Độ chói cần **bảng R3 chuẩn CIE 144** (đang dùng bản tạm khuếch tán). Xem `DESIGN.md`, `VALIDATION.md`.
