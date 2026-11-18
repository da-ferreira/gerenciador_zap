import { useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Select } from './ui/Select'

type Theme = 'system' | 'light' | 'dark'
const KEY = 'zap-theme'
const mq = matchMedia('(prefers-color-scheme: dark)')

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && mq.matches))
}

mq.addEventListener('change', () => apply(read()))

const ICONS = { system: Monitor, light: Sun, dark: Moon }

export function ThemeToggle() {
  const [theme, setTheme] = useState(read)
  const Icon = ICONS[theme]
  return (
    <Select
      aria-label="Tema"
      title="Tema"
      value={theme}
      minListWidth={140}
      options={[
        { value: 'system', label: 'Sistema' },
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Escuro' },
      ]}
      onChange={(t: Theme) => {
        try {
          if (t === 'system') localStorage.removeItem(KEY)
          else localStorage.setItem(KEY, t)
        } catch {
          /* no storage: theme lasts until reload */
        }
        apply(t)
        setTheme(t)
      }}
      triggerClassName="inline-flex size-9 items-center justify-center rounded-lg border border-field bg-canvas text-dim transition hover:bg-surface hover:text-ink focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none"
    >
      <Icon aria-hidden className="size-4" />
    </Select>
  )
}
