const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');

const uploadEbook = makeUploader('ebook');

router.get('/', authenticate, (req, res) => {
  const { kategori, jenjang, q, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT * FROM ebook WHERE 1=1';
  const params = [];
  if (kategori) { sql += ' AND kategori = ?'; params.push(kategori); }
  if (jenjang) { sql += ' AND jenjang = ?'; params.push(jenjang); }
  if (q) { sql += ' AND (judul LIKE ? OR penulis LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));
  return ok(res, db.prepare(sql).all(...params));
});

router.post('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), uploadEbook.fields([{ name: 'file' }, { name: 'cover' }]), (req, res) => {
  const { judul, penulis, kategori, deskripsi, jenjang } = req.body;
  if (!judul || !req.files?.file) return fail(res, 'judul dan file e-book wajib diisi.');
  const fileUrlVal = fileUrl(req, 'ebook', req.files.file[0].filename);
  const coverUrlVal = req.files.cover ? fileUrl(req, 'ebook', req.files.cover[0].filename) : null;
  const info = db.prepare(
    `INSERT INTO ebook (judul, penulis, kategori, deskripsi, file_url, cover_url, jenjang) VALUES (?,?,?,?,?,?,?)`
  ).run(judul, penulis, kategori || 'literasi_umum', deskripsi, fileUrlVal, coverUrlVal, jenjang);
  return created(res, { id: info.lastInsertRowid });
});

router.get('/:id', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM ebook WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return ok(res, row);
});

router.delete('/:id', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  db.prepare('DELETE FROM ebook WHERE id = ?').run(req.params.id);
  return ok(res, null, 'E-book dihapus.');
});

module.exports = router;
