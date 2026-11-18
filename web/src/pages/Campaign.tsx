import { ThemeToggle } from '../components/ThemeToggle'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { Alert, ErrorState, Loading, Muted, useBusy } from '../components/kit'
import { api, type CampaignData, type Health, type Template } from '../lib/api'
import { Ctx, syncReturns, type CampaignCtx } from '../lib/campaign'
import { toast } from '../lib/feedback'
import { fmtDate, fmtN } from '../lib/format'
import { HealthCard } from './HealthCard'
import { Messages } from '../tabs/Messages'
import { Mailings } from '../tabs/Mailings'
import { Sends } from '../tabs/Sends'
import { Bases } from '../tabs/Bases'
import { Removals } from '../tabs/Removals'
import { Quick } from '../tabs/Quick'
import { Config } from '../tabs/Config'

const TABS = [
  ['mensagens', 'Mensagens', Messages],
  ['mailings', 'Mailings', Mailings],
  ['envios', 'Envios', Sends],
  ['bases', 'Bases', Bases],
  ['removidos', 'Removidos', Removals],
  ['avulso', 'Envio avulso', Quick],
  ['config', 'Configuração', Config],
] as const

export function CampaignPage({ id }: { id: string }) {
  const [data, setData] = useState<CampaignData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useState<string>('mensagens')
  const [health, setHealth] = useState<Health | null>(null)
  const [healthErr, setHealthErr] = useState<string | null>(null)
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [templatesErr, setTemplatesErr] = useState<string | null>(null)
  const [syncing, runSync] = useBusy()
  const channelId = data?.campaign.channel_id

  const reload = useCallback(async () => {
    try {
      setData(await api<CampaignData>(`/campaigns/${id}`))
      setError(null)
      setVersion((v) => v + 1)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  // The Meta is the slow part: the page opens first and the card fills in when it answers.
  useEffect(() => {
    if (!channelId || health || healthErr) return
    let alive = true
    api<Health>(`/loopiee/channels/${channelId}/meta-health`).then(
      (h) => alive && setHealth(h),
      (e: Error) => alive && setHealthErr(e.message),
    )
    return () => {
      alive = false
    }
  }, [channelId, health, healthErr])

  // A new channel invalidates what was read for the old one.
  useEffect(() => {
    setHealth(null)
    setHealthErr(null)
    setTemplates(null)
    setTemplatesErr(null)
  }, [channelId])

  const loadTemplates = useCallback(() => {
    if (templates || !channelId) return
    api<Template[]>(`/loopiee/channels/${channelId}/templates`).then(
      (t) => (setTemplates(t), setTemplatesErr(null)),
      (e: Error) => setTemplatesErr(e.message),
    )
  }, [templates, channelId])

  if (error && !data)
    return (
      <main className="mx-auto max-w-[1080px] px-4 py-6">
        <ErrorState message={error} onRetry={reload} />
      </main>
    )
  if (!data)
    return (
      <main className="mx-auto flex max-w-[1080px] flex-col gap-4 px-4 py-6">
        <Loading text="Carregando a campanha…" />
        <Skeleton className="h-24 rounded-xl" />
      </main>
    )

  const c = data.campaign
  const ctx: CampaignCtx = {
    data,
    reload,
    version,
    health,
    healthErr,
    rereadHealth: () => (setHealth(null), setHealthErr(null)),
    templates,
    templatesErr,
    loadTemplates,
  }
  const Tab = TABS.find(([k]) => k === tab)![2]

  return (
    <Ctx.Provider value={ctx}>
      <main className="mx-auto flex max-w-[1080px] flex-col gap-5 px-4 pt-6 pb-16">
        <div className="flex flex-col gap-1">
          <a
            href="#/"
            className="inline-flex w-fit items-center gap-1 rounded text-sm text-dim hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none"
          >
            <ArrowLeft aria-hidden className="size-4" /> Campanhas
          </a>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-semibold break-words">{c.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <Muted>Retornos lidos: {c.synced_at ? fmtDate(c.synced_at) : 'nunca'}</Muted>
              <Button
                variant="secondary"
                disabled={syncing}
                onClick={() =>
                  runSync(async () => {
                    const r = await syncReturns(c.id)
                    if (r.errors.length) toast(r.errors.join(' | '), true)
                    else toast('Retornos atualizados.')
                    await reload()
                  })
                }
              >
                <RefreshCw aria-hidden className={syncing ? 'size-4 animate-spin' : 'size-4'} />
                Atualizar retornos
              </Button>
              <ThemeToggle />
            </div>
          </div>
          <Muted>
            {c.channel_name || 'Sem canal'} · limite {fmtN(c.limit_24h)} pessoas/24h · removidos:{' '}
            {fmtN(data.removed.manual)} à mão, {fmtN(data.removed.optout)} pediram para sair,{' '}
            {fmtN(data.removed.sem_whatsapp)} não entregáveis
          </Muted>
        </div>

        {!c.channel_id && <Alert>Escolha o canal em Configuração antes de criar mailings.</Alert>}
        <HealthCard />

        <div role="tablist" className="-mx-4 flex gap-1 overflow-x-auto border-b border-hairline px-4 [scrollbar-width:none]">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={
                'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none ' +
                (tab === k ? 'border-brand text-ink' : 'border-transparent text-dim hover:text-ink')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          <Tab />
        </div>
      </main>
    </Ctx.Provider>
  )
}
