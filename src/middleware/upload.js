const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

function makeUploader(subfolder) {
  const dir = path.join(__dirname, '../../uploads', subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  });

  const maxMb = parseInt(process.env.UPLOAD_MAX_MB || '20', 10);
  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 }
  });
}

// helper untuk membangun URL publik file yang sudah diupload
function fileUrl(req, subfolder, filename) {
  if (!filename) return null;
  return `${req.protocol}://${req.get('host')}/uploads/${subfolder}/${filename}`;
}

module.exports = { makeUploader, fileUrl };
