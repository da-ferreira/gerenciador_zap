// Cadastra a campanha VGX CMS 2026 com as 7 mensagens e, se passados, os CSVs das bases.
// Uso: node scripts/seed-vgx.js [base-geral.csv] [gerentes.csv]
// Template e canal ficam para escolher na tela (vêm do Loopiee).
require('dotenv').config();
const fs = require('fs');
const store = require('../src/store');
const { parseBase } = require('../src/campaign');

const IMG = 'https://app-loopiee-1.s3.us-east-1.amazonaws.com/campanhas/vgx-cms26/';
const NAME = 'VGX · CMS Financial Innovation 2026';

const db = store.load();
if (db.campaigns.some((c) => c.name === NAME)) {
  console.log('Campanha já existe, nada feito.');
  process.exit(0);
}
const c = { id: store.newId(), name: NAME, channel_id: null, channel_name: null, optout_text: 'Parar de receber', limit_24h: 2000, created_at: store.now() };
db.campaigns.push(c);

function base(name, file) {
  if (!file) return null;
  const { contacts, report } = parseBase(fs.readFileSync(file, 'utf8'));
  const b = { id: store.newId(), campaign_id: c.id, name, contacts, report: { ...report, invalid: report.invalid.slice(0, 50), invalid_count: report.invalid.length }, created_at: store.now() };
  db.bases.push(b);
  console.log(`Base ${name}: ${contacts.length} contatos`);
  return b.id;
}
const geral = base('Geral', process.argv[2]);
const gerentes = base('Gerentes e acima', process.argv[3]);

const msgs = [
  ['1 · Você foi selecionado', geral, '2026-11-16T09:00', '01_voce_foi_selecionado.png'],
  ['2 · Quem te espera lá', geral, '2026-11-16T10:00', '02_quem_te_espera_la.png'],
  ['3 · Podcast Gabriel', geral, '2026-11-17T09:00', '03_podcast_gabriel.png'],
  ['4 · Quem te espera lá (gerentes)', gerentes, '2026-11-18T09:00', '02_quem_te_espera_la.png'],
  ['5 · Faltam 15 minutos', geral, '2026-11-18T17:15', '04_faltam_15_minutos.png'],
  ['6 · Happy hour', gerentes, '2026-11-18T18:15', '05_happy_hour.png'],
  ['7 · Agradecimento', geral, '2026-11-23T09:00', null],
];
for (const [title, base_id, scheduled_at, img] of msgs) {
  db.messages.push({ id: store.newId(), campaign_id: c.id, title, base_id, scheduled_at, image_url: img ? IMG + img : null, template_id: null, template_name: null, variables: null, created_at: store.now() });
}
store.save();
console.log(`Campanha criada com ${msgs.length} mensagens.`);
