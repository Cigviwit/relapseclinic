// Sent prescription PDFs live in Cloud Storage for as long as the WhatsApp link works, then are removed.
// The prescription itself stays in the patient's record and can be printed again at any time.
const PDF_LINK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const pdfPath = (id) => `prescription-pdfs/${id}.pdf`;
const isFresh = (createdAtMs, nowMs) => Number.isFinite(createdAtMs) && nowMs - createdAtMs < PDF_LINK_DAYS * DAY_MS;

/** Deletes expired PDFs and returns how many went. Older files kept their bytes in the document, so deleting the document removes those too. */
async function purgeExpiredFiles(db, bucket, nowMs) {
  const cutoff = new Date(nowMs - PDF_LINK_DAYS * DAY_MS);
  const expired = await db.collection('prescriptionFiles').where('createdAt', '<', cutoff).limit(400).get();
  for (const snap of expired.docs) {
    if (snap.data().path) await bucket.file(snap.data().path).delete({ ignoreNotFound: true });
    await snap.ref.delete();
  }
  return expired.size;
}

module.exports = { PDF_LINK_DAYS, pdfPath, isFresh, purgeExpiredFiles };
