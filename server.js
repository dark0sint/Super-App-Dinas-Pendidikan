require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

require('./src/db'); // inisialisasi & migrasi schema saat startup

const routes = require('./src/routes');
const { notFoundHandler, errorHandler } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// ==== KEAMANAN & PERFORMA (Fitur Penunjang #5) ====
app.use(helmet({ crossOriginResourcePolicy: false })); // biar file di /uploads tetap bisa diakses
app.use(cors()); // sesuaikan origin di produksi bila perlu
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting global untuk mencegah abuse / brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan, coba lagi beberapa saat lagi.' }
});
app.use('/api/', limiter);

// Rate limit lebih ketat khusus login (anti brute-force akun)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Terlalu banyak percobaan login, coba lagi nanti.' }
});
app.use('/api/auth/login', loginLimiter);

// File statis (materi, tugas, ebook, bukti pengaduan, dokumen)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check untuk load balancer / monitoring server
app.get('/health', (req, res) => res.json({ success: true, status: 'UP', timestamp: new Date().toISOString() }));

// ==== ROUTES API ====
app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n=========================================================`);
  console.log(` Super App Dinas Pendidikan API`);
  console.log(` Berjalan di port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  console.log(` Health check : http://localhost:${PORT}/health`);
  console.log(` Base API     : http://localhost:${PORT}/api`);
  console.log(`=========================================================\n`);
});

module.exports = app;
