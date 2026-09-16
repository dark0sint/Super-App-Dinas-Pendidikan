require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./index');

function upsertUser({ nik_nisn, password, role, nama, email }) {
  const existing = db.prepare('SELECT id FROM users WHERE nik_nisn = ?').get(nik_nisn);
  if (existing) {
    console.log(`User ${nik_nisn} sudah ada, dilewati.`);
    return existing.id;
  }
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    `INSERT INTO users (nik_nisn, password_hash, role, nama, email) VALUES (?,?,?,?,?)`
  ).run(nik_nisn, hash, role, nama, email);
  console.log(`User ${role} '${nama}' dibuat (NIK/NISN: ${nik_nisn}).`);
  return info.lastInsertRowid;
}

function seed() {
  // 1. Superadmin Dinas
  const superadminNik = process.env.SUPERADMIN_NIK || '1000000000000001';
  const superadminPass = process.env.SUPERADMIN_PASSWORD || 'Admin#12345';
  upsertUser({
    nik_nisn: superadminNik,
    password: superadminPass,
    role: 'admin_dinas',
    nama: 'Administrator Dinas Pendidikan',
    email: 'admin@dindik.go.id'
  });

  // 2. Contoh sekolah
  const sekolahExists = db.prepare('SELECT id FROM sekolah LIMIT 1').get();
  let sekolahId;
  if (!sekolahExists) {
    const info = db.prepare(
      `INSERT INTO sekolah (npsn, nama, jenjang, alamat, latitude, longitude, kuota_zonasi, kuota_prestasi, kuota_afirmasi)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run('12345678', 'SDN Contoh 1', 'SD', 'Jl. Pendidikan No. 1', -6.200000, 106.816666, 60, 20, 20);
    sekolahId = info.lastInsertRowid;
    console.log(`Sekolah contoh dibuat (id: ${sekolahId}).`);
  } else {
    sekolahId = sekolahExists.id;
  }

  // 3. Contoh admin sekolah & guru
  upsertUser({
    nik_nisn: '2000000000000001',
    password: 'Sekolah#123',
    role: 'admin_sekolah',
    nama: 'Admin SDN Contoh 1',
    email: 'admin.sekolah1@dindik.go.id'
  });
  const guruId = upsertUser({
    nik_nisn: '3000000000000001',
    password: 'Guru#12345',
    role: 'guru',
    nama: 'Budi Santoso, S.Pd',
    email: 'budi.guru@dindik.go.id'
  });

  // set sekolah_id untuk guru & admin sekolah
  db.prepare('UPDATE users SET sekolah_id = ? WHERE role IN (?, ?) AND sekolah_id IS NULL')
    .run(sekolahId, 'admin_sekolah', 'guru');

  // 4. Contoh siswa & orang tua
  const siswaId = upsertUser({
    nik_nisn: '4000000000000001',
    password: 'Siswa#12345',
    role: 'siswa',
    nama: 'Andi Pratama',
    email: null
  });
  db.prepare('UPDATE users SET sekolah_id = ? WHERE id = ?').run(sekolahId, siswaId);

  const ortuId = upsertUser({
    nik_nisn: '5000000000000001',
    password: 'Ortu#12345',
    role: 'orang_tua',
    nama: 'Ibu Sri Wahyuni',
    email: null
  });
  const relasi = db.prepare('SELECT id FROM wali_siswa WHERE orang_tua_id=? AND siswa_id=?').get(ortuId, siswaId);
  if (!relasi) {
    db.prepare('INSERT INTO wali_siswa (orang_tua_id, siswa_id, hubungan) VALUES (?,?,?)').run(ortuId, siswaId, 'ibu');
  }

  // 5. Contoh kelas & masukkan siswa
  let kelas = db.prepare('SELECT id FROM kelas WHERE sekolah_id = ? LIMIT 1').get(sekolahId);
  let kelasId;
  if (!kelas) {
    const info = db.prepare(
      'INSERT INTO kelas (sekolah_id, nama, tingkat, wali_guru_id, tahun_ajaran) VALUES (?,?,?,?,?)'
    ).run(sekolahId, 'Kelas 6A', '6', guruId, '2026/2027');
    kelasId = info.lastInsertRowid;
  } else {
    kelasId = kelas.id;
  }
  const anggota = db.prepare('SELECT id FROM kelas_siswa WHERE kelas_id=? AND siswa_id=?').get(kelasId, siswaId);
  if (!anggota) {
    db.prepare('INSERT INTO kelas_siswa (kelas_id, siswa_id) VALUES (?,?)').run(kelasId, siswaId);
  }

  console.log('\n=== SEED SELESAI ===');
  console.log(`Login Admin Dinas -> NIK: ${superadminNik} | Password: ${superadminPass}`);
  console.log('Login Admin Sekolah -> NIK: 2000000000000001 | Password: Sekolah#123');
  console.log('Login Guru -> NIK: 3000000000000001 | Password: Guru#12345');
  console.log('Login Siswa -> NIK: 4000000000000001 | Password: Siswa#12345');
  console.log('Login Orang Tua -> NIK: 5000000000000001 | Password: Ortu#12345');
}

seed();
