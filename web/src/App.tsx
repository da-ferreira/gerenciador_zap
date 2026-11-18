import { useEffect, useState, useSyncExternalStore } from 'react'
import { Toaster } from './components/ui/Toaster'
import { ConfirmHost, Loading } from './components/kit'
import { setOnUnauthorized } from './lib/api'
import { dismiss, useToasts } from './lib/feedback'
import { Login } from './pages/Login'
import { Campaigns } from './pages/Campaigns'
import { CampaignPage } from './pages/Campaign'

const subscribeHash = (l: () => void) => {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}

export function App() {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash)
  const [logged, setLogged] = useState<boolean | null>(null)
  const toasts = useToasts()

  useEffect(() => {
    setOnUnauthorized(() => setLogged(false))
    fetch('api/me')
      .then((r) => r.json())
      .then((me) => setLogged(!!me.logged))
      .catch(() => setLogged(false))
  }, [])

  const campaignId = hash.match(/^#\/c\/([\w-]+)/)?.[1]

  return (
    <>
      {logged === null ? (
        <div className="mx-auto max-w-[1080px] px-4 py-6">
          <Loading text="Carregando…" />
        </div>
      ) : !logged ? (
        <Login onLogged={() => setLogged(true)} />
      ) : campaignId ? (
        <CampaignPage key={campaignId} id={campaignId} />
      ) : (
        <Campaigns onLogout={() => setLogged(false)} />
      )}
      <ConfirmHost />
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
