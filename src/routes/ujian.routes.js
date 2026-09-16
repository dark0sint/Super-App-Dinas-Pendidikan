const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

// ==== BUAT UJIAN ====
router.post('/', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  const { kelas_id, judul, mapel, waktu_mulai, durasi_menit, acak_soal } = req.body;
  if (!kelas_id || !judul) return fail(res, 'kelas_id dan judul wajib diisi.');
  const info = db.prepare(
    `INSERT INTO ujian (kelas_id, guru_id, judul, mapel, waktu_mulai, durasi_menit, acak_soal) VALUES (?,?,?,?,?,?,?)`
  ).run(kelas_id, req.user.id, judul, mapel, waktu_mulai, durasi_menit || 60, acak_soal ? 1 : 0);
  return created(res, { id: info.lastInsertRowid });
});

router.get('/', authenticate, (req, res) => {
  const { kelas_id } = req.query;
  let sql = 'SELECT * FROM ujian WHERE 1=1';
  const params = [];
  if (kelas_id) { sql += ' AND kelas_id = ?'; params.push(kelas_id); }
  else if (req.user.role === 'siswa') {
    sql += ' AND kelas_id IN (SELECT kelas_id FROM kelas_siswa WHERE siswa_id = ?)';
    params.push(req.user.id);
  }
  return ok(res, db.prepare(sql).all(...params));
});

// ==== TAMBAH SOAL (guru) ====
router.post('/:id/soal', authenticate, authorize('guru'), (req, res) => {
  const { pertanyaan, pilihan_a, pilihan_b, pilihan_c, pilihan_d, jawaban_benar, bobot } = req.body;
  if (!pertanyaan || !jawaban_benar) return fail(res, 'pertanyaan dan jawaban_benar wajib diisi.');
  const info = db.prepare(
    `INSERT INTO soal_ujian (ujian_id, pertanyaan, pilihan_a, pilihan_b, pilihan_c, pilihan_d, jawaban_benar, bobot)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(req.params.id, pertanyaan, pilihan_a, pilihan_b, pilihan_c, pilihan_d, jawaban_benar, bobot || 1);
  return created(res, { id: info.lastInsertRowid });
});

// Guru: lihat semua soal beserta kunci jawaban
router.get('/:id/soal', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  return ok(res, db.prepare('SELECT * FROM soal_ujian WHERE ujian_id = ?').all(req.params.id));
});

// Siswa: mulai ujian -> soal ditampilkan TANPA kunci jawaban
router.post('/:id/mulai', authenticate, authorize('siswa'), (req, res) => {
  const ujian = db.prepare('SELECT * FROM ujian WHERE id = ?').get(req.params.id);
  if (!ujian) return notFound(res, 'Ujian tidak ditemukan.');

  let hasil = db.prepare('SELECT * FROM ujian_hasil WHERE ujian_id = ? AND siswa_id = ?').get(req.params.id, req.user.id);
  if (!hasil) {
    const info = db.prepare(
      `INSERT INTO ujian_hasil (ujian_id, siswa_id, mulai_at, status) VALUES (?,?,?,?)`
    ).run(req.params.id, req.user.id, new Date().toISOString(), 'berlangsung');
    hasil = { id: info.lastInsertRowid };
  } else if (hasil.status === 'selesai') {
    return fail(res, 'Anda sudah menyelesaikan ujian ini.', 409);
  }

  let soal = db.prepare('SELECT id, pertanyaan, pilihan_a, pilihan_b, pilihan_c, pilihan_d, bobot FROM soal_ujian WHERE ujian_id = ?').all(req.params.id);
  if (ujian.acak_soal) soal = soal.sort(() => Math.random() - 0.5);

  return ok(res, { ujian, soal, hasil_id: hasil.id });
});

// Siswa: submit jawaban -> otomatis dinilai
router.post('/:id/submit', authenticate, authorize('siswa'), (req, res) => {
  const { jawaban } = req.body; // { soal_id: 'a'|'b'|'c'|'d', ... }
  if (!jawaban || typeof jawaban !== 'object') return fail(res, 'jawaban wajib berupa objek {soal_id: pilihan}.');

  const soalList = db.prepare('SELECT * FROM soal_ujian WHERE ujian_id = ?').all(req.params.id);
  let totalBobot = 0, skorDiperoleh = 0;
  for (const soal of soalList) {
    totalBobot += soal.bobot;
    const jawabanSiswa = jawaban[soal.id];
    if (jawabanSiswa && jawabanSiswa === soal.jawaban_benar) skorDiperoleh += soal.bobot;
  }
  const nilai = totalBobot > 0 ? Math.round((skorDiperoleh / totalBobot) * 10000) / 100 : 0;

  const result = db.prepare(
    `UPDATE ujian_hasil SET jawaban_json = ?, nilai = ?, selesai_at = ?, status = 'selesai'
     WHERE ujian_id = ? AND siswa_id = ?`
  ).run(JSON.stringify(jawaban), nilai, new Date().toISOString(), req.params.id, req.user.id);

  if (result.changes === 0) return fail(res, 'Sesi ujian belum dimulai.', 400);
  return ok(res, { nilai }, 'Ujian selesai dan dinilai otomatis.');
});

// Rekap hasil ujian untuk guru
router.get('/:id/hasil', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  const rows = db.prepare(
    `SELECT uh.*, u.nama as nama_siswa, u.nik_nisn FROM ujian_hasil uh
     JOIN users u ON u.id = uh.siswa_id WHERE uh.ujian_id = ?`
  ).all(req.params.id);
  return ok(res, rows);
});

module.exports = router;
