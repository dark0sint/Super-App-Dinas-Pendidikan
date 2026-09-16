const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, (req, res) => {
  let sql = 'SELECT k.*, s.nama as nama_sekolah FROM kelas k JOIN sekolah s ON s.id = k.sekolah_id WHERE 1=1';
  const params = [];
  if (req.user.role === 'guru') { sql += ' AND k.wali_guru_id = ?'; params.push(req.user.id); }
  else if (req.user.role === 'siswa') {
    sql += ' AND k.id IN (SELECT kelas_id FROM kelas_siswa WHERE siswa_id = ?)';
    params.push(req.user.id);
  } else if (req.user.sekolah_id) { sql += ' AND k.sekolah_id = ?'; params.push(req.user.sekolah_id); }
  return ok(res, db.prepare(sql).all(...params));
});

router.post('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { sekolah_id, nama, tingkat, wali_guru_id, tahun_ajaran } = req.body;
  const finalSekolahId = req.user.role === 'admin_sekolah' ? req.user.sekolah_id : sekolah_id;
  if (!nama || !finalSekolahId) return fail(res, 'nama dan sekolah_id wajib diisi.');
  const info = db.prepare(
    'INSERT INTO kelas (sekolah_id, nama, tingkat, wali_guru_id, tahun_ajaran) VALUES (?,?,?,?,?)'
  ).run(finalSekolahId, nama, tingkat, wali_guru_id || null, tahun_ajaran);
  return created(res, { id: info.lastInsertRowid });
});

router.get('/:id/siswa', authenticate, (req, res) => {
  const rows = db.prepare(
    `SELECT u.id, u.nik_nisn, u.nama FROM kelas_siswa ks JOIN users u ON u.id = ks.siswa_id WHERE ks.kelas_id = ?`
  ).all(req.params.id);
  return ok(res, rows);
});

router.post('/:id/siswa', authenticate, authorize('admin_dinas', 'admin_sekolah', 'guru'), (req, res) => {
  const { siswa_id } = req.body;
  if (!siswa_id) return fail(res, 'siswa_id wajib diisi.');
  try {
    db.prepare('INSERT INTO kelas_siswa (kelas_id, siswa_id) VALUES (?,?)').run(req.params.id, siswa_id);
    return created(res, null, 'Siswa ditambahkan ke kelas.');
  } catch (e) {
    return fail(res, 'Siswa sudah terdaftar di kelas ini.');
  }
});

router.delete('/:id/siswa/:siswa_id', authenticate, authorize('admin_dinas', 'admin_sekolah', 'guru'), (req, res) => {
  db.prepare('DELETE FROM kelas_siswa WHERE kelas_id = ? AND siswa_id = ?').run(req.params.id, req.params.siswa_id);
  return ok(res, null, 'Siswa dikeluarkan dari kelas.');
});

module.exports = router;
