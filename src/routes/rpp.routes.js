const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');

const uploadRpp = makeUploader('dokumen');

router.get('/', authenticate, (req, res) => {
  let sql = 'SELECT r.*, u.nama as nama_guru FROM rpp r JOIN users u ON u.id = r.guru_id WHERE 1=1';
  const params = [];
  if (req.user.role === 'guru') { sql += ' AND r.guru_id = ?'; params.push(req.user.id); }
  const { status } = req.query;
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  sql += ' ORDER BY r.created_at DESC';
  return ok(res, db.prepare(sql).all(...params));
});

router.post('/', authenticate, authorize('guru'), uploadRpp.single('file'), (req, res) => {
  const { mapel, kelas, semester, tahun_ajaran, konten } = req.body;
  if (!mapel) return fail(res, 'mapel wajib diisi.');
  const fileUrlVal = req.file ? fileUrl(req, 'dokumen', req.file.filename) : null;
  const info = db.prepare(
    `INSERT INTO rpp (guru_id, mapel, kelas, semester, tahun_ajaran, konten, file_url, status)
     VALUES (?,?,?,?,?,?,?, 'draft')`
  ).run(req.user.id, mapel, kelas, semester, tahun_ajaran, konten, fileUrlVal);
  return created(res, { id: info.lastInsertRowid });
});

router.patch('/:id/ajukan', authenticate, authorize('guru'), (req, res) => {
  db.prepare("UPDATE rpp SET status = 'diajukan' WHERE id = ? AND guru_id = ?").run(req.params.id, req.user.id);
  return ok(res, null, 'RPP diajukan untuk direview.');
});

router.patch('/:id/verifikasi', authenticate, authorize('admin_sekolah', 'admin_dinas'), (req, res) => {
  const { status, catatan_verifikator } = req.body; // 'disetujui' | 'revisi'
  if (!['disetujui', 'revisi'].includes(status)) return fail(res, 'Status verifikasi tidak valid.');
  db.prepare('UPDATE rpp SET status = ?, catatan_verifikator = ? WHERE id = ?').run(status, catatan_verifikator || null, req.params.id);
  return ok(res, null, 'RPP diverifikasi.');
});

module.exports = router;
