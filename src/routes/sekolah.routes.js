const router = require('express').Router();
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', (req, res) => {
  const { jenjang, q } = req.query;
  let sql = 'SELECT * FROM sekolah WHERE 1=1';
  const params = [];
  if (jenjang) { sql += ' AND jenjang = ?'; params.push(jenjang); }
  if (q) { sql += ' AND nama LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY nama ASC';
  return ok(res, db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sekolah WHERE id = ?').get(req.params.id);
  if (!row) return notFound(res);
  return ok(res, row);
});

router.post('/', authenticate, authorize('admin_dinas'), (req, res) => {
  const { npsn, nama, jenjang, alamat, latitude, longitude, kuota_zonasi, kuota_prestasi, kuota_afirmasi } = req.body;
  if (!nama) return fail(res, 'Nama sekolah wajib diisi.');
  const info = db.prepare(
    `INSERT INTO sekolah (npsn, nama, jenjang, alamat, latitude, longitude, kuota_zonasi, kuota_prestasi, kuota_afirmasi)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(npsn, nama, jenjang || 'SD', alamat, latitude, longitude, kuota_zonasi || 0, kuota_prestasi || 0, kuota_afirmasi || 0);
  return created(res, { id: info.lastInsertRowid });
});

router.put('/:id', authenticate, authorize('admin_dinas'), (req, res) => {
  const f = req.body;
  db.prepare(
    `UPDATE sekolah SET nama=COALESCE(?,nama), jenjang=COALESCE(?,jenjang), alamat=COALESCE(?,alamat),
     latitude=COALESCE(?,latitude), longitude=COALESCE(?,longitude), kuota_zonasi=COALESCE(?,kuota_zonasi),
     kuota_prestasi=COALESCE(?,kuota_prestasi), kuota_afirmasi=COALESCE(?,kuota_afirmasi) WHERE id=?`
  ).run(f.nama, f.jenjang, f.alamat, f.latitude, f.longitude, f.kuota_zonasi, f.kuota_prestasi, f.kuota_afirmasi, req.params.id);
  return ok(res, null, 'Data sekolah diperbarui.');
});

router.delete('/:id', authenticate, authorize('admin_dinas'), (req, res) => {
  db.prepare('DELETE FROM sekolah WHERE id = ?').run(req.params.id);
  return ok(res, null, 'Sekolah dihapus.');
});

module.exports = router;
