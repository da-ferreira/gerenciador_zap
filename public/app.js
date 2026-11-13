const $app = document.getElementById('app');
const $dlg = document.getElementById('dlg');
const $dlgBody = document.getElementById('dlg-body');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtN = (n) => Number(n || 0).toLocaleString('pt-BR');
const fmtDate = (s) => (s ? new Date(s.length === 16 ? s + ':00-03:00' : s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const weekday = (s) => (s ? new Date(s + ':00-03:00').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' }) : '');
const fileOf = (url) => (url ? decodeURIComponent(url.split('/').pop()) : '');
const fmtPhone = (p) => (p ? `(${p.slice(0, 2)}) ${p.slice(2, -4)}-${p.slice(-4)}` : '');

function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), err ? 6000 : 3000);
}

async function api(path, opts = {}) {
  const r = await fetch('api' + path, {
    ...opts,
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401 && path !== '/login') { renderLogin(); throw new Error('Sessão expirada.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.msg || `Erro ${r.status}`);
  return data;
}

async function guard(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}

function openDialog(html, onSubmit) {
  $dlgBody.innerHTML = html;
  $dlg.showModal();
  $dlgBody.onsubmit = async (ev) => {
    const submitter = ev.submitter;
    if (!submitter || submitter.value === 'cancel') return;
    ev.preventDefault();
    await guard(submitter, async () => {
      if ((await onSubmit(new FormData($dlgBody), submitter)) !== false) $dlg.close();
    });
  };
}

// ---------- estado ----------
const state = { campaign: null, data: null, tab: 'mensagens', templates: null, templatesErr: null, health: null, healthErr: null };

// ---------- login ----------
function renderLogin() {
  $app.innerHTML = `
    <form class="card login" id="login">
      <h1>Gerenciador Zap</h1>
      <label>Senha<input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <button class="primary">Entrar</button>
    </form>`;
  document.getElementById('login').onsubmit = (ev) => {
    ev.preventDefault();
    guard(ev.submitter, async () => {
      await api('/login', { method: 'POST', body: { password: new FormData(ev.target).get('password') } });
      route();
    });
  };
}

// ---------- campanhas ----------
async function renderCampaigns() {
  const list = await api('/campaigns');
  $app.innerHTML = `
    <div class="wrap">
      <div class="row between">
        <h1>Campanhas</h1>
        <div class="row"><button id="new" class="primary">Nova campanha</button><button id="logout">Sair</button></div>
      </div>
      <div class="grid">
        ${list.map((c) => `
          <a class="card click" href="#/c/${c.id}" style="text-decoration:none;color:inherit">
            <h2>${esc(c.name)}</h2>
            <span class="muted small">${esc(c.channel_name || 'Sem canal')} · ${c.messages} mensagens</span>
          </a>`).join('') || '<p class="muted">Nenhuma campanha ainda.</p>'}
      </div>
    </div>`;
  document.getElementById('logout').onclick = async () => { await api('/logout', { method: 'POST' }); renderLogin(); };
  document.getElementById('new').onclick = () => openDialog(`
      <h2>Nova campanha</h2>
      <label>Nome<input name="name" required></label>
      <div class="row"><button class="primary" value="ok">Criar</button><button value="cancel" formnovalidate>Cancelar</button></div>`,
    async (fd) => {
      const c = await api('/campaigns', { method: 'POST', body: { name: fd.get('name') } });
      location.hash = `#/c/${c.id}`;
    });
}

// ---------- campanha ----------
async function loadCampaign(id) {
  state.data = await api(`/campaigns/${id}`);
  state.campaign = state.data.campaign;
}

async function loadTemplates() {
  if (state.templates || !state.campaign.channel_id) return;
  try {
    state.templates = await api(`/loopiee/channels/${state.campaign.channel_id}/templates`);
    state.templatesErr = null;
  } catch (e) {
    state.templatesErr = e.message;
  }
}

async function loadHealth() {
  if (state.health || !state.campaign.channel_id) return;
  try {
    state.health = await api(`/loopiee/channels/${state.campaign.channel_id}/meta-health`);
    state.healthErr = null;
  } catch (e) {
    state.healthErr = e.message;
  }
}

const QUALITY = { GREEN: ['Alta', ''], YELLOW: ['Média', 'warn'], RED: ['Baixa', 'danger'] };
const TIER = { TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: Infinity };
const qualityChip = (q) => (QUALITY[q] ? `<span class="chip ${QUALITY[q][1]}">Qualidade ${QUALITY[q][0]}</span>` : '<span class="chip gray">Qualidade sem nota</span>');
const tplHealth = (name) => state.health?.templates?.find((t) => t.name === name);

function tplChips(name) {
  const t = tplHealth(name);
  if (!t) return '';
  if (t.status !== 'APPROVED') return `<span class="chip danger">Template ${esc(t.status)} na Meta</span>`;
  return QUALITY[t.quality] ? qualityChip(t.quality) : '';
}

function healthCard() {
  const c = state.campaign;
  if (!c.channel_id) return '';
  if (state.healthErr) {
    const why = /404/.test(state.healthErr) ? 'o Loopiee ainda não tem a rota meta-health' : state.healthErr.slice(0, 200);
    return `<div class="alert">Qualidade do número indisponível: ${esc(why)}.</div>`;
  }
  const h = state.health;
  if (!h) return '';
  const p = h.phone;
  const tier = TIER[p.messaging_limit];
  const lowLimit = tier && c.limit_24h > tier;
  const bad = h.templates.filter((t) => t.status !== 'APPROVED').length;
  return `
    <div class="card">
      <div class="row between">
        <div class="grid" style="gap:2px">
          <h3>${esc(p.verified_name)} · ${esc(p.display_phone_number)}</h3>
          <span class="muted small">Lido na Meta às ${fmtDate(h.checked_at)}</span>
        </div>
        <button id="health-refresh">Reler</button>
      </div>
      <div class="row">
        ${qualityChip(p.quality_rating)}
        <span class="chip ${p.status === 'CONNECTED' ? '' : 'danger'}">Número ${esc(p.status)}</span>
        <span class="chip ${lowLimit ? 'danger' : 'gray'}">Limite ${tier === Infinity ? 'ilimitado' : tier ? fmtN(tier) + ' pessoas/24h' : 'não informado'}</span>
        ${bad ? `<span class="chip danger">${bad} template(s) fora do ar</span>` : ''}
      </div>
      ${lowLimit ? `<div class="alert danger">O limite da Meta (${fmtN(tier)}) é menor que o da campanha (${fmtN(c.limit_24h)}). Ajuste em Configuração.</div>` : ''}
      ${h.waba_mismatch ? '<div class="alert">O número não pertence à conta (WABA) cadastrada no canal: o status dos templates não pôde ser conferido.</div>' : ''}
    </div>`;
}

async function renderCampaign(id, keepTab) {
  if (!keepTab || state.campaign?.id !== id) { state.templates = null; state.health = null; state.healthErr = null; if (state.campaign?.id !== id) state.tab = 'mensagens'; }
  await loadCampaign(id);
  await loadHealth();
  const c = state.campaign;
  const tabs = [['mensagens', 'Mensagens'], ['envios', 'Envios'], ['bases', 'Bases'], ['removidos', 'Removidos'], ['avulso', 'Envio avulso'], ['config', 'Configuração']];
  $app.innerHTML = `
    <div class="wrap">
      <div class="grid" style="gap:4px">
        <a href="#/" class="small">← Campanhas</a>
        <div class="row between">
          <h1>${esc(c.name)}</h1>
          <div class="row">
            <span class="muted small">Retornos lidos: ${c.synced_at ? fmtDate(c.synced_at) : 'nunca'}</span>
            <button id="sync">Atualizar retornos</button>
          </div>
        </div>
        <span class="muted small">${esc(c.channel_name || 'Sem canal')} · limite ${fmtN(c.limit_24h)} pessoas/24h · removidos: ${fmtN(state.data.removed.manual)} à mão, ${fmtN(state.data.removed.optout)} pediram para sair, ${fmtN(state.data.removed.sem_whatsapp)} não entregáveis</span>
      </div>
      ${!c.channel_id ? '<div class="alert">Escolha o canal em Configuração antes de criar mailings.</div>' : ''}
      ${healthCard()}
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}</button>`).join('')}</div>
      <div id="tab"></div>
    </div>`;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; renderCampaign(id, true); }));
  document.getElementById('sync').onclick = (ev) => guard(ev.target, async () => {
    const r = await api(`/campaigns/${id}/sync`, { method: 'POST' });
    if (r.errors.length) toast(r.errors.join(' | '), true); else toast('Retornos atualizados.');
    renderCampaign(id, true);
  });
  const $refresh = document.getElementById('health-refresh');
  if ($refresh) $refresh.onclick = () => { state.health = null; state.healthErr = null; renderCampaign(id, true); };
  const $tab = document.getElementById('tab');
  await ({ mensagens: tabMessages, envios: tabSends, bases: tabBases, removidos: tabRemovals, avulso: tabQuick, config: tabConfig })[state.tab]($tab);
}

const reload = () => renderCampaign(state.campaign.id, true);

// ---------- envios ----------
const SEND_STATUS = { pending: ['Na fila', 'gray'], sent: ['Enviado', 'gray'], delivered: ['Entregue', ''], read: ['Lido', ''], failed: ['Falhou', 'danger'] };
state.sends = { q: '', status: '' };
const ERROR_CODES = { 131049: 'Bloqueio de marketing da Meta', 131026: 'Não entregável (sem WhatsApp)', 131047: 'Fora da janela de 24h', 131050: 'Pessoa parou de receber marketing', 132001: 'Template não existe ou não aprovado' };

async function tabSends($tab) {
  const f = state.sends;
  const qs = (offset) => `?q=${encodeURIComponent(f.q)}&status=${f.status}&offset=${offset}`;
  const data = await api(`/campaigns/${state.campaign.id}/sends${qs(0)}`);
  const row = (x) => `<tr>
      <td>${fmtDate(x.at)}</td>
      <td><button class="link" data-phone="${esc(x.phone)}">${esc(fmtPhone(x.phone))}</button><br><span class="muted small">${esc(x.name)}</span></td>
      <td>${esc(x.title)}${x.template ? `<br><span class="muted small">${esc(x.template)}</span>` : ''}</td>
      <td><span class="chip ${SEND_STATUS[x.status][1]}">${SEND_STATUS[x.status][0]}</span>${x.code ? `<br><span class="muted small" title="${esc(x.error || '')}">${esc(x.code)} · ${esc(ERROR_CODES[x.code] || x.error || '')}</span>` : ''}</td>
      <td class="small">${esc(x.button || '')}</td>
    </tr>`;
  const filters = [['', 'Todos', data.counts.all], ...Object.entries(SEND_STATUS).map(([k, [l]]) => [k, l, data.counts[k]])];
  $tab.innerHTML = `
    <div class="grid">
      <div class="row">
        <input id="sq" type="search" placeholder="Buscar por número ou nome" value="${esc(f.q)}" style="max-width:280px">
        ${filters.map(([k, l, n]) => `<button data-st="${k}" class="${f.status === k ? 'primary' : ''}">${l} (${fmtN(n)})</button>`).join('')}
      </div>
      <span class="muted small">Retornos de ${fmtDate(state.campaign.synced_at)}. Clique em "Atualizar retornos" para ler de novo. Clique no número para ver só os envios dele.</span>
      ${data.total ? `<div class="card scroll"><table>
        <thead><tr><th>Quando</th><th>Número</th><th>Mensagem</th><th>Status</th><th>Botão</th></tr></thead>
        <tbody id="srows">${data.rows.map(row).join('')}</tbody></table></div>` : '<p class="muted">Nenhum envio com retorno lido.</p>'}
      ${data.total > data.rows.length ? `<button id="smore">Mostrar mais (${fmtN(data.total - data.rows.length)} restantes)</button>` : ''}
    </div>`;
  const $q = document.getElementById('sq');
  $q.onkeydown = (ev) => { if (ev.key === 'Enter') { f.q = $q.value.trim(); tabSends($tab); } };
  $q.onsearch = () => { f.q = $q.value.trim(); tabSends($tab); };
  $tab.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { f.status = b.dataset.st; tabSends($tab); }));
  const bindPhones = (el) => el.querySelectorAll('[data-phone]').forEach((b) => (b.onclick = () => { f.q = b.dataset.phone; f.status = ''; tabSends($tab); }));
  bindPhones($tab);
  let shown = data.rows.length;
  const $more = document.getElementById('smore');
  if ($more) $more.onclick = () => guard($more, async () => {
    const next = await api(`/campaigns/${state.campaign.id}/sends${qs(shown)}`);
    const $rows = document.getElementById('srows');
    $rows.insertAdjacentHTML('beforeend', next.rows.map(row).join(''));
    bindPhones($rows);
    shown += next.rows.length;
    if (shown >= next.total) $more.remove(); else $more.textContent = `Mostrar mais (${fmtN(next.total - shown)} restantes)`;
  });
}

// ---------- mensagens ----------
function msgStatus(m) {
  if (m.mailing_name) return `<span class="chip">Criado no Chat Ativo${m.mailing_id ? ` · #${m.mailing_id}` : ''}</span>`;
  return '<span class="chip gray">Rascunho</span>';
}

function msgNumbers(m) {
  if (m.stats) {
    const s = m.stats;
    if (!s.total) return `<div class="nums"><span><b>${fmtN(m.created_counts?.included)}</b> no mailing</span><span class="muted">sem retorno lido ainda</span></div>`;
    return `<div class="nums">
      <span><b>${fmtN(s.total)}</b> no mailing</span>
      ${s.pending ? `<span>${fmtN(s.pending)} na fila</span>` : ''}
      <span>${fmtN(s.sent)} enviados</span><span>${fmtN(s.delivered)} entregues</span><span><b>${fmtN(s.read)}</b> lidos</span>
      <span>${fmtN(s.failed)} falharam</span><span>${fmtN(s.clicked)} clicaram</span><span>${fmtN(s.optout)} saíram</span></div>`;
  }
  const p = m.preview;
  if (!p || !p.base) return '<span class="muted small">Escolha a base para ver a conta.</span>';
  const out = p.base - p.included;
  return `<div class="nums"><span>${fmtN(p.base)} na base</span><span>${fmtN(out)} saem</span><span><b>${fmtN(p.included)} vão receber</b></span></div>`;
}

async function tabMessages($tab) {
  const { messages, bases, campaign } = state.data;
  const baseName = (id) => bases.find((b) => b.id === id)?.name || '—';
  $tab.innerHTML = `
    <div class="grid">
      <div class="row between"><span class="muted small">Ordenadas por data. A conta de quem recebe é refeita na hora de criar.</span><button id="add" class="primary">Nova mensagem</button></div>
      ${messages.map((m) => {
        const over = campaign.limit_24h && m.window_24h > campaign.limit_24h;
        return `
        <div class="card">
          <div class="row between">
            <div class="grid" style="gap:2px">
              <h3>${esc(m.title)}</h3>
              <span class="muted small">${m.scheduled_at ? `${weekday(m.scheduled_at)} ${fmtDate(m.scheduled_at)}` : 'Sem data'} · base ${esc(baseName(m.base_id))} · ${esc(m.template_name || 'sem template')}</span>
            </div>
            ${msgStatus(m)}
          </div>
          ${msgNumbers(m)}
          <div class="row small">
            ${m.image_url ? `<span class="thumb">Imagem: ${esc(fileOf(m.image_url))}</span>` : '<span class="thumb">Sem imagem</span>'}
            ${m.mailing_name ? '' : tplChips(m.template_name)}
            ${m.window_24h != null ? `<span class="chip ${over ? 'danger' : 'gray'}">${fmtN(m.window_24h)} pessoas nas 24h${over ? ` — passa de ${fmtN(campaign.limit_24h)}` : ''}</span>` : ''}
          </div>
          <div class="row">
            ${m.mailing_name ? '' : `<button data-act="edit" data-id="${m.id}">Editar</button><button data-act="preview" data-id="${m.id}">Ver quem sai</button>`}
            <a class="btn" href="api/messages/${m.id}/csv">Baixar CSV</a>
            ${m.mailing_name ? '' : `<button class="primary" data-act="create" data-id="${m.id}">Criar no Chat Ativo</button><button class="danger" data-act="del" data-id="${m.id}">Apagar</button>`}
          </div>
        </div>`;
      }).join('') || '<p class="muted">Nenhuma mensagem.</p>'}
    </div>`;
  document.getElementById('add').onclick = () => editMessage(null);
  $tab.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const m = messages.find((x) => x.id === b.dataset.id);
    ({ edit: () => editMessage(m), preview: () => previewMessage(m), create: () => createMailing(m, b), del: () => deleteMessage(m, b) })[b.dataset.act]();
  }));
}

function knownImages() {
  return [...new Set(state.data.messages.map((m) => m.image_url).filter(Boolean))];
}

function templateOptions(selected) {
  if (state.templatesErr) return `<option value="">Não consegui listar: ${esc(state.templatesErr)}</option>`;
  if (!state.templates) return '<option value="">Escolha o canal da campanha</option>';
  return '<option value="">Escolha…</option>' + state.templates.map((t) => {
    const h = tplHealth(t.name);
    const tag = !h ? '' : h.status !== 'APPROVED' ? ` — ${h.status}` : QUALITY[h.quality] ? ` — qualidade ${QUALITY[h.quality][0].toLowerCase()}` : '';
    return `<option value="${esc(t.id)}" ${String(t.id) === String(selected) ? 'selected' : ''}>${esc(t.name + tag)}</option>`;
  }).join('');
}

async function editMessage(m) {
  await loadTemplates();
  const v = m || {};
  openDialog(`
    <h2>${m ? 'Editar mensagem' : 'Nova mensagem'}</h2>
    <label>Título<input name="title" value="${esc(v.title || '')}" required placeholder="Ex.: 1 · Você foi selecionado"></label>
    <div class="two">
      <label>Base<select name="base_id" required><option value="">Escolha…</option>${state.data.bases.map((b) => `<option value="${b.id}" ${b.id === v.base_id ? 'selected' : ''}>${esc(b.name)} (${fmtN(b.size)})</option>`).join('')}</select></label>
      <label>Data e hora (Brasília)<input type="datetime-local" name="scheduled_at" value="${esc(v.scheduled_at || '')}" required></label>
    </div>
    <label>Template<select name="template_id">${templateOptions(v.template_id)}</select></label>
    <label>Link da imagem (vazio = sem imagem)<input name="image_url" list="imgs" value="${esc(v.image_url || '')}" placeholder="https://…"></label>
    <datalist id="imgs">${knownImages().map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
    <label>Variáveis do template (separe por |; aceita {{nome}} e {{primeiro_nome}})<input name="variables" value="${esc(v.variables || '')}" placeholder="Vazio se o template não tem variáveis"></label>
    <div class="row"><button class="primary" value="ok">Salvar</button><button value="cancel" formnovalidate>Cancelar</button></div>`,
  async (fd) => {
    const tpl = state.templates?.find((t) => String(t.id) === fd.get('template_id'));
    const body = { title: fd.get('title'), base_id: fd.get('base_id'), scheduled_at: fd.get('scheduled_at'), template_id: fd.get('template_id'), template_name: tpl?.name || v.template_name || '', image_url: fd.get('image_url').trim(), variables: fd.get('variables').trim() };
    if (m) await api(`/messages/${m.id}`, { method: 'PUT', body });
    else await api(`/campaigns/${state.campaign.id}/messages`, { method: 'POST', body });
    toast('Mensagem salva.');
    reload();
  });
}

async function previewMessage(m) {
  const p = await guard(null, () => api(`/messages/${m.id}/preview`));
  if (!p) return;
  const c = p.counts;
  openDialog(`
    <h2>${esc(m.title)}</h2>
    <div class="nums"><span>${fmtN(c.base)} na base</span><span><b>${fmtN(c.included)} vão receber</b></span></div>
    <div class="nums small muted"><span>${fmtN(c.manual)} à mão</span><span>${fmtN(c.optout)} pediram para sair</span><span>${fmtN(c.sem_whatsapp)} não entregáveis</span><span>${fmtN(c.marketing)} bloqueio de marketing</span></div>
    ${p.excluded.length ? `<div class="scroll"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Motivo</th></tr></thead><tbody>
      ${p.excluded.map((e) => `<tr><td>${esc(e.name)}</td><td>${fmtPhone(e.phone)}</td><td>${esc(e.reason_label)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Ninguém sai desta base.</p>'}
    ${p.sample.length ? `<h3>Primeiras linhas do CSV</h3><code>${p.sample.map((s) => esc(s.csv)).join('<br>')}</code>` : ''}
    <div class="row"><button value="cancel">Fechar</button></div>`, () => {});
}

async function createMailing(m, btn) {
  const p = await guard(btn, async () => {
    await api(`/campaigns/${state.campaign.id}/sync`, { method: 'POST' });
    return api(`/messages/${m.id}/preview`);
  });
  if (!p) return;
  const c = p.counts;
  openDialog(`
    <h2>Criar no Chat Ativo</h2>
    <p><b>${esc(m.title)}</b><br><span class="muted">${weekday(m.scheduled_at)} ${fmtDate(m.scheduled_at)} · ${esc(m.template_name || '')}</span></p>
    <div class="nums"><span>${fmtN(c.base)} na base</span><span>${fmtN(c.base - c.included)} saem</span><span><b>${fmtN(c.included)} vão receber</b></span></div>
    <p class="small muted">${m.image_url ? `Imagem: ${esc(fileOf(m.image_url))}` : 'Sem imagem'}. O mailing entra agendado e dispara sozinho no horário. Depois de criado, parar ou mudar o horário é pela tela do Chat Ativo.</p>
    <div class="row"><button class="primary" value="ok">Criar com ${fmtN(c.included)}</button><button value="cancel">Cancelar</button></div>`,
  async () => {
    const r = await api(`/messages/${m.id}/create`, { method: 'POST', body: { expected: c.included } });
    toast(`Mailing criado com ${fmtN(r.count)} contatos${r.mailing_id ? ` (#${r.mailing_id})` : ''}.`);
    reload();
  });
}

function deleteMessage(m, btn) {
  if (!confirm(`Apagar "${m.title}"?`)) return;
  guard(btn, async () => { await api(`/messages/${m.id}`, { method: 'DELETE' }); reload(); });
}

// ---------- bases ----------
async function tabBases($tab) {
  const { bases } = state.data;
  $tab.innerHTML = `
    <div class="grid">
      <form class="card" id="up">
        <h3>Importar base</h3>
        <p class="muted small">CSV com nome e telefone (colunas <code>nome,ddd,numero</code> ou <code>nome,telefone</code>; vírgula ou ponto e vírgula). Duplicados e números inválidos ficam de fora.</p>
        <div class="two">
          <label>Nome da base<input name="name" required placeholder="Ex.: Geral"></label>
          <label>Arquivo<input type="file" name="file" accept=".csv,text/csv" required></label>
        </div>
        <div class="row"><button class="primary">Importar</button></div>
      </form>
      ${bases.map((b) => `
        <div class="card">
          <div class="row between"><h3>${esc(b.name)}</h3><button class="danger" data-del="${b.id}">Apagar</button></div>
          <div class="nums"><span><b>${fmtN(b.size)}</b> contatos</span><span>${fmtN(b.report.lines)} linhas no arquivo</span><span>${fmtN(b.report.duplicates)} duplicados</span><span>${fmtN(b.report.invalid_count)} inválidos</span><span>${fmtN(b.report.landlines)} fixos</span></div>
          ${b.report.invalid?.length ? `<details><summary class="small">Ver inválidos</summary><code>${b.report.invalid.map((i) => `linha ${i.line}: ${esc(i.value)}`).join('<br>')}</code></details>` : ''}
        </div>`).join('')}
    </div>`;
  document.getElementById('up').onsubmit = (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    guard(ev.submitter, async () => {
      const csv = await fd.get('file').text();
      const b = await api(`/campaigns/${state.campaign.id}/bases`, { method: 'POST', body: { name: fd.get('name'), csv } });
      toast(`Base importada: ${fmtN(b.size)} contatos.`);
      reload();
    });
  };
  $tab.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    if (!confirm('Apagar esta base?')) return;
    guard(b, async () => { await api(`/bases/${b.dataset.del}`, { method: 'DELETE' }); reload(); });
  }));
}

// ---------- removidos ----------
async function tabRemovals($tab) {
  const list = await api(`/campaigns/${state.campaign.id}/removals`);
  $tab.innerHTML = `
    <div class="grid">
      <form class="card" id="rm">
        <h3>Remover números</h3>
        <p class="muted small">Vale para todos os próximos mailings da campanha. Um número por linha (com ou sem DDD 55).</p>
        <label>Números<textarea name="phones" required placeholder="11999998888"></textarea></label>
        <label>Motivo (opcional)<input name="note" placeholder="Ex.: pediu por telefone"></label>
        <div class="row"><button class="primary">Remover</button></div>
      </form>
      <div class="card">
        <div class="row between"><h3>${fmtN(list.length)} fora da campanha</h3><input id="q" placeholder="Buscar nome ou telefone" style="max-width:260px"></div>
        <p class="muted small">"Pediu para sair" e "Não entregável" vêm dos retornos dos envios (botão Atualizar retornos). Só a remoção à mão pode ser desfeita aqui.</p>
        <div class="scroll"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Motivo</th><th>Origem</th><th>Quando</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      </div>
    </div>`;
  const draw = (q) => {
    const n = q.replace(/\D/g, '');
    const t = q.trim().toLowerCase();
    document.getElementById('rows').innerHTML = list
      .filter((r) => !t || r.name.toLowerCase().includes(t) || (n && r.phone.includes(n)))
      .map((r) => `<tr><td>${esc(r.name)}</td><td>${fmtPhone(r.phone)}</td><td>${esc(r.reason_label)}</td><td>${esc(r.note || '')}</td><td>${r.at ? fmtDate(r.at) : ''}</td>
        <td>${r.id ? `<button class="link" data-undo="${r.id}">Desfazer</button>` : ''}</td></tr>`).join('');
    document.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => guard(b, async () => { await api(`/removals/${b.dataset.undo}`, { method: 'DELETE' }); reload(); })));
  };
  draw('');
  document.getElementById('q').oninput = (ev) => draw(ev.target.value);
  document.getElementById('rm').onsubmit = (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    guard(ev.submitter, async () => {
      const r = await api(`/campaigns/${state.campaign.id}/removals`, { method: 'POST', body: { phones: fd.get('phones'), note: fd.get('note') } });
      toast(`${r.added} removidos.${r.invalid.length ? ` Inválidos: ${r.invalid.join(', ')}` : ''}`, r.invalid.length > 0);
      reload();
    });
  };
}

// ---------- envio avulso ----------
async function tabQuick($tab) {
  await loadTemplates();
  const [images, history] = await Promise.all([api(`/campaigns/${state.campaign.id}/template-images`), api(`/campaigns/${state.campaign.id}/quick`)]);
  $tab.innerHTML = `
    <div class="grid">
      <form class="card" id="qs">
        <h3>Enviar um HSM agora</h3>
        <p class="muted small">Sai na hora pelo canal da campanha. Ao escolher o template, a imagem dele já vem marcada. Números removidos da campanha são pulados.</p>
        <label>Template<select name="template_id" required>${templateOptions('')}</select></label>
        <label>Imagem<select name="image_pick">
          <option value="">Sem imagem</option>
          ${knownImages().map((u) => `<option value="${esc(u)}">${esc(fileOf(u))}</option>`).join('')}
          <option value="outro">Outro link…</option>
        </select></label>
        <label id="qs-other" hidden>Link da imagem<input name="image_other" placeholder="https://…"></label>
        <div class="two">
          <label>Números (um por linha)<textarea name="phones" required placeholder="11999998888"></textarea></label>
          <div class="grid" style="align-content:start">
            <label>Nome (para {{nome}})<input name="name"></label>
            <label>Variáveis (separe por |)<input name="variables" placeholder="Vazio se o template não tem variáveis"></label>
          </div>
        </div>
        <div class="row"><button class="primary">Enviar agora</button></div>
      </form>
      <div class="card">
        <h3>Últimos envios avulsos</h3>
        ${history.length ? `<div class="scroll"><table><thead><tr><th>Quando</th><th>Template</th><th>Números</th><th>Imagem</th></tr></thead><tbody>
          ${history.map((h) => `<tr><td>${fmtDate(h.created_at)}</td><td>${esc(h.template_name || h.template_id)}</td><td>${h.phones.map(fmtPhone).join('<br>')}</td><td class="thumb">${esc(fileOf(h.image_url)) || '—'}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small">Nenhum ainda.</p>'}
      </div>
    </div>`;
  const form = document.getElementById('qs');
  const other = document.getElementById('qs-other');
  form.image_pick.onchange = () => { other.hidden = form.image_pick.value !== 'outro'; };
  // Vínculo pela mensagem da campanha; sem ele, pelo nome (vgx_cms26_01_x ↔ 01_x.png).
  form.template_id.onchange = () => {
    const name = state.templates?.find((t) => String(t.id) === form.template_id.value)?.name || '';
    form.image_pick.value = images[form.template_id.value]
      || knownImages().find((u) => name.endsWith(fileOf(u).replace(/\.\w+$/, ''))) || '';
    form.image_pick.onchange();
  };
  form.onsubmit = (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const tpl = state.templates?.find((t) => String(t.id) === fd.get('template_id'));
    const count = String(fd.get('phones')).split(/[\n,;]+/).filter((s) => s.trim()).length;
    if (!confirm(`Enviar "${tpl?.name || fd.get('template_id')}" agora para ${count} número(s)?`)) return;
    guard(ev.submitter, async () => {
      const r = await api(`/campaigns/${state.campaign.id}/quick`, {
        method: 'POST',
        body: { template_id: fd.get('template_id'), template_name: tpl?.name, image_url: (fd.get('image_pick') === 'outro' ? fd.get('image_other') : fd.get('image_pick')).trim(), phones: fd.get('phones'), name: fd.get('name'), variables: fd.get('variables').trim() },
      });
      toast(`Enviado para ${r.sent}.${r.skipped.length ? ` Pulados: ${r.skipped.map((s) => `${fmtPhone(s.phone)} (${s.reason_label})`).join(', ')}` : ''}`, r.skipped.length > 0);
      reload();
    });
  };
}

// ---------- configuração ----------
async function tabConfig($tab) {
  const c = state.campaign;
  const locked = state.data.messages.some((m) => m.mailing_name);
  let channels = [];
  let err = '';
  try { channels = await api('/loopiee/channels'); } catch (e) { err = e.message; }
  $tab.innerHTML = `
    <form class="card" id="cfg">
      <label>Nome<input name="name" value="${esc(c.name)}" required></label>
      <label>Canal do Chat Ativo${locked ? ' (travado: já há mailing criado)' : ''}
        <select name="channel_id" ${locked ? 'disabled' : ''}>
          ${err ? `<option value="${esc(c.channel_id || '')}">Não consegui listar: ${esc(err)}</option>` : `<option value="">Escolha…</option>${channels.map((ch) => `<option value="${ch.id}" ${String(ch.id) === String(c.channel_id) ? 'selected' : ''}>${esc(ch.name)} (${esc(ch.type)})</option>`).join('')}`}
        </select></label>
      <div class="two">
        <label>Texto do botão de saída<input name="optout_text" value="${esc(c.optout_text)}"></label>
        <label>Limite de pessoas diferentes em 24h<input type="number" name="limit_24h" min="0" value="${c.limit_24h}"></label>
      </div>
      <div class="row"><button class="primary">Salvar</button></div>
    </form>`;
  document.getElementById('cfg').onsubmit = (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = { name: fd.get('name'), optout_text: fd.get('optout_text'), limit_24h: fd.get('limit_24h') };
    if (!locked && !err) {
      const ch = channels.find((x) => String(x.id) === fd.get('channel_id'));
      body.channel_id = ch?.id || null;
      body.channel_name = ch?.name || null;
    }
    guard(ev.submitter, async () => {
      await api(`/campaigns/${c.id}`, { method: 'PUT', body });
      state.templates = null;
      toast('Salvo.');
      reload();
    });
  };
}

// ---------- rotas ----------
async function route() {
  const me = await fetch('api/me').then((r) => r.json()).catch(() => ({}));
  if (!me.logged) return renderLogin();
  const m = location.hash.match(/^#\/c\/([\w-]+)/);
  try {
    if (m) await renderCampaign(m[1], state.campaign?.id === m[1]);
    else await renderCampaigns();
  } catch (e) {
    toast(e.message, true);
  }
}
window.addEventListener('hashchange', route);
route();
