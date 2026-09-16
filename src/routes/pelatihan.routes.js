const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', (req, res) => {
  return ok(res, db.prepare('SELECT * FROM pelatihan ORDER BY jadwal_mulai DESC').all());
});

router.post('/', authenticate, authorize('admin_dinas'), (req, res) => {
  const { judul, deskripsi, penyelenggara, jadwal_mulai, jadwal_selesai, kuota, link_webinar } = req.body;
  if (!judul) return fail(res, 'judul wajib diisi.');
  const info = db.prepare(
    `INSERT INTO pelatihan (judul, deskripsi, penyelenggara, jadwal_mulai, jadwal_selesai, kuota, link_webinar)
     VALUES (?,?,?,?,?,?,?)`
  ).run(judul, deskripsi, penyelenggara, jadwal_mulai, jadwal_selesai, kuota || 0, link_webinar);
  return created(res, { id: info.lastInsertRowid });
});

// ==== GURU MENDAFTAR PELATIHAN ====
router.post('/:id/daftar', authenticate, authorize('guru', 'staf_sekolah'), (req, res) => {
  const pelatihan = db.prepare('SELECT * FROM pelatihan WHERE id = ?').get(req.params.id);
  if (!pelatihan) return notFound(res);
  if (pelatihan.kuota > 0) {
    const jumlahPeserta = db.prepare('SELECT COUNT(*) as c FROM pelatihan_peserta WHERE pelatihan_id = ?').get(req.params.id).c;
    if (jumlahPeserta >= pelatihan.kuota) return fail(res, 'Kuota pelatihan sudah penuh.', 409);
  }
  try {
    const info = db.prepare('INSERT INTO pelatihan_peserta (pelatihan_id, guru_id) VALUES (?,?)').run(req.params.id, req.user.id);
    return created(res, { id: info.lastInsertRowid }, 'Berhasil mendaftar pelatihan.');
  } catch (e) {
    return fail(res, 'Anda sudah terdaftar pada pelatihan ini.', 409);
  }
});

router.get('/saya/riwayat', authenticate, authorize('guru', 'staf_sekolah'), (req, res) => {
  const rows = db.prepare(
    `SELECT pp.*, p.judul, p.jadwal_mulai FROM pelatihan_peserta pp JOIN pelatihan p ON p.id = pp.pelatihan_id
     WHERE pp.guru_id = ?`
  ).all(req.user.id);
  return ok(res, rows);
});

router.patch('/:id/peserta/:guru_id/status', authenticate, authorize('admin_dinas'), (req, res) => {
  const { status, sertifikat_url } = req.body;
  db.prepare('UPDATE pelatihan_peserta SET status = ?, sertifikat_url = COALESCE(?, sertifikat_url) WHERE pelatihan_id = ? AND guru_id = ?')
    .run(status, sertifikat_url, req.params.id, req.params.guru_id);
  return ok(res, null, 'Status peserta diperbarui.');
});

module.exports = router;
