import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { Card, ErrorState, FormModal, Muted, Table, Tag, useBusy, useLoad } from '../components/kit'
import { api, type Stats } from '../lib/api'
import { syncReturns, useCampaign } from '../lib/campaign'
import { toast } from '../lib/feedback'
import { ERROR_CODES, brTime, fmtDate, fmtN, pct } from '../lib/format'

type Mailing = {
  at: string
  title: string
  paused?: boolean
  template?: string
  mailing_id?: number
  stats: Stats
  errors: Record<string, { count: number; message?: string }>
  first_at?: string
  last_at?: string
  synced_at?: string
}

const Pct = ({ n, t }: { n: number; t: number }) => (t ? <span className="ml-1 text-xs text-dim">{pct(n, t)}</span> : null)

export function Mailings() {
  const { data, reload, version } = useCampaign()
  const list = useLoad(() => api<Mailing[]>(`/campaigns/${data.campaign.id}/mailings`), [version])
  const [open, setOpen] = useState<Mailing | null>(null)
  const [syncing, runSync] = useBusy()

  if (list.loading && !list.data) return <Skeleton className="h-40 rounded-xl" />
  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />
  if (!list.data!.length) return <Muted>Nenhum mailing criado ainda.</Muted>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Muted>Retornos de {fmtDate(data.campaign.synced_at)}. Clique num mailing para ver o detalhe.</Muted>
        <Button
          variant="secondary"
          disabled={syncing}
          onClick={() =>
            runSync(async () => {
              const r = await syncReturns(data.campaign.id)
              if (r.errors.length) toast(r.errors.join(' | '), true)
              else toast('Retornos atualizados.')
              await reload()
            })
          }
        >
          Atualizar retornos
        </Button>
      </div>
      <Card className="p-0 sm:p-0">
        <Table head={['Disparo', 'Mailing', 'Pessoas', 'Entregues', 'Lidos', 'Falharam', 'Saíram']}>
          {list.data!.map((x, i) => {
            const s = x.stats
            return (
              <tr
                key={i}
                tabIndex={0}
                onClick={() => setOpen(x)}
                onKeyDown={(e) => e.key === 'Enter' && setOpen(x)}
                className="cursor-pointer transition hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
              >
                <td className="whitespace-nowrap">{fmtDate(x.at)}</td>
                <td className="min-w-48">
                  {x.title} {x.paused && <Tag tone="danger">Parado</Tag>}
                  <Muted>
                    {x.template}
                    {x.mailing_id ? ` · #${x.mailing_id}` : ''}
                  </Muted>
                </td>
                <td>{fmtN(s.total)}</td>
                <td className="whitespace-nowrap">
                  {fmtN(s.delivered + s.read)}
                  <Pct n={s.delivered + s.read} t={s.total} />
                </td>
                <td className="whitespace-nowrap">
                  {fmtN(s.read)}
                  <Pct n={s.read} t={s.total} />
                </td>
                <td className="whitespace-nowrap">
                  {fmtN(s.failed)}
                  <Pct n={s.failed} t={s.total} />
                </td>
                <td>{fmtN(s.optout)}</td>
              </tr>
            )
          })}
        </Table>
      </Card>
      {open && <MailingDetail x={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function MailingDetail({ x, onClose }: { x: Mailing; onClose: () => void }) {
  const s = x.stats
  const errors = Object.entries(x.errors).sort((a, b) => b[1].count - a[1].count)
  const line = (label: string, n: number, strong?: boolean) => (
    <tr>
      <td>{label}</td>
      <td className="text-right whitespace-nowrap">
        {strong ? <b className="font-semibold">{fmtN(n)}</b> : fmtN(n)}
        <Pct n={n} t={s.total} />
      </td>
    </tr>
  )
  return (
    <FormModal title={x.title} onClose={onClose}>
      <div className="-mt-2 flex flex-col gap-0.5">
        <Muted>
          {x.template}
          {x.mailing_id ? ` · mailing #${x.mailing_id}` : ''} · disparo {fmtDate(x.at)}
        </Muted>
        <Muted>
          {x.first_at
            ? `Retornos de ${brTime(x.first_at)} a ${brTime(x.last_at)} · lidos do Loopiee em ${fmtDate(x.synced_at)}`
            : 'Sem retorno lido ainda.'}
        </Muted>
      </div>
      <Table head={[]}>
        {line('Pessoas no mailing', s.total, true)}
        {line('Entregues', s.delivered + s.read, true)}
        {line('↳ já leram', s.read)}
        {line('Enviados, sem confirmação de entrega', s.sent)}
        {s.pending > 0 && line('Na fila', s.pending)}
        {line('Falharam', s.failed)}
        {line('Clicaram em algum botão', s.clicked)}
        {line('Pediram para sair', s.optout)}
      </Table>
      {errors.length > 0 && (
        <>
          <h3 className="font-semibold">Falhas por motivo</h3>
          <Table head={[]}>
            {errors.map(([code, e]) => (
              <tr key={code}>
                <td>
                  {code} · {ERROR_CODES[code] || e.message || ''}
                </td>
                <td className="text-right">{fmtN(e.count)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </FormModal>
  )
}
