import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorState, Field, FormModal, Muted, useLoad } from '../components/kit'
import { api, type CampaignListItem } from '../lib/api'

export function Campaigns({ onLogout }: { onLogout: () => void }) {
  const list = useLoad(() => api<CampaignListItem[]>('/campaigns'), [])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  return (
    <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-4 pt-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <div className="flex gap-2">
          <ThemeToggle />
          <Button onClick={() => setCreating(true)}>Nova campanha</Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await api('/logout', { method: 'POST' }).catch(() => {})
              onLogout()
            }}
          >
            Sair
          </Button>
        </div>
      </div>

      {list.loading && !list.data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[74px] rounded-xl" />
          <Skeleton className="h-[74px] rounded-xl" />
        </div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.data!.length ? (
        <Muted>Nenhuma campanha ainda.</Muted>
      ) : (
        <div className="flex flex-col gap-3">
          {list.data!.map((c) => (
            <a
              key={c.id}
              href={`#/c/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-canvas p-4 transition hover:border-field hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{c.name}</h2>
                <Muted>
                  {c.channel_name || 'Sem canal'} · {c.messages} mensagens
                </Muted>
              </div>
              <ChevronRight aria-hidden className="size-4 text-faint" />
            </a>
          ))}
        </div>
      )}

      {creating && (
        <FormModal
          title="Nova campanha"
          submitLabel="Criar"
          onClose={() => setCreating(false)}
          onSubmit={async () => {
            const c = await api<{ id: string }>('/campaigns', { method: 'POST', body: { name } })
            location.hash = `#/c/${c.id}`
          }}
        >
          <Field label="Nome" htmlFor="cname">
            <Input id="cname" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </FormModal>
      )}
    </main>
  )
}
