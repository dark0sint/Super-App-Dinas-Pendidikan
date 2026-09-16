/**
 * Hitung jarak antara dua koordinat (dalam KM) menggunakan formula Haversine.
 * Dipakai untuk verifikasi PPDB jalur zonasi.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || isNaN(v))) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // radius bumi dalam km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

module.exports = { haversineKm };
