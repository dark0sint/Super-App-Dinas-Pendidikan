const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');

const uploadMateri = makeUploader('materi');

router.get('/', authenticate, (req, res) => {
  const { kelas_id } = req.query;
  let sql = 'SELECT * FROM materi WHERE 1=1';
  const params = [];
  if (kelas_id) { sql += ' AND kelas_id = ?'; params.push(kelas_id); }
  else if (req.user.role === 'siswa') {
    sql += ' AND kelas_id IN (SELECT kelas_id FROM kelas_siswa WHERE siswa_id = ?)';
    params.push(req.user.id);
  }
  sql += ' ORDER BY created_at DESC';
  return ok(res, db.prepare(sql).all(...params));
});

router.post('/', authenticate, authorize('guru', 'admin_sekolah'), uploadMateri.single('file'), (req, res) => {
  const { kelas_id, judul, deskripsi, mapel, video_url } = req.body;
  if (!kelas_id || !judul) return fail(res, 'kelas_id dan judul wajib diisi.');
  const fileUrlVal = req.file ? fileUrl(req, 'materi', req.file.filename) : null;
  const info = db.prepare(
    `INSERT INTO materi (kelas_id, guru_id, judul, deskripsi, mapel, file_url, video_url) VALUES (?,?,?,?,?,?,?)`
  ).run(kelas_id, req.user.id, judul, deskripsi, mapel, fileUrlVal, video_url || null);
  return created(res, { id: info.lastInsertRowid });
});

router.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM materi WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return ok(res, row);
});

router.delete('/:id', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  db.prepare('DELETE FROM materi WHERE id = ?').run(req.params.id);
  return ok(res, null, 'Materi dihapus.');
});

module.exports = router;
