function ok(res, data, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}
function created(res, data, message = 'Berhasil dibuat') {
  return ok(res, data, message, 201);
}
function fail(res, message = 'Terjadi kesalahan', status = 400, errors = null) {
  return res.status(status).json({ success: false, message, errors });
}
function notFound(res, message = 'Data tidak ditemukan') {
  return fail(res, message, 404);
}

module.exports = { ok, created, fail, notFound };
