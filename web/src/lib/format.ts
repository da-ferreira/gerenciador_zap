const TZ = 'America/Sao_Paulo'

// Brasília times are stored as YYYY-MM-DDTHH:mm, without offset.
export const fmtN = (n?: number | null) => Number(n || 0).toLocaleString('pt-BR')
export const fmtDate = (s?: string | null) =>
  s
    ? new Date(s.length === 16 ? s + ':00-03:00' : s).toLocaleString('pt-BR', {
        timeZone: TZ,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
export const weekday = (s?: string | null) =>
  s ? new Date(s + ':00-03:00').toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'short' }) : ''
export const brTime = (s?: string | null) => (s ? fmtDate(s.replace(' ', 'T') + '-03:00') : '—')
export const fileOf = (url?: string | null) => (url ? decodeURIComponent(url.split('/').pop()!) : '')
export const fmtPhone = (p?: string | null) => (p ? `(${p.slice(0, 2)}) ${p.slice(2, -4)}-${p.slice(-4)}` : '')
export const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : '')

export const ERROR_CODES: Record<string, string> = {
  131049: 'Bloqueio de marketing da Meta',
  131026: 'Não entregável (sem WhatsApp)',
  130472: 'Experimento da Meta (não recebe marketing)',
  131047: 'Fora da janela de 24h',
  131050: 'Pessoa parou de receber marketing',
  132001: 'Template não existe ou não aprovado',
}
