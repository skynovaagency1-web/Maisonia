const crypto = require('node:crypto');
const multer = require('multer');
const storage = require('./storage');

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
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    const err = new Error('Seules les photos JPEG, PNG ou WebP sont acceptées.');
    err.status = 400;
    cb(err);
  },
});

// Enregistre les photos reçues et renvoie leurs noms de fichier.
async function saveUploads(files = []) {
  const keys = [];
  for (const f of files) {
    const key = crypto.randomBytes(16).toString('hex') + IMAGE_TYPES[f.mimetype];
    await storage.put(key, f.buffer, f.mimetype);
    keys.push(key);
  }
  return keys;
}

const removeUploads = (keys) => storage.remove(keys);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

module.exports = { requireRole, upload, saveUploads, removeUploads, httpError };
