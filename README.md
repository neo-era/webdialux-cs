# WebDialux-CS

Công cụ mô phỏng chiếu sáng đường (kiểu DIALux) theo **QCVN 07-7:2023** (phương pháp CIE 140), chạy hoàn toàn **client-side** trên GitHub Pages. **Mọi tính toán chạy local trên máy — dữ liệu Excel/IES không gửi lên mạng.**

Chạy ngay: **https://neo-era.github.io/webdialux-cs/** · Phiên bản: xem `src/version.mjs` (badge trong app; mỗi lần cập nhật tăng 0,1).

## Tính năng
- Đọc **Excel dữ liệu tuyến** (sheet `DU LIEU TUYEN`) + **thư mục IES** (IESNA LM-63, dò cả thư mục con).
- **Tự xác định cấp đường** theo ưu tiên: cột `Cấp đường` → cột `Loại tuyến` (tên theo QCVN 07) → suy từ hình học.
- **Hai chế độ**: *Đa phương án* (tính tất cả bộ đèn trong thư viện, chấm điểm Borda lần 1/lần 2, chọn ✓ đèn tối ưu = công suất nhỏ nhất vẫn Đạt) và *Từng phương án* (1 đèn/dòng).
- **Mặt đường q0** chọn được (CIE R3, mặc định 0,08 theo DIALux; 0,07 chuẩn CIE), **MF** tuỳ chỉnh.
- **Tải file kết quả Excel** (ExcelJS, định dạng chuyên nghiệp, 3 sheet): *Chấm điểm chi tiết* · *Tổng hợp đèn* (theo NSX · loại · công suất → số tuyến, số bộ, kW) · *Theo tuyến*. Luôn là **file mới**, không ghi lên file gốc. Kết quả/điểm/hạng/✓/tổng hợp là **công thức Excel** — sửa số trong Excel là tự tính lại.
- **Xuất PDF** kiểu DIALux, 3–4 trang/tuyến, nhiều tuyến tự chia **tối đa 300 tuyến/file** (ảnh nén, ≈ 40–65 MB/file), mỗi file có **mục lục & tổng quan** bấm được + bookmark từng tuyến/phần; tên bộ đèn = tên file IES (giống Excel): phối cảnh 3D ban đêm từ lưới E thực tính (màu theo CCT, trụ ngoài lòng đường, đúng bố trí 1 bên/đối xứng/so le), mặt bằng, thông số bộ đèn + Polar LDC, lắp đặt + Imax 70/80/90°, bảng Ký hiệu/Tính toán/Yêu cầu/Kiểm tra, chỉ số năng lượng, false-color độ rọi, lưới giá trị E, kết quả & lưới độ chói theo từng observer.
- **PWA**: cài như ứng dụng (☰ Menu → Cài đặt ứng dụng; iOS: Chia sẻ → Thêm vào MH chính) và **chạy offline** sau lần mở đầu; có thông báo khi có bản mới.
- Tên file xuất: `WebDialux_KetQua[_ChamDiem]_<tên file dữ liệu>_<YYYYMMDD-HHMM>.xlsx`, `WebDialux_BaoCao_<tuyến|N_tuyen>_<YYYYMMDD-HHMM>.pdf`.

## Sử dụng
1. Mở app → **📄 Chọn file Excel** → **📁 Chọn thư mục IES**.
2. Chỉnh MF / q0 / Chế độ nếu cần → **▶ Chạy**.
3. **⬇️ Tải file kết quả** (Excel 3 sheet) và/hoặc **📑 Xuất PDF** (các tuyến đang lọc).
4. Menu ☰ → *Tải Excel mẫu* để lấy đúng cấu trúc cột; *Hướng dẫn sử dụng* để xem chi tiết (bao gồm bảng tên Loại tuyến QCVN 07 → cấp và ngưỡng Ltb/Uo/Ul/TI/SR).

Chạy local: `python -m http.server 8080` trong thư mục repo → http://localhost:8080.

## Cấu trúc mã
| File | Vai trò |
|---|---|
| `index.html` | Giao diện, luồng đọc Excel/IES, bảng kết quả, nút xuất |
| `src/version.mjs` | Một nguồn phiên bản duy nhất (badge, menu, chân trang PDF, tiêu đề Excel) |
| `src/ies.mjs` | Parse LM-63 (keyword MANUFAC/LUMCAT/LAMP/CCT/CRI) + nội suy cường độ |
| `src/geometry.mjs` | Bố trí đèn, lưới CIE 140, góc (C, γ, β) |
| `src/rtable.mjs`, `src/r3data.mjs` | Bảng R3 CIE thật của DIALux; `scaleRTable` theo q0 |
| `src/photometry.mjs`, `src/metrics.mjs` | E, L, TI; Ltb, Uo, Ul, SR |
| `src/engine.mjs` | Tính một tuyến + đánh giá QCVN |
| `src/mapping.mjs` | Đọc cột Excel, phân cấp đường (cột / loại tuyến / hình học) |
| `src/batch.mjs`, `src/scoring.mjs` | Chạy hàng loạt, chấm điểm Borda, chọn đèn tối ưu |
| `src/xlsxpro.mjs` | Workbook kết quả 3 sheet (ExcelJS); `toRankedShape` dùng chung cho 2 chế độ |
| `src/report.mjs`, `src/font.mjs` | Báo cáo PDF (jsPDF + canvas), font tiếng Việt nhúng |
| `src/pdfparts.mjs` | Chia báo cáo nhiều tuyến thành nhiều file PDF |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: cache offline theo phiên bản, cài đặt; icon sinh bằng `tools/make-icons.mjs` |
| `cli.mjs` | Chạy dòng lệnh một ca |
| `test/` | Bộ test `node --test` (91 test; Excel công thức kiểm bằng HyperFormula, PDF mục lục/link/bookmark đọc lại bằng pdf.js) |
| `data/ies/`, `data/dialux_cases.json` | IES mẫu, 14 ca đối chiếu DIALux |

## Kiểm chứng
Đối chiếu DIALux (ca Cầu Bình Triệu 2 và 14 ca khác): độ rọi ~4 %, Ltb/Uo khớp khi cùng q0 và cách hiểu overhang = vươn − khoảng cách trụ-mép; chỉ số năng lượng khớp đúng quy ước DIALux. **TI** là ước tính (Stiles-Holladay), thiên an toàn — dùng tham khảo. Chi tiết: `VALIDATION.md`, `DESIGN.md`.

## Phát triển
```bash
npm install          # exceljs, @napi-rs/canvas, jspdf, hyperformula, pdfjs-dist (devDependencies cho test)
node --test
node cli.mjs data/ies/MAGNOLIA-BL-STR16A-PD36-60W.ies --H 7.5 --overhang 1 --spacing 35 --width 7 --tilt 15 --class D1
```
Quy ước: mỗi lần push tăng `VERSION` 0,1 (`src/version.mjs` + `package.json` + hằng `VERSION` trong `sw.js` — test kiểm khớp). Thêm file vào `src/` thì thêm vào `PRECACHE` trong `sw.js` (test báo nếu thiếu).

## Còn lại
ULR/ULOR tính thật (đang 0,00), đường đẳng rọi (isolines), cấp EN 13201 tham chiếu, cải thiện TI.
