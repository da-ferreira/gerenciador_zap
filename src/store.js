const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
let db;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    db = {};
  }
  for (const k of ['campaigns', 'bases', 'messages', 'removals']) db[k] ||= [];
  db.syncs ||= {};
  return db;
}

// Grava num temporário e renomeia: uma queda no meio não deixa o JSON pela metade.
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

module.exports = { load, save, newId, now };
