const fs = require('node:fs/promises');
const path = require('node:path');
const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function diskStorage(dir) {
  const file = (k) => path.join(dir, path.basename(k));
  return {
    put: async (k, data) => { await fs.mkdir(dir, { recursive: true }); await fs.writeFile(file(k), data); },
    get: async (k) => { try { return { body: await fs.readFile(file(k)), type: TYPES[path.extname(k)] || 'application/octet-stream' }; } catch { return null; } },
    delete: (k) => fs.rm(file(k), { force: true }),
  };
}
module.exports = { diskStorage };
