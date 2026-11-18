// Regras de quem entra em cada mailing. Telefone interno = DDD + número, sem o 55.

const CODE_SEM_WHATSAPP = '131026';
const CODE_LIMITE_MARKETING = '131049';
const CODE_PAROU_MARKETING = '131050';
const DAY_MS = 24 * 60 * 60 * 1000;

const REASONS = {
  manual: 'Removido à mão',
  optout: 'Pediu para sair (botão ou 131050)',
  sem_whatsapp: 'Não entregável (131026)',
  marketing: 'Bloqueio de marketing (131049) no envio anterior',
  nao_leu: 'Não leu nenhuma mensagem',
};

function normPhone(value) {
  let p = String(value ?? '').replace(/\D/g, '');
  if ((p.length === 12 || p.length === 13) && p.startsWith('55')) p = p.slice(2);
  return p;
}

const normText = (s) => String(s ?? '').trim().toLowerCase();

// Separadores do CSV do Chat Ativo (; e |) e aspas não podem ir nos valores.
const clean = (s) => String(s ?? '').replace(/[;|"\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

// Aceita o CSV que o marketing manda: nome + (ddd e numero) ou um telefone completo.
function parseBase(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('Arquivo vazio.');
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitLine(lines[0], sep).map(normText);
  const find = (...names) => head.findIndex((h) => names.includes(h));
  const iNome = find('nome', 'name', 'client_name');
  const iDdd = find('ddd');
  const iNum = find('numero', 'número', 'phone', 'telefone', 'celular', 'whatsapp');
  if (iNum < 0) throw new Error('Não achei a coluna do telefone (numero, telefone, celular ou phone).');

  const contacts = [];
  const seen = new Set();
  const invalid = [];
  let duplicates = 0;
  let landlines = 0;
  lines.slice(1).forEach((line, i) => {
    const cols = splitLine(line, sep);
    const phone = normPhone((iDdd >= 0 ? cols[iDdd] : '') + cols[iNum]);
    const name = iNome >= 0 ? clean(cols[iNome]) : '';
    if (phone.length !== 10 && phone.length !== 11) {
      invalid.push({ line: i + 2, value: line.slice(0, 80) });
      return;
    }
    if (seen.has(phone)) { duplicates++; return; }
    seen.add(phone);
    if (phone.length === 10) landlines++;
    contacts.push({ name, phone });
  });
  return { contacts, report: { lines: lines.length - 1, valid: contacts.length, duplicates, landlines, invalid } };
}

// Retorno de cada mailing já criado, lido do sync guardado (não chama a API aqui).
function feedback(db, campaignId) {
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  const optoutText = normText(campaign?.optout_text || 'Parar de receber');
  const optout = new Map();
  const semWhatsapp = new Map();
  const sources = [...db.messages, ...(db.quicksends || [])].filter((m) => m.campaign_id === campaignId && m.mailing_id);
  for (const msg of sources) {
    for (const row of db.syncs[msg.mailing_id]?.rows || []) {
      if (row.button_reply && normText(row.button_reply) === optoutText) optout.set(row.phone, { message_id: msg.id, at: row.button_reply_at });
      // 131050: a pessoa desligou o marketing da empresa no próprio WhatsApp — vale como pedido de saída.
      if (row.code === CODE_PAROU_MARKETING && !optout.has(row.phone)) optout.set(row.phone, { message_id: msg.id, at: row.at });
      if (row.code === CODE_SEM_WHATSAPP) semWhatsapp.set(row.phone, { message_id: msg.id, at: row.at });
    }
  }
  return { optout, semWhatsapp };
}

function manualSet(db, campaignId) {
  return new Map(db.removals.filter((r) => r.campaign_id === campaignId).map((r) => [r.phone, r]));
}

// O 131049 só tira a pessoa do envio seguinte. Para cada telefone, olha a última
// mensagem anterior cuja base o incluía: se recebeu e deu 131049, sai desta; se já
// foi pulado ali, volta.
function lastCodeBefore(db, msg) {
  const prior = db.messages
    .filter((m) => m.campaign_id === msg.campaign_id && m.mailing_id && m.id !== msg.id && m.scheduled_at < msg.scheduled_at)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const last = new Map();
  for (const m of prior) {
    const sent = new Set(m.phones || []);
    const codes = new Map((db.syncs[m.mailing_id]?.rows || []).map((r) => [r.phone, r.code]));
    for (const c of db.bases.find((b) => b.id === m.base_id)?.contacts || []) {
      last.set(c.phone, sent.has(c.phone) ? codes.get(c.phone) || null : 'pulado');
    }
  }
  return last;
}

// Quem leu ao menos uma mensagem já disparada na campanha (mailings e avulsos).
function readers(db, campaignId) {
  const set = new Set();
  for (const m of [...db.messages, ...(db.quicksends || [])].filter((x) => x.campaign_id === campaignId && x.mailing_id)) {
    for (const r of db.syncs[m.mailing_id]?.rows || []) if (r.status === 'read') set.add(r.phone);
  }
  return set;
}

function build(db, msg) {
  const base = db.bases.find((b) => b.id === msg.base_id);
  if (!base) return { included: [], excluded: [], counts: { base: 0, included: 0 } };
  const manual = manualSet(db, msg.campaign_id);
  const { optout, semWhatsapp } = feedback(db, msg.campaign_id);
  const last = lastCodeBefore(db, msg);
  const read = msg.only_engaged ? readers(db, msg.campaign_id) : null;

  const included = [];
  const excluded = [];
  for (const c of base.contacts) {
    let reason = null;
    if (manual.has(c.phone)) reason = 'manual';
    else if (optout.has(c.phone)) reason = 'optout';
    else if (semWhatsapp.has(c.phone)) reason = 'sem_whatsapp';
    else if (last.get(c.phone) === CODE_LIMITE_MARKETING) reason = 'marketing';
    else if (read && !read.has(c.phone)) reason = 'nao_leu';
    if (reason) excluded.push({ ...c, reason });
    else included.push(c);
  }
  // "Sempre incluir" da campanha entra no fim, passando por cima de qualquer filtro.
  const inSet = new Set(included.map((c) => c.phone));
  let forced = 0;
  // skip_always_include: mensagens de teste (só o número de quem testa).
  for (const f of msg.skip_always_include ? [] : db.campaigns.find((c) => c.id === msg.campaign_id)?.always_include || []) {
    if (inSet.has(f.phone)) continue;
    inSet.add(f.phone);
    included.push(f);
    forced++;
  }
  const out = excluded.filter((e) => !inSet.has(e.phone));
  excluded.length = 0;
  excluded.push(...out);
  const counts = { base: base.contacts.length, included: included.length, out: excluded.length, forced };
  for (const k of Object.keys(REASONS)) counts[k] = excluded.filter((e) => e.reason === k).length;
  return { included, excluded, counts };
}

function fillVariables(template, contact) {
  if (!template) return '';
  const first = (contact.name || '').split(' ')[0] || '';
  return template
    .split('|')
    .map((v) => clean(v.replace(/\{\{\s*nome\s*\}\}/gi, contact.name || '').replace(/\{\{\s*primeiro_nome\s*\}\}/gi, first)))
    .join('|');
}

function toCsv(msg, contacts) {
  const lines = ['client_name;client_document;client_email;ddd;phone;variables;image_url'];
  for (const c of contacts) {
    lines.push([clean(c.name), '', '', c.phone.slice(0, 2), c.phone.slice(2), fillVariables(msg.variables, c), clean(msg.image_url)].join(';'));
  }
  return lines.join('\n') + '\n';
}

// Pessoas diferentes que recebem nas 24h que terminam no horário de cada mensagem.
// Mensagem já criada conta quem foi de fato; as futuras, a prévia de hoje.
function windows(db, campaignId) {
  const msgs = db.messages
    .filter((m) => m.campaign_id === campaignId && m.scheduled_at)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const phones = new Map(msgs.map((m) => [m.id, m.mailing_name ? new Set(m.phones || []) : new Set(build(db, m).included.map((c) => c.phone))]));
  const result = {};
  for (const m of msgs) {
    const end = Date.parse(m.scheduled_at + ':00-03:00');
    const set = new Set();
    for (const o of msgs) {
      const t = Date.parse(o.scheduled_at + ':00-03:00');
      if (t > end - DAY_MS && t <= end) for (const p of phones.get(o.id)) set.add(p);
    }
    result[m.id] = set.size;
  }
  return result;
}

module.exports = { REASONS, normPhone, parseBase, feedback, manualSet, build, toCsv, windows, CODE_SEM_WHATSAPP, CODE_LIMITE_MARKETING };
