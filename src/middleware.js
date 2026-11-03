const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.flash('info', 'Connectez-vous pour continuer.');
      return res.redirect(`/connexion?next=${encodeURIComponent(req.originalUrl)}`);
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).render('error', { title: 'Accès refusé', message: "Cette page n'est pas accessible avec votre type de compte." });
    }
    next();
  };
}

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    const err = new Error('Seules les photos JPEG, PNG ou WebP sont acceptées.');
    err.status = 400;
    cb(err);
  },
});

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

module.exports = { requireRole, upload, httpError };

const fs = require('node:fs');
function removeUploads(filenames) {
  for (const f of filenames) fs.rm(path.join(__dirname, '..', 'uploads', path.basename(f)), { force: true }, () => {});
}
module.exports.removeUploads = removeUploads;
