// Stockage des photos : dossier uploads/ sur Node, bucket R2 sur Cloudflare.
let store = null;
const setStorage = (s) => { store = s; };
const put = (key, data, type) => store.put(key, data, type);
const get = (key) => store.get(key); // → { body, type } ou null
const remove = (keys) => Promise.all(keys.map((k) => store.delete(k).catch(() => {})));
module.exports = { setStorage, put, get, remove };
