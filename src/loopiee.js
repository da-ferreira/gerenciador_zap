const BASE = () => (process.env.LOOPIEE_API_URL || '').replace(/\/$/, '');
let token = null;

async function login() {
  const r = await fetch(BASE() + '/signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: process.env.LOOPIEE_USERNAME, password: process.env.LOOPIEE_PASSWORD }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Login no Loopiee falhou: ${text}`);
  token = JSON.parse(text).token;
}

async function call(pathname, opts = {}, retry = true) {
  if (!token) await login();
  const r = await fetch(BASE() + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), authorization: `Bearer ${token}` },
  });
  if (r.status === 401 && retry) {
    token = null;
    return call(pathname, opts, false);
  }
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) {
    const msg = typeof body === 'string' ? body : body.msg || body.message || text;
    throw new Error(`Loopiee respondeu ${r.status}: ${msg}`);
  }
  return body;
}

async function listChannels() {
  const r = await call('/multichannel/channel?perPage=200');
  return (r.channels || []).map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

async function listTemplates(channelId) {
  const { channel } = await call(`/multichannel/channel/${channelId}`);
  let list = [];
  try { list = JSON.parse(channel.waba_templates || '[]'); } catch { list = []; }
  return list.map((t) => ({ id: t.template_id, name: t.name }));
}

const metaHealth = (channelId) => call(`/multichannel/channel/${channelId}/meta-health`);

async function uploadMailing({ name, channelId, templateId, scheduledAt, csv }) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('channel_id', String(channelId));
  fd.append('template_id', String(templateId));
  if (scheduledAt) fd.append('scheduled_at', scheduledAt);
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'mailing.csv');
  return call('/multichannel/mailing/upload', { method: 'POST', body: fd });
}

// O upload não devolve o id: acha pelo nome, que geramos único.
async function findMailingId(name, channelId) {
  const q = new URLSearchParams({ q: name.split(' · ')[0], channel_id: String(channelId), perPage: '10', orderBy: 'id', direction: 'desc' });
  const r = await call(`/multichannel/mailing?${q}`);
  const m = (r.mailings || []).find((x) => x.name === name);
  return m ? m.id : null;
}

async function mailingDetails(mailingId) {
  const rows = [];
  for (let page = 1; ; page++) {
    const r = await call(`/multichannel/mailing/${mailingId}/details?perPage=1000&currentPage=${page}&orderBy=id&direction=asc`);
    rows.push(...(r.details || []));
    if (page >= (r.totalPages || 1)) break;
  }
  return rows;
}

module.exports = { listChannels, listTemplates, metaHealth, uploadMailing, findMailingId, mailingDetails };
