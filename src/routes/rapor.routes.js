const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

function canViewSiswa(req, siswaId) {
  if (['admin_dinas', 'admin_sekolah', 'guru'].includes(req.user.role)) return true;
  if (req.user.role === 'siswa' && req.user.id == siswaId) return true;
  if (req.user.role === 'orang_tua') {
    const relasi = db.prepare('SELECT 1 FROM wali_siswa WHERE orang_tua_id = ? AND siswa_id = ?').get(req.user.id, siswaId);
    return !!relasi;
  }
  return false;
}

// ==== INPUT NILAI (guru) ====
router.post('/', authenticate, authorize('guru'), (req, res) => {
  const { siswa_id, kelas_id, semester, tahun_ajaran, mapel, nilai_pengetahuan, nilai_keterampilan, nilai_sikap, catatan_guru } = req.body;
  if (!siswa_id || !mapel || !semester || !tahun_ajaran) return fail(res, 'Data rapor tidak lengkap.');
  const info = db.prepare(
    `INSERT INTO rapor (siswa_id, kelas_id, semester, tahun_ajaran, mapel, nilai_pengetahuan, nilai_keterampilan, nilai_sikap, catatan_guru, guru_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(siswa_id, kelas_id, semester, tahun_ajaran, mapel, nilai_pengetahuan, nilai_keterampilan, nilai_sikap, catatan_guru, req.user.id);
  return created(res, { id: info.lastInsertRowid });
});

// ==== RIWAYAT RAPOR SISWA (siswa sendiri / ortu / guru / admin) ====
router.get('/siswa/:siswa_id', authenticate, (req, res) => {
  if (!canViewSiswa(req, req.params.siswa_id)) return fail(res, 'Tidak memiliki akses ke data ini.', 403);
  const { semester, tahun_ajaran } = req.query;
  let sql = 'SELECT * FROM rapor WHERE siswa_id = ?';
  const params = [req.params.siswa_id];
  if (semester) { sql += ' AND semester = ?'; params.push(semester); }
  if (tahun_ajaran) { sql += ' AND tahun_ajaran = ?'; params.push(tahun_ajaran); }
  sql += ' ORDER BY tahun_ajaran DESC, semester DESC, mapel ASC';
  return ok(res, db.prepare(sql).all(...params));
});

router.put('/:id', authenticate, authorize('guru'), (req, res) => {
  const f = req.body;
  db.prepare(
    `UPDATE rapor SET nilai_pengetahuan=COALESCE(?,nilai_pengetahuan), nilai_keterampilan=COALESCE(?,nilai_keterampilan),
     nilai_sikap=COALESCE(?,nilai_sikap), catatan_guru=COALESCE(?,catatan_guru) WHERE id=?`
  ).run(f.nilai_pengetahuan, f.nilai_keterampilan, f.nilai_sikap, f.catatan_guru, req.params.id);
  return ok(res, null, 'Nilai rapor diperbarui.');
});

module.exports = router;
