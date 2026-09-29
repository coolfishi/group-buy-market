import { describe, expect, it } from 'vitest'
import { buildTimeline, relatedNotifies, type TraceMember, type TraceNotify, type TraceOrder, type TraceTeam } from '../src/trace/timeline'

const NOW = new Date('2026-09-28T12:00:00+08:00')
const t = (hhmm: string) => `2026-09-28T${hhmm}:00+08:00`

function order(p: Partial<TraceOrder> = {}): TraceOrder {
  return {
    order_id: '100000000001',
    product_name: 'POP UP PARADE 五条悟',
    order_time: t('10:00'),
    pay_amount: '169.00',
    market_type: 1,
    team_id: '12345678',
    status: 'PAY_WAIT',
    pay_time: null,
    trade_no: null,
    settle_status: 0,
    close_reason: null,
    refund_time: null,
    ...p,
  }
}

function team(p: Partial<TraceTeam> = {}): TraceTeam {
  return {
    team_id: '12345678',
    activity_name: '五条悟 2 人团',
    target_count: 2,
    lock_count: 1,
    complete_count: 0,
    status: 0,
    valid_start_time: t('10:00'),
    valid_end_time: t('13:00'),
    notify_type: 'HTTP',
    create_time: t('10:00'),
    ...p,
  }
}

const member = (p: Partial<TraceMember> = {}): TraceMember => ({
  user_id: 'oUser',
  order_id: '900000000001',
  status: 0,
  out_trade_no: '100000000001',
  out_trade_time: null,
  create_time: t('10:00'),
  ...p,
})

const notify = (p: Partial<TraceNotify>): TraceNotify => ({
  id: 1,
  team_id: '12345678',
  notify_category: 'trade_settlement',
  notify_type: 'HTTP',
  notify_count: 1,
  notify_status: 1,
  parameter_json: JSON.stringify({ teamId: '12345678', outTradeNoList: ['100000000001', '100000000002'] }),
  create_time: t('10:20'),
  update_time: t('10:20'),
  ...p,
})

const keys = (tl: ReturnType<typeof buildTimeline>) => tl.steps.map((s) => s.key)

describe('订单全链路时间线', () => {
  it('单独购买：只有商城侧节点', () => {
    const tl = buildTimeline(order({ market_type: 0, team_id: null, status: 'DEAL_DONE', pay_time: t('10:01'), trade_no: '2026T1' }), null, [], [], NOW)
    expect(keys(tl)).toEqual(['create', 'pay'])
    expect(tl.summary).toBe('交易完成')
  })

  it('拼团进行中：开团 → 付款 → 结算 → 等待成团', () => {
    const tl = buildTimeline(
      order({ status: 'PAY_SUCCESS', pay_time: t('10:02'), settle_status: 1 }),
      team({ complete_count: 1 }),
      [member({ status: 1, out_trade_time: t('10:02') })],
      [],
      NOW,
    )
    expect(keys(tl)).toEqual(['create', 'lock', 'pay', 'settle', 'team'])
    expect(tl.steps[1].title).toBe('锁单：开团')
    expect(tl.steps[4]).toMatchObject({ title: '等待成团', tone: 'wait' })
    expect(tl.summary).toBe('拼团进行中，还差 1 人，截止 09-28 13:00')
  })

  it('参团并成团：回调送达后订单变为拼团成功', () => {
    const tl = buildTimeline(
      order({ order_id: '100000000002', status: 'DEAL_DONE', pay_time: t('10:19'), settle_status: 1 }),
      team({ status: 1, lock_count: 2, complete_count: 2 }),
      [member({ status: 1 }), member({ out_trade_no: '100000000002', status: 1, out_trade_time: t('10:19'), create_time: t('10:18') })],
      [notify({})],
      NOW,
    )
    expect(tl.steps.find((s) => s.key === 'lock')?.title).toBe('锁单：参团（第 2 人）')
    expect(tl.steps.find((s) => s.key === 'team')).toMatchObject({ source: '通知任务', tone: 'ok' })
    expect(tl.steps.at(-1)).toMatchObject({ key: 'callback', tone: 'ok' })
    expect(tl.summary).toBe('拼团成功，交易完成')
  })

  it('成团回调多次失败：提示去通知任务页重发', () => {
    const tl = buildTimeline(
      order({ status: 'PAY_SUCCESS', pay_time: t('10:02'), settle_status: 1 }),
      team({ status: 1, complete_count: 2, lock_count: 2 }),
      [member({ status: 1, out_trade_time: t('10:02') })],
      [notify({ notify_status: 3, notify_count: 5, parameter_json: JSON.stringify({ outTradeNoList: ['100000000001'] }) })],
      NOW,
    )
    const step = tl.steps.find((s) => s.key === 'team')!
    expect(step.tone).toBe('fail')
    expect(step.detail).toContain('已尝试 5 次')
    expect(step.detail).toContain('手动重发')
    expect(keys(tl)).not.toContain('callback')
  })

  it('结算被拒：付款晚于截止，自动退款', () => {
    const tl = buildTimeline(
      order({ status: 'CLOSE', pay_time: t('13:05'), settle_status: 2, refund_time: t('13:06'), close_reason: '拼团已结束，已退款' }),
      team({ valid_end_time: t('13:00') }),
      [member()],
      [],
      NOW,
    )
    expect(tl.steps.find((s) => s.key === 'settle')).toMatchObject({ title: '结算被拒', tone: 'fail' })
    expect(tl.steps.at(-1)).toMatchObject({ key: 'refund', title: '原路退款' })
    expect(tl.summary).toBe('已退款：拼团已结束，已退款')
  })

  it('到期未成团自动退款：拼团退单 → 原路退款', () => {
    const tl = buildTimeline(
      order({ status: 'CLOSE', pay_time: t('10:02'), settle_status: 1, refund_time: t('11:40'), close_reason: '拼团到期未成团，已自动退款' }),
      team({ valid_end_time: t('11:00'), complete_count: 1 }),
      [member({ status: 2, out_trade_time: t('10:02') })],
      [notify({ id: 2, notify_category: 'trade_paid2refund', notify_type: 'MQ', parameter_json: JSON.stringify({ outTradeNo: '100000000001' }), create_time: t('11:39') })],
      NOW,
    )
    expect(keys(tl)).toEqual(['create', 'lock', 'pay', 'settle', 'team', 'unlock', 'refund'])
    expect(tl.steps[4]).toMatchObject({ title: '到期未凑齐', at: t('11:00'), tone: 'warn' })
    expect(tl.steps[5].detail).toContain('已付款、未成团退单')
    expect(tl.steps[5].detail).toContain('MQ 消息已送达')
    expect(tl.summary).toBe('已退款：拼团到期未成团，已自动退款')
  })

  it('未付款超时关闭', () => {
    const tl = buildTimeline(order({ status: 'CLOSE', close_reason: '超时未支付' }), team(), [member({ status: 2 })], [], NOW)
    expect(tl.steps.find((s) => s.key === 'pay')).toMatchObject({ title: '未付款，订单关闭', detail: '超时未支付', tone: 'fail' })
    expect(keys(tl)).not.toContain('refund')
    expect(tl.summary).toBe('已关闭：超时未支付')
  })

  it('通知任务按队伍和交易单号匹配，不串到别的订单', () => {
    const tasks = [
      notify({ id: 1, parameter_json: JSON.stringify({ outTradeNoList: ['999999999999'] }) }),
      notify({ id: 2, notify_category: 'trade_paid2refund', parameter_json: JSON.stringify({ outTradeNo: '999999999999' }) }),
    ]
    expect(relatedNotifies('100000000001', '12345678', tasks)).toEqual({ settle: undefined, refund: undefined })
  })
})
