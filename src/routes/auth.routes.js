const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate } = require('../middleware/auth');

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, nama: user.nama, sekolah_id: user.sekolah_id, nik_nisn: user.nik_nisn },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// ==== LOGIN SSO (satu akun NIK/NISN untuk semua layanan) ====
router.post('/login', (req, res) => {
  const { nik_nisn, password } = req.body;
  if (!nik_nisn || !password) return fail(res, 'NIK/NISN dan password wajib diisi.');

  const user = db.prepare('SELECT * FROM users WHERE nik_nisn = ?').get(nik_nisn);
  if (!user || !user.aktif) return fail(res, 'Akun tidak ditemukan atau tidak aktif.', 401);

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return fail(res, 'NIK/NISN atau password salah.', 401);

  const accessToken = signAccessToken(user);
  const refreshToken = crypto.randomBytes(40).toString('hex');
  db.prepare('UPDATE users SET refresh_token = ? WHERE id = ?').run(refreshToken, user.id);

  db.prepare('INSERT INTO audit_log (user_id, aksi, entitas) VALUES (?,?,?)').run(user.id, 'LOGIN', 'auth');

  return ok(res, {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id, nik_nisn: user.nik_nisn, nama: user.nama,
      role: user.role, sekolah_id: user.sekolah_id, email: user.email
    }
  }, 'Login berhasil.');
});

// ==== REFRESH TOKEN ====
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return fail(res, 'refresh_token wajib diisi.');
  const user = db.prepare('SELECT * FROM users WHERE refresh_token = ?').get(refresh_token);
  if (!user) return fail(res, 'Refresh token tidak valid.', 401);
  const accessToken = signAccessToken(user);
  return ok(res, { access_token: accessToken }, 'Token diperbarui.');
});

// ==== LOGOUT ====
router.post('/logout', authenticate, (req, res) => {
  db.prepare('UPDATE users SET refresh_token = NULL WHERE id = ?').run(req.user.id);
  return ok(res, null, 'Logout berhasil.');
});

// ==== REGISTRASI (untuk orang tua / calon siswa mendaftar akun pertama kali) ====
router.post('/register', (req, res) => {
  const { nik_nisn, password, role, nama, email, telepon } = req.body;
  if (!nik_nisn || !password || !role || !nama) {
    return fail(res, 'nik_nisn, password, role, dan nama wajib diisi.');
  }
  if (!['siswa', 'orang_tua'].includes(role)) {
    return fail(res, 'Pendaftaran mandiri hanya untuk role siswa atau orang_tua. Role lain dibuat oleh admin.');
  }
  const existing = db.prepare('SELECT id FROM users WHERE nik_nisn = ?').get(nik_nisn);
  if (existing) return fail(res, 'NIK/NISN sudah terdaftar.', 409);

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    `INSERT INTO users (nik_nisn, password_hash, role, nama, email, telepon) VALUES (?,?,?,?,?,?)`
  ).run(nik_nisn, hash, role, nama, email || null, telepon || null);

  return created(res, { id: info.lastInsertRowid, nik_nisn, nama, role }, 'Registrasi berhasil, silakan login.');
});

// ==== PROFIL SAYA ====
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    `SELECT id, nik_nisn, nama, role, email, telepon, sekolah_id, created_at FROM users WHERE id = ?`
  ).get(req.user.id);
  if (!user) return notFound(res, 'Pengguna tidak ditemukan.');
  return ok(res, user);
});

router.put('/me', authenticate, (req, res) => {
  const { nama, email, telepon } = req.body;
  db.prepare('UPDATE users SET nama = COALESCE(?,nama), email = COALESCE(?,email), telepon = COALESCE(?,telepon) WHERE id = ?')
    .run(nama, email, telepon, req.user.id);
  return ok(res, null, 'Profil diperbarui.');
});

// ==== GANTI PASSWORD ====
router.post('/change-password', authenticate, (req, res) => {
  const { password_lama, password_baru } = req.body;
  if (!password_lama || !password_baru) return fail(res, 'password_lama dan password_baru wajib diisi.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password_lama, user.password_hash)) return fail(res, 'Password lama salah.', 401);
  const hash = bcrypt.hashSync(password_baru, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  return ok(res, null, 'Password berhasil diubah.');
});

module.exports = router;
