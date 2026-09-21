import type { PayProvider } from './types.js'

/**
 * 仅用于自动化测试（PAY_PROVIDER=mock），生产环境不启用。
 * 通过 markPaid 模拟支付宝异步通知到账。
 */
export function createMockProvider(gatewayUrl: string): PayProvider & { markPaid(orderId: string): void } {
  const trades = new Map<string, { amount: number; status: string; tradeNo?: string; paidAt?: Date }>()

  return {
    name: 'mock',

    async pagePay(req) {
      trades.set(req.orderId, { amount: req.amount, status: 'WAIT_BUYER_PAY' })
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      return `<form name="punchout_form" method="post" action="${esc(gatewayUrl)}">
<input type="hidden" name="out_trade_no" value="${esc(req.orderId)}">
<input type="hidden" name="total_amount" value="${req.amount.toFixed(2)}">
<input type="hidden" name="subject" value="${esc(req.subject)}">
</form><script>document.forms[0].submit();</script>`
    },

    async query(orderId) {
      const t = trades.get(orderId)
      return t ? { status: t.status, tradeNo: t.tradeNo, paidAt: t.paidAt } : { status: 'NOT_FOUND' }
    },

    async refund(orderId) {
      const t = trades.get(orderId)
      if (t) t.status = 'TRADE_CLOSED'
    },

    async close(orderId) {
      const t = trades.get(orderId)
      if (t && t.status === 'WAIT_BUYER_PAY') t.status = 'TRADE_CLOSED'
    },

    verifyNotify() {
      return { valid: false }
    },

    markPaid(orderId) {
      const t = trades.get(orderId)
      if (t) Object.assign(t, { status: 'TRADE_SUCCESS', tradeNo: `MOCK${orderId}`, paidAt: new Date() })
    },
  }
}
