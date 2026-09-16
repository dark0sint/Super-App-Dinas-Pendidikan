# Super App Dinas Pendidikan — REST API

Backend API siap-jalan (Node.js + Express + SQLite) untuk Super App Dinas Pendidikan, mencakup:
PPDB, E-Learning (materi/tugas/ujian CBT), Rapor Digital, Perpustakaan Digital, Presensi (face
recognition/kartu pintar), Pembayaran non-tunai, Komunikasi ortu-sekolah, RPP/Silabus,
Kepegawaian & Mutasi, Pelatihan/CPD, Dashboard Data Terpadu, Anggaran BOS, Pengaduan Publik,
serta SSO satu akun (NIK/NISN) untuk semua layanan.

Database menggunakan **SQLite file-based** (`better-sqlite3`) sehingga tidak perlu instalasi
database server terpisah — cocok untuk deploy cepat maupun skala menengah. Untuk skala besar,
lapisan data bisa dimigrasikan ke PostgreSQL/MySQL tanpa mengubah struktur API (lihat bagian
"Migrasi ke Database Produksi" di bawah).

---

## 1. Instalasi & Menjalankan di Server

### Prasyarat
- Node.js **v18 atau lebih baru** (`node -v`)
- Server Linux (Ubuntu/Debian direkomendasikan) dengan build tools untuk modul native:
  ```bash
  sudo apt-get update && sudo apt-get install -y build-essential python3
  ```

### Langkah instalasi

```bash
# 1. Ekstrak project & masuk ke foldernya
cd super-app-dindik

# 2. Install dependency
npm install

# 3. Salin file environment & sesuaikan konfigurasi
cp .env.example .env
nano .env   # isi JWT_SECRET, kredensial payment gateway, dsb.

# 4. Buat akun awal (Admin Dinas, contoh sekolah, guru, siswa, ortu)
npm run seed

# 5. Jalankan server
npm start
```

Server berjalan di `http://localhost:3000` (atau sesuai `PORT` di `.env`).
Cek kesehatan server: `GET /health`.

### Menjalankan permanen di server (disarankan: PM2)

```bash
sudo npm install -g pm2
pm2 start server.js --name super-app-dindik
pm2 save
pm2 startup   # ikuti instruksi agar auto-start saat server reboot
```

### Reverse proxy dengan Nginx (opsional tapi disarankan untuk produksi)

```nginx
server {
    listen 80;
    server_name dindik.contoh-domain.go.id;

    client_max_body_size 25M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Aktifkan HTTPS dengan Certbot (`sudo certbot --nginx`) — **wajib** karena aplikasi ini menangani
data pribadi anak (NIK, nilai, presensi).

---

## 2. Akun Default Setelah `npm run seed`

| Role          | NIK/NISN            | Password       |
|---------------|----------------------|----------------|
| Admin Dinas   | 1000000000000001    | Admin#12345    |
| Admin Sekolah | 2000000000000001    | Sekolah#123    |
| Guru          | 3000000000000001    | Guru#12345     |
| Siswa         | 4000000000000001    | Siswa#12345    |
| Orang Tua     | 5000000000000001    | Ortu#12345     |

**Segera ganti password default ini** via `POST /api/auth/change-password` setelah login pertama.

---

## 3. Konsep Single Sign-On (SSO)

Satu akun (`nik_nisn` + password) digunakan untuk seluruh modul. Setelah login (`POST
/api/auth/login`), gunakan `access_token` (JWT) di header:
```
Authorization: Bearer <access_token>
```
untuk semua endpoint yang membutuhkan autentikasi. Gunakan `refresh_token` pada
`POST /api/auth/refresh` untuk memperbarui access token tanpa login ulang.

---

## 4. Ringkasan Endpoint per Modul

Semua endpoint diawali `/api`. Body request default `application/json`, kecuali endpoint upload
file yang menggunakan `multipart/form-data`.

### Auth & SSO (`/auth`)
`POST /login` · `POST /register` · `POST /refresh` · `POST /logout` · `GET /me` · `PUT /me` · `POST /change-password`

### Users & Sekolah (`/users`, `/sekolah`)
CRUD pengguna (admin), relasi wali-siswa (`POST /users/wali-siswa`, `GET /users/saya/anak`), data master sekolah.

### 1. PPDB (`/ppdb`)
- `POST /ppdb` — daftar (form-data, field `dokumen` untuk unggah berkas), mendukung jalur `zonasi/prestasi/afirmasi/perpindahan` dengan **perhitungan jarak otomatis (haversine)** untuk zonasi.
- `GET /ppdb/peringkat/:sekolah_id/:jalur` — **transparansi publik**, peringkat real-time.
- `GET /ppdb/:id` — cek status pendaftaran.
- `PATCH /ppdb/:id/status` — verifikasi (admin).

### E-Learning (`/kelas`, `/materi`, `/tugas`, `/ujian`)
- Kelas & anggota kelas.
- Materi: teks/video/`file`.
- Tugas: unggah, `POST /tugas/:id/submit` (mendukung offline via field `submitted_at_offline`), `POST /tugas/sync-offline` untuk sinkronisasi batch saat sinyal kembali.
- Ujian CBT: `POST /ujian/:id/soal`, `POST /ujian/:id/mulai` (soal tanpa kunci jawaban, opsi acak), `POST /ujian/:id/submit` (**dinilai otomatis**).

### Rapor Digital (`/rapor`)
`POST /rapor` (guru input nilai), `GET /rapor/siswa/:siswa_id` (akses dibatasi: siswa sendiri/ortu terkait/guru/admin).

### Perpustakaan Digital (`/perpustakaan`)
CRUD e-book (materi pelajaran/literasi umum/jurnal), filter kategori & jenjang, pencarian.

### Presensi (`/presensi`)
- `POST /presensi/device-webhook` — dipanggil oleh **perangkat face recognition/kartu pintar** (header `x-device-secret` sesuai `.env`). Titik integrasi untuk notifikasi real-time ke orang tua (hubungkan ke FCM/WebSocket di lapisan produksi).
- `POST /presensi/manual`, `POST /presensi/sync-offline`, `GET /presensi/siswa/:siswa_id`, `GET /presensi/kelas/:kelas_id`.

### Pembayaran Non-Tunai (`/pembayaran`)
- `POST /pembayaran` — buat tagihan (SPP/seragam/buku).
- `POST /pembayaran/:id/checkout` — buat transaksi ke **payment gateway** (contoh struktur Midtrans; isi `PAYMENT_GATEWAY_SERVER_KEY` di `.env`).
- `POST /pembayaran/webhook/notification` — callback status pembayaran dari gateway (dengan verifikasi signature).
- `GET /pembayaran/siswa/:siswa_id` — riwayat tagihan untuk ortu/siswa.

### Komunikasi (`/komunikasi`)
Chat privat (`/komunikasi/pesan`, `/komunikasi/inbox`) & forum resmi sekolah (`/komunikasi/forum`).

### RPP/Silabus (`/rpp`)
`POST /rpp` (draft), `PATCH /rpp/:id/ajukan`, `PATCH /rpp/:id/verifikasi` (admin sekolah/dinas).

### Kepegawaian & Mutasi (`/kepegawaian`)
Pengajuan angka kredit/kenaikan pangkat/sertifikasi/mutasi + verifikasi oleh Dinas (mutasi disetujui otomatis memindahkan `sekolah_id` guru).

### Pelatihan/CPD (`/pelatihan`)
Daftar pelatihan publik, pendaftaran guru dengan kontrol kuota, riwayat sertifikasi.

### Dashboard Data Terpadu (`/dashboard`)
`GET /dashboard/ringkasan`, `GET /dashboard/kehadiran`, `GET /dashboard/distribusi-jenjang`, `GET /dashboard/anggaran` — untuk visualisasi big data real-time (Dapodik lokal).

### Anggaran BOS (`/anggaran`)
`GET /anggaran/publik` — **transparansi publik** tanpa login. `POST /anggaran/:id/penggunaan` — admin sekolah lapor rincian penggunaan dana.

### Pengaduan Publik (`/pengaduan`)
`POST /pengaduan` — bisa **anonim**, tanpa login, dengan unggah bukti. Mengembalikan `tracking_code`.
`GET /pengaduan/lacak/:tracking_code` — pelapor memantau tindak lanjut tanpa perlu login.

---

## 5. Keamanan yang Sudah Diterapkan

- Password di-hash dengan **bcrypt**, JWT dengan masa berlaku terbatas + refresh token.
- **Helmet** (HTTP security headers) & **rate limiting** (umum + khusus login untuk anti brute-force).
- Kontrol akses berbasis peran (`authorize(...roles)`) di setiap endpoint sensitif.
- Opsi pengaduan **anonim** agar pelapor pungli/bullying terlindungi.
- Audit log dasar (`audit_log`) untuk mencatat aktivitas login.
- **Rekomendasi tambahan untuk produksi:** aktifkan HTTPS (lihat Nginx+Certbot di atas), audit
  berkala, backup rutin file `data/dindik.db`, serta kebijakan retensi data pribadi anak sesuai
  UU PDP.

## 6. Dukungan Mode Offline

Endpoint `POST /tugas/sync-offline` dan `POST /presensi/sync-offline` menerima data batch yang
disimpan sementara di perangkat client (mobile/PWA) saat tanpa sinyal, lalu disinkronkan otomatis
saat koneksi kembali. Untuk aplikasi ringan di sisi client, gunakan penyimpanan lokal (IndexedDB/
SQLite mobile) dan panggil endpoint ini secara batch.

## 7. Migrasi ke Database Produksi (opsional, untuk skala sangat besar)

Struktur SQL di `src/db/schema.sql` menggunakan sintaks standar dan mudah diadaptasi ke
PostgreSQL/MySQL bila jumlah pengguna sudah sangat besar (jutaan siswa se-provinsi). Ganti
`src/db/index.js` dengan driver yang sesuai (mis. `pg` atau `mysql2`) — struktur route/controller
tidak perlu diubah karena hanya memakai SQL standar.

## 8. Catatan Integrasi Eksternal

Beberapa fitur memerlukan kredensial/perangkat resmi yang **harus disediakan oleh Dinas**, bukan
bagian dari kode ini:
- **Face recognition/kartu pintar**: aplikasi ini menyediakan endpoint webhook siap pakai
  (`/presensi/device-webhook`); integrasikan dengan SDK/perangkat vendor yang dipakai.
- **Payment gateway**: contoh struktur mengikuti Midtrans; isi kredensial resmi di `.env`, atau
  sesuaikan `pembayaran.routes.js` bila memakai gateway lain (Doku, Xendit, dll).
- **Notifikasi real-time (push notification)**: titik integrasi sudah disediakan di webhook
  presensi & webhook pembayaran; hubungkan dengan Firebase Cloud Messaging/WebSocket sesuai
  platform aplikasi mobile Dinas.
