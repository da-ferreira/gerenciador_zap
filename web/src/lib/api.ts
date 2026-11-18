let onUnauthorized = () => {}
export const setOnUnauthorized = (fn: () => void) => (onUnauthorized = fn)

// Relative path: the app is served under /zap/ in production.
export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch('api' + path, {
    method: opts.method,
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (r.status === 401 && path !== '/login') {
    onUnauthorized()
    throw new Error('Sessão expirada.')
  }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.msg || `Erro ${r.status}`)
  return data as T
}

export type Stats = {
  total: number
  pending: number
  sent: number
  delivered: number
  read: number
  failed: number
  clicked: number
  optout: number
}

export type Campaign = {
  id: string
  name: string
  channel_id: string | number | null
  channel_name: string | null
  limit_24h: number
  optout_text: string
  synced_at: string | null
}

export type CampaignListItem = { id: string; name: string; channel_name: string | null; messages: number }

export type Message = {
  id: string
  title: string
  base_id: string
  scheduled_at: string
  template_id: string | number
  template_name: string
  image_url: string
  variables: string
  only_engaged?: boolean
  mailing_name?: string
  mailing_id?: number
  paused?: boolean
  stats?: Stats
  created_counts?: { included: number }
  preview?: { base: number; included: number; out?: number }
  window_24h?: number | null
}

export type Base = {
  id: string
  name: string
  size: number
  report: {
    lines: number
    duplicates: number
    invalid_count: number
    landlines: number
    invalid?: { line: number; value: string }[]
  }
}

export type CampaignData = {
  campaign: Campaign
  messages: Message[]
  bases: Base[]
  removed: { manual: number; optout: number; sem_whatsapp: number }
}

export type Template = { id: string | number; name: string }

export type Health = {
  checked_at: string
  phone: {
    verified_name: string
    display_phone_number: string
    quality_rating: string
    status: string
    messaging_limit: string
  }
  templates: { name: string; status: string; quality: string }[]
  waba_mismatch?: boolean
}

export type Preview = {
  counts: { base: number; included: number; out: number; forced: number; manual: number; optout: number; sem_whatsapp: number; marketing: number; nao_leu: number }
  excluded: { name: string; phone: string; reason_label: string }[]
  sample: { csv: string }[]
}

export type SyncResult = { errors: string[] }
