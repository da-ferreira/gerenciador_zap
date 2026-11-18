import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Card, Field } from '../components/kit'
import { useBusy, useLoad } from '../lib/hooks'
import { api } from '../lib/api'
import { useCampaign } from '../lib/campaign'
import { toast } from '../lib/feedback'

type Channel = { id: string | number; name: string; type: string }

export function Config() {
  const { data, reload } = useCampaign()
  const c = data.campaign
  const locked = data.messages.some((m) => m.mailing_name)
  const channels = useLoad(() => api<Channel[]>('/loopiee/channels'), [])
  const [v, setV] = useState({
    name: c.name,
    channel_id: c.channel_id != null ? String(c.channel_id) : '',
    optout_text: c.optout_text,
    limit_24h: String(c.limit_24h),
  })
  const [saving, runSave] = useBusy()
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }))

  const placeholder = channels.error ? `Não consegui listar: ${channels.error}` : channels.data ? 'Escolha…' : 'Carregando…'

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          const body: Record<string, unknown> = { name: v.name, optout_text: v.optout_text, limit_24h: v.limit_24h }
          if (!locked && channels.data) {
            const ch = channels.data.find((x) => String(x.id) === v.channel_id)
            body.channel_id = ch?.id ?? null
            body.channel_name = ch?.name ?? null
          }
          runSave(async () => {
            await api(`/campaigns/${c.id}`, { method: 'PUT', body })
            toast('Salvo.')
            await reload()
          })
        }}
      >
        <Field label="Nome" htmlFor="c-name">
          <Input id="c-name" required value={v.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={`Canal do Chat Ativo${locked ? ' (travado: já há mailing criado)' : ''}`}>
          <Select
            aria-label="Canal do Chat Ativo"
            disabled={locked || !channels.data}
            placeholder={locked ? c.channel_name || placeholder : placeholder}
            value={v.channel_id}
            onChange={(x) => set('channel_id', x)}
            options={(channels.data ?? []).map((ch) => ({ value: String(ch.id), label: `${ch.name} (${ch.type})` }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Texto do botão de saída" htmlFor="c-optout">
            <Input id="c-optout" value={v.optout_text} onChange={(e) => set('optout_text', e.target.value)} />
          </Field>
          <Field label="Limite de pessoas diferentes em 24h" htmlFor="c-limit">
            <Input id="c-limit" type="number" min={0} value={v.limit_24h} onChange={(e) => set('limit_24h', e.target.value)} />
          </Field>
        </div>
        <Button type="submit" className="self-start" disabled={saving}>
          Salvar
        </Button>
      </form>
    </Card>
  )
}
