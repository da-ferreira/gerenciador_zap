import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { Input } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { Card, ErrorState, Muted, Table, Tag, textLink, type Tone } from '../components/kit'
import { useBusy } from '../lib/hooks'
import { api } from '../lib/api'
import { useCampaign } from '../lib/campaign'
import { ERROR_CODES, fmtDate, fmtN, fmtPhone } from '../lib/format'

type Row = {
  at: string
  phone: string
  name: string
  title: string
  template?: string
  status: keyof typeof STATUS
  status_at?: string
  code?: string
  error?: string
  button?: string
}
type Page = { rows: Row[]; total: number; counts: Record<string, number> }

const STATUS: Record<string, [string, Tone]> = {
  pending: ['Na fila', 'neutral'],
  sent: ['Enviado', 'neutral'],
  delivered: ['Entregue', 'brand'],
  read: ['Lido', 'ok'],
  failed: ['Falhou', 'danger'],
}

// Filter survives switching tabs, like the old page.
const filter = { q: '', status: '' }

export function Sends() {
  const { data, version } = useCampaign()
  const [f, setF] = useState(filter)
  const [q, setQ] = useState(f.q)
  const [page, setPage] = useState<Page | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [more, runMore] = useBusy()
  const qs = (offset: number) => `?q=${encodeURIComponent(f.q)}&status=${f.status}&offset=${offset}`

  useEffect(() => {
    Object.assign(filter, f)
    let alive = true
    setError(null)
    api<Page>(`/campaigns/${data.campaign.id}/sends${qs(0)}`).then(
      (p) => alive && setPage(p),
      (e: Error) => alive && setError(e.message),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, version, tick])

  if (error) return <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
  if (!page) return <Skeleton className="h-40 rounded-xl" />

  const chips = [['', 'Todos', page.counts.all] as const, ...Object.entries(STATUS).map(([k, [l]]) => [k, l, page.counts[k]] as const)]
  const byPhone = (phone: string) => (setQ(phone), setF({ q: phone, status: '' }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault()
            setF({ ...f, q: q.trim() })
          }}
        >
          <Input type="search" icon={<Search />} placeholder="Buscar por número ou nome" value={q} onChange={(e) => {
            setQ(e.target.value)
            if (!e.target.value && f.q) setF({ ...f, q: '' })
          }} />
        </form>
        <div className="flex flex-wrap gap-2">
          {chips.map(([k, l, n]) => (
            <Chip key={k} active={f.status === k} count={n ?? 0} onClick={() => setF({ ...f, status: k })}>
              {l}
            </Chip>
          ))}
        </div>
      </div>
      <Muted>
        Retornos de {fmtDate(data.campaign.synced_at)}. Clique em "Atualizar retornos" para ler de novo. Clique no número para ver só os envios dele.
      </Muted>
      {page.total ? (
        <Card className="p-0 sm:p-0">
          <Table head={['Disparo', 'Número', 'Mensagem', 'Status', 'Botão']}>
            {page.rows.map((x, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap">{fmtDate(x.at)}</td>
                <td className="whitespace-nowrap">
                  <button className={textLink} onClick={() => byPhone(x.phone)}>
                    {fmtPhone(x.phone)}
                  </button>
                  <Muted>{x.name}</Muted>
                </td>
                <td className="min-w-40">
                  {x.title}
                  {x.template && <Muted>{x.template}</Muted>}
                </td>
                <td className="min-w-40">
                  <Tag tone={STATUS[x.status][1]}>{STATUS[x.status][0]}</Tag>
                  {x.status_at && <span className="ml-1.5 text-xs text-dim">{fmtDate(x.status_at)}</span>}
                  {x.code && (
                    <Muted title={x.error || ''}>
                      {x.code} · {ERROR_CODES[x.code] || x.error || ''}
                    </Muted>
                  )}
                </td>
                <td className="text-[13px]">{x.button || ''}</td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        <Muted>Nenhum envio com retorno lido.</Muted>
      )}
      {page.total > page.rows.length && (
        <Button
          variant="secondary"
          className="self-start"
          disabled={more}
          onClick={() =>
            runMore(async () => {
              const next = await api<Page>(`/campaigns/${data.campaign.id}/sends${qs(page.rows.length)}`)
              setPage({ ...next, rows: [...page.rows, ...next.rows] })
            })
          }
        >
          Mostrar mais ({fmtN(page.total - page.rows.length)} restantes)
        </Button>
      )}
    </div>
  )
}
