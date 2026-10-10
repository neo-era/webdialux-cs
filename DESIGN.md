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

## Excel kết quả có công thức sống (src/xlsxpro.mjs)
Mục tiêu: sửa số trong Excel → Kết quả/điểm/hạng/✓/tổng hợp tự tính lại; mở file thấy ngay kết quả (công thức kèm giá trị cache + `fullCalcOnLoad`).
- Ghi số **gốc chưa làm tròn** (hiển thị bằng numFmt) — app so Đạt trên giá trị làm tròn nhưng chấm Borda trên giá trị gốc.
- Sheet 1, nhóm tuyến = dải dòng a..b, YC ở dòng đầu nhóm ($N$a…):
  - Kết quả = `IF(AND(ROUND(W,2)>=N,ROUND(X,2)>=O,ROUND(Y,2)>=P,ROUND(Z,0)<=Q,ROUND(AA,2)>=R),"ĐẠT","KHÔNG ĐẠT")`
  - Điểm Borda = `SUMPRODUCT((AC_g="ĐẠT")*(W_g<=W))` (TI: `>=`). Không dùng COUNTIFS `"<="&ô` (đổi số → chuỗi 15 chữ số, lệch điểm).
  - Tổng 2 = số đối thủ trong nhóm đồng Tổng 1 cao nhất bị thắng ≥ 3/5 tiêu chí (SUMPRODUCT).
  - Hạng = 1 + số phương án Đạt tốt hơn theo (CS nhỏ hơn) → (Tổng 1, Tổng 2 cao hơn) → (Ltb cao hơn) → hoà tuyệt đối thì dòng trên trước (SUMPRODUCT trên dải con a..n-1, giống sort ổn định của app; không dùng ROW(dải)); ✓ = Hạng 1.
  - Chế độ Từng phương án (app không chấm điểm): cột điểm để trống; Hạng/✓ = IF(Kết quả="ĐẠT").
- Sheet 3: bộ đèn/chỉ tiêu chọn = INDEX/MATCH dòng ✓ của nhóm ở sheet 1; Kết quả theo có/không ✓.
- Sheet 2: Số tuyến/Số bộ/kW = SUMPRODUCT so bằng trên sheet 3 theo (Hãng, Loại, CS) — không dùng COUNTIFS vì * ? ~ trong tên đèn thành ký tự đại diện; TỔNG CỘNG = SUM. Danh sách tổ hợp cố định theo lúc xuất (sửa số làm đổi đèn chọn sang tổ hợp mới thì không tự thêm dòng).
- Kiểm chứng: test/xlsxformula.test.mjs tính lại toàn bộ công thức bằng HyperFormula (`useArrayArithmetic: true` — bắt buộc để SUMPRODUCT tính mảng như Excel) và so với kết quả app. Đã đối chiếu thêm bằng Excel 16 thật qua COM (786 tuyến, 19.886 ô + bộ IES trùng 35.406 ô: lệch 0).
- Hạn chế còn lại: màu tô (dòng ✓, ô Kết quả) là tĩnh, không đổi theo khi sửa số; sắp xếp lại sheet 1 làm hỏng dải nhóm; bản dự phòng SheetJS (khi không tải được ExcelJS) vẫn chỉ có giá trị.

## PWA (cài như ứng dụng, chạy offline)
- `manifest.webmanifest`: name/short_name WebDialux-CS, `start_url`/`scope` = `./` (chạy được dưới /webdialux-cs/ của GitHub Pages), `display: standalone`, icon 192/512 + 512 maskable (`icons/`, sinh bằng `tools/make-icons.mjs`).
- `sw.js` (service worker cổ điển, cùng thư mục index.html):
  - `VERSION` trong sw.js phải bằng `src/version.mjs` (test kiểm) → đổi phiên bản = byte sw.js đổi = trình duyệt cài SW mới, cache `webdialux-<VERSION>`; bản cũ bị xoá khi activate.
  - Precache: `./`, index.html, manifest, icon, mọi `src/*.mjs` (`cache: reload`); 3 thư viện CDN tải dạng **cors** + kiểm `res.ok` (opaque thì 404 cũng bị lưu và bị đệm ~7 MB/mục); CDN lỗi không làm hỏng cài đặt, thiếu thì tải bù lần dùng sau.
  - Fetch: cùng origin → mạng trước với `cache: no-cache` (bỏ qua max-age 600 s của GitHub Pages), lưu bản 200 qua `waitUntil`; quá 4 s thì dùng cache nếu có, chưa có thì vẫn chờ mạng. CDN → cache trước, thiếu thì tải bù. Cả mạng lẫn cache đều không có → trang HTML báo offline.
  - Vẫn phải tăng VERSION mỗi lần deploy: module nạp lười (report/font/xlsxpro) chỉ được làm mới khi dùng, offline có thể ghép index mới với module cũ nếu không đổi cache.
  - Trang kiểm bản mới mỗi giờ và khi quay lại tab (`reg.update()`).
  - SW mới chờ (waiting) → trang hiện thanh "Có bản mới — Tải lại"; bấm → `SKIP_WAITING` → `controllerchange` → reload.
- Đăng ký SW chỉ khi `serviceWorker` có và không phải `file://`.
- Kiểm chứng: test/pwa.test.mjs (manifest, icon đúng kích thước, danh sách precache đủ file thật, VERSION khớp); E2E puppeteer: installability (CDP), offline reload → nạp Excel/IES, Chạy, xuất Excel/PDF; đổi VERSION của sw.js → hiện thanh bản mới.

## Mục lục PDF + tên bộ đèn thống nhất (v1.9)
- Mục lục: dựng xong các trang tuyến trước (ghi trang bắt đầu từng tuyến + trang từng phần), rồi chèn K trang mục lục vào đầu file (`doc.insertPage`), cộng K vào mọi số trang đã ghi; vẽ mục lục + link nội bộ (`doc.link`) + bookmark (`doc.outline`). Chạy trong mỗi lô của `buildPdfParts` (mỗi file mục lục riêng, tiêu đề "phần k/n"); 1 tuyến → không có trang mục lục, chỉ bookmark. `finalizeDoc` chạy sau cùng nên "Trang i/N" tính cả mục lục.
- Tên bộ đèn: một hàm `luminaireLabel(iesName)` (bỏ `.ies` và `_IESNA2002`) dùng chung cho PDF (dòng "Tên bộ đèn") và Excel (`cleanIes`). `[LUMINAIRE]` của IES chuyển xuống dòng "Mô tả trong IES"; thêm dòng "File IES" (tên đầy đủ).
- PWA: nút "Cài đặt ứng dụng" trong menu (`beforeinstallprompt`), hướng dẫn iOS (Chia sẻ → Thêm vào MH chính), meta apple-mobile-web-app-*. Sự kiện có thể đến trước khi module chạy → script nhỏ trong `<head>` giữ ở `window.__installEvt`; iOS luôn ẩn nút (không có prompt), chỉ hiện hướng dẫn Safari.
- Excel sheet 2 gộp theo tên bộ đèn **không phân biệt hoa/thường** (Excel so `=` cũng vậy → tránh đếm đôi); cột V sheet 1 = tên bộ đèn (rơi về model nếu thiếu file) để sheet 3/2 luôn tra được. Hai file IES khác nhau cùng hãng·model·CS giờ là 2 dòng riêng (trước gộp theo model).
- Mục lục: 36 dòng trang đầu, 42 dòng trang sau (hết ở y=280, chân trang y=290); K = 1 + ⌈(n−36)/42⌉ (300 tuyến → 8 trang). Tiêu đề "Độ rọi ngang" sang trang cùng ảnh (bookmark trỏ đúng).
- Kế hoạch: (1) chốt mẫu mục lục (2–3 phương án render) → (2) test: số trang mục lục khớp, link/outline có trong PDF, dung lượng ≤ 100 MB/300 tuyến, hàm tên → (3) code → (4) review → (5) E2E 786 tuyến + PWA.
