const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');
const { haversineKm } = require('../utils/distance');

const uploadDokumen = makeUploader('dokumen');

// ==== DAFTAR PPDB (publik/daring, transparan) ====
router.post('/', uploadDokumen.single('dokumen'), (req, res) => {
  const {
    nik_calon, nama_calon, tanggal_lahir, alamat, latitude, longitude,
    sekolah_tujuan_id, jalur, nilai_prestasi, user_id
  } = req.body;

  if (!nik_calon || !nama_calon || !sekolah_tujuan_id || !jalur) {
    return fail(res, 'nik_calon, nama_calon, sekolah_tujuan_id, dan jalur wajib diisi.');
  }
  if (!['zonasi', 'prestasi', 'afirmasi', 'perpindahan'].includes(jalur)) {
    return fail(res, 'Jalur tidak valid.');
  }

  const sekolah = db.prepare('SELECT * FROM sekolah WHERE id = ?').get(sekolah_tujuan_id);
  if (!sekolah) return notFound(res, 'Sekolah tujuan tidak ditemukan.');

  let jarak = null;
  if (jalur === 'zonasi' && latitude && longitude) {
    jarak = haversineKm(parseFloat(latitude), parseFloat(longitude), sekolah.latitude, sekolah.longitude);
  }

  const dokumenUrl = req.file ? fileUrl(req, 'dokumen', req.file.filename) : null;

  const info = db.prepare(
    `INSERT INTO ppdb_pendaftaran
     (nik_calon, nama_calon, tanggal_lahir, alamat, latitude, longitude, sekolah_tujuan_id, jalur, nilai_prestasi, dokumen_url, jarak_km, user_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    nik_calon, nama_calon, tanggal_lahir || null, alamat || null,
    latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
    sekolah_tujuan_id, jalur, nilai_prestasi ? parseFloat(nilai_prestasi) : 0,
    dokumenUrl, jarak, user_id || null
  );

  return created(res, {
    id: info.lastInsertRowid,
    jarak_km: jarak,
    pesan_transparansi: 'Pendaftaran tercatat. Anda dapat memantau status & peringkat secara real-time melalui endpoint peringkat.'
  }, 'Pendaftaran PPDB berhasil diajukan.');
});

// ==== CEK STATUS PENDAFTARAN (publik, by id) ====
router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT p.*, s.nama as nama_sekolah FROM ppdb_pendaftaran p
     JOIN sekolah s ON s.id = p.sekolah_tujuan_id WHERE p.id = ?`
  ).get(req.params.id);
  if (!row) return notFound(res);
  return ok(res, row);
});

// ==== PERINGKAT/TRANSPARANSI PENDAFTARAN PER SEKOLAH & JALUR ====
// Zonasi diurutkan jarak terdekat, prestasi diurutkan nilai tertinggi (transparan bagi publik)
router.get('/peringkat/:sekolah_id/:jalur', (req, res) => {
  const { sekolah_id, jalur } = req.params;
  const orderBy = jalur === 'zonasi' ? 'jarak_km ASC' : 'nilai_prestasi DESC';
  const rows = db.prepare(
    `SELECT id, nama_calon, jalur, jarak_km, nilai_prestasi, status,
            ROW_NUMBER() OVER (ORDER BY ${orderBy}) as peringkat
     FROM ppdb_pendaftaran WHERE sekolah_tujuan_id = ? AND jalur = ?
     ORDER BY ${orderBy}`
  ).all(sekolah_id, jalur);
  return ok(res, rows);
});

// ==== LIST UNTUK ADMIN/VERIFIKATOR ====
router.get('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { status, jalur, sekolah_id } = req.query;
  let sql = 'SELECT p.*, s.nama as nama_sekolah FROM ppdb_pendaftaran p JOIN sekolah s ON s.id = p.sekolah_tujuan_id WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  if (jalur) { sql += ' AND p.jalur = ?'; params.push(jalur); }
  const effSekolahId = req.user.role === 'admin_sekolah' ? req.user.sekolah_id : sekolah_id;
  if (effSekolahId) { sql += ' AND p.sekolah_tujuan_id = ?'; params.push(effSekolahId); }
  sql += ' ORDER BY p.created_at DESC';
  return ok(res, db.prepare(sql).all(...params));
});

// ==== VERIFIKASI / UBAH STATUS ====
router.patch('/:id/status', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { status, catatan } = req.body;
  if (!['diajukan', 'verifikasi', 'diterima', 'ditolak', 'cadangan'].includes(status)) {
    return fail(res, 'Status tidak valid.');
  }
  const result = db.prepare('UPDATE ppdb_pendaftaran SET status = ?, catatan = ? WHERE id = ?')
    .run(status, catatan || null, req.params.id);
  if (result.changes === 0) return notFound(res);
  return ok(res, null, 'Status pendaftaran diperbarui.');
});

module.exports = router;
