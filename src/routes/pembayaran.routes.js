const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const { ok, created, fail, notFound } = require('../utils/response');
const { authenticate, authorize } = require('../middleware/auth');

// ==== BUAT TAGIHAN (admin sekolah/dinas) ====
router.post('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { siswa_id, jenis, deskripsi, periode, jumlah } = req.body;
  if (!siswa_id || !jenis || !jumlah) return fail(res, 'siswa_id, jenis, dan jumlah wajib diisi.');
  const orderId = `DINDIK-${Date.now()}-${siswa_id}`;
  const info = db.prepare(
    `INSERT INTO pembayaran (siswa_id, jenis, deskripsi, periode, jumlah, order_id) VALUES (?,?,?,?,?,?)`
  ).run(siswa_id, jenis, deskripsi, periode, jumlah, orderId);
  return created(res, { id: info.lastInsertRowid, order_id: orderId });
});

// ==== BUAT TRANSAKSI DI PAYMENT GATEWAY (contoh struktur Midtrans Snap) ====
// Untuk produksi, isi PAYMENT_GATEWAY_SERVER_KEY di .env dengan kredensial resmi.
router.post('/:id/checkout', authenticate, async (req, res) => {
  const tagihan = db.prepare('SELECT * FROM pembayaran WHERE id = ?').get(req.params.id);
  if (!tagihan) return notFound(res, 'Tagihan tidak ditemukan.');
  if (tagihan.status === 'paid') return fail(res, 'Tagihan sudah lunas.', 409);

  const serverKey = process.env.PAYMENT_GATEWAY_SERVER_KEY;
  if (!serverKey || serverKey === 'REPLACE_ME') {
    return fail(res, 'Payment gateway belum dikonfigurasi. Isi PAYMENT_GATEWAY_SERVER_KEY pada file .env dengan kredensial resmi.', 503);
  }

  try {
    const auth = Buffer.from(`${serverKey}:`).toString('base64');
    const response = await fetch(`${process.env.PAYMENT_GATEWAY_BASE_URL}/v2/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        transaction_details: { order_id: tagihan.order_id, gross_amount: tagihan.jumlah },
        payment_type: 'gopay'
      })
    });
    const data = await response.json();
    db.prepare('UPDATE pembayaran SET payment_gateway_ref = ? WHERE id = ?').run(data.transaction_id || null, tagihan.id);
    return ok(res, data, 'Transaksi pembayaran dibuat. Selesaikan pembayaran melalui link/QR yang diberikan.');
  } catch (err) {
    return fail(res, `Gagal menghubungi payment gateway: ${err.message}`, 502);
  }
});

// ==== WEBHOOK NOTIFIKASI DARI PAYMENT GATEWAY ====
router.post('/webhook/notification', (req, res) => {
  const { order_id, transaction_status, signature_key, status_code, gross_amount } = req.body;
  const serverKey = process.env.PAYMENT_GATEWAY_SERVER_KEY;

  // Verifikasi signature (contoh pola Midtrans: sha512(order_id+status_code+gross_amount+server_key))
  if (serverKey && serverKey !== 'REPLACE_ME' && signature_key) {
    const expected = crypto.createHash('sha512').update(`${order_id}${status_code}${gross_amount}${serverKey}`).digest('hex');
    if (expected !== signature_key) return fail(res, 'Signature tidak valid.', 403);
  }

  const tagihan = db.prepare('SELECT * FROM pembayaran WHERE order_id = ?').get(order_id);
  if (!tagihan) return notFound(res, 'Order tidak ditemukan.');

  let statusBaru = tagihan.status;
  if (['settlement', 'capture'].includes(transaction_status)) statusBaru = 'paid';
  else if (['deny', 'cancel', 'failure'].includes(transaction_status)) statusBaru = 'failed';
  else if (transaction_status === 'expire') statusBaru = 'expired';

  db.prepare('UPDATE pembayaran SET status = ?, paid_at = ? WHERE order_id = ?')
    .run(statusBaru, statusBaru === 'paid' ? new Date().toISOString() : null, order_id);

  return ok(res, null, 'Notifikasi pembayaran diproses.');
});

// Tandai lunas manual (mis. pembayaran tunai dicatat admin) - untuk kelengkapan operasional
router.patch('/:id/tandai-lunas', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  db.prepare("UPDATE pembayaran SET status = 'paid', metode_pembayaran = ?, paid_at = ? WHERE id = ?")
    .run(req.body.metode_pembayaran || 'tunai', new Date().toISOString(), req.params.id);
  return ok(res, null, 'Pembayaran ditandai lunas.');
});

// ==== RIWAYAT TAGIHAN SISWA (siswa/ortu) ====
router.get('/siswa/:siswa_id', authenticate, (req, res) => {
  if (req.user.role === 'orang_tua') {
    const relasi = db.prepare('SELECT 1 FROM wali_siswa WHERE orang_tua_id=? AND siswa_id=?').get(req.user.id, req.params.siswa_id);
    if (!relasi) return fail(res, 'Tidak memiliki akses.', 403);
  }
  return ok(res, db.prepare('SELECT * FROM pembayaran WHERE siswa_id = ? ORDER BY created_at DESC').all(req.params.siswa_id));
});

router.get('/', authenticate, authorize('admin_dinas', 'admin_sekolah'), (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT p.*, u.nama as nama_siswa FROM pembayaran p JOIN users u ON u.id = p.siswa_id WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  return ok(res, db.prepare(sql).all(...params));
});

module.exports = router;
