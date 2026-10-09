// Chia báo cáo PDF nhiều tuyến thành nhiều file.
// jsPDF dựng cả file thành một chuỗi; vài trăm tuyến (mỗi tuyến ~3 trang) có thể vượt giới hạn
// chuỗi của trình duyệt ("Invalid string length"). 50 tuyến/file ≈ 5–10 MB (ảnh nén FAST).
export const PDF_PER_FILE = 50;

/**
 * Dựng PDF theo lô, mỗi lô tối đa perFile tuyến (1 item = 1 tuyến, render có thể thêm nhiều trang).
 * prepare(item) → payload hoặc null (bỏ qua, không tạo trang). prepare chạy hết cho mọi item
 * trước khi dựng PDF, để nParts/total trong tên file tính trên số tuyến xuất được thật.
 * emit(doc, info) được await xong mới dựng lô kế, để trình duyệt giải phóng file trước.
 */
export async function buildPdfParts({ items, perFile = PDF_PER_FILE, prepare, makeDoc, render, finalize, emit, onPrepare, onProgress }) {
  const ready = [];
  for (let k = 0; k < items.length; k++) {
    const p = prepare(items[k]);
    if (p != null) ready.push({ item: items[k], p });
    if (onPrepare) await onPrepare(k + 1, items.length);
  }
  const total = ready.length, nParts = Math.ceil(total / perFile);
  let doc = null, inPart = 0, part = 0, made = 0, first = null;
  const flush = async () => {
    if (!doc) return;
    part++;
    finalize(doc);
    await emit(doc, { part, nParts, total, routes: inPart, first });
    doc = null; inPart = 0; first = null;
  };
  for (const { item, p } of ready) {
    if (inPart >= perFile) await flush();
    if (!doc) doc = makeDoc(); else doc.addPage();
    render(doc, p);
    if (first === null) first = item;
    made++; inPart++;
    if (onProgress) await onProgress(made);
  }
  await flush();
  return { made, parts: part };
}

/** Phần "chủ đề" trong tên file: 1 tuyến → tên tuyến; 1 file → N_tuyen; nhiều file → N_tuyen_phank-n. */
export function partSubject({ part, nParts, routes, total, firstName }) {
  if (nParts === 1 && routes === 1) return firstName || "tuyen";
  if (nParts === 1) return `${routes}_tuyen`;
  return `${total}_tuyen_phan${part}-${nParts}`;
}
