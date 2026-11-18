import { useSyncExternalStore } from 'react'
import type { Toast } from '../components/ui/Toaster'

// Toasts and confirmations live outside React so any handler can call them.
type Ask = { message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
let toasts: Toast[] = []
let ask: Ask | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l))

let seq = 0
export function toast(message: string, error = false) {
  const id = ++seq
  toasts = [...toasts, { id, type: error ? 'error' : 'success', message }]
  emit()
  setTimeout(() => dismiss(id), error ? 6000 : 3000)
}
export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function confirm(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}) {
  return new Promise<boolean>((resolve) => {
    ask = { message, confirmLabel: opts.confirmLabel ?? 'Confirmar', danger: !!opts.danger, resolve }
    emit()
  })
}
export function answer(ok: boolean) {
  ask?.resolve(ok)
  ask = null
  emit()
}

export const useToasts = () => useSyncExternalStore(subscribe, () => toasts)
export const useAsk = () => useSyncExternalStore(subscribe, () => ask)

/** Runs `fn` reporting errors as a toast; returns undefined on failure. */
export async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    toast((e as Error).message, true)
  }
}
