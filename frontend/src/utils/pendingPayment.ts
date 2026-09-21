/** 真实模式同窗口跳转支付时，记录待确认的支付，回到站内后通过订单查询确认 */
export interface PendingPayment {
  productId: string
  since: number
}

const KEY = 'toyspace.pendingPay'

export function savePendingPayment(p: PendingPayment) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PendingPayment) : null
  } catch {
    return null
  }
}

export function clearPendingPayment() {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
