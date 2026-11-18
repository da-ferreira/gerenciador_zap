import { useState } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import { Button } from '../components/ui/Button'
import { PasswordInput } from '../components/ui/Input'
import { Field } from '../components/kit'
import { api } from '../lib/api'
import { guard } from '../lib/feedback'

export function Login({ onLogged }: { onLogged: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main className="relative flex min-h-dvh items-start justify-center px-4 pt-[15vh]">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <form
        className="flex w-full max-w-[360px] flex-col gap-4 rounded-xl border border-hairline bg-canvas p-6 max-sm:border-0 max-sm:p-0"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          const ok = await guard(() => api('/login', { method: 'POST', body: { password } }))
          setBusy(false)
          if (ok) onLogged()
        }}
      >
        <h1 className="text-xl font-semibold">Gerenciador Zap</h1>
        <Field label="Senha" htmlFor="password">
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" disabled={busy}>
          Entrar
        </Button>
      </form>
    </main>
  )
}
