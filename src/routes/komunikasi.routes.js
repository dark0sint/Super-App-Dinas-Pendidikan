const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

// ==== CHAT PRIVAT (ortu <-> guru/sekolah) ====
router.post('/pesan', authenticate, (req, res) => {
  const { ke_user_id, isi } = req.body;
  if (!ke_user_id || !isi) return fail(res, 'ke_user_id dan isi wajib diisi.');
  const info = db.prepare('INSERT INTO pesan (dari_user_id, ke_user_id, isi) VALUES (?,?,?)').run(req.user.id, ke_user_id, isi);
  return created(res, { id: info.lastInsertRowid });
});

// Riwayat percakapan dengan satu lawan bicara
router.get('/pesan/:user_id', authenticate, (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM pesan WHERE (dari_user_id = ? AND ke_user_id = ?) OR (dari_user_id = ? AND ke_user_id = ?)
     ORDER BY created_at ASC`
  ).all(req.user.id, req.params.user_id, req.params.user_id, req.user.id);
  db.prepare('UPDATE pesan SET dibaca = 1 WHERE ke_user_id = ? AND dari_user_id = ?').run(req.user.id, req.params.user_id);
  return ok(res, rows);
});

// Daftar kontak percakapan (inbox)
router.get('/inbox', authenticate, (req, res) => {
  const rows = db.prepare(
    `SELECT u.id, u.nama, u.role,
       (SELECT isi FROM pesan p2 WHERE (p2.dari_user_id=u.id AND p2.ke_user_id=?) OR (p2.dari_user_id=? AND p2.ke_user_id=u.id) ORDER BY p2.created_at DESC LIMIT 1) as pesan_terakhir,
       (SELECT COUNT(*) FROM pesan p3 WHERE p3.dari_user_id = u.id AND p3.ke_user_id = ? AND p3.dibaca = 0) as belum_dibaca
     FROM users u
     WHERE u.id IN (
       SELECT dari_user_id FROM pesan WHERE ke_user_id = ?
       UNION
       SELECT ke_user_id FROM pesan WHERE dari_user_id = ?
     )`
  ).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  return ok(res, rows);
});

// ==== FORUM RESMI SEKOLAH ====
router.get('/forum', authenticate, (req, res) => {
  const sekolahId = req.query.sekolah_id || req.user.sekolah_id;
  const rows = db.prepare(
    `SELECT f.*, u.nama as nama_pembuat FROM forum_topik f JOIN users u ON u.id = f.dibuat_oleh
     WHERE f.sekolah_id = ? ORDER BY f.created_at DESC`
  ).all(sekolahId);
  return ok(res, rows);
});

router.post('/forum', authenticate, (req, res) => {
  const { judul, isi, sekolah_id } = req.body;
  if (!judul) return fail(res, 'judul wajib diisi.');
  const info = db.prepare('INSERT INTO forum_topik (sekolah_id, judul, isi, dibuat_oleh) VALUES (?,?,?,?)')
    .run(sekolah_id || req.user.sekolah_id, judul, isi, req.user.id);
  return created(res, { id: info.lastInsertRowid });
});

router.get('/forum/:id/balasan', authenticate, (req, res) => {
  const rows = db.prepare(
    `SELECT b.*, u.nama FROM forum_balasan b JOIN users u ON u.id = b.dibuat_oleh WHERE topik_id = ? ORDER BY created_at ASC`
  ).all(req.params.id);
  return ok(res, rows);
});

router.post('/forum/:id/balasan', authenticate, (req, res) => {
  const { isi } = req.body;
  if (!isi) return fail(res, 'isi balasan wajib diisi.');
  const info = db.prepare('INSERT INTO forum_balasan (topik_id, isi, dibuat_oleh) VALUES (?,?,?)').run(req.params.id, isi, req.user.id);
  return created(res, { id: info.lastInsertRowid });
});

module.exports = router;
