import { useState, type ComponentProps, type ReactNode } from 'react'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { cn } from './ui/cn'
import { answer, guard, useAsk } from '../lib/feedback'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-3 rounded-xl border border-hairline bg-canvas p-4 sm:p-5', className)}
      {...props}
    />
  )
}

export type Tone = 'ok' | 'neutral' | 'caution' | 'danger' | 'brand'
const tones: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  neutral: 'border border-field text-dim',
  caution: 'bg-caution-soft text-caution',
  danger: 'bg-danger-soft text-danger',
  brand: 'bg-brand-soft text-brand',
}
export function Tag({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}
      {...props}
    />
  )
}

export function Alert({ tone = 'caution', children }: { tone?: 'caution' | 'danger'; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg px-3.5 py-2.5 text-sm', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-caution-soft text-caution')}>
      {children}
    </div>
  )
}

export function Loading({ text }: { text: string }) {
  return (
    <div role="status" className="flex items-center gap-2.5 py-2 text-sm text-dim">
      <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-field border-t-brand motion-reduce:animate-[spin_2.4s_linear_infinite]" />
      {text}
    </div>
  )
}

export function Muted({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-[13px] text-dim', className)} {...props} />
}

/** Label above a control; `htmlFor` ties it to native inputs. */
export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full resize-y rounded-lg border border-field bg-canvas px-3 py-2 text-base text-ink transition outline-none placeholder:text-faint sm:text-sm',
        'focus:border-brand focus:ring-4 focus:ring-brand-area',
        className,
      )}
      {...props}
    />
  )
}

export const linkButton =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-field bg-canvas px-3 text-sm font-medium text-ink transition hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none'

export const textLink =
  'rounded text-left font-medium text-brand hover:underline focus-visible:ring-4 focus-visible:ring-brand-area focus-visible:outline-none'

export function Nums({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums', className)}>{children}</div>
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap text-dim">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-hairline [&_td]:px-2 [&_td]:py-2 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  )
}

/** Modal with a form: the submit button stays busy until `onSubmit` settles; errors become a toast. */
export function FormModal({
  title,
  submitLabel,
  onSubmit,
  onClose,
  children,
  wide,
}: {
  title: string
  submitLabel?: string
  onSubmit?: () => Promise<unknown>
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal label={title} onClose={onClose} className={wide ? 'max-w-[720px]' : 'max-w-[560px]'}>
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!onSubmit) return onClose()
          setBusy(true)
          const ok = await guard(async () => (await onSubmit(), true))
          setBusy(false)
          if (ok) onClose()
        }}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {onSubmit ? 'Cancelar' : 'Fechar'}
          </Button>
          {onSubmit && (
            <Button type="submit" disabled={busy}>
              {submitLabel ?? 'Salvar'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}

export function ConfirmHost() {
  const ask = useAsk()
  if (!ask) return null
  return (
    <Modal label="Confirmar" onClose={() => answer(false)} className="max-w-[440px]">
      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm">{ask.message}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => answer(false)}>
            Cancelar
          </Button>
          <Button variant={ask.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
            {ask.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-danger">
      {message}
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  )
}
