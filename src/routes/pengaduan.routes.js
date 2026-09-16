const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');

const uploadBukti = makeUploader('bukti');

function generateTrackingCode() {
  return 'ADU-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ==== LAPOR (bisa anonim, tanpa login) ====
router.post('/', uploadBukti.single('bukti'), (req, res) => {
  const { kategori, deskripsi, lokasi, sekolah_id, anonim, user_id } = req.body;
  if (!kategori || !deskripsi) return fail(res, 'kategori dan deskripsi wajib diisi.');
  if (!['pungli', 'bullying', 'fasilitas', 'lainnya'].includes(kategori)) return fail(res, 'Kategori tidak valid.');

  const isAnonim = anonim === 'false' ? 0 : 1;
  const buktiUrl = req.file ? fileUrl(req, 'bukti', req.file.filename) : null;
  const trackingCode = generateTrackingCode();

  const info = db.prepare(
    `INSERT INTO pengaduan (kategori, deskripsi, lokasi, sekolah_id, anonim, pelapor_user_id, bukti_url, tracking_code)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(kategori, deskripsi, lokasi || null, sekolah_id || null, isAnonim, isAnonim ? null : (user_id || null), buktiUrl, trackingCode);

  return created(res, {
    id: info.lastInsertRowid,
    tracking_code: trackingCode
  }, 'Pengaduan diterima. Simpan kode pelacakan untuk memantau tindak lanjut.');
});

// ==== LACAK PENGADUAN (publik, tanpa login, pakai tracking code) ====
router.get('/lacak/:tracking_code', (req, res) => {
  const row = db.prepare('SELECT kategori, status, tanggapan, created_at FROM pengaduan WHERE tracking_code = ?')
    .get(req.params.tracking_code);
  if (!row) return notFound(res, 'Kode pelacakan tidak ditemukan.');
  return ok(res, row);
});

// ==== KELOLA PENGADUAN (admin dinas/sekolah) ====
router.get('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { status, kategori } = req.query;
  let sql = 'SELECT * FROM pengaduan WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (kategori) { sql += ' AND kategori = ?'; params.push(kategori); }
  if (req.user.role === 'admin_sekolah') { sql += ' AND sekolah_id = ?'; params.push(req.user.sekolah_id); }
  sql += ' ORDER BY created_at DESC';
  return ok(res, db.prepare(sql).all(...params));
});

router.patch('/:id/status', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { status, tanggapan } = req.body;
  if (!['diterima', 'diverifikasi', 'ditindaklanjuti', 'selesai', 'ditolak'].includes(status)) {
    return fail(res, 'Status tidak valid.');
  }
  db.prepare('UPDATE pengaduan SET status = ?, tanggapan = ? WHERE id = ?').run(status, tanggapan || null, req.params.id);
  return ok(res, null, 'Status pengaduan diperbarui.');
});

module.exports = router;
