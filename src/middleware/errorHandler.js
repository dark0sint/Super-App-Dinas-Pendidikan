function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.` });
}

function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err);
  if (err instanceof require('multer').MulterError) {
    return res.status(400).json({ success: false, message: `Upload gagal: ${err.message}` });
  }
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Terjadi kesalahan pada server.'
  });
}

module.exports = { notFoundHandler, errorHandler };
