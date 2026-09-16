const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token akses tidak ditemukan. Silakan login (SSO).' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, nama, sekolah_id, nik_nisn }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa.' });
  }
}

// Membatasi akses endpoint hanya untuk role tertentu
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Belum terautentikasi.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke sumber daya ini.' });
    }
    next();
  };
}

// Verifikasi khusus untuk webhook perangkat presensi (bukan JWT user biasa)
function verifyDeviceSecret(req, res, next) {
  const secret = req.headers['x-device-secret'];
  if (!secret || secret !== process.env.DEVICE_WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: 'Signature perangkat tidak valid.' });
  }
  next();
}

module.exports = { authenticate, authorize, verifyDeviceSecret };
