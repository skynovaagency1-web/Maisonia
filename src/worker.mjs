// Point d'entrée Cloudflare Workers : D1 pour la base, R2 pour les photos.
// Les fichiers de public/ sont servis directement par Cloudflare (configuration « assets »).
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import db from './db.js';
import d1 from './db-d1.js';
import storage from './storage.js';
import app from './app.js';

db.setDriver(d1.d1Driver(() => env.DB));
storage.setStorage({
  put: (key, data, type) => env.PHOTOS.put(key, data, { httpMetadata: { contentType: type } }),
  get: async (key) => {
    const o = await env.PHOTOS.get(key);
    return o ? { body: await o.arrayBuffer(), type: o.httpMetadata?.contentType || 'application/octet-stream' } : null;
  },
  delete: (key) => env.PHOTOS.delete(key),
});

app.listen(3000);
export default httpServerHandler({ port: 3000 });
