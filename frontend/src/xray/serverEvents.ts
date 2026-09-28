import type { Order } from '@/types'
import { recordEvent, type TraceSource } from './trace'

/**
 * 付款到账、成团、到期退款都发生在服务端，前端只能从订单状态变化看出来。
 * 这里记住每笔订单上次看到的状态，变化时补一条“服务端事件”。
 */

const lastSeen = new Map<string, Order['status']>()
const UNPAID: Order['status'][] = ['CREATE', 'PAY_WAIT']

/** 返回推断出的事件（机制目录的键），同时写入追踪面板 */
export function observeOrders(orders: Order[], source: TraceSource): string[] {
  const found: string[] = []
  for (const o of orders) {
    const before = lastSeen.get(o.orderId)
    lastSeen.set(o.orderId, o.status)
    if (!before || before === o.status) continue
    const events: string[] = []
    if (UNPAID.includes(before) && (o.status === 'PAY_SUCCESS' || o.status === 'DEAL_DONE')) events.push('pay_success')
    if (o.status === 'DEAL_DONE' && o.purchaseType !== 'single') events.push('team_success')
    if ((o.status === 'WAIT_REFUND' || o.status === 'CLOSE') && o.closeReason?.includes('到期未成团')) events.push('auto_refund')
    for (const endpoint of events) {
      recordEvent({ source, endpoint, detail: `订单 ${o.orderId}：${label(before)} → ${label(o.status)}` })
      found.push(endpoint)
    }
  }
  return found
}

const labels: Record<Order['status'], string> = {
  CREATE: '待支付',
  PAY_WAIT: '待支付',
  PAY_SUCCESS: '已付款',
  DEAL_DONE: '拼团成功',
  WAIT_REFUND: '退款处理中',
  CLOSE: '已关闭',
}

function label(s: Order['status']) {
  return labels[s]
}

/** 仅测试用 */
export function resetObserved() {
  lastSeen.clear()
}
