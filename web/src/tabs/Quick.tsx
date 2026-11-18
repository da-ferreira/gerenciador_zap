import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Skeleton } from '../components/ui/Skeleton'
import { Card, ErrorState, Field, Muted, Table, Textarea } from '../components/kit'
import { useBusy, useLoad } from '../lib/hooks'
import { api } from '../lib/api'
import { knownImages, templateOptions, useCampaign } from '../lib/campaign'
import { confirm, toast } from '../lib/feedback'
import { fileOf, fmtDate, fmtPhone } from '../lib/format'

type History = { created_at: string; template_name?: string; template_id: string; phones: string[]; image_url?: string }
const OTHER = 'outro'

export function Quick() {
  const { data, reload, version, templates, templatesErr, health, loadTemplates } = useCampaign()
  const id = data.campaign.id
  const loaded = useLoad(
    () => Promise.all([api<Record<string, string>>(`/campaigns/${id}/template-images`), api<History[]>(`/campaigns/${id}/quick`)]),
    [version],
  )
  const [v, setV] = useState({ template_id: '', image: '', other: '', phones: '', name: '', variables: '' })
  const [missing, setMissing] = useState(false)
  const [sending, runSend] = useBusy()
  const set = (k: keyof typeof v, value: string) => setV((s) => ({ ...s, [k]: value }))
  useEffect(() => loadTemplates(), [loadTemplates])

  if (loaded.error) return <ErrorState message={loaded.error} onRetry={loaded.reload} />
  if (!loaded.data) return <Skeleton className="h-80 rounded-xl" />
  const [images, history] = loaded.data
  const known = knownImages(data)

  // Linked through the campaign message; without one, by name (vgx_cms26_01_x ↔ 01_x.png).
  const pickTemplate = (tid: string) => {
    const name = templates?.find((t) => String(t.id) === tid)?.name || ''
    const image = images[tid] || known.find((u) => name.endsWith(fileOf(u).replace(/\.\w+$/, ''))) || ''
    setV((s) => ({ ...s, template_id: tid, image }))
    setMissing(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!v.template_id) return setMissing(true)
            const tpl = templates?.find((t) => String(t.id) === v.template_id)
            const count = v.phones.split(/[\n,;]+/).filter((s) => s.trim()).length
            if (!(await confirm(`Enviar "${tpl?.name || v.template_id}" agora para ${count} número(s)?`, { confirmLabel: 'Enviar agora' }))) return
            runSend(async () => {
              const r = await api<{ sent: number; skipped: { phone: string; reason_label: string }[] }>(`/campaigns/${id}/quick`, {
                method: 'POST',
                body: {
                  template_id: v.template_id,
                  template_name: tpl?.name,
                  image_url: (v.image === OTHER ? v.other : v.image).trim(),
                  phones: v.phones,
                  name: v.name,
                  variables: v.variables.trim(),
                },
              })
              const skipped = r.skipped.map((s) => `${fmtPhone(s.phone)} (${s.reason_label})`).join(', ')
              toast(`Enviado para ${r.sent}.${skipped ? ` Pulados: ${skipped}` : ''}`, r.skipped.length > 0)
              await reload()
            })
          }}
        >
          <h3 className="font-semibold">Enviar um HSM agora</h3>
          <Muted>
            Sai na hora pelo canal da campanha. Ao escolher o template, a imagem dele já vem marcada. Números removidos da campanha são pulados.
          </Muted>
          <Field label="Template">
            <Select
              aria-label="Template"
              placeholder={templatesErr ? `Não consegui listar: ${templatesErr}` : !data.campaign.channel_id ? 'Escolha o canal da campanha' : templates ? 'Escolha…' : 'Carregando…'}
              value={v.template_id}
              onChange={pickTemplate}
              options={templateOptions(templates, health)}
              triggerClassName={missing ? 'border-danger' : undefined}
            />
          </Field>
          <Field label="Imagem">
            <Select
              aria-label="Imagem"
              value={v.image}
              onChange={(x) => set('image', x)}
              options={[
                { value: '', label: 'Sem imagem' },
                ...known.map((u) => ({ value: u, label: fileOf(u) })),
                { value: OTHER, label: 'Outro link…' },
              ]}
            />
          </Field>
          {v.image === OTHER && (
            <Field label="Link da imagem" htmlFor="q-other">
              <Input id="q-other" placeholder="https://…" value={v.other} onChange={(e) => set('other', e.target.value)} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Números (um por linha)" htmlFor="q-phones">
              <Textarea id="q-phones" required placeholder="11999998888" value={v.phones} onChange={(e) => set('phones', e.target.value)} />
            </Field>
            <div className="flex flex-col gap-4">
              <Field label="Nome (para {{nome}})" htmlFor="q-name">
                <Input id="q-name" value={v.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Variáveis (separe por |)" htmlFor="q-vars">
                <Input id="q-vars" placeholder="Vazio se o template não tem variáveis" value={v.variables} onChange={(e) => set('variables', e.target.value)} />
              </Field>
            </div>
          </div>
          <Button type="submit" className="self-start" disabled={sending}>
            Enviar agora
          </Button>
        </form>
      </Card>
      <Card>
        <h3 className="font-semibold">Últimos envios avulsos</h3>
        {history.length ? (
          <div className="-mx-4 sm:-mx-5">
            <Table head={['Quando', 'Template', 'Números', 'Imagem']}>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{fmtDate(h.created_at)}</td>
                  <td className="min-w-32">{h.template_name || h.template_id}</td>
                  <td className="whitespace-nowrap">
                    {h.phones.map((p) => (
                      <div key={p}>{fmtPhone(p)}</div>
                    ))}
                  </td>
                  <td className="text-[13px] break-all text-dim">{fileOf(h.image_url) || '—'}</td>
                </tr>
              ))}
            </Table>
          </div>
        ) : (
          <Muted>Nenhum ainda.</Muted>
        )}
      </Card>
    </div>
  )
}
