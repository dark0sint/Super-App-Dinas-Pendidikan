const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');
const { makeUploader, fileUrl } = require('../middleware/upload');

const uploadTugas = makeUploader('tugas');

// ==== DAFTAR TUGAS ====
router.get('/', authenticate, (req, res) => {
  const { kelas_id } = req.query;
  let sql = 'SELECT * FROM tugas WHERE 1=1';
  const params = [];
  if (kelas_id) { sql += ' AND kelas_id = ?'; params.push(kelas_id); }
  else if (req.user.role === 'siswa') {
    sql += ' AND kelas_id IN (SELECT kelas_id FROM kelas_siswa WHERE siswa_id = ?)';
    params.push(req.user.id);
  }
  sql += ' ORDER BY deadline ASC';
  return ok(res, db.prepare(sql).all(...params));
});

router.post('/', authenticate, authorize('guru', 'admin_sekolah'), uploadTugas.single('file'), (req, res) => {
  const { kelas_id, judul, deskripsi, mapel, deadline } = req.body;
  if (!kelas_id || !judul) return fail(res, 'kelas_id dan judul wajib diisi.');
  const fileUrlVal = req.file ? fileUrl(req, 'tugas', req.file.filename) : null;
  const info = db.prepare(
    `INSERT INTO tugas (kelas_id, guru_id, judul, deskripsi, mapel, deadline, file_url) VALUES (?,?,?,?,?,?,?)`
  ).run(kelas_id, req.user.id, judul, deskripsi, mapel, deadline, fileUrlVal);
  return created(res, { id: info.lastInsertRowid });
});

// ==== SISWA MENGUMPULKAN TUGAS (mendukung sinkronisasi offline) ====
router.post('/:id/submit', authenticate, authorize('siswa'), uploadTugas.single('file'), (req, res) => {
  const { catatan, submitted_at_offline } = req.body;
  const tugas = db.prepare('SELECT * FROM tugas WHERE id = ?').get(req.params.id);
  if (!tugas) return notFound(res, 'Tugas tidak ditemukan.');

  const fileUrlVal = req.file ? fileUrl(req, 'tugas', req.file.filename) : null;
  const status = tugas.deadline && new Date() > new Date(tugas.deadline) ? 'terlambat' : 'dikumpulkan';
  const isOffline = submitted_at_offline ? 1 : 0;

  try {
    const info = db.prepare(
      `INSERT INTO tugas_submission (tugas_id, siswa_id, file_url, catatan, status, submitted_at, synced_offline)
       VALUES (?,?,?,?,?,?,?)`
    ).run(req.params.id, req.user.id, fileUrlVal, catatan || null, status, submitted_at_offline || new Date().toISOString(), isOffline);
    return created(res, { id: info.lastInsertRowid, status }, 'Tugas berhasil dikumpulkan.');
  } catch (e) {
    // sudah pernah submit -> update
    db.prepare(
      `UPDATE tugas_submission SET file_url = COALESCE(?, file_url), catatan = COALESCE(?, catatan), status = ?
       WHERE tugas_id = ? AND siswa_id = ?`
    ).run(fileUrlVal, catatan, status, req.params.id, req.user.id);
    return ok(res, null, 'Pengumpulan tugas diperbarui.');
  }
});

// ==== GURU MELIHAT & MENILAI PENGUMPULAN ====
router.get('/:id/submissions', authenticate, authorize('guru', 'admin_sekolah'), (req, res) => {
  const rows = db.prepare(
    `SELECT ts.*, u.nama as nama_siswa, u.nik_nisn FROM tugas_submission ts
     JOIN users u ON u.id = ts.siswa_id WHERE ts.tugas_id = ?`
  ).all(req.params.id);
  return ok(res, rows);
});

router.patch('/submissions/:submission_id/nilai', authenticate, authorize('guru'), (req, res) => {
  const { nilai, feedback_guru } = req.body;
  db.prepare(`UPDATE tugas_submission SET nilai = ?, feedback_guru = ?, status = 'dinilai' WHERE id = ?`)
    .run(nilai, feedback_guru || null, req.params.submission_id);
  return ok(res, null, 'Nilai tugas tersimpan.');
});

// ==== SYNC BATCH OFFLINE (client mengirim antrean tugas yang dikumpulkan saat tanpa sinyal) ====
router.post('/sync-offline', authenticate, authorize('siswa'), (req, res) => {
  const { items } = req.body; // [{tugas_id, catatan, submitted_at_offline}]
  if (!Array.isArray(items)) return fail(res, 'items harus berupa array.');
  const insert = db.prepare(
    `INSERT OR IGNORE INTO tugas_submission (tugas_id, siswa_id, catatan, status, submitted_at, synced_offline)
     VALUES (?,?,?,?,?,1)`
  );
  const tx = db.transaction((rows) => {
    for (const it of rows) insert.run(it.tugas_id, req.user.id, it.catatan || null, 'dikumpulkan', it.submitted_at_offline);
  });
  tx(items);
  return ok(res, { synced: items.length }, 'Sinkronisasi data offline berhasil.');
});

module.exports = router;
