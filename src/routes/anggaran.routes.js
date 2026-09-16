const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

// ==== TRANSPARANSI PUBLIK (tanpa login, masyarakat bisa lihat penyaluran dana) ====
router.get('/publik', (req, res) => {
  const { sekolah_id, tahun } = req.query;
  let sql = `SELECT a.id, s.nama as nama_sekolah, a.tahun, a.sumber_dana, a.jumlah_diterima, a.jumlah_terpakai, a.status
             FROM anggaran_bos a JOIN sekolah s ON s.id = a.sekolah_id WHERE 1=1`;
  const params = [];
  if (sekolah_id) { sql += ' AND a.sekolah_id = ?'; params.push(sekolah_id); }
  if (tahun) { sql += ' AND a.tahun = ?'; params.push(tahun); }
  sql += ' ORDER BY a.tahun DESC';
  return ok(res, db.prepare(sql).all(...params));
});

router.get('/publik/:id/rincian', (req, res) => {
  const row = db.prepare('SELECT rincian_penggunaan FROM anggaran_bos WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  let rincian = [];
  try { rincian = JSON.parse(row.rincian_penggunaan || '[]'); } catch (e) { rincian = []; }
  return ok(res, rincian);
});

// ==== ADMIN: KELOLA ANGGARAN ====
router.post('/', authenticate, authorize('admin_dinas'), (req, res) => {
  const { sekolah_id, tahun, sumber_dana, jumlah_diterima } = req.body;
  if (!sekolah_id || !tahun || !jumlah_diterima) return fail(res, 'sekolah_id, tahun, dan jumlah_diterima wajib diisi.');
  const info = db.prepare(
    `INSERT INTO anggaran_bos (sekolah_id, tahun, sumber_dana, jumlah_diterima) VALUES (?,?,?,?)`
  ).run(sekolah_id, tahun, sumber_dana || 'BOS', jumlah_diterima);
  return created(res, { id: info.lastInsertRowid });
});

// Admin sekolah melaporkan penggunaan dana (transparansi rincian)
router.post('/:id/penggunaan', authenticate, authorize('admin_sekolah', 'admin_dinas'), (req, res) => {
  const { keterangan, jumlah, tanggal } = req.body;
  if (!keterangan || !jumlah) return fail(res, 'keterangan dan jumlah wajib diisi.');
  const anggaran = db.prepare('SELECT * FROM anggaran_bos WHERE id = ?').get(req.params.id);
  if (!anggaran) return notFound(res);

  let rincian = [];
  try { rincian = JSON.parse(anggaran.rincian_penggunaan || '[]'); } catch (e) { rincian = []; }
  rincian.push({ keterangan, jumlah, tanggal: tanggal || new Date().toISOString() });

  const totalTerpakai = rincian.reduce((sum, r) => sum + Number(r.jumlah || 0), 0);
  db.prepare('UPDATE anggaran_bos SET rincian_penggunaan = ?, jumlah_terpakai = ? WHERE id = ?')
    .run(JSON.stringify(rincian), totalTerpakai, req.params.id);

  return created(res, null, 'Rincian penggunaan anggaran dicatat.');
});

router.patch('/:id/status', authenticate, authorize('admin_dinas'), (req, res) => {
  const { status } = req.body;
  if (!['disusun', 'disetujui', 'dicairkan', 'dipertanggungjawabkan'].includes(status)) return fail(res, 'Status tidak valid.');
  db.prepare('UPDATE anggaran_bos SET status = ? WHERE id = ?').run(status, req.params.id);
  return ok(res, null, 'Status anggaran diperbarui.');
});

module.exports = router;
