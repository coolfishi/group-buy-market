import type { Order } from '@/types'

export function formatPrice(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function formatDateTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 剩余时间 → HH:MM:SS，超过一天显示天数 */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00:00'
  const total = Math.floor(remainingMs / 1000)
  const days = Math.floor(total / 86400)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hms = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
  return days > 0 ? `${days} 天 ${hms}` : hms
}

export interface StatusView {
  label: string
  tone: 'wait' | 'paid' | 'done' | 'refund' | 'closed'
  note?: string
}

export function orderStatusView(order: Order): StatusView {
  switch (order.status) {
    case 'CREATE':
    case 'PAY_WAIT':
      return { label: '待支付', tone: 'wait', note: '还没付款，可以继续付款或取消订单' }
    case 'PAY_SUCCESS':
      if (order.team?.state === 'failed') {
        return { label: '支付完成', tone: 'paid', note: '拼团到期未凑齐，可以申请退单' }
      }
      if (order.teamProgress) {
        const { complete, target } = order.teamProgress
        return { label: '支付完成', tone: 'paid', note: `拼团中，已有 ${complete}/${target} 人付款` }
      }
      return { label: '支付完成', tone: 'paid', note: order.purchaseType === 'single' ? '单独购买' : undefined }
    case 'DEAL_DONE':
      return {
        label: order.purchaseType === 'single' ? '交易完成' : '拼团成功',
        tone: 'done',
        note: order.purchaseType === 'single' ? undefined : '已成团，等待发货',
      }
    case 'WAIT_REFUND':
      return { label: '退款处理中', tone: 'refund', note: '退款将原路退回，到账后状态自动更新' }
    case 'CLOSE':
      return { label: '已关闭', tone: 'closed', note: order.closeReason }
  }
}

export function canRefund(order: Order): boolean {
  return order.status === 'PAY_WAIT' || order.status === 'CREATE' || order.status === 'PAY_SUCCESS' || order.status === 'DEAL_DONE'
}
