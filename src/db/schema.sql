-- =========================================================
-- SUPER APP DINAS PENDIDIKAN - DATABASE SCHEMA (SQLite)
-- =========================================================
PRAGMA foreign_keys = ON;

-- ============ 0. SSO / USERS ============
CREATE TABLE IF NOT EXISTS sekolah (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npsn TEXT UNIQUE,
  nama TEXT NOT NULL,
  jenjang TEXT CHECK(jenjang IN ('PAUD','TK','SD','SMP','SMA','SMK')) DEFAULT 'SD',
  alamat TEXT,
  latitude REAL,
  longitude REAL,
  kuota_zonasi INTEGER DEFAULT 0,
  kuota_prestasi INTEGER DEFAULT 0,
  kuota_afirmasi INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nik_nisn TEXT UNIQUE NOT NULL,           -- Satu akun untuk semua layanan (SSO)
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('siswa','orang_tua','guru','staf_sekolah','admin_sekolah','admin_dinas')),
  nama TEXT NOT NULL,
  email TEXT,
  telepon TEXT,
  sekolah_id INTEGER,
  aktif INTEGER DEFAULT 1,
  refresh_token TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sekolah_id) REFERENCES sekolah(id)
);

-- Relasi anak <-> orang tua (many to many, karena satu ortu bisa punya banyak anak)
CREATE TABLE IF NOT EXISTS wali_siswa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orang_tua_id INTEGER NOT NULL,
  siswa_id INTEGER NOT NULL,
  hubungan TEXT DEFAULT 'orang_tua',
  FOREIGN KEY (orang_tua_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (siswa_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(orang_tua_id, siswa_id)
);

-- ============ 1. PPDB ============
CREATE TABLE IF NOT EXISTS ppdb_pendaftaran (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nik_calon TEXT NOT NULL,
  nama_calon TEXT NOT NULL,
  tanggal_lahir TEXT,
  alamat TEXT,
  latitude REAL,
  longitude REAL,
  sekolah_tujuan_id INTEGER NOT NULL,
  jalur TEXT CHECK(jalur IN ('zonasi','prestasi','afirmasi','perpindahan')) NOT NULL,
  nilai_prestasi REAL DEFAULT 0,
  dokumen_url TEXT,
  jarak_km REAL,
  status TEXT CHECK(status IN ('diajukan','verifikasi','diterima','ditolak','cadangan')) DEFAULT 'diajukan',
  catatan TEXT,
  user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sekolah_tujuan_id) REFERENCES sekolah(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============ 2. E-LEARNING ============
CREATE TABLE IF NOT EXISTS kelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sekolah_id INTEGER NOT NULL,
  nama TEXT NOT NULL,
  tingkat TEXT,
  wali_guru_id INTEGER,
  tahun_ajaran TEXT,
  FOREIGN KEY (sekolah_id) REFERENCES sekolah(id),
  FOREIGN KEY (wali_guru_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS kelas_siswa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id INTEGER NOT NULL,
  siswa_id INTEGER NOT NULL,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id) ON DELETE CASCADE,
  FOREIGN KEY (siswa_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(kelas_id, siswa_id)
);

CREATE TABLE IF NOT EXISTS materi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id INTEGER NOT NULL,
  guru_id INTEGER NOT NULL,
  judul TEXT NOT NULL,
  deskripsi TEXT,
  mapel TEXT,
  file_url TEXT,
  video_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id),
  FOREIGN KEY (guru_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tugas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id INTEGER NOT NULL,
  guru_id INTEGER NOT NULL,
  judul TEXT NOT NULL,
  deskripsi TEXT,
  mapel TEXT,
  deadline TEXT,
  file_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id),
  FOREIGN KEY (guru_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tugas_submission (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tugas_id INTEGER NOT NULL,
  siswa_id INTEGER NOT NULL,
  file_url TEXT,
  catatan TEXT,
  nilai REAL,
  feedback_guru TEXT,
  status TEXT CHECK(status IN ('dikumpulkan','dinilai','terlambat')) DEFAULT 'dikumpulkan',
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  synced_offline INTEGER DEFAULT 0,
  FOREIGN KEY (tugas_id) REFERENCES tugas(id),
  FOREIGN KEY (siswa_id) REFERENCES users(id),
  UNIQUE(tugas_id, siswa_id)
);

CREATE TABLE IF NOT EXISTS ujian (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id INTEGER NOT NULL,
  guru_id INTEGER NOT NULL,
  judul TEXT NOT NULL,
  mapel TEXT,
  jenis TEXT DEFAULT 'CBT',
  waktu_mulai TEXT,
  durasi_menit INTEGER DEFAULT 60,
  acak_soal INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kelas_id) REFERENCES kelas(id),
  FOREIGN KEY (guru_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS soal_ujian (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ujian_id INTEGER NOT NULL,
  pertanyaan TEXT NOT NULL,
  pilihan_a TEXT, pilihan_b TEXT, pilihan_c TEXT, pilihan_d TEXT,
  jawaban_benar TEXT CHECK(jawaban_benar IN ('a','b','c','d')),
  bobot REAL DEFAULT 1,
  FOREIGN KEY (ujian_id) REFERENCES ujian(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ujian_hasil (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ujian_id INTEGER NOT NULL,
  siswa_id INTEGER NOT NULL,
  jawaban_json TEXT,
  nilai REAL,
  mulai_at TEXT,
  selesai_at TEXT,
  status TEXT CHECK(status IN ('berlangsung','selesai')) DEFAULT 'berlangsung',
  FOREIGN KEY (ujian_id) REFERENCES ujian(id),
  FOREIGN KEY (siswa_id) REFERENCES users(id),
  UNIQUE(ujian_id, siswa_id)
);

-- ============ 3. RAPOR ============
CREATE TABLE IF NOT EXISTS rapor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL,
  kelas_id INTEGER,
  semester TEXT CHECK(semester IN ('ganjil','genap')),
  tahun_ajaran TEXT,
  mapel TEXT NOT NULL,
  nilai_pengetahuan REAL,
  nilai_keterampilan REAL,
  nilai_sikap TEXT,
  catatan_guru TEXT,
  guru_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (siswa_id) REFERENCES users(id),
  FOREIGN KEY (guru_id) REFERENCES users(id)
);

-- ============ 4. PERPUSTAKAAN DIGITAL ============
CREATE TABLE IF NOT EXISTS ebook (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judul TEXT NOT NULL,
  penulis TEXT,
  kategori TEXT CHECK(kategori IN ('materi_pelajaran','literasi_umum','jurnal')) DEFAULT 'literasi_umum',
  deskripsi TEXT,
  file_url TEXT NOT NULL,
  cover_url TEXT,
  jenjang TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============ 5. PRESENSI ============
CREATE TABLE IF NOT EXISTS presensi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  jam_masuk TEXT,
  jam_pulang TEXT,
  metode TEXT CHECK(metode IN ('face_recognition','kartu_pintar','manual')) DEFAULT 'manual',
  status TEXT CHECK(status IN ('hadir','izin','sakit','alpa','terlambat')) DEFAULT 'hadir',
  lokasi TEXT,
  device_id TEXT,
  synced_offline INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (siswa_id) REFERENCES users(id),
  UNIQUE(siswa_id, tanggal)
);

-- ============ 6. PEMBAYARAN ============
CREATE TABLE IF NOT EXISTS pembayaran (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL,
  jenis TEXT CHECK(jenis IN ('spp','seragam','buku','kegiatan','lainnya')) NOT NULL,
  deskripsi TEXT,
  periode TEXT,
  jumlah REAL NOT NULL,
  status TEXT CHECK(status IN ('pending','paid','failed','expired')) DEFAULT 'pending',
  order_id TEXT UNIQUE,
  payment_gateway_ref TEXT,
  metode_pembayaran TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  FOREIGN KEY (siswa_id) REFERENCES users(id)
);

-- ============ 7. KOMUNIKASI (Chat & Forum) ============
CREATE TABLE IF NOT EXISTS pesan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dari_user_id INTEGER NOT NULL,
  ke_user_id INTEGER NOT NULL,
  isi TEXT NOT NULL,
  dibaca INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dari_user_id) REFERENCES users(id),
  FOREIGN KEY (ke_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS forum_topik (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sekolah_id INTEGER,
  judul TEXT NOT NULL,
  isi TEXT,
  dibuat_oleh INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dibuat_oleh) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS forum_balasan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topik_id INTEGER NOT NULL,
  isi TEXT NOT NULL,
  dibuat_oleh INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topik_id) REFERENCES forum_topik(id) ON DELETE CASCADE,
  FOREIGN KEY (dibuat_oleh) REFERENCES users(id)
);

-- ============ 8. RPP / SILABUS ============
CREATE TABLE IF NOT EXISTS rpp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guru_id INTEGER NOT NULL,
  mapel TEXT NOT NULL,
  kelas TEXT,
  semester TEXT,
  tahun_ajaran TEXT,
  konten TEXT,
  file_url TEXT,
  status TEXT CHECK(status IN ('draft','diajukan','disetujui','revisi')) DEFAULT 'draft',
  catatan_verifikator TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guru_id) REFERENCES users(id)
);

-- ============ 9. KEPEGAWAIAN & MUTASI ============
CREATE TABLE IF NOT EXISTS kepegawaian_pengajuan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guru_id INTEGER NOT NULL,
  jenis TEXT CHECK(jenis IN ('angka_kredit','kenaikan_pangkat','sertifikasi','mutasi')) NOT NULL,
  detail TEXT,
  sekolah_tujuan_id INTEGER,
  dokumen_url TEXT,
  status TEXT CHECK(status IN ('diajukan','diproses','disetujui','ditolak')) DEFAULT 'diajukan',
  catatan_verifikator TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guru_id) REFERENCES users(id),
  FOREIGN KEY (sekolah_tujuan_id) REFERENCES sekolah(id)
);

-- ============ 10. PELATIHAN / CPD ============
CREATE TABLE IF NOT EXISTS pelatihan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judul TEXT NOT NULL,
  deskripsi TEXT,
  penyelenggara TEXT,
  jadwal_mulai TEXT,
  jadwal_selesai TEXT,
  kuota INTEGER DEFAULT 0,
  link_webinar TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pelatihan_peserta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pelatihan_id INTEGER NOT NULL,
  guru_id INTEGER NOT NULL,
  status TEXT CHECK(status IN ('terdaftar','hadir','lulus','tidak_lulus')) DEFAULT 'terdaftar',
  sertifikat_url TEXT,
  FOREIGN KEY (pelatihan_id) REFERENCES pelatihan(id),
  FOREIGN KEY (guru_id) REFERENCES users(id),
  UNIQUE(pelatihan_id, guru_id)
);

-- ============ 11. ANGGARAN / BOS ============
CREATE TABLE IF NOT EXISTS anggaran_bos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sekolah_id INTEGER NOT NULL,
  tahun INTEGER NOT NULL,
  sumber_dana TEXT DEFAULT 'BOS',
  jumlah_diterima REAL DEFAULT 0,
  jumlah_terpakai REAL DEFAULT 0,
  rincian_penggunaan TEXT, -- JSON string
  status TEXT CHECK(status IN ('disusun','disetujui','dicairkan','dipertanggungjawabkan')) DEFAULT 'disusun',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sekolah_id) REFERENCES sekolah(id)
);

-- ============ 12. PENGADUAN PUBLIK ============
CREATE TABLE IF NOT EXISTS pengaduan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kategori TEXT CHECK(kategori IN ('pungli','bullying','fasilitas','lainnya')) NOT NULL,
  deskripsi TEXT NOT NULL,
  lokasi TEXT,
  sekolah_id INTEGER,
  anonim INTEGER DEFAULT 1,
  pelapor_user_id INTEGER,
  bukti_url TEXT,
  tracking_code TEXT UNIQUE,
  status TEXT CHECK(status IN ('diterima','diverifikasi','ditindaklanjuti','selesai','ditolak')) DEFAULT 'diterima',
  tanggapan TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sekolah_id) REFERENCES sekolah(id),
  FOREIGN KEY (pelapor_user_id) REFERENCES users(id)
);

-- ============ 13. AUDIT LOG (keamanan) ============
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  aksi TEXT,
  entitas TEXT,
  entitas_id INTEGER,
  ip_address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_presensi_tanggal ON presensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_pembayaran_status ON pembayaran(status);
CREATE INDEX IF NOT EXISTS idx_ppdb_status ON ppdb_pendaftaran(status);
