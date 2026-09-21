/** 拼团营销服务（Java 后端）内部接口客户端 */

export class GbmError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

interface GbmResponse<T> {
  code: string
  info?: string
  data?: T
}

export interface LockResult {
  orderId: string
  originalPrice: number
  deductionPrice: number
  payPrice: number
  tradeOrderStatus: number
  teamId: string
}

export interface GbmClient {
  lock(req: {
    userId: string
    teamId?: string | null
    activityId: number
    goodsId: string
    outTradeNo: string
    notifyUrl: string
  }): Promise<LockResult>
  settle(req: { userId: string; outTradeNo: string; outTradeTime: Date }): Promise<void>
  refund(req: { userId: string; outTradeNo: string }): Promise<void>
  updateDcc(key: string, value: string): Promise<void>
}

export function createGbmClient(opts: { baseUrl: string; source: string; channel: string; timeoutMs?: number }): GbmClient {
  const timeoutMs = opts.timeoutMs ?? 10_000

  async function call<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> }): Promise<T> {
    const url = new URL(opts.baseUrl + path)
    if (init.query) for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v)
    const res = await fetch(url, {
      method: init.method,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) throw new GbmError(`HTTP_${res.status}`, `拼团服务不可用（${res.status}）`)
    const payload = (await res.json()) as GbmResponse<T>
    if (payload.code !== '0000') throw new GbmError(payload.code, payload.info ?? '拼团服务返回失败')
    return payload.data as T
  }

  return {
    lock(req) {
      return call<LockResult>('/api/v1/gbm/trade/lock_market_pay_order', {
        method: 'POST',
        body: {
          userId: req.userId,
          teamId: req.teamId || null,
          activityId: req.activityId,
          goodsId: req.goodsId,
          source: opts.source,
          channel: opts.channel,
          outTradeNo: req.outTradeNo,
          notifyConfigVO: { notifyType: 'HTTP', notifyUrl: req.notifyUrl },
        },
      })
    },
    async settle(req) {
      await call('/api/v1/gbm/trade/settlement_market_pay_order', {
        method: 'POST',
        body: {
          source: opts.source,
          channel: opts.channel,
          userId: req.userId,
          outTradeNo: req.outTradeNo,
          outTradeTime: req.outTradeTime.getTime(),
        },
      })
    },
    async refund(req) {
      await call('/api/v1/gbm/trade/refund_market_pay_order', {
        method: 'POST',
        body: { userId: req.userId, outTradeNo: req.outTradeNo, source: opts.source, channel: opts.channel },
      })
    },
    async updateDcc(key, value) {
      await call('/api/v1/gbm/dcc/update_config', { method: 'GET', query: { key, value } })
    },
  }
}
