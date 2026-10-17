# WebDialux-CS

Công cụ mô phỏng chiếu sáng đường (kiểu DIALux) theo **QCVN 07-7:2023** (phương pháp CIE 140), chạy hoàn toàn **client-side** trên GitHub Pages. **Mọi tính toán chạy local trên máy — dữ liệu Excel/IES không gửi lên mạng.**

Chạy ngay: **https://neo-era.github.io/webdialux-cs/** · Phiên bản: xem `src/version.mjs` (badge trong app; mỗi lần cập nhật tăng 0,1).

## Tính năng
- Đọc **Excel dữ liệu tuyến** (sheet `DU LIEU TUYEN`) + **thư mục IES** (IESNA LM-63, dò cả thư mục con).
- **Tự xác định cấp đường** theo ưu tiên: cột `Cấp đường` → cột `Loại tuyến` (tên theo QCVN 07) → suy từ hình học.
- **Hai chế độ**: *Đa phương án* (tính tất cả bộ đèn trong thư viện, chấm điểm Borda lần 1/lần 2, chọn ✓ đèn tối ưu = công suất nhỏ nhất vẫn Đạt) và *Từng phương án* (1 đèn/dòng).
- **Chuyển Excel thô → file dữ liệu** (v3.4, ☰ Menu): đọc file tổng hợp có cột cùng tên file mẫu (tiêu đề ở dòng bất kỳ, xuống dòng, chú thích trong ngoặc, nhiều dòng phương án đèn/tuyến), chỉ chép thông số đầu vào — bỏ cột kết quả/điểm/xếp hạng/đèn được chọn; mỗi tuyến 1 dòng, để trống bộ đèn (app tự quét IES), góc nghiêng theo dòng đèn được chọn; cảnh báo thông số khác nhau trong tuyến và tuyến thiếu H/lòng đường/khoảng cách trụ (tô vàng); tải về file `WebDialux_DuLieu_…xlsx` và nạp sẵn để chạy.
- **Excel mẫu** (☰ Menu → Tải Excel mẫu): sheet `DU LIEU TUYEN` định dạng sẵn (tô màu nhóm cột, ghi chú, danh sách chọn, kiểm số), sheet `CAP DUONG QCVN07-7-23` (ngưỡng 8 cấp A…E + quy đổi Loại tuyến → cấp) và `HUONG DAN`.
- **Vỉa hè & dải phân cách**: cột *Độ rộng vỉa hè (m)* giới hạn dải tính SR = min(5 m, W/2, vỉa hè) và được vẽ trong 3D/mặt bằng; cột *Độ rộng dải phân cách (m)* để vẽ dải phân cách khi *Dải phân cách giữa* = có (số liệu tính không đổi).
- **Tư thế lắp đặt thật** (v2.3): độ rọi, độ chói, TI, Imax 70/80/90°, ULR/ULOR tính theo đèn đã nghiêng/xoay; cột *Góc xoay bộ đèn*, *Số bộ đèn/trụ*, *Hệ số bảo trì MF* theo tuyến; bố trí *giữa* (trụ trên dải phân cách, cần đôi). Cường độ lấy đúng IES, không nhân ballast factor (như DIALux). Ul theo tim làn của từng observer (EN 13201-3).
- **Khớp DIALux 7 tuyến** (v2.5–v2.6, test cố định với đúng file IES): Ltb ±0,01, Uo ±0,01, Ul ≤ +0,02, TI ±1 %, REI đúng cả 7, Eav, W/km đúng. Lưới tính 3 điểm ngang/làn; W/km = 1000/S làm tròn gần nhất; Imax quét mịn; TI theo EN 13201-3 (giá trị ban đầu, người quan sát dời); thêm **REI tham khảo** (EN 13201-2:2015: từng mép, lấy mép xấu, dải = bề rộng làn) cạnh SR của QCVN.
- **Kiểm chứng DIALux**: ca Cầu Bình Triệu 2 (đúng file IES + báo cáo DIALux đầy đủ) khớp lưới E từng điểm (TB 0,0%), lưới L (TB −0,4%), Ltb 1,37/1,38, Ul 0,91/0,90, Imax 534/282/10,1 vs 538/284/10,1 — là test cố định.
- **Chế độ Khu vực tự do** (v2.4): sân thể thao, công viên, quảng trường, bãi đỗ xe — khai báo trụ bằng Excel (`VI TRI TRU`, `VUNG TINH`) hoặc kéo/xoay trụ trên mặt bằng, tính lưới độ rọi ngang từng vùng (chữ nhật hoặc đa giác), đánh giá theo TCVN 13608:2023 (Bảng 4, 6, 7, 12–15) và EN 12193 cấp I–III; xuất Excel (trụ đã chỉnh + kết quả + lưới) và PDF.
- **Trụ nhiều đèn** (v2.7): mỗi đèn trên trụ hướng / nghiêng / vươn / cao độ / IES riêng (trụ quảng trường, cột pha) — sheet `DEN TREN TRU`, ngăn *Chi tiết trụ* (sơ đồ hướng, thêm đèn, chia đều 360°, sao chép sang trụ khác); file cũ vẫn chạy (trụ không khai từng đèn = N đèn giống nhau).
- **Phối cảnh 3D khu vực + mẫu công viên** (v2.8): xem 3D ban đêm (mặt vùng tô theo độ rọi đã tính, trụ/cần/đèn đúng cao độ và hướng; kéo xoay, lăn phóng to), PDF có trang 3D; mẫu dựng sẵn *Công viên (Bảng 7)* với 4 vùng cổng chính / đường trục chính / đường dạo / sân hoạt động, Menu → *Tải Excel mẫu công viên*.
- **Chiếu sáng mỹ thuật** (v2.9): tòa nhà (đa giác chân + cao), tường rào (đường gấp khúc), cây xanh (thân + tán) — vẽ trên mặt bằng hoặc sheet `VAT THE`; tính độ rọi trên từng mặt đứng / tán cây theo pháp tuyến, có che khuất và bóng đổ xuống mặt đất, độ chói L = ρE/π; đánh giá theo vùng môi trường E1–E4 (giới hạn L 5/10/25 cd/m² — ILP GN01:2011 theo CIE 150; Eav tối thiểu tham khảo CIE 094, sửa được); đèn hắt lên 0–180°, đèn âm đất; xem 3D, mặt đứng trải phẳng; Excel (`VAT THE`, `KET QUA MAT DUNG`, `LUOI MAT DUNG`) và PDF; mẫu *Mỹ thuật*.
- **3D chất lượng cao** (v3.0): phối cảnh khu vực dò tia từng điểm ảnh (nội suy mượt, khử răng cưa, độ sáng theo độ chói L = ρE/π, mặt đất toàn cảnh tính bằng cùng engine có bóng đổ, ánh trời mờ, sương xa); PDF in ảnh 3D 2000 px theo đúng góc nhìn đang xoay; 3D đường trong PDF gấp đôi độ phân giải (1680 × 800, đúng tỉ lệ).
- **Giao diện điện thoại** (v3.1): thanh hành động cố định dưới đáy (Excel · IES · Chạy · Kết quả · Thêm), menu dạng tấm trượt, vùng chạm ≥ 44 px, kết quả đường dạng thẻ, nhãn mặt bằng tránh chồng.
- **Chế độ Cầu** (v3.2): chiếu sáng mặt cầu giao thông — mặt cắt ngang (lòng đường, làn, lề bộ hành, gờ chắn, dải phân cách, lan can, vị trí trụ trên lan can / gờ chắn / dải phân cách), **trắc dọc** dốc dọc đối xứng + đường cong đứng lồi; trụ thẳng đứng bám cao độ mặt cầu, độ rọi/độ chói theo **pháp tuyến mặt cầu**, người quan sát & hướng nhìn TI bám mặt cầu, tia bị đỉnh cầu che không tính; tính từng khoảng cột dọc cầu lấy ô xấu nhất (Ltb, Uo, Ul, TI, SR — QCVN 07-7:2023), lề bộ hành Eav/Uo (TCVN 13608:2023 Bảng 4), cảnh báo đỉnh cầu che tầm nhìn; tự chọn đèn công suất nhỏ nhất vẫn Đạt. Cầu dốc 0 % trùng chế độ Đường (test). Sheet `DU LIEU CAU`, Excel kết quả (`KET QUA CAU`, `O TINH DOC CAU`), PDF 3 trang/cầu (mặt cắt, trắc dọc + Ltb từng ô, mặt bằng, 3D, bộ đèn).
- **Bộ đèn 3D kiểu LED thật** (v3.3): thân đèn tối + mặt phát sáng theo trục quang đã nghiêng, chùm sáng mờ chỉ toả xuống mặt chiếu (đèn hắt thì toả lên) — bỏ quầng tròn hắt lên trời; áp cho 3D cầu, 3D khu vực, 3D đường trong PDF.
- **Mặt đường q0** chọn được (CIE R3, mặc định 0,08 theo DIALux; 0,07 chuẩn CIE), **MF** tuỳ chỉnh.
- **Tải file kết quả Excel** (ExcelJS, định dạng chuyên nghiệp, 3 sheet): *Chấm điểm chi tiết* · *Tổng hợp đèn* (theo NSX · loại · công suất → số tuyến, số bộ, kW) · *Theo tuyến*. Luôn là **file mới**, không ghi lên file gốc. Kết quả/điểm/hạng/✓/tổng hợp là **công thức Excel** — sửa số trong Excel là tự tính lại.
- **Xuất PDF** kiểu DIALux, 3–4 trang/tuyến, nhiều tuyến tự chia **tối đa 300 tuyến/file** (ảnh nén, ≈ 40–65 MB/file), mỗi file có **mục lục & tổng quan** bấm được + bookmark từng tuyến/phần; tên bộ đèn = tên file IES (giống Excel): phối cảnh 3D ban đêm từ lưới E thực tính (màu theo CCT, trụ trên vỉa hè, vỉa hè tô theo E thực tính, dải phân cách, đúng bố trí 1 bên/đối xứng/so le), mặt bằng, thông số bộ đèn + Polar LDC, lắp đặt + Imax 70/80/90°, bảng Ký hiệu/Tính toán/Yêu cầu/Kiểm tra, chỉ số năng lượng, false-color độ rọi, lưới giá trị E, kết quả & lưới độ chói theo từng observer.
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
| `src/area.mjs`, `src/areaReq.mjs`, `src/areaDraw.mjs`, `src/areaReport.mjs`, `src/areaui.mjs` | Chế độ khu vực: tính, bảng yêu cầu, vẽ mặt bằng, PDF, giao diện |
| `src/bridge.mjs`, `src/bridgeDraw.mjs`, `src/bridgeReport.mjs`, `src/bridgeui.mjs` | Chế độ cầu: trắc dọc, tính trên mặt dốc, Excel; vẽ mặt cắt / trắc dọc / mặt bằng / 3D; PDF; giao diện |
| `src/rawImport.mjs` | Chuyển Excel thô (bảng tổng hợp) → dòng dữ liệu đúng mẫu DU LIEU TUYEN |
| `src/template.mjs` | Excel mẫu nhập liệu (ExcelJS): dữ liệu tuyến, bảng cấp đường QCVN 07-7:2023, hướng dẫn |
| `src/report.mjs`, `src/font.mjs` | Báo cáo PDF (jsPDF + canvas), font tiếng Việt nhúng |
| `src/pdfparts.mjs` | Chia báo cáo nhiều tuyến thành nhiều file PDF |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: cache offline theo phiên bản, cài đặt; icon sinh bằng `tools/make-icons.mjs` |
| `cli.mjs` | Chạy dòng lệnh một ca |
| `test/` | Bộ test `node --test` (139 test; Excel công thức kiểm bằng HyperFormula, PDF mục lục/link/bookmark đọc lại bằng pdf.js) |
| `data/ies/`, `data/dialux_cases.json` | IES mẫu, 14 ca đối chiếu DIALux |

## Kiểm chứng
Đối chiếu DIALux (ca Cầu Bình Triệu 2 và 14 ca khác): độ rọi ~4 %, Ltb/Uo khớp khi cùng q0 và cách hiểu overhang = vươn − khoảng cách trụ-mép; chỉ số năng lượng khớp đúng quy ước DIALux. **TI** tính theo EN 13201-3 như DIALux (giá trị ban đầu, người quan sát dời trong 1 khoảng cột, đèn phía trước 500 m). Chi tiết: `VALIDATION.md`, `DESIGN.md`.

## Phát triển
```bash
npm install          # exceljs, @napi-rs/canvas, jspdf, hyperformula, pdfjs-dist (devDependencies cho test)
node --test
node cli.mjs data/ies/MAGNOLIA-BL-STR16A-PD36-60W.ies --H 7.5 --overhang 1 --spacing 35 --width 7 --tilt 15 --class D1
```
Quy ước: mỗi lần push tăng `VERSION` 0,1 (`src/version.mjs` + `package.json` + hằng `VERSION` trong `sw.js` — test kiểm khớp). Thêm file vào `src/` thì thêm vào `PRECACHE` trong `sw.js` (test báo nếu thiếu).

## Còn lại
ULR/ULOR tính thật (đang 0,00), đường đẳng rọi (isolines), cấp EN 13201 tham chiếu, cải thiện TI.
