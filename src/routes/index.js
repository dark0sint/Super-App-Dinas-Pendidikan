const router = require('express').Router();

router.use('/auth', require('./auth.routes'));               // SSO: login, register, profil
router.use('/users', require('./users.routes'));              // Manajemen pengguna & relasi wali-siswa
router.use('/sekolah', require('./sekolah.routes'));           // Data master sekolah

router.use('/ppdb', require('./ppdb.routes'));                 // 1. PPDB

router.use('/kelas', require('./kelas.routes'));               // 1. E-Learning
router.use('/materi', require('./materi.routes'));
router.use('/tugas', require('./tugas.routes'));
router.use('/ujian', require('./ujian.routes'));
router.use('/rapor', require('./rapor.routes'));
router.use('/perpustakaan', require('./perpustakaan.routes'));

router.use('/presensi', require('./presensi.routes'));         // 2. Monitoring Orang Tua
router.use('/pembayaran', require('./pembayaran.routes'));
router.use('/komunikasi', require('./komunikasi.routes'));

router.use('/rpp', require('./rpp.routes'));                   // 3. Guru & Tendik
router.use('/kepegawaian', require('./kepegawaian.routes'));
router.use('/pelatihan', require('./pelatihan.routes'));

router.use('/dashboard', require('./dashboard.routes'));       // 4. Dinas & Manajemen Internal
router.use('/anggaran', require('./anggaran.routes'));
router.use('/pengaduan', require('./pengaduan.routes'));

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Super App Dinas Pendidikan API',
    version: '1.0.0',
    dokumentasi: 'Lihat README.md untuk daftar lengkap endpoint.'
  });
});

module.exports = router;
