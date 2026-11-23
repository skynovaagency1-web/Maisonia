// Lancement local avec Node.js : base SQLite dans data/, photos dans uploads/.
const path = require('node:path');
const express = require('express');
const { setDriver } = require('./db');
const { nodeDriver } = require('./db-node');
const { setStorage } = require('./storage');
const { diskStorage } = require('./storage-node');

setDriver(nodeDriver(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'servizone.db')));
setStorage(diskStorage(path.join(__dirname, '..', 'uploads')));

const app = require('./app');
const site = express();
site.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
site.use(app);

const port = process.env.PORT || 3000;
site.listen(port, () => console.log(`Servizone : http://localhost:${port}`));
