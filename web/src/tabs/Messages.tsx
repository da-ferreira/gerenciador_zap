import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card, Field, FormModal, Muted, Nums, Table, Tag, linkButton } from '../components/kit'
import { api, type Message, type Preview } from '../lib/api'
import { QUALITY, knownImages, syncReturns, templateOptions, tplHealth, useCampaign } from '../lib/campaign'
import { confirm, guard, toast } from '../lib/feedback'
import { fileOf, fmtDate, fmtN, fmtPhone, weekday } from '../lib/format'

// Every line already left the Loopiee (by the last read): nothing to stop.
const msgDone = (m: Message) => !!(m.stats && m.stats.total && !m.stats.pending)

function MsgStatus({ m }: { m: Message }) {
  const id = m.mailing_id ? ` · #${m.mailing_id}` : ''
  if (m.mailing_name && m.paused) return <Tag tone="danger">Parado{id}</Tag>
  if (m.mailing_name && msgDone(m)) return <Tag tone="ok">Disparo concluído{id}</Tag>
  if (m.mailing_name) return <Tag tone="brand">Criado no Chat Ativo{id}</Tag>
  return <Tag>Rascunho</Tag>
}

function MsgNumbers({ m }: { m: Message }) {
  if (m.stats) {
    const s = m.stats
    if (!s.total)
      return (
        <Nums>
          <span><b className="font-semibold">{fmtN(m.created_counts?.included)}</b> no mailing</span>
          <span className="text-dim">sem retorno lido ainda</span>
        </Nums>
      )
    return (
      <Nums>
        <span><b className="font-semibold">{fmtN(s.total)}</b> no mailing</span>
        {s.pending > 0 && <span>{fmtN(s.pending)} na fila</span>}
        <span>{fmtN(s.sent)} enviados</span>
        <span>{fmtN(s.delivered)} entregues</span>
        <span><b className="font-semibold">{fmtN(s.read)}</b> lidos</span>
        <span>{fmtN(s.failed)} falharam</span>
        <span>{fmtN(s.clicked)} clicaram</span>
        <span>{fmtN(s.optout)} saíram</span>
      </Nums>
    )
  }
  const p = m.preview
  if (!p || !p.base) return <Muted>Escolha a base para ver a conta.</Muted>
  return (
    <Nums>
      <span>{fmtN(p.base)} na base</span>
      <span>{fmtN(p.out ?? p.base - p.included)} saem</span>
      <b className="font-semibold">{fmtN(p.included)} vão receber</b>
      {m.only_engaged && <Tag>Só quem leu</Tag>}
    </Nums>
  )
}

function TplTag({ name }: { name: string }) {
  const { health } = useCampaign()
  const t = tplHealth(health, name)
  if (!t) return null
  if (t.status !== 'APPROVED') return <Tag tone="danger">Template {t.status} na Meta</Tag>
  const q = QUALITY[t.quality]
  return q ? <Tag tone={q[1]}>Template: qualidade {q[0].toLowerCase()}</Tag> : <Tag>Template: qualidade pendente</Tag>
}

const MAILING_ACTIONS = {
  pause: ['POST', 'pause', 'Parar o disparo de "%s"? Quem ainda não recebeu fica parado até você retomar.', 'Disparo parado.', 'Parar disparo'],
  resume: ['POST', 'resume', 'Retomar o disparo de "%s"?', 'Disparo retomado.', 'Retomar'],
  unmail: ['DELETE', 'mailing', 'Apagar o mailing de "%s" no Chat Ativo? Some também o histórico de quem já recebeu e não dá para desfazer. A mensagem volta a rascunho.', 'Mailing apagado. A mensagem voltou a rascunho.', 'Apagar mailing'],
} as const

type Dialog = { kind: 'edit'; m: Message | null } | { kind: 'preview'; m: Message; p: Preview } | { kind: 'create'; m: Message; p: Preview }

export function Messages() {
  const { data, reload } = useCampaign()
  const { messages, bases, campaign } = data
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const baseName = (id: string) => bases.find((b) => b.id === id)?.name || '—'

  const busy = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id)
    await guard(fn)
    setBusyId(null)
  }

  const mailingAction = async (m: Message, act: keyof typeof MAILING_ACTIONS) => {
    const [method, path, ask, done, label] = MAILING_ACTIONS[act]
    if (!(await confirm(ask.replace('%s', m.title), { confirmLabel: label, danger: act !== 'resume' }))) return
    busy(m.id, async () => {
      await api(`/messages/${m.id}/${path}`, { method })
      toast(done)
      await reload()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Muted>Ordenadas por data. A conta de quem recebe é refeita na hora de criar.</Muted>
        <Button onClick={() => setDialog({ kind: 'edit', m: null })}>Nova mensagem</Button>
      </div>
      {!messages.length && <Muted>Nenhuma mensagem.</Muted>}
      {messages.map((m) => {
        const over = !!campaign.limit_24h && (m.window_24h ?? 0) > campaign.limit_24h
        const disabled = busyId === m.id
        return (
          <Card key={m.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold break-words">{m.title}</h3>
                <Muted>
                  {m.scheduled_at ? `${weekday(m.scheduled_at)} ${fmtDate(m.scheduled_at)}` : 'Sem data'} · base {baseName(m.base_id)} ·{' '}
                  {m.template_name || 'sem template'}
                </Muted>
              </div>
              <MsgStatus m={m} />
            </div>
            <MsgNumbers m={m} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] break-all text-dim">{m.image_url ? `Imagem: ${fileOf(m.image_url)}` : 'Sem imagem'}</span>
              <TplTag name={m.template_name} />
              {m.window_24h != null && (
                <Tag tone={over ? 'danger' : 'neutral'}>
                  {fmtN(m.window_24h)} pessoas nas 24h{over && ` — passa de ${fmtN(campaign.limit_24h)}`}
                </Tag>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!m.mailing_name && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'edit', m })}>
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      busy(m.id, async () => setDialog({ kind: 'preview', m, p: await api<Preview>(`/messages/${m.id}/preview`) }))
                    }
                  >
                    Ver quem sai
                  </Button>
                </>
              )}
              <a className={linkButton} href={`api/messages/${m.id}/csv`}>
                Baixar CSV
              </a>
              {m.mailing_name && !m.paused && !msgDone(m) && (
                <Button variant="danger" size="sm" disabled={disabled} onClick={() => mailingAction(m, 'pause')}>
                  Parar disparo
                </Button>
              )}
              {m.mailing_name && m.paused && (
                <>
                  <Button variant="secondary" size="sm" disabled={disabled} onClick={() => mailingAction(m, 'resume')}>
                    Retomar
                  </Button>
                  <Button variant="danger" size="sm" disabled={disabled} onClick={() => mailingAction(m, 'unmail')}>
                    Apagar mailing
                  </Button>
                </>
              )}
              {!m.mailing_name && (
                <>
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      busy(m.id, async () => {
                        await syncReturns(campaign.id)
                        setDialog({ kind: 'create', m, p: await api<Preview>(`/messages/${m.id}/preview`) })
                      })
                    }
                  >
                    Criar no Chat Ativo
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    disabled={disabled}
                    onClick={async () => {
                      if (!(await confirm(`Apagar "${m.title}"?`, { confirmLabel: 'Apagar', danger: true }))) return
                      busy(m.id, async () => {
                        await api(`/messages/${m.id}`, { method: 'DELETE' })
                        await reload()
                      })
                    }}
                  >
                    Apagar
                  </Button>
                </>
              )}
            </div>
          </Card>
        )
      })}

      {dialog?.kind === 'edit' && <EditMessage m={dialog.m} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'preview' && <PreviewMessage m={dialog.m} p={dialog.p} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'create' && <CreateMailing m={dialog.m} p={dialog.p} onClose={() => setDialog(null)} />}
    </div>
  )
}

function EditMessage({ m, onClose }: { m: Message | null; onClose: () => void }) {
  const { data, templates, templatesErr, health, reload, loadTemplates } = useCampaign()
  useEffect(() => loadTemplates(), [loadTemplates])
  const [v, setV] = useState({
    title: m?.title ?? '',
    base_id: m?.base_id ?? '',
    scheduled_at: m?.scheduled_at ?? '',
    template_id: m?.template_id != null ? String(m.template_id) : '',
    image_url: m?.image_url ?? '',
    variables: m?.variables ?? '',
    only_engaged: m?.only_engaged ? '1' : '',
  })
  const [missing, setMissing] = useState(false)
  const set = (k: keyof typeof v) => (value: string) => setV((s) => ({ ...s, [k]: value }))
  const tplPlaceholder = templatesErr
    ? `Não consegui listar: ${templatesErr}`
    : !data.campaign.channel_id
      ? 'Escolha o canal da campanha'
      : templates
        ? 'Escolha…'
        : 'Carregando…'

  return (
    <FormModal
      title={m ? 'Editar mensagem' : 'Nova mensagem'}
      onClose={onClose}
      onSubmit={async () => {
        if (!v.base_id) {
          setMissing(true)
          throw new Error('Escolha a base.')
        }
        const tpl = templates?.find((t) => String(t.id) === v.template_id)
        const body = { ...v, template_name: tpl?.name || m?.template_name || '', image_url: v.image_url.trim(), variables: v.variables.trim(), only_engaged: v.only_engaged === '1' }
        if (m) await api(`/messages/${m.id}`, { method: 'PUT', body })
        else await api(`/campaigns/${data.campaign.id}/messages`, { method: 'POST', body })
        toast('Mensagem salva.')
        await reload()
      }}
    >
      <Field label="Título" htmlFor="m-title">
        <Input id="m-title" required autoFocus placeholder="Ex.: 1 · Você foi selecionado" value={v.title} onChange={(e) => set('title')(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Base">
          <Select
            aria-label="Base"
            placeholder="Escolha…"
            value={v.base_id}
            onChange={(x) => (set('base_id')(x), setMissing(false))}
            options={data.bases.map((b) => ({ value: b.id, label: `${b.name} (${fmtN(b.size)})` }))}
            triggerClassName={missing ? 'border-danger' : undefined}
          />
        </Field>
        <Field label="Data e hora (Brasília)" htmlFor="m-when">
          <Input id="m-when" type="datetime-local" required value={v.scheduled_at} onChange={(e) => set('scheduled_at')(e.target.value)} />
        </Field>
      </div>
      <Field label="Quem recebe">
        <Select
          aria-label="Quem recebe"
          value={v.only_engaged}
          onChange={set('only_engaged')}
          options={[
            { value: '', label: 'Toda a base (menos quem saiu)' },
            { value: '1', label: 'Só quem leu alguma mensagem da campanha' },
          ]}
        />
      </Field>
      <Field label="Template">
        <Select aria-label="Template" placeholder={tplPlaceholder} value={v.template_id} onChange={set('template_id')} options={templateOptions(templates, health)} />
      </Field>
      <Field label="Link da imagem (vazio = sem imagem)" htmlFor="m-img">
        <Input id="m-img" list="m-imgs" placeholder="https://…" value={v.image_url} onChange={(e) => set('image_url')(e.target.value)} />
        <datalist id="m-imgs">
          {knownImages(data).map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </Field>
      <Field label="Variáveis do template (separe por |; aceita {{nome}} e {{primeiro_nome}})" htmlFor="m-vars">
        <Input id="m-vars" placeholder="Vazio se o template não tem variáveis" value={v.variables} onChange={(e) => set('variables')(e.target.value)} />
      </Field>
    </FormModal>
  )
}

function PreviewMessage({ m, p, onClose }: { m: Message; p: Preview; onClose: () => void }) {
  const c = p.counts
  return (
    <FormModal title={m.title} onClose={onClose} wide>
      <Nums>
        <span>{fmtN(c.base)} na base</span>
        <b className="font-semibold">{fmtN(c.included)} vão receber</b>
      </Nums>
      <Nums className="text-[13px] text-dim">
        <span>{fmtN(c.manual)} à mão</span>
        <span>{fmtN(c.optout)} pediram para sair</span>
        <span>{fmtN(c.sem_whatsapp)} não entregáveis</span>
        <span>{fmtN(c.marketing)} bloqueio de marketing</span>
        {c.nao_leu > 0 && <span>{fmtN(c.nao_leu)} não leram nenhuma</span>}
        {c.forced > 0 && <span>{fmtN(c.forced)} do "sempre incluir" entraram</span>}
      </Nums>
      {p.excluded.length ? (
        <div className="max-h-[50vh] overflow-y-auto">
          <Table head={['Nome', 'Telefone', 'Motivo']}>
            {p.excluded.map((e, i) => (
              <tr key={i}>
                <td>{e.name}</td>
                <td className="whitespace-nowrap">{fmtPhone(e.phone)}</td>
                <td>{e.reason_label}</td>
              </tr>
            ))}
          </Table>
        </div>
      ) : (
        <Muted>Ninguém sai desta base.</Muted>
      )}
      {p.sample.length > 0 && (
        <>
          <h3 className="font-semibold">Primeiras linhas do CSV</h3>
          <pre className="overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">{p.sample.map((s) => s.csv).join('\n')}</pre>
        </>
      )}
    </FormModal>
  )
}

function CreateMailing({ m, p, onClose }: { m: Message; p: Preview; onClose: () => void }) {
  const { reload } = useCampaign()
  const c = p.counts
  return (
    <FormModal
      title="Criar no Chat Ativo"
      submitLabel={`Criar com ${fmtN(c.included)}`}
      onClose={onClose}
      onSubmit={async () => {
        const r = await api<{ count: number; mailing_id?: number }>(`/messages/${m.id}/create`, { method: 'POST', body: { expected: c.included } })
        toast(`Mailing criado com ${fmtN(r.count)} contatos${r.mailing_id ? ` (#${r.mailing_id})` : ''}.`)
        await reload()
      }}
    >
      <div>
        <p className="font-semibold">{m.title}</p>
        <Muted>
          {weekday(m.scheduled_at)} {fmtDate(m.scheduled_at)} · {m.template_name}
        </Muted>
      </div>
      <Nums>
        <span>{fmtN(c.base)} na base</span>
        <span>{fmtN(c.out)} saem</span>
        {c.forced > 0 && <span>+{fmtN(c.forced)} do "sempre incluir"</span>}
        <b className="font-semibold">{fmtN(c.included)} vão receber</b>
      </Nums>
      <Muted>
        {m.image_url ? `Imagem: ${fileOf(m.image_url)}` : 'Sem imagem'}. O mailing entra agendado e dispara sozinho no horário. Depois de criado, parar ou mudar o
        horário é pela tela do Chat Ativo.
      </Muted>
    </FormModal>
  )
}
