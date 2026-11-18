import { createContext, useContext } from 'react'
import { api, type CampaignData, type Health, type Template } from './api'

export type CampaignCtx = {
  data: CampaignData
  /** Refetches the campaign; tabs refetch their own data when `version` changes. */
  reload: () => Promise<void>
  version: number
  health: Health | null
  healthErr: string | null
  rereadHealth: () => void
  templates: Template[] | null
  templatesErr: string | null
  loadTemplates: () => void
}

export const Ctx = createContext<CampaignCtx | null>(null)
export const useCampaign = () => useContext(Ctx)!

export const QUALITY: Record<string, [string, 'ok' | 'caution' | 'danger']> = {
  GREEN: ['Alta', 'ok'],
  YELLOW: ['Média', 'caution'],
  RED: ['Baixa', 'danger'],
}
export const TIER: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: Infinity,
}

export const tplHealth = (h: Health | null, name?: string) => h?.templates?.find((t) => t.name === name)

export function templateOptions(templates: Template[] | null, health: Health | null) {
  return (templates ?? []).map((t) => {
    const h = tplHealth(health, t.name)
    const tag = !h
      ? ''
      : h.status !== 'APPROVED'
        ? ` — ${h.status}`
        : QUALITY[h.quality]
          ? ` — qualidade ${QUALITY[h.quality][0].toLowerCase()}`
          : ''
    return { value: String(t.id), label: t.name + tag }
  })
}

export const knownImages = (data: CampaignData) => [
  ...new Set(data.messages.map((m) => m.image_url).filter(Boolean)),
]

export async function syncReturns(campaignId: string) {
  return api<{ errors: string[] }>(`/campaigns/${campaignId}/sync`, { method: 'POST' })
}
