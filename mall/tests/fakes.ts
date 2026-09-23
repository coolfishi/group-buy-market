import { GbmError, type GbmClient } from '../src/gbm.js'
import type { OrderStore, PayOrder, Product } from '../src/orders.js'

export function memoryStore(products: Product[]): OrderStore & { all: PayOrder[] } {
  const all: PayOrder[] = []
  let seq = 0
  return {
    all,
    async findProduct(id) {
      return products.find((p) => p.goodsId === id) ?? null
    },
    async insert(o) {
      all.push({ ...o, id: ++seq })
    },
    async update(orderId, patch, expect) {
      const o = all.find((x) => x.orderId === orderId)
      if (!o || (expect && !expect.includes(o.status))) return false
      Object.assign(o, patch)
      return true
    },
    async get(orderId) {
      const o = all.find((x) => x.orderId === orderId)
      return o ? { ...o } : null
    },
    async findReusable(userId, productId, marketType, teamId) {
      return (
        [...all]
          .reverse()
          .find(
            (o) =>
              o.userId === userId &&
              o.productId === productId &&
              o.marketType === marketType &&
              o.status === 'PAY_WAIT' &&
              (teamId ? o.teamId === teamId : true),
          ) ?? null
      )
    },
    async listByUser(userId, beforeId, size) {
      return all
        .filter((o) => o.userId === userId && (beforeId === null || (o.id ?? 0) < beforeId))
        .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
        .slice(0, size)
        .map((o) => ({ ...o }))
    },
    async listByStatus(status, limit) {
      return all.filter((o) => o.status === status).slice(0, limit).map((o) => ({ ...o }))
    },
    async listPaidGroupOrders(limit) {
      return all.filter((o) => o.marketType === 1 && o.status === 'PAY_SUCCESS' && o.teamId).slice(0, limit).map((o) => ({ ...o }))
    },
    async listUnsettled(limit) {
      return all.filter((o) => o.marketType === 1 && o.settleStatus === 0 && o.status === 'PAY_SUCCESS').slice(0, limit)
    },
  }
}

/** 模拟拼团服务：记录调用，可按需让结算失败 */
export function fakeGbm() {
  const calls: { op: string; args: unknown }[] = []
  let teamSeq = 0
  const state = { settleError: null as GbmError | null, lockError: null as GbmError | null }
  const client: GbmClient = {
    async lock(req) {
      calls.push({ op: 'lock', args: req })
      if (state.lockError) throw state.lockError
      return {
        orderId: 'G' + req.outTradeNo,
        originalPrice: 169,
        deductionPrice: 30,
        payPrice: 139,
        tradeOrderStatus: 0,
        teamId: req.teamId ?? String(10000000 + ++teamSeq).slice(-8),
      }
    },
    async settle(req) {
      calls.push({ op: 'settle', args: req })
      if (state.settleError) throw state.settleError
    },
    async refund(req) {
      calls.push({ op: 'refund', args: req })
    },
    async updateDcc(key, value) {
      calls.push({ op: 'dcc', args: { key, value } })
    },
  }
  return { client, calls, state }
}
