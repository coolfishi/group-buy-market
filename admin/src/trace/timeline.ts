/**
 * 订单全链路：把商城库的订单、拼团库的队伍与成员、通知任务拼成一条时间线。
 * 纯函数，只依赖传入的数据，便于测试。
 */

export interface TraceOrder {
  order_id: string
  product_name: string
  order_time: string
  pay_amount: number | string
  market_type: number
  team_id: string | null
  status: string
  pay_time: string | null
  trade_no: string | null
  settle_status: number
  close_reason: string | null
  refund_time: string | null
}

export interface TraceTeam {
  team_id: string
  activity_name: string | null
  target_count: number
  lock_count: number
  complete_count: number
  /** 0 拼团中、1 成团、2 失败、3 成团含退单 */
  status: number
  valid_start_time: string
  valid_end_time: string
  notify_type: string | null
  create_time: string
}

export interface TraceMember {
  user_id: string
  order_id: string
  /** 0 已锁单、1 已付款结算、2 已退单 */
  status: number
  out_trade_no: string
  out_trade_time: string | null
  create_time: string
}

export interface TraceNotify {
  id: number
  team_id: string
  notify_category: string | null
  notify_type: string | null
  notify_count: number
  /** 0 待发送、1 已送达、2 待重试、3 失败 */
  notify_status: number
  parameter_json: string | null
  create_time: string
  update_time: string
}

export type Tone = 'ok' | 'wait' | 'warn' | 'fail'
export type Source = '商城库' | '拼团库' | '通知任务'

export interface Step {
  key: string
  title: string
  detail: string
  at: string | null
  source: Source
  tone: Tone
}

export interface Timeline {
  summary: string
  summaryTone: Tone
  steps: Step[]
}

const REFUND_CATEGORY: Record<string, string> = {
  trade_unpaid2refund: '未付款退单',
  trade_paid2refund: '已付款、未成团退单',
  trade_paid_team2refund: '已成团退单',
}

function notifyResult(n: TraceNotify): { text: string; tone: Tone } {
  const via = n.notify_type === 'MQ' ? 'MQ 消息' : 'HTTP 回调'
  if (n.notify_status === 1) return { text: `${via}已送达（共发送 ${n.notify_count} 次）`, tone: 'ok' }
  if (n.notify_status === 3) return { text: `${via}发送失败（已尝试 ${n.notify_count} 次），可在“通知任务”页手动重发`, tone: 'fail' }
  if (n.notify_status === 2) return { text: `${via}发送失败，等待定时任务重试（已尝试 ${n.notify_count} 次）`, tone: 'warn' }
  return { text: `${via}待发送`, tone: 'wait' }
}

function params(n: TraceNotify): Record<string, unknown> {
  try {
    return JSON.parse(n.parameter_json ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 这笔订单相关的通知：成团结算任务按队伍 + 出单列表匹配，退单任务按外部交易单号匹配 */
export function relatedNotifies(orderId: string, teamId: string | null, tasks: TraceNotify[]) {
  const settle = tasks.find((t) => {
    if (t.notify_category !== 'trade_settlement' || t.team_id !== teamId) return false
    const list = params(t).outTradeNoList
    return !Array.isArray(list) || list.map(String).includes(orderId)
  })
  const refund = tasks.find((t) => t.notify_category !== 'trade_settlement' && String(params(t).outTradeNo ?? '') === orderId)
  return { settle, refund }
}

function time(v: string | null | undefined) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function buildTimeline(
  order: TraceOrder,
  team: TraceTeam | null,
  members: TraceMember[],
  tasks: TraceNotify[],
  now = new Date(),
): Timeline {
  const steps: Step[] = []
  const isGroup = Number(order.market_type) === 1
  const paid = !!order.pay_time
  const refunded = !!order.refund_time || order.status === 'WAIT_REFUND'

  steps.push({
    key: 'create',
    title: '下单',
    detail: `${order.product_name}，${isGroup ? '拼团' : '单独购买'}，实付 ¥${Number(order.pay_amount).toFixed(2)}`,
    at: order.order_time,
    source: '商城库',
    tone: 'ok',
  })

  // ---------- 拼团侧：锁单 ----------
  const memberIndex = members.findIndex((m) => m.out_trade_no === order.order_id)
  const member = memberIndex >= 0 ? members[memberIndex] : undefined
  if (isGroup) {
    if (member) {
      steps.push({
        key: 'lock',
        title: memberIndex === 0 ? '锁单：开团' : `锁单：参团（第 ${memberIndex + 1} 人）`,
        detail: `队伍 ${order.team_id}${team ? `，${team.target_count} 人团，截止 ${fmt(team.valid_end_time)}` : ''}；锁单责任链校验通过，Redis 占用组队名额`,
        at: member.create_time,
        source: '拼团库',
        tone: 'ok',
      })
    } else {
      steps.push({
        key: 'lock',
        title: '锁单',
        detail: order.team_id ? `拼团库里没有找到这笔订单的锁单记录（队伍 ${order.team_id}），可能已被清理` : '没有锁单记录：下单时锁单失败',
        at: null,
        source: '拼团库',
        tone: order.team_id ? 'warn' : 'fail',
      })
    }
  }

  // ---------- 付款 ----------
  if (paid) {
    steps.push({
      key: 'pay',
      title: '付款到账',
      detail: order.trade_no ? `支付宝交易号 ${order.trade_no}` : '已确认到账',
      at: order.pay_time,
      source: '商城库',
      tone: 'ok',
    })
  } else if (order.status === 'CLOSE') {
    steps.push({ key: 'pay', title: '未付款，订单关闭', detail: order.close_reason ?? '已关闭', at: null, source: '商城库', tone: 'fail' })
  } else {
    steps.push({ key: 'pay', title: '等待付款', detail: '用户还没有完成支付宝付款', at: null, source: '商城库', tone: 'wait' })
  }

  // ---------- 拼团侧：结算、成团 ----------
  const { settle: settleTask, refund: refundTask } = relatedNotifies(order.order_id, order.team_id, tasks)
  if (isGroup && paid) {
    if (Number(order.settle_status) === 2) {
      steps.push({
        key: 'settle',
        title: '结算被拒',
        detail: '拼团结算责任链拒绝（付款时间晚于队伍截止时间等），商城自动原路退款',
        at: null,
        source: '商城库',
        tone: 'fail',
      })
    } else if (member?.out_trade_time || Number(order.settle_status) === 1) {
      steps.push({
        key: 'settle',
        title: '拼团结算',
        detail: '结算责任链：渠道黑名单 → 外部交易单号 → 付款时间早于截止 → 完成人数加一',
        at: member?.out_trade_time ?? null,
        source: '拼团库',
        tone: 'ok',
      })
    } else {
      steps.push({ key: 'settle', title: '拼团结算', detail: '已付款，等待商城调用结算（定时任务会重试）', at: null, source: '商城库', tone: 'wait' })
    }

    const formed = team && (team.status === 1 || team.status === 3)
    if (formed) {
      const r = settleTask ? notifyResult(settleTask) : null
      steps.push({
        key: 'team',
        title: '成团',
        detail: `${team!.target_count} 人全部付款，拼团成功${r ? `；${r.text}` : ''}`,
        at: settleTask?.create_time ?? null,
        source: settleTask ? '通知任务' : '拼团库',
        tone: r?.tone ?? 'ok',
      })
      if (settleTask && settleTask.notify_status === 1) {
        steps.push({
          key: 'callback',
          title: '商城收到成团回调',
          detail: order.status === 'DEAL_DONE' || refunded ? '队伍内已付款订单改为拼团成功' : '回调已送达，商城订单状态待同步',
          at: settleTask.update_time,
          source: '通知任务',
          tone: order.status === 'DEAL_DONE' || refunded ? 'ok' : 'warn',
        })
      }
    } else if (team) {
      const expired = (time(team.valid_end_time)?.getTime() ?? 0) <= now.getTime()
      if (expired) {
        steps.push({
          key: 'team',
          title: '到期未凑齐',
          detail: `截止时只有 ${team.complete_count}/${team.target_count} 人付款，${refunded ? '商城定时任务随后自动退单退款' : '商城定时任务会自动退单退款'}`,
          at: team.valid_end_time,
          source: '拼团库',
          tone: 'warn',
        })
      } else if (!refunded) {
        steps.push({
          key: 'team',
          title: '等待成团',
          detail: `已付款 ${team.complete_count}/${team.target_count} 人，截止 ${fmt(team.valid_end_time)}`,
          at: null,
          source: '拼团库',
          tone: 'wait',
        })
      }
    }
  }

  // ---------- 退单与退款 ----------
  if (refundTask || member?.status === 2) {
    const r = refundTask ? notifyResult(refundTask) : null
    steps.push({
      key: 'unlock',
      title: '拼团退单',
      detail: `${refundTask ? REFUND_CATEGORY[refundTask.notify_category ?? ''] ?? '退单' : '退单'}：退单责任链 + 对应策略，释放组队名额${r ? `；${r.text}` : ''}`,
      at: refundTask?.create_time ?? null,
      source: refundTask ? '通知任务' : '拼团库',
      tone: r?.tone ?? 'ok',
    })
  }
  if (paid && refunded) {
    const done = !!order.refund_time
    steps.push({
      key: 'refund',
      title: done ? '原路退款' : '退款处理中',
      detail: done ? order.close_reason ?? '已退款' : '支付宝退款失败时由定时任务重试',
      at: order.refund_time,
      source: '商城库',
      tone: done ? 'ok' : 'wait',
    })
  }

  return { steps: sortSteps(steps), ...summarize(order, team, refunded, now) }
}

/**
 * 按时间排序。节点是按业务先后插入的；没有时间的节点（例如结算被拒、等待成团）
 * 沿用前一个节点的时间，保持在它的逻辑位置上，不会被排到后面发生的退款之后。
 */
function sortSteps(steps: Step[]): Step[] {
  let last = 0
  const keyed = steps.map((s, i) => {
    const own = time(s.at)?.getTime()
    if (own !== undefined) last = Math.max(last, own)
    return { s, i, at: own ?? last }
  })
  keyed.sort((a, b) => a.at - b.at || a.i - b.i)
  return keyed.map((k) => k.s)
}

function summarize(order: TraceOrder, team: TraceTeam | null, refunded: boolean, now: Date): { summary: string; summaryTone: Tone } {
  if (refunded) return { summary: order.refund_time ? `已退款：${order.close_reason ?? '原路退回'}` : '退款处理中', summaryTone: order.refund_time ? 'ok' : 'wait' }
  switch (order.status) {
    case 'DEAL_DONE':
      return { summary: Number(order.market_type) === 1 ? '拼团成功，交易完成' : '交易完成', summaryTone: 'ok' }
    case 'CLOSE':
      return { summary: `已关闭：${order.close_reason ?? '未付款'}`, summaryTone: 'fail' }
    case 'CREATE':
    case 'PAY_WAIT':
      return { summary: '等待付款', summaryTone: 'wait' }
    case 'PAY_SUCCESS': {
      if (!team || Number(order.market_type) !== 1) return { summary: '已付款', summaryTone: 'ok' }
      const left = team.target_count - team.complete_count
      const expired = (time(team.valid_end_time)?.getTime() ?? 0) <= now.getTime()
      return expired
        ? { summary: '队伍已到期未凑齐，等待自动退款', summaryTone: 'warn' }
        : { summary: `拼团进行中，还差 ${left} 人，截止 ${fmt(team.valid_end_time)}`, summaryTone: 'wait' }
    }
    default:
      return { summary: order.status, summaryTone: 'wait' }
  }
}

function fmt(v: string) {
  const d = time(v)
  if (!d) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
