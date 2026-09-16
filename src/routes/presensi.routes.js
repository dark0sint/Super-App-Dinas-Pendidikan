const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize, verifyDeviceSecret } = require('../middleware/auth');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ==== WEBHOOK dari perangkat Face Recognition / Kartu Pintar ====
// Dipanggil oleh perangkat di gerbang sekolah, bukan oleh user login biasa.
router.post('/device-webhook', verifyDeviceSecret, (req, res) => {
  const { nik_nisn, tipe, metode, device_id, lokasi } = req.body; // tipe: 'masuk' | 'pulang'
  if (!nik_nisn || !tipe) return fail(res, 'nik_nisn dan tipe (masuk/pulang) wajib diisi.');

  const siswa = db.prepare("SELECT id FROM users WHERE nik_nisn = ? AND role = 'siswa'").get(nik_nisn);
  if (!siswa) return notFound(res, 'Siswa tidak ditemukan.');

  const tanggal = todayStr();
  const jam = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM presensi WHERE siswa_id = ? AND tanggal = ?').get(siswa.id, tanggal);

  if (!existing) {
    db.prepare(
      `INSERT INTO presensi (siswa_id, tanggal, jam_masuk, metode, status, lokasi, device_id) VALUES (?,?,?,?,?,?,?)`
    ).run(siswa.id, tanggal, tipe === 'masuk' ? jam : null, metode || 'face_recognition', 'hadir', lokasi, device_id);
  } else if (tipe === 'pulang') {
    db.prepare('UPDATE presensi SET jam_pulang = ? WHERE id = ?').run(jam, existing.id);
  } else if (tipe === 'masuk' && !existing.jam_masuk) {
    db.prepare('UPDATE presensi SET jam_masuk = ? WHERE id = ?').run(jam, existing.id);
  }

  // NOTE: Untuk notifikasi real-time ke orang tua, hubungkan endpoint ini
  // dengan layanan push notification (FCM/WebSocket) di lapisan produksi.
  return ok(res, { siswa_id: siswa.id, tanggal, tipe, waktu: jam }, 'Presensi tercatat.');
});

// ==== INPUT MANUAL (guru/staf, untuk izin/sakit/alpa) ====
router.post('/manual', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  const { siswa_id, tanggal, status, lokasi } = req.body;
  if (!siswa_id || !status) return fail(res, 'siswa_id dan status wajib diisi.');
  const tgl = tanggal || todayStr();
  db.prepare(
    `INSERT INTO presensi (siswa_id, tanggal, status, metode, lokasi) VALUES (?,?,?,?,?)
     ON CONFLICT(siswa_id, tanggal) DO UPDATE SET status = excluded.status`
  ).run(siswa_id, tgl, status, 'manual', lokasi || null);
  return created(res, null, 'Presensi manual tersimpan.');
});

// ==== SYNC OFFLINE (aplikasi kartu/HP guru merekam lalu sync saat online) ====
router.post('/sync-offline', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  const { items } = req.body; // [{siswa_id, tanggal, status, jam_masuk, jam_pulang}]
  if (!Array.isArray(items)) return fail(res, 'items harus array.');
  const stmt = db.prepare(
    `INSERT INTO presensi (siswa_id, tanggal, jam_masuk, jam_pulang, status, metode, synced_offline)
     VALUES (?,?,?,?,?, 'manual', 1)
     ON CONFLICT(siswa_id, tanggal) DO UPDATE SET
       jam_masuk = COALESCE(excluded.jam_masuk, presensi.jam_masuk),
       jam_pulang = COALESCE(excluded.jam_pulang, presensi.jam_pulang),
       status = excluded.status`
  );
  const tx = db.transaction((rows) => { for (const it of rows) stmt.run(it.siswa_id, it.tanggal, it.jam_masuk, it.jam_pulang, it.status); });
  tx(items);
  return ok(res, { synced: items.length }, 'Sinkronisasi presensi offline berhasil.');
});

// ==== RIWAYAT PRESENSI SISWA (untuk siswa/ortu/guru) ====
router.get('/siswa/:siswa_id', authenticate, (req, res) => {
  if (req.user.role === 'orang_tua') {
    const relasi = db.prepare('SELECT 1 FROM wali_siswa WHERE orang_tua_id=? AND siswa_id=?').get(req.user.id, req.params.siswa_id);
    if (!relasi) return fail(res, 'Tidak memiliki akses ke data anak ini.', 403);
  }
  const { bulan } = req.query; // format YYYY-MM
  let sql = 'SELECT * FROM presensi WHERE siswa_id = ?';
  const params = [req.params.siswa_id];
  if (bulan) { sql += " AND strftime('%Y-%m', tanggal) = ?"; params.push(bulan); }
  sql += ' ORDER BY tanggal DESC';
  return ok(res, db.prepare(sql).all(...params));
});

// ==== REKAP PRESENSI KELAS (guru) ====
router.get('/kelas/:kelas_id', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  const { tanggal } = req.query;
  const tgl = tanggal || todayStr();
  const rows = db.prepare(
    `SELECT u.id as siswa_id, u.nama, p.status, p.jam_masuk, p.jam_pulang
     FROM kelas_siswa ks JOIN users u ON u.id = ks.siswa_id
     LEFT JOIN presensi p ON p.siswa_id = u.id AND p.tanggal = ?
     WHERE ks.kelas_id = ?`
  ).all(tgl, req.params.kelas_id);
  return ok(res, rows);
});

module.exports = router;
