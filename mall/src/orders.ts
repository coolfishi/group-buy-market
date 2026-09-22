import { randomInt } from 'node:crypto'
import { GbmError, type GbmClient } from './gbm.js'
import type { PayProvider } from './pay/types.js'

export type OrderStatus = 'CREATE' | 'PAY_WAIT' | 'PAY_SUCCESS' | 'DEAL_DONE' | 'WAIT_REFUND' | 'CLOSE'

export interface PayOrder {
  orderId: string
  userId: string
  productId: string
  productName: string
  orderTime: Date
  totalAmount: number
  payAmount: number
  marketType: 0 | 1
  marketDeduction: number
  activityId: number | null
  teamId: string | null
  status: OrderStatus
  payForm: string | null
  payTime: Date | null
  tradeNo: string | null
  /** 拼团结算：0 未结算、1 已结算、2 结算被拒 */
  settleStatus: 0 | 1 | 2
  closeReason: string | null
  refundTime: Date | null
  id?: number
}

export interface Product {
  goodsId: string
  goodsName: string
  originalPrice: number
}

/** 订单页展示的拼团队伍快照 */
export interface TeamSnapshot {
  teamId: string
  /** 0 拼团中、1 已成团、2 已失败、3 成团含退单 */
  status: number
  targetCount: number
  lockCount: number
  completeCount: number
  validEndTime: number
  members: { label: string; paid: boolean; isMe: boolean; isLeader: boolean }[]
}

export interface OrderStore {
  findProduct(goodsId: string): Promise<Product | null>
  insert(order: PayOrder): Promise<void>
  update(orderId: string, patch: Partial<PayOrder>, expectStatus?: OrderStatus[]): Promise<boolean>
  get(orderId: string): Promise<PayOrder | null>
  findReusable(userId: string, productId: string, marketType: 0 | 1, teamId: string | null): Promise<PayOrder | null>
  listByUser(userId: string, beforeId: number | null, size: number): Promise<PayOrder[]>
  listByStatus(status: OrderStatus, limit: number): Promise<PayOrder[]>
  listUnsettled(limit: number): Promise<PayOrder[]>
  /** 查询订单所在队伍的进度与成员（可选，测试替身可不实现） */
  teamsByIds?(teamIds: string[], userId: string): Promise<TeamSnapshot[]>
}

export class MallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 200,
  ) {
    super(message)
  }
}

export interface OrderServiceDeps {
  store: OrderStore
  gbm: GbmClient
  pay: PayProvider
  publicBaseUrl: string
  internalBaseUrl: string
  /** 支付宝异步通知地址，不填时由 publicBaseUrl 拼接 */
  payNotifyUrl?: string
  payTimeoutMinutes: number
  now?: () => Date
  log?: { info(obj: unknown, msg?: string): void; error(obj: unknown, msg?: string): void }
}

/** 拼团侧认为订单已不可结算（拼团已结束、已退单等），付款需要原路退回 */
const SETTLE_REJECTED = new Set(['E0101', 'E0102', 'E0104', 'E0105', 'E0106'])

export function newOrderId(now = Date.now()): string {
  // 12 位：时间戳后 8 位 + 4 位随机，满足拼团库 varchar(12)
  return String(now).slice(-8) + String(randomInt(0, 10000)).padStart(4, '0')
}

export function createOrderService(deps: OrderServiceDeps) {
  const { store, gbm, pay } = deps
  const now = deps.now ?? (() => new Date())
  const log = deps.log ?? { info() {}, error() {} }
  const inflight = new Set<string>()

  const notifyUrl = `${deps.internalBaseUrl}/api/v1/alipay/group_buy_notify`
  const payNotifyUrl = deps.payNotifyUrl || `${deps.publicBaseUrl}/api/v1/alipay/alipay_notify_url`
  const returnUrl = `${deps.publicBaseUrl}/orders`

  async function guard<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (inflight.has(key)) throw new MallError('DUPLICATE', '订单正在处理，请勿重复提交。')
    inflight.add(key)
    try {
      return await fn()
    } finally {
      inflight.delete(key)
    }
  }

  async function createPayOrder(
    userId: string,
    req: { productId: string; marketType: 0 | 1; activityId?: number | null; teamId?: string | null },
  ): Promise<{ form: string; orderId: string }> {
    return guard(`create:${userId}:${req.productId}`, async () => {
      const product = await store.findProduct(req.productId)
      if (!product) throw new MallError('NOT_FOUND', '商品不存在或已下架。')
      if (req.marketType === 1 && !req.activityId) throw new MallError('0002', '缺少拼团活动信息。')

      // 同一商品、同一拼团方式的未支付订单直接复用，避免重复锁单
      // 复用时重新生成支付表单（同一订单号，新的时间戳与签名），不直接返回旧表单
      const reusable = await store.findReusable(userId, product.goodsId, req.marketType, req.teamId ?? null)
      if (reusable && reusable.status === 'PAY_WAIT') {
        try {
          const form = await pay.pagePay({
            orderId: reusable.orderId,
            amount: reusable.payAmount,
            subject: reusable.productName,
            notifyUrl: payNotifyUrl,
            returnUrl,
            timeoutMinutes: deps.payTimeoutMinutes,
          })
          await store.update(reusable.orderId, { payForm: form })
          return { form, orderId: reusable.orderId }
        } catch (e) {
          log.error({ err: e, orderId: reusable.orderId }, '重新生成支付单失败')
          throw new MallError('PAY_UNAVAILABLE', '支付服务暂时不可用，请稍后再试。')
        }
      }

      const orderId = newOrderId(now().getTime())
      const order: PayOrder = {
        orderId,
        userId,
        productId: product.goodsId,
        productName: product.goodsName,
        orderTime: now(),
        totalAmount: product.originalPrice,
        payAmount: product.originalPrice,
        marketType: req.marketType,
        marketDeduction: 0,
        activityId: req.marketType === 1 ? Number(req.activityId) : null,
        teamId: null,
        status: 'CREATE',
        payForm: null,
        payTime: null,
        tradeNo: null,
        settleStatus: 0,
        closeReason: null,
        refundTime: null,
      }

      if (req.marketType === 1) {
        try {
          const lock = await gbm.lock({
            userId,
            teamId: req.teamId ?? null,
            activityId: Number(req.activityId),
            goodsId: product.goodsId,
            outTradeNo: orderId,
            notifyUrl,
          })
          order.payAmount = Number(lock.payPrice)
          order.marketDeduction = Number(lock.deductionPrice)
          order.totalAmount = Number(lock.originalPrice)
          order.teamId = lock.teamId ?? null
        } catch (e) {
          if (e instanceof GbmError) throw new MallError(e.code, e.message)
          throw e
        }
      }

      await store.insert(order)
      try {
        const form = await pay.pagePay({
          orderId,
          amount: order.payAmount,
          subject: product.goodsName,
          notifyUrl: payNotifyUrl,
          returnUrl,
          timeoutMinutes: deps.payTimeoutMinutes,
        })
        await store.update(orderId, { status: 'PAY_WAIT', payForm: form })
        log.info({ orderId, userId, marketType: req.marketType, teamId: order.teamId }, '创建支付订单')
        return { form, orderId }
      } catch (e) {
        await store.update(orderId, { status: 'CLOSE', closeReason: '创建支付失败' })
        if (order.marketType === 1) await gbm.refund({ userId, outTradeNo: orderId }).catch(() => undefined)
        log.error({ err: e, orderId }, '创建支付单失败')
        throw new MallError('PAY_UNAVAILABLE', '支付服务暂时不可用，请稍后再试。')
      }
    })
  }

  /** 支付到账（异步通知或主动查询），幂等 */
  async function markPaid(orderId: string, tradeNo?: string, paidAt?: Date) {
    const order = await store.get(orderId)
    if (!order) return
    const changed = await store.update(
      orderId,
      { status: 'PAY_SUCCESS', payTime: paidAt ?? now(), tradeNo: tradeNo ?? null },
      ['CREATE', 'PAY_WAIT'],
    )
    if (!changed) return
    log.info({ orderId }, '支付成功')
    if (order.marketType === 1) await settle({ ...order, payTime: paidAt ?? now() })
  }

  async function settle(order: PayOrder) {
    try {
      await gbm.settle({ userId: order.userId, outTradeNo: order.orderId, outTradeTime: order.payTime ?? now() })
      await store.update(order.orderId, { settleStatus: 1 })
    } catch (e) {
      if (e instanceof GbmError && SETTLE_REJECTED.has(e.code)) {
        // 付款时拼团已结束：原路退款
        log.info({ orderId: order.orderId, code: e.code }, '拼团结算被拒，自动退款')
        await store.update(order.orderId, { settleStatus: 2, status: 'WAIT_REFUND' })
        await refundMoney({ ...order, status: 'WAIT_REFUND' }, '拼团已结束，已退款')
      } else {
        // 网络等临时问题，由定时任务重试
        log.error({ err: e, orderId: order.orderId }, '拼团结算失败，稍后重试')
      }
    }
  }

  async function refundMoney(order: PayOrder, reason: string) {
    try {
      await pay.refund(order.orderId, order.payAmount, reason)
      await store.update(order.orderId, { status: 'CLOSE', closeReason: reason, refundTime: now() }, ['WAIT_REFUND'])
    } catch (e) {
      // 保持“退款处理中”，定时任务重试
      log.error({ err: e, orderId: order.orderId }, '支付退款失败，稍后重试')
    }
  }

  /** 拼团成团回调：队伍内已支付订单变为拼团成功 */
  async function onTeamComplete(teamId: string, outTradeNoList: string[]) {
    for (const orderId of outTradeNoList) {
      await store.update(orderId, { status: 'DEAL_DONE' }, ['PAY_SUCCESS'])
    }
    log.info({ teamId, count: outTradeNoList.length }, '拼团成功')
  }

  async function refund(userId: string, orderId: string): Promise<{ success: boolean; message: string }> {
    return guard(`refund:${orderId}`, () => refundInner(userId, orderId))
  }

  async function refundInner(userId: string, orderId: string): Promise<{ success: boolean; message: string }> {
    const order = await store.get(orderId)
    if (!order || order.userId !== userId) throw new MallError('E0104', '订单不存在。')

    if (order.status === 'CREATE' || order.status === 'PAY_WAIT') {
      // 先确认支付宝侧确实没付款，防止刚付完就被关单
      const trade = await pay.query(orderId).catch(() => null)
      if (trade && (trade.status === 'TRADE_SUCCESS' || trade.status === 'TRADE_FINISHED')) {
        await markPaid(orderId, trade.tradeNo, trade.paidAt)
        return refundInner(userId, orderId)
      }
      await pay.close(orderId).catch(() => undefined)
      if (order.marketType === 1) await gbm.refund({ userId, outTradeNo: orderId }).catch(() => undefined)
      await store.update(orderId, { status: 'CLOSE', closeReason: '已取消订单' }, ['CREATE', 'PAY_WAIT'])
      return { success: true, message: '订单已取消' }
    }

    if (order.status === 'PAY_SUCCESS' || order.status === 'DEAL_DONE') {
      if (order.marketType === 1) {
        try {
          await gbm.refund({ userId, outTradeNo: orderId })
        } catch (e) {
          // E0104：拼团侧已无该单（已退），继续退款
          if (!(e instanceof GbmError && e.code === 'E0104')) {
            return { success: false, message: e instanceof Error ? e.message : '拼团退单失败' }
          }
        }
      }
      await store.update(orderId, { status: 'WAIT_REFUND' }, ['PAY_SUCCESS', 'DEAL_DONE'])
      await refundMoney({ ...order, status: 'WAIT_REFUND' }, '已退款')
      return { success: true, message: '已提交退单' }
    }

    return { success: false, message: '这笔订单当前不能退单。' }
  }

  /** 定时任务：补单、超时关单、结算与退款重试 */
  async function sync() {
    const timeoutMs = deps.payTimeoutMinutes * 60_000
    for (const order of await store.listByStatus('PAY_WAIT', 50)) {
      try {
        const trade = await pay.query(order.orderId)
        if (trade.status === 'TRADE_SUCCESS' || trade.status === 'TRADE_FINISHED') {
          await markPaid(order.orderId, trade.tradeNo, trade.paidAt)
        } else if (now().getTime() - order.orderTime.getTime() > timeoutMs) {
          await pay.close(order.orderId).catch(() => undefined)
          if (order.marketType === 1) await gbm.refund({ userId: order.userId, outTradeNo: order.orderId }).catch(() => undefined)
          await store.update(order.orderId, { status: 'CLOSE', closeReason: '超时未支付' }, ['PAY_WAIT'])
        }
      } catch (e) {
        log.error({ err: e, orderId: order.orderId }, '同步支付状态失败')
      }
    }
    for (const order of await store.listUnsettled(20)) {
      if (now().getTime() - (order.payTime?.getTime() ?? 0) > 30_000) await settle(order)
    }
    for (const order of await store.listByStatus('WAIT_REFUND', 20)) {
      await refundMoney(order, order.closeReason ?? '已退款')
    }
  }

  /** 用户查看订单时，对最近的待支付订单主动查一次支付结果 */
  async function refreshRecent(orders: PayOrder[]) {
    const pending = orders.filter((o) => o.status === 'PAY_WAIT').slice(0, 3)
    for (const o of pending) {
      const trade = await pay.query(o.orderId).catch(() => null)
      if (trade && (trade.status === 'TRADE_SUCCESS' || trade.status === 'TRADE_FINISHED')) {
        await markPaid(o.orderId, trade.tradeNo, trade.paidAt)
      }
    }
    return pending.length > 0
  }

  async function listOrders(userId: string, lastId: string | null, pageSize: number) {
    const size = Math.min(Math.max(pageSize || 10, 1), 50)
    const before = lastId && /^\d+$/.test(lastId) ? Number(lastId) : null
    let rows = await store.listByUser(userId, before, size + 1)
    if (before === null && (await refreshRecent(rows))) rows = await store.listByUser(userId, before, size + 1)
    const page = rows.slice(0, size)
    const teamIds = [...new Set(page.filter((o) => o.marketType === 1 && o.teamId).map((o) => o.teamId as string))]
    const teams = new Map<string, TeamSnapshot>()
    if (teamIds.length && store.teamsByIds) {
      try {
        for (const t of await store.teamsByIds(teamIds, userId)) teams.set(t.teamId, t)
      } catch (e) {
        // 队伍信息只是展示用，查询失败时照常返回订单
        log.error({ err: e }, '查询拼团队伍失败')
      }
    }
    return {
      orderList: page.map((o) => ({
        orderId: o.orderId,
        productId: o.productId,
        productName: o.productName,
        status: o.status,
        orderTime: o.orderTime.getTime(),
        payAmount: o.payAmount,
        totalAmount: o.totalAmount,
        marketType: o.marketType,
        teamId: o.teamId,
        closeReason: o.closeReason,
        team: o.teamId ? (teams.get(o.teamId) ?? null) : null,
      })),
      hasMore: rows.length > size,
      lastId: page.length ? String(page[page.length - 1].id) : lastId,
    }
  }

  return { createPayOrder, markPaid, onTeamComplete, refund, sync, listOrders }
}

export type OrderService = ReturnType<typeof createOrderService>
