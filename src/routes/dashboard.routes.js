const router = require('express').Router();
const db = require('../db');
const { ok } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

// ==== RINGKASAN UTAMA (untuk kartu statistik di dashboard) ====
router.get('/ringkasan', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const scopeSekolah = req.user.role === 'admin_sekolah';
  const sekolahFilter = scopeSekolah ? 'WHERE sekolah_id = ?' : '';
  const args = scopeSekolah ? [req.user.sekolah_id] : [];

  const totalSekolah = scopeSekolah ? 1 : db.prepare('SELECT COUNT(*) as c FROM sekolah').get().c;
  const totalSiswa = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role='siswa' ${scopeSekolah ? 'AND sekolah_id = ?' : ''}`).get(...args).c;
  const totalGuru = db.prepare(`SELECT COUNT(*) as c FROM users WHERE role='guru' ${scopeSekolah ? 'AND sekolah_id = ?' : ''}`).get(...args).c;
  const totalPPDBDiajukan = db.prepare("SELECT COUNT(*) as c FROM ppdb_pendaftaran WHERE status IN ('diajukan','verifikasi')").get().c;
  const totalPengaduanAktif = db.prepare("SELECT COUNT(*) as c FROM pengaduan WHERE status NOT IN ('selesai','ditolak')").get().c;
  const totalTagihanBelumLunas = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(jumlah),0) as total FROM pembayaran WHERE status='pending'").get();

  return ok(res, {
    total_sekolah: totalSekolah,
    total_siswa: totalSiswa,
    total_guru: totalGuru,
    ppdb_menunggu_verifikasi: totalPPDBDiajukan,
    pengaduan_aktif: totalPengaduanAktif,
    tagihan_belum_lunas: totalTagihanBelumLunas
  });
});

// ==== STATISTIK KELULUSAN / TINGKAT KEHADIRAN (real-time, per sekolah) ====
router.get('/kehadiran', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { tanggal } = req.query;
  const tgl = tanggal || new Date().toISOString().slice(0, 10);
  const scopeSekolah = req.user.role === 'admin_sekolah';

  const rows = db.prepare(
    `SELECT s.id as sekolah_id, s.nama as nama_sekolah,
       COUNT(DISTINCT u.id) as total_siswa,
       COUNT(DISTINCT CASE WHEN p.status='hadir' THEN p.siswa_id END) as hadir
     FROM sekolah s
     LEFT JOIN users u ON u.sekolah_id = s.id AND u.role = 'siswa'
     LEFT JOIN presensi p ON p.siswa_id = u.id AND p.tanggal = ?
     ${scopeSekolah ? 'WHERE s.id = ?' : ''}
     GROUP BY s.id`
  ).all(...(scopeSekolah ? [tgl, req.user.sekolah_id] : [tgl]));

  return ok(res, rows);
});

// ==== DISTRIBUSI FASILITAS & JUMLAH SISWA PER JENJANG ====
router.get('/distribusi-jenjang', authenticate, authorize('admin_dinas'), (req, res) => {
  const rows = db.prepare(
    `SELECT s.jenjang, COUNT(DISTINCT s.id) as jumlah_sekolah, COUNT(DISTINCT u.id) as jumlah_siswa
     FROM sekolah s LEFT JOIN users u ON u.sekolah_id = s.id AND u.role = 'siswa'
     GROUP BY s.jenjang`
  ).all();
  return ok(res, rows);
});

// ==== PENYALURAN ANGGARAN BOS (untuk grafik dashboard) ====
router.get('/anggaran', authenticate, authorize('admin_dinas'), (req, res) => {
  const rows = db.prepare(
    `SELECT tahun, SUM(jumlah_diterima) as total_diterima, SUM(jumlah_terpakai) as total_terpakai
     FROM anggaran_bos GROUP BY tahun ORDER BY tahun DESC`
  ).all();
  return ok(res, rows);
});

module.exports = router;
