import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { Card, ErrorState, Field, Muted, Table, Textarea, textLink, useBusy, useLoad } from '../components/kit'
import { api } from '../lib/api'
import { useCampaign } from '../lib/campaign'
import { guard, toast } from '../lib/feedback'
import { fmtDate, fmtN, fmtPhone } from '../lib/format'

type Removal = { id?: string; name: string; phone: string; reason_label: string; note?: string; at?: string }

export function Removals() {
  const { data, reload, version } = useCampaign()
  const list = useLoad(() => api<Removal[]>(`/campaigns/${data.campaign.id}/removals`), [version])
  const [phones, setPhones] = useState('')
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [adding, runAdd] = useBusy()
  const [undoing, setUndoing] = useState<string | null>(null)

  const n = q.replace(/\D/g, '')
  const t = q.trim().toLowerCase()
  const rows = (list.data ?? []).filter((r) => !t || r.name.toLowerCase().includes(t) || (n && r.phone.includes(n)))

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            runAdd(async () => {
              const r = await api<{ added: number; invalid: string[] }>(`/campaigns/${data.campaign.id}/removals`, {
                method: 'POST',
                body: { phones, note },
              })
              toast(`${r.added} removidos.${r.invalid.length ? ` Inválidos: ${r.invalid.join(', ')}` : ''}`, r.invalid.length > 0)
              setPhones('')
              setNote('')
              await reload()
            })
          }}
        >
          <h3 className="font-semibold">Remover números</h3>
          <Muted>Vale para todos os próximos mailings da campanha. Um número por linha (com ou sem DDD 55).</Muted>
          <Field label="Números" htmlFor="r-phones">
            <Textarea id="r-phones" required placeholder="11999998888" value={phones} onChange={(e) => setPhones(e.target.value)} />
          </Field>
          <Field label="Motivo (opcional)" htmlFor="r-note">
            <Input id="r-note" placeholder="Ex.: pediu por telefone" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button type="submit" className="self-start" disabled={adding}>
            Remover
          </Button>
        </form>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{list.data ? `${fmtN(list.data.length)} fora da campanha` : 'Fora da campanha'}</h3>
          <div className="w-full sm:w-64">
            <Input type="search" icon={<Search />} aria-label="Buscar" placeholder="Buscar nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <Muted>
          "Pediu para sair" e "Não entregável" vêm dos retornos dos envios (botão Atualizar retornos). Só a remoção à mão pode ser desfeita aqui.
        </Muted>
        {list.loading && !list.data ? (
          <Skeleton className="h-32" />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : (
          <div className="-mx-4 sm:-mx-5">
            <Table head={['Nome', 'Telefone', 'Motivo', 'Origem', 'Quando', '']}>
              {rows.map((r, i) => (
                <tr key={r.id ?? i}>
                  <td className="min-w-32">{r.name}</td>
                  <td className="whitespace-nowrap">{fmtPhone(r.phone)}</td>
                  <td>{r.reason_label}</td>
                  <td>{r.note || ''}</td>
                  <td className="whitespace-nowrap">{r.at ? fmtDate(r.at) : ''}</td>
                  <td>
                    {r.id && (
                      <button
                        className={textLink}
                        disabled={undoing === r.id}
                        onClick={async () => {
                          setUndoing(r.id!)
                          await guard(async () => {
                            await api(`/removals/${r.id}`, { method: 'DELETE' })
                            await reload()
                          })
                          setUndoing(null)
                        }}
                      >
                        Desfazer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
