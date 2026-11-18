import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, Field, Muted, Nums } from '../components/kit'
import { api } from '../lib/api'
import { useCampaign } from '../lib/campaign'
import { confirm, guard, toast } from '../lib/feedback'
import { fmtN } from '../lib/format'

export function Bases() {
  const { data, reload } = useCampaign()
  const [busy, setBusy] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    await guard(fn)
    setBusy(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            run('up', async () => {
              const b = await api<{ size: number }>(`/campaigns/${data.campaign.id}/bases`, {
                method: 'POST',
                body: { name, csv: await file!.text() },
              })
              toast(`Base importada: ${fmtN(b.size)} contatos.`)
              setName('')
              setFile(null)
              form.reset()
              await reload()
            })
          }}
        >
          <h3 className="font-semibold">Importar base</h3>
          <Muted>
            CSV com nome e telefone (colunas <code className="font-mono">nome,ddd,numero</code> ou <code className="font-mono">nome,telefone</code>; vírgula
            ou ponto e vírgula). Duplicados e números inválidos ficam de fora.
          </Muted>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da base" htmlFor="b-name">
              <Input id="b-name" required placeholder="Ex.: Geral" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Arquivo" htmlFor="b-file">
              <input
                id="b-file"
                type="file"
                accept=".csv,text/csv"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="h-10 w-full rounded-lg border border-field bg-canvas text-sm text-dim file:mr-3 file:h-full file:cursor-pointer file:border-0 file:border-r file:border-field file:bg-surface file:px-3 file:font-medium file:text-ink hover:file:bg-surface-hover focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none"
              />
            </Field>
          </div>
          <Button type="submit" className="self-start" disabled={busy === 'up'}>
            Importar
          </Button>
        </form>
      </Card>
      {data.bases.map((b) => (
        <Card key={b.id}>
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 font-semibold break-words">{b.name}</h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger"
              disabled={busy === b.id}
              onClick={async () => {
                if (!(await confirm('Apagar esta base?', { confirmLabel: 'Apagar', danger: true }))) return
                run(b.id, async () => {
                  await api(`/bases/${b.id}`, { method: 'DELETE' })
                  await reload()
                })
              }}
            >
              Apagar
            </Button>
          </div>
          <Nums>
            <span>
              <b className="font-semibold">{fmtN(b.size)}</b> contatos
            </span>
            <span>{fmtN(b.report.lines)} linhas no arquivo</span>
            <span>{fmtN(b.report.duplicates)} duplicados</span>
            <span>{fmtN(b.report.invalid_count)} inválidos</span>
            <span>{fmtN(b.report.landlines)} fixos</span>
          </Nums>
          {!!b.report.invalid?.length && (
            <details className="text-[13px]">
              <summary className="w-fit rounded text-dim hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none">
                Ver inválidos
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-surface p-3 font-mono text-xs whitespace-pre-wrap">
                {b.report.invalid.map((i) => `linha ${i.line}: ${i.value}`).join('\n')}
              </pre>
            </details>
          )}
        </Card>
      ))}
    </div>
  )
}
