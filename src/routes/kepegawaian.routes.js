const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');

const uploadDok = makeUploader('dokumen');

// ==== GURU: AJUKAN (angka kredit / kenaikan pangkat / sertifikasi / mutasi) ====
router.post('/', authenticate, authorize('guru', 'staf_sekolah'), uploadDok.single('dokumen'), (req, res) => {
  const { jenis, detail, sekolah_tujuan_id } = req.body;
  if (!['angka_kredit', 'kenaikan_pangkat', 'sertifikasi', 'mutasi'].includes(jenis)) {
    return fail(res, 'Jenis pengajuan tidak valid.');
  }
  if (jenis === 'mutasi' && !sekolah_tujuan_id) return fail(res, 'sekolah_tujuan_id wajib diisi untuk mutasi.');
  const dokumenUrl = req.file ? fileUrl(req, 'dokumen', req.file.filename) : null;
  const info = db.prepare(
    `INSERT INTO kepegawaian_pengajuan (guru_id, jenis, detail, sekolah_tujuan_id, dokumen_url) VALUES (?,?,?,?,?)`
  ).run(req.user.id, jenis, detail || null, sekolah_tujuan_id || null, dokumenUrl);
  return created(res, { id: info.lastInsertRowid }, 'Pengajuan berhasil dikirim, silakan pantau statusnya.');
});

router.get('/saya', authenticate, authorize('guru', 'staf_sekolah'), (req, res) => {
  return ok(res, db.prepare('SELECT * FROM kepegawaian_pengajuan WHERE guru_id = ? ORDER BY created_at DESC').all(req.user.id));
});

// ==== ADMIN DINAS: VERIFIKASI PENGAJUAN ====
router.get('/', authenticate, authorize('admin_dinas'), (req, res) => {
  const { jenis, status } = req.query;
  let sql = `SELECT k.*, u.nama as nama_guru, u.nik_nisn FROM kepegawaian_pengajuan k JOIN users u ON u.id = k.guru_id WHERE 1=1`;
  const params = [];
  if (jenis) { sql += ' AND k.jenis = ?'; params.push(jenis); }
  if (status) { sql += ' AND k.status = ?'; params.push(status); }
  sql += ' ORDER BY k.created_at DESC';
  return ok(res, db.prepare(sql).all(...params));
});

router.patch('/:id/status', authenticate, authorize('admin_dinas'), (req, res) => {
  const { status, catatan_verifikator } = req.body;
  if (!['diproses', 'disetujui', 'ditolak'].includes(status)) return fail(res, 'Status tidak valid.');
  db.prepare('UPDATE kepegawaian_pengajuan SET status = ?, catatan_verifikator = ? WHERE id = ?')
    .run(status, catatan_verifikator || null, req.params.id);

  // Jika mutasi disetujui, pindahkan sekolah_id guru
  if (status === 'disetujui') {
    const pengajuan = db.prepare('SELECT * FROM kepegawaian_pengajuan WHERE id = ?').get(req.params.id);
    if (pengajuan.jenis === 'mutasi' && pengajuan.sekolah_tujuan_id) {
      db.prepare('UPDATE users SET sekolah_id = ? WHERE id = ?').run(pengajuan.sekolah_tujuan_id, pengajuan.guru_id);
    }
  }
  return ok(res, null, 'Status pengajuan diperbarui.');
});

module.exports = router;
