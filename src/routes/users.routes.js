const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

// ==== LIST USERS (admin) ====
router.get('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { role, sekolah_id, q, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT id, nik_nisn, nama, role, email, telepon, sekolah_id, aktif, created_at FROM users WHERE 1=1';
  const params = [];
  if (role) { sql += ' AND role = ?'; params.push(role); }
  if (sekolah_id) { sql += ' AND sekolah_id = ?'; params.push(sekolah_id); }
  if (q) { sql += ' AND (nama LIKE ? OR nik_nisn LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  // admin_sekolah hanya lihat sekolahnya sendiri
  if (req.user.role === 'admin_sekolah') { sql += ' AND sekolah_id = ?'; params.push(req.user.sekolah_id); }
  sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));
  const rows = db.prepare(sql).all(...params);
  return ok(res, rows);
});

// ==== BUAT USER BARU (admin membuat akun guru/staf/dsb) ====
router.post('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { nik_nisn, password, role, nama, email, telepon, sekolah_id } = req.body;
  if (!nik_nisn || !password || !role || !nama) return fail(res, 'Data wajib tidak lengkap.');
  const existing = db.prepare('SELECT id FROM users WHERE nik_nisn = ?').get(nik_nisn);
  if (existing) return fail(res, 'NIK/NISN sudah terdaftar.', 409);

  const finalSekolahId = req.user.role === 'admin_sekolah' ? req.user.sekolah_id : sekolah_id;
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    `INSERT INTO users (nik_nisn, password_hash, role, nama, email, telepon, sekolah_id) VALUES (?,?,?,?,?,?,?)`
  ).run(nik_nisn, hash, role, nama, email || null, telepon || null, finalSekolahId || null);

  return created(res, { id: info.lastInsertRowid });
});

router.get('/:id', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, nik_nisn, nama, role, email, telepon, sekolah_id, aktif FROM users WHERE id = ?').get(req.params.id);
  if (!user) return notFound(res);
  return ok(res, user);
});

router.put('/:id', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { nama, email, telepon, aktif } = req.body;
  db.prepare('UPDATE users SET nama=COALESCE(?,nama), email=COALESCE(?,email), telepon=COALESCE(?,telepon), aktif=COALESCE(?,aktif) WHERE id=?')
    .run(nama, email, telepon, aktif, req.params.id);
  return ok(res, null, 'Data pengguna diperbarui.');
});

router.delete('/:id', authenticate, authorize('admin_dinas'), (req, res) => {
  db.prepare('UPDATE users SET aktif = 0 WHERE id = ?').run(req.params.id);
  return ok(res, null, 'Pengguna dinonaktifkan.');
});

// ==== RELASI ORANG TUA - ANAK ====
router.post('/wali-siswa', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { orang_tua_id, siswa_id, hubungan } = req.body;
  if (!orang_tua_id || !siswa_id) return fail(res, 'orang_tua_id dan siswa_id wajib diisi.');
  try {
    db.prepare('INSERT INTO wali_siswa (orang_tua_id, siswa_id, hubungan) VALUES (?,?,?)')
      .run(orang_tua_id, siswa_id, hubungan || 'orang_tua');
    return created(res, null, 'Relasi wali-siswa ditambahkan.');
  } catch (e) {
    return fail(res, 'Relasi sudah ada atau data tidak valid.');
  }
});

// Daftar anak milik orang tua yang sedang login
router.get('/saya/anak', authenticate, authorize('orang_tua'), (req, res) => {
  const anak = db.prepare(
    `SELECT u.id, u.nik_nisn, u.nama, u.sekolah_id, s.nama as nama_sekolah
     FROM wali_siswa w JOIN users u ON u.id = w.siswa_id
     LEFT JOIN sekolah s ON s.id = u.sekolah_id
     WHERE w.orang_tua_id = ?`
  ).all(req.user.id);
  return ok(res, anak);
});

module.exports = router;
