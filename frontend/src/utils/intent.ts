import type { PurchaseType } from '@/types'

/** 未登录时点击购买，记录购买意图；登录回来后由用户再次确认 */
export interface PurchaseIntent {
  productId: string
  type: PurchaseType
  teamId?: string
  savedAt: number
}

const INTENT_KEY = 'toyspace.intent'
const INTENT_TTL_MS = 30 * 60_000

export function saveIntent(intent: Omit<PurchaseIntent, 'savedAt'>) {
  try {
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, savedAt: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function takeIntent(productId: string): PurchaseIntent | null {
  try {
    const raw = window.sessionStorage.getItem(INTENT_KEY)
    if (!raw) return null
    const intent = JSON.parse(raw) as PurchaseIntent
    if (intent.productId !== productId) return null
    window.sessionStorage.removeItem(INTENT_KEY)
    return Date.now() - intent.savedAt < INTENT_TTL_MS ? intent : null
  } catch {
    return null
  }
}

/** 只允许站内相对路径，避免登录后被带去外部地址 */
export function safeRedirect(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
