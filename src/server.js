require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./store');
const loopiee = require('./loopiee');
const camp = require('./campaign');

for (const k of ['APP_PASSWORD', 'SESSION_SECRET']) {
  if (!process.env[k]) {
    console.error(`Falta ${k} no .env`);
    process.exit(1);
  }
}

const app = express();
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});

// ---------- sessão (senha única) ----------
const SESSION_DAYS = 7;
const hmac = (v) => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(v).digest('hex');
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();

function readCookie(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)gz_sess=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!sig || sig.length !== 64) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(exp)))) return false;
  return Number(exp) > Date.now();
}

function cookie(value, maxAge) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `gz_sess=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

// Máquina pública: 5 erros seguidos travam o IP por 15 minutos.
const attempts = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { fails: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ msg: 'Muitas tentativas. Espere 15 minutos.' });
  const ok = crypto.timingSafeEqual(sha(req.body?.password), sha(process.env.APP_PASSWORD));
  if (!ok) {
    a.fails++;
    if (a.fails >= 5) { a.fails = 0; a.until = Date.now() + 15 * 60 * 1000; }
    attempts.set(ip, a);
    return res.status(401).json({ msg: 'Senha incorreta.' });
  }
  attempts.delete(ip);
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  res.set('Set-Cookie', cookie(`${exp}.${hmac(exp)}`, SESSION_DAYS * 86400)).json({ ok: true });
});

app.post('/api/logout', (req, res) => res.set('Set-Cookie', cookie('', 0)).json({ ok: true }));
app.get('/api/me', (req, res) => res.json({ logged: readCookie(req) }));

app.use('/api', (req, res, next) => (readCookie(req) ? next() : res.status(401).json({ msg: 'Faça login.' })));

// ---------- helpers ----------
const wrap = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch((e) => {
  console.error(e);
  res.status(e.status || 500).json({ msg: e.message });
});
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const getOr404 = (list, id, what) => list.find((x) => x.id === id) || (() => { throw fail(404, `${what} não encontrado.`); })();
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function baseSummary(b) {
  const { contacts, ...rest } = b;
  return { ...rest, size: contacts.length };
}

function messageView(db, m, win) {
  const b = camp.build(db, m);
  return {
    ...m,
    phones: undefined,
    preview: m.mailing_name ? null : b.counts,
    window_24h: win[m.id] ?? null,
  };
}

// O Loopiee corta o nome do mailing em 50 caracteres e não devolve o id no upload:
// o código único vai na frente para sobreviver ao corte e achar o mailing depois.
const mailingName = (id, ...parts) => [`zap-${id.slice(0, 8)}`, ...parts].join(' · ').slice(0, 50);

async function syncCampaign(db, campaignId) {
  const msgs = [...db.messages, ...(db.quicksends || []).map((q) => Object.assign(q, { title: q.title || 'Envio avulso' }))]
    .filter((m) => m.campaign_id === campaignId && m.mailing_name);
  const campaign = db.campaigns.find((c) => c.id === campaignId);
  const errors = [];
  for (const m of msgs) {
    try {
      if (!m.mailing_id) m.mailing_id = await loopiee.findMailingId(m.mailing_name, campaign.channel_id);
      if (!m.mailing_id) continue;
      const rows = await loopiee.mailingDetails(m.mailing_id);
      db.syncs[m.mailing_id] = {
        at: store.now(),
        rows: rows.map((r) => ({
          phone: camp.normPhone(r.phone),
          name: r.name || null,
          process_status: r.process_status,
          status: r.delivery_status || null,
          code: r.delivery_error_code ? String(r.delivery_error_code) : null,
          error: r.delivery_error_message || null,
          at: r.delivery_status_at || null,
          button_reply: r.button_reply || null,
          button_reply_at: r.button_reply_at || null,
        })),
      };
    } catch (e) {
      errors.push(`${m.title}: ${e.message}`);
    }
  }
  campaign.synced_at = store.now();
  store.save();
  return errors;
}

function sendStatus(r) {
  if (r.process_status === 'fail' || r.status === 'failed') return 'failed';
  if (r.status === 'read' || r.status === 'delivered' || r.status === 'sent') return r.status;
  return 'pending';
}

function stats(db, m) {
  const rows = (m.mailing_id && db.syncs[m.mailing_id]?.rows) || [];
  const s = { total: rows.length, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, optout: 0, clicked: 0 };
  const optoutText = (db.campaigns.find((c) => c.id === m.campaign_id)?.optout_text || '').trim().toLowerCase();
  for (const r of rows) {
    if (r.process_status === 'unprocessed' || r.process_status === 'processing') s.pending++;
    if (r.process_status === 'fail' || r.status === 'failed') s.failed++;
    else if (r.status === 'read') s.read++;
    else if (r.status === 'delivered') s.delivered++;
    else if (r.status === 'sent') s.sent++;
    if (r.button_reply) {
      s.clicked++;
      if (r.button_reply.trim().toLowerCase() === optoutText) s.optout++;
    }
  }
  return s;
}

// ---------- Loopiee ----------
app.get('/api/loopiee/channels', wrap(async (req, res) => res.json(await loopiee.listChannels())));
app.get('/api/loopiee/channels/:id/templates', wrap(async (req, res) => res.json(await loopiee.listTemplates(req.params.id))));
app.get('/api/loopiee/channels/:id/meta-health', wrap(async (req, res) => res.json(await loopiee.metaHealth(req.params.id))));

// ---------- campanhas ----------
app.get('/api/campaigns', wrap((req, res) => {
  const db = store.load();
  res.json(db.campaigns.map((c) => ({ ...c, messages: db.messages.filter((m) => m.campaign_id === c.id).length })));
}));

app.post('/api/campaigns', wrap((req, res) => {
  const db = store.load();
  const name = String(req.body.name || '').trim();
  if (!name) throw fail(400, 'Informe o nome.');
  const c = { id: store.newId(), name, channel_id: null, channel_name: null, optout_text: 'Parar de receber', limit_24h: 2000, created_at: store.now() };
  db.campaigns.push(c);
  store.save();
  res.json(c);
}));

app.get('/api/campaigns/:id', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const win = camp.windows(db, c.id);
  const { optout, semWhatsapp } = camp.feedback(db, c.id);
  res.json({
    campaign: c,
    bases: db.bases.filter((b) => b.campaign_id === c.id).map(baseSummary),
    messages: db.messages
      .filter((m) => m.campaign_id === c.id)
      .sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''))
      .map((m) => ({ ...messageView(db, m, win), stats: m.mailing_name ? stats(db, m) : null })),
    removed: { manual: db.removals.filter((r) => r.campaign_id === c.id).length, optout: optout.size, sem_whatsapp: semWhatsapp.size },
  });
}));

app.put('/api/campaigns/:id', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const b = req.body;
  if (b.name !== undefined) c.name = String(b.name).trim() || c.name;
  if (b.channel_id !== undefined) {
    if (db.messages.some((m) => m.campaign_id === c.id && m.mailing_name)) throw fail(409, 'Já há mailing criado: o canal não pode mais mudar.');
    c.channel_id = b.channel_id || null;
    c.channel_name = b.channel_name || null;
  }
  if (b.optout_text !== undefined) c.optout_text = String(b.optout_text).trim();
  if (b.limit_24h !== undefined) c.limit_24h = Number(b.limit_24h) || 0;
  store.save();
  res.json(c);
}));

app.post('/api/campaigns/:id/sync', wrap(async (req, res) => {
  const db = store.load();
  getOr404(db.campaigns, req.params.id, 'Campanha');
  res.json({ errors: await syncCampaign(db, req.params.id) });
}));

// Cada linha = uma pessoa em um mailing, do retorno lido por último. Ordem: disparo mais recente primeiro.
app.get('/api/campaigns/:id/sends', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const names = new Map(db.bases.filter((b) => b.campaign_id === c.id).flatMap((b) => b.contacts.map((x) => [x.phone, x.name])));
  const q = String(req.query.q || '').trim().toLowerCase();
  const qPhone = camp.normPhone(q);
  const status = String(req.query.status || '');
  const offset = Number(req.query.offset) || 0;

  const all = [];
  for (const m of [...db.messages, ...(db.quicksends || [])].filter((x) => x.campaign_id === c.id && x.mailing_id)) {
    const when = m.scheduled_at ? m.scheduled_at + ':00-03:00' : m.created_at;
    for (const r of db.syncs[m.mailing_id]?.rows || []) {
      all.push({
        phone: r.phone, name: r.name || names.get(r.phone) || '', title: m.title || 'Envio avulso', template: m.template_name,
        status: sendStatus(r), at: when, status_at: r.at ? r.at.replace(' ', 'T') + (/[Z+]|-\d\d:\d\d$/.test(r.at) ? '' : '-03:00') : null, code: r.code, error: r.error, button: r.button_reply,
      });
    }
  }
  const matchQ = (x) => !q || (qPhone.length >= 4 && x.phone.includes(qPhone)) || x.name.toLowerCase().includes(q);
  const found = all.filter(matchQ);
  const counts = { all: found.length, pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
  for (const x of found) counts[x.status]++;
  const rows = found.filter((x) => !status || x.status === status).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || Date.parse(b.status_at || 0) - Date.parse(a.status_at || 0));
  res.json({ counts, total: rows.length, rows: rows.slice(offset, offset + 200) });
}));

// ---------- bases ----------
app.post('/api/campaigns/:id/bases', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const name = String(req.body.name || '').trim();
  if (!name) throw fail(400, 'Informe o nome da base.');
  const { contacts, report } = camp.parseBase(req.body.csv || '');
  if (!contacts.length) throw fail(400, 'Nenhum telefone válido no arquivo.');
  const base = { id: store.newId(), campaign_id: c.id, name, contacts, report: { ...report, invalid: report.invalid.slice(0, 50), invalid_count: report.invalid.length }, created_at: store.now() };
  db.bases.push(base);
  store.save();
  res.json(baseSummary(base));
}));

app.delete('/api/bases/:id', wrap((req, res) => {
  const db = store.load();
  const b = getOr404(db.bases, req.params.id, 'Base');
  if (db.messages.some((m) => m.base_id === b.id)) throw fail(409, 'Há mensagem usando esta base. Troque a base da mensagem antes.');
  db.bases = db.bases.filter((x) => x.id !== b.id);
  store.save();
  res.json({ ok: true });
}));

// ---------- mensagens ----------
const MSG_FIELDS = ['title', 'base_id', 'template_id', 'template_name', 'scheduled_at', 'image_url', 'variables'];

function applyMessage(m, body) {
  for (const k of MSG_FIELDS) if (body[k] !== undefined) m[k] = body[k] === '' ? null : body[k];
  if (m.scheduled_at && !DATE_RE.test(m.scheduled_at)) throw fail(400, 'Data/hora inválida.');
  if (m.image_url && !/^https:\/\//.test(m.image_url)) throw fail(400, 'O link da imagem precisa começar com https://');
}

app.post('/api/campaigns/:id/messages', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const m = { id: store.newId(), campaign_id: c.id, title: 'Nova mensagem', created_at: store.now() };
  applyMessage(m, req.body);
  db.messages.push(m);
  store.save();
  res.json(m);
}));

app.put('/api/messages/:id', wrap((req, res) => {
  const db = store.load();
  const m = getOr404(db.messages, req.params.id, 'Mensagem');
  if (m.mailing_name) throw fail(409, 'Mailing já criado no Chat Ativo. Mude por lá (agendamento) ou crie outra mensagem.');
  applyMessage(m, req.body);
  store.save();
  res.json(m);
}));

app.delete('/api/messages/:id', wrap((req, res) => {
  const db = store.load();
  const m = getOr404(db.messages, req.params.id, 'Mensagem');
  if (m.mailing_name) throw fail(409, 'Mailing já criado no Chat Ativo; não dá para apagar daqui.');
  db.messages = db.messages.filter((x) => x.id !== m.id);
  store.save();
  res.json({ ok: true });
}));

app.get('/api/messages/:id/preview', wrap((req, res) => {
  const db = store.load();
  const m = getOr404(db.messages, req.params.id, 'Mensagem');
  const b = camp.build(db, m);
  res.json({
    counts: b.counts,
    excluded: b.excluded.map((e) => ({ ...e, reason_label: camp.REASONS[e.reason] })),
    sample: b.included.slice(0, 5).map((c) => ({ ...c, csv: camp.toCsv(m, [c]).split('\n')[1] })),
  });
}));

app.get('/api/messages/:id/csv', wrap((req, res) => {
  const db = store.load();
  const m = getOr404(db.messages, req.params.id, 'Mensagem');
  const contacts = m.mailing_name ? db.bases.find((b) => b.id === m.base_id)?.contacts.filter((c) => (m.phones || []).includes(c.phone)) || [] : camp.build(db, m).included;
  const file = `${(m.title || 'mailing').replace(/[^\w-]+/g, '_')}.csv`;
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${file}"` }).send(camp.toCsv(m, contacts));
}));

const creating = new Set();
// Template pausado ou rejeitado na Meta não sai: barra antes de criar. Se a Meta não responder, não barra.
async function assertTemplateUsable(channelId, templateName) {
  let health;
  try { health = await loopiee.metaHealth(channelId); } catch { return; }
  const t = (health.templates || []).find((x) => x.name === templateName);
  if (t && t.status !== 'APPROVED') throw fail(400, `O template ${templateName} está ${t.status} na Meta.`);
}

app.post('/api/messages/:id/create', wrap(async (req, res) => {
  const db = store.load();
  const m = getOr404(db.messages, req.params.id, 'Mensagem');
  const c = db.campaigns.find((x) => x.id === m.campaign_id);
  if (m.mailing_name) throw fail(409, 'Este mailing já foi criado.');
  if (creating.has(m.id)) throw fail(409, 'Já está sendo criado.');
  if (!c.channel_id) throw fail(400, 'Escolha o canal da campanha.');
  if (!m.template_id) throw fail(400, 'Escolha o template.');
  await assertTemplateUsable(c.channel_id, m.template_name);
  if (!m.base_id) throw fail(400, 'Escolha a base.');
  if (!m.scheduled_at) throw fail(400, 'Defina data e hora.');
  if (Date.parse(m.scheduled_at + ':00-03:00') < Date.now()) throw fail(400, 'A data/hora já passou. Ajuste antes de criar.');

  creating.add(m.id);
  try {
    // Puxa os retornos dos envios anteriores para valer quem saiu até agora.
    const syncErrors = await syncCampaign(db, c.id);
    if (syncErrors.length) throw fail(502, `Não consegui ler os retornos dos envios anteriores: ${syncErrors.join('; ')}`);
    const { included, counts } = camp.build(db, m);
    if (!included.length) throw fail(400, 'Ninguém sobrou para receber.');
    if (req.body.expected !== undefined && Number(req.body.expected) !== included.length) {
      throw fail(409, `A lista mudou desde a prévia: agora são ${included.length}. Confira e confirme de novo.`);
    }

    const name = mailingName(m.id, m.title, m.scheduled_at.replace('T', ' '));
    await loopiee.uploadMailing({
      name,
      channelId: c.channel_id,
      templateId: m.template_id,
      scheduledAt: m.scheduled_at + ':00-03:00',
      csv: camp.toCsv(m, included),
    });
    m.mailing_name = name;
    m.phones = included.map((x) => x.phone);
    m.created_counts = counts;
    m.mailing_created_at = store.now();
    store.save();
    try {
      m.mailing_id = await loopiee.findMailingId(name, c.channel_id);
      store.save();
    } catch (e) {
      console.error('Mailing criado, mas não achei o id agora:', e.message);
    }
    res.json({ ok: true, mailing_id: m.mailing_id || null, count: included.length });
  } finally {
    creating.delete(m.id);
  }
}));

async function createdMailing(db, id) {
  const m = getOr404(db.messages, id, 'Mensagem');
  if (!m.mailing_name) throw fail(409, 'Esta mensagem ainda não virou mailing.');
  if (!m.mailing_id) {
    const c = db.campaigns.find((x) => x.id === m.campaign_id);
    m.mailing_id = await loopiee.findMailingId(m.mailing_name, c.channel_id);
    if (!m.mailing_id) throw fail(502, 'Não achei este mailing no Chat Ativo.');
  }
  return m;
}

app.post('/api/messages/:id/pause', wrap(async (req, res) => {
  const db = store.load();
  const m = await createdMailing(db, req.params.id);
  await loopiee.pauseMailing(m.mailing_id);
  m.paused = true;
  store.save();
  res.json({ ok: true });
}));

app.post('/api/messages/:id/resume', wrap(async (req, res) => {
  const db = store.load();
  const m = await createdMailing(db, req.params.id);
  await loopiee.resumeMailing(m.mailing_id);
  m.paused = false;
  store.save();
  res.json({ ok: true });
}));

// Apaga no Chat Ativo (inclusive o histórico de quem já recebeu) e a mensagem volta a rascunho.
app.delete('/api/messages/:id/mailing', wrap(async (req, res) => {
  const db = store.load();
  const m = await createdMailing(db, req.params.id);
  if (!m.paused) throw fail(409, 'Pare o disparo antes de apagar.');
  await loopiee.deleteMailing(m.mailing_id);
  delete db.syncs[m.mailing_id];
  for (const k of ['mailing_name', 'mailing_id', 'phones', 'created_counts', 'mailing_created_at', 'paused']) delete m[k];
  store.save();
  res.json({ ok: true });
}));

// ---------- envio avulso ----------
// Imagem padrão de cada template: a da mensagem da campanha que usa esse template.
app.get('/api/campaigns/:id/template-images', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const map = {};
  for (const m of db.messages.filter((x) => x.campaign_id === c.id && x.template_id && x.image_url)) map[m.template_id] = m.image_url;
  res.json(map);
}));

app.get('/api/campaigns/:id/quick', wrap((req, res) => {
  const db = store.load();
  getOr404(db.campaigns, req.params.id, 'Campanha');
  res.json((db.quicksends || []).filter((q) => q.campaign_id === req.params.id).slice(-30).reverse());
}));

app.post('/api/campaigns/:id/quick', wrap(async (req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  if (!c.channel_id) throw fail(400, 'Escolha o canal da campanha.');
  const { template_id, template_name, image_url, variables, name } = req.body;
  if (!template_id) throw fail(400, 'Escolha o template.');
  await assertTemplateUsable(c.channel_id, template_name);
  if (image_url && !/^https:\/\//.test(image_url)) throw fail(400, 'O link da imagem precisa começar com https://');

  const manual = camp.manualSet(db, c.id);
  const { optout, semWhatsapp } = camp.feedback(db, c.id);
  const contacts = [];
  const skipped = [];
  const invalid = [];
  for (const token of String(req.body.phones || '').split(/[\n,;]+/)) {
    if (!token.trim()) continue;
    const phone = camp.normPhone(token);
    if (phone.length !== 10 && phone.length !== 11) { invalid.push(token.trim()); continue; }
    if (contacts.some((x) => x.phone === phone)) continue;
    const reason = manual.has(phone) ? 'manual' : optout.has(phone) ? 'optout' : semWhatsapp.has(phone) ? 'sem_whatsapp' : null;
    if (reason) { skipped.push({ phone, reason_label: camp.REASONS[reason] }); continue; }
    contacts.push({ phone, name: String(name || '').trim() });
  }
  if (invalid.length) throw fail(400, `Número inválido: ${invalid.join(', ')}`);
  if (!contacts.length) throw fail(400, skipped.length ? 'Todos os números estão na lista de removidos.' : 'Informe ao menos um número.');

  const msg = { image_url: image_url || null, variables: variables || null };
  const id = store.newId();
  const mname = mailingName(id, 'avulso', template_name || template_id);
  await loopiee.uploadMailing({ name: mname, channelId: c.channel_id, templateId: template_id, csv: camp.toCsv(msg, contacts) });
  db.quicksends ||= [];
  db.quicksends.push({ id, campaign_id: c.id, template_id, template_name, image_url: msg.image_url, phones: contacts.map((x) => x.phone), mailing_name: mname, created_at: store.now() });
  store.save();
  res.json({ ok: true, sent: contacts.length, skipped });
}));

// ---------- remoções ----------
app.get('/api/campaigns/:id/removals', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const names = new Map();
  for (const b of db.bases.filter((x) => x.campaign_id === c.id)) for (const k of b.contacts) if (!names.has(k.phone)) names.set(k.phone, k.name);
  const titles = new Map([...db.messages, ...(db.quicksends || [])].map((m) => [m.id, m.title || "Envio avulso"]));
  const { optout, semWhatsapp } = camp.feedback(db, c.id);
  const list = [
    ...db.removals.filter((r) => r.campaign_id === c.id).map((r) => ({ id: r.id, phone: r.phone, reason: 'manual', note: r.note, at: r.created_at })),
    ...[...optout].map(([phone, v]) => ({ phone, reason: 'optout', note: titles.get(v.message_id), at: v.at })),
    ...[...semWhatsapp].map(([phone, v]) => ({ phone, reason: 'sem_whatsapp', note: titles.get(v.message_id), at: v.at })),
  ].map((r) => ({ ...r, name: names.get(r.phone) || '', reason_label: camp.REASONS[r.reason] }));
  res.json(list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))));
}));

app.post('/api/campaigns/:id/removals', wrap((req, res) => {
  const db = store.load();
  const c = getOr404(db.campaigns, req.params.id, 'Campanha');
  const note = String(req.body.note || '').trim().slice(0, 200);
  const existing = camp.manualSet(db, c.id);
  const added = [];
  const invalid = [];
  for (const token of String(req.body.phones || '').split(/[\n,;]+/)) {
    if (!token.trim()) continue;
    const phone = camp.normPhone(token);
    if (phone.length !== 10 && phone.length !== 11) { invalid.push(token.trim()); continue; }
    if (existing.has(phone) || added.includes(phone)) continue;
    added.push(phone);
    db.removals.push({ id: store.newId(), campaign_id: c.id, phone, note, created_at: store.now() });
  }
  store.save();
  res.json({ added: added.length, invalid });
}));

app.delete('/api/removals/:id', wrap((req, res) => {
  const db = store.load();
  getOr404(db.removals, req.params.id, 'Remoção');
  db.removals = db.removals.filter((r) => r.id !== req.params.id);
  store.save();
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ msg: 'Rota não encontrada.' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const port = Number(process.env.PORT) || 3090;
app.listen(port, () => console.log(`gerenciador_zap na porta ${port}`));
