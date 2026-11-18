import { Button } from '../components/ui/Button'
import { Truncate } from '../components/ui/Truncate'
import { Alert, Card, Loading, Muted, Tag } from '../components/kit'
import { QUALITY, TIER, tplHealth, useCampaign } from '../lib/campaign'
import { fmtDate, fmtN } from '../lib/format'

export function HealthCard() {
  const { data, health: h, healthErr, rereadHealth } = useCampaign()
  const c = data.campaign
  if (!c.channel_id) return null
  if (healthErr) {
    const why = /404/.test(healthErr) ? 'o Loopiee ainda não tem a rota meta-health' : healthErr.slice(0, 200)
    return <Alert>Qualidade do número indisponível: {why}.</Alert>
  }
  if (!h)
    return (
      <Card>
        <Loading text="Lendo a qualidade do número na Meta…" />
      </Card>
    )

  const p = h.phone
  const tier = TIER[p.messaging_limit]
  const lowLimit = !!tier && c.limit_24h > tier
  const bad = h.templates.filter((t) => t.status !== 'APPROVED').length
  const q = QUALITY[p.quality_rating]

  // Compact list: drops the common prefix (e.g. vgx_cms26_) so it fits on phones.
  const names = [...new Set(data.messages.map((m) => m.template_name).filter(Boolean))]
  let pre = names.length ? names.reduce((a, n) => { while (!n.startsWith(a)) a = a.slice(0, -1); return a }) : ''
  pre = names.length > 1 ? pre.slice(0, pre.lastIndexOf('_') + 1) : ''

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">
            {p.verified_name} · {p.display_phone_number}
          </h3>
          <Muted>Lido na Meta às {fmtDate(h.checked_at)}</Muted>
        </div>
        <Button variant="secondary" size="sm" onClick={rereadHealth}>
          Reler
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {q ? <Tag tone={q[1]}>Qualidade {q[0]}</Tag> : <Tag>Qualidade sem nota</Tag>}
        <Tag tone={p.status === 'CONNECTED' ? 'ok' : 'danger'}>Número {p.status}</Tag>
        <Tag tone={lowLimit ? 'danger' : 'neutral'}>
          Limite {tier === Infinity ? 'ilimitado' : tier ? fmtN(tier) + ' pessoas/24h' : 'não informado'}
        </Tag>
        {bad > 0 && <Tag tone="danger">{bad} template(s) fora do ar</Tag>}
      </div>
      {names.length > 0 && (
        <div className="flex flex-col">
          <Muted className="mb-1">Qualidade dos templates{pre && ` (${pre}…)`}</Muted>
          {names.map((n) => {
            const t = tplHealth(h, n)
            const [txt, tone] = !t
              ? ['—', 'neutral' as const]
              : t.status !== 'APPROVED'
                ? [t.status, 'danger' as const]
                : QUALITY[t.quality] ?? ['Pendente', 'neutral' as const]
            return (
              <div key={n} className="flex items-center justify-between gap-3 border-t border-hairline py-1.5 text-sm">
                <Truncate className="min-w-0">{n.slice(pre.length)}</Truncate>
                <Tag tone={tone}>{txt}</Tag>
              </div>
            )
          })}
        </div>
      )}
      {lowLimit && (
        <Alert tone="danger">
          O limite da Meta ({fmtN(tier)}) é menor que o da campanha ({fmtN(c.limit_24h)}). Ajuste em Configuração.
        </Alert>
      )}
      {h.waba_mismatch && (
        <Alert>O número não pertence à conta (WABA) cadastrada no canal: o status dos templates não pôde ser conferido.</Alert>
      )}
    </Card>
  )
}
