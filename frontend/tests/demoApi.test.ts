import { describe, expect, it } from 'vitest'
import { filterProducts, products } from '@/data/products'
import { createDemoApi, DEMO_STORAGE_KEY } from '@/services/demo/demoApi'

const user = { userId: 'demo_player', displayName: '体验玩家' }

function setup(start = Date.UTC(2026, 0, 1)) {
  let t = start
  const api = createDemoApi({ storage: window.localStorage, now: () => t, latencyMs: 0 })
  return { api, advance: (ms: number) => (t += ms), reopen: () => createDemoApi({ storage: window.localStorage, now: () => t, latencyMs: 0 }) }
}

describe('商品筛选', () => {
  it('按分类与关键词过滤，无结果时返回空', () => {
    expect(filterProducts(products, '', 'mecha').map((p) => p.id)).toEqual(['TS-3001', 'TS-3002'])
    expect(filterProducts(products, '软胶', 'all')).toHaveLength(2)
    expect(filterProducts(products, '不存在的东西', 'all')).toEqual([])
    expect(filterProducts(products, '软胶', 'anime')).toEqual([])
  })
})

describe('演示模式完整流程', () => {
  it('开团 → 模拟支付 → 订单 → 退单 → 退款完成，刷新后保持', async () => {
    const { api, advance, reopen } = setup()
    const market = await api.getMarket('TS-1001', user)
    const res = await api.checkout(user, { productId: 'TS-1001', type: 'open', activityId: market.activityId })
    if (res.kind !== 'demo') throw new Error('expected demo')
    expect(res.order).toMatchObject({ status: 'PAY_WAIT', payAmount: 99 })

    const paid = await api.settleDemoPayment(user, res.order.orderId, 'confirm')
    expect(paid.status).toBe('PAY_SUCCESS')
    expect(paid.teamProgress).toEqual({ target: 3, complete: 1 })

    // 模拟刷新：新实例读取同一份本地存储
    const again = reopen()
    const page = await again.listOrders(user, null, 10)
    expect(page.orders).toHaveLength(1)
    expect((await again.getMarket('TS-1001', user)).teams[0].isMine).toBe(true)

    await expect(again.refund(user, paid.orderId)).resolves.toBe('WAIT_REFUND')
    expect((await again.listOrders(user, null, 10)).orders[0].status).toBe('WAIT_REFUND')
    advance(9_000)
    expect((await again.listOrders(user, null, 10)).orders[0]).toMatchObject({ status: 'CLOSE', closeReason: '已退款' })
    // 自己的队伍释放后移除
    expect((await again.getMarket('TS-1001', user)).teams.some((t) => t.isMine)).toBe(false)
  })

  it('参团补齐最后一人即拼团成功', async () => {
    const { api } = setup()
    const market = await api.getMarket('TS-2001', user)
    const team = market.teams.find((t) => t.lockCount === t.targetCount - 1 && t.validEndTime > Date.UTC(2026, 0, 1))!
    const res = await api.checkout(user, { productId: 'TS-2001', type: 'join', teamId: team.teamId, activityId: market.activityId })
    if (res.kind !== 'demo') throw new Error('expected demo')
    const paid = await api.settleDemoPayment(user, res.order.orderId, 'confirm')
    expect(paid.status).toBe('DEAL_DONE')
  })

  it('取消支付会关闭订单并释放名额', async () => {
    const { api } = setup()
    const before = await api.getMarket('TS-1002', user)
    const team = before.teams.find((t) => t.lockCount < t.targetCount)!
    const res = await api.checkout(user, { productId: 'TS-1002', type: 'join', teamId: team.teamId, activityId: before.activityId })
    if (res.kind !== 'demo') throw new Error('expected demo')
    const closed = await api.settleDemoPayment(user, res.order.orderId, 'cancel')
    expect(closed).toMatchObject({ status: 'CLOSE', closeReason: '已取消支付' })
    const after = await api.getMarket('TS-1002', user)
    expect(after.teams.find((t) => t.teamId === team.teamId)?.lockCount).toBe(team.lockCount)
  })

  it('过期、满员、重复参团都会被拒绝', async () => {
    const { api } = setup()
    const expired = (await api.getMarket('TS-3001', user)).teams.find((t) => t.teamId.endsWith('EXP'))!
    await expect(api.checkout(user, { productId: 'TS-3001', type: 'join', teamId: expired.teamId })).rejects.toMatchObject({ code: 'E0102' })

    const full = (await api.getMarket('TS-1001', user)).teams.find((t) => t.teamId.endsWith('FULL'))!
    expect(full.lockCount).toBe(full.targetCount)
    await expect(api.checkout(user, { productId: 'TS-1001', type: 'join', teamId: full.teamId })).rejects.toMatchObject({ code: 'E0006' })

    const open = (await api.getMarket('TS-3002', user)).teams.find((t) => t.targetCount - t.lockCount >= 2)!
    await api.checkout(user, { productId: 'TS-3002', type: 'join', teamId: open.teamId })
    await expect(api.checkout(user, { productId: 'TS-3002', type: 'join', teamId: open.teamId })).rejects.toMatchObject({ code: 'E0103' })
  })

  it('同一商品提交中重复点击会被拦截', async () => {
    const api = createDemoApi({ storage: window.localStorage, latencyMs: 20 })
    const first = api.checkout(user, { productId: 'TS-2002', type: 'single' })
    await expect(api.checkout(user, { productId: 'TS-2002', type: 'single' })).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(first).resolves.toMatchObject({ kind: 'demo' })
  })

  it('订单分页', async () => {
    const { api } = setup()
    for (let i = 0; i < 7; i++) await api.checkout(user, { productId: 'TS-2002', type: 'single' })
    const p1 = await api.listOrders(user, null, 5)
    expect(p1.orders).toHaveLength(5)
    expect(p1.hasMore).toBe(true)
    const p2 = await api.listOrders(user, p1.lastId, 5)
    expect(p2.orders).toHaveLength(2)
    expect(p2.hasMore).toBe(false)
    expect(new Set([...p1.orders, ...p2.orders].map((o) => o.orderId)).size).toBe(7)
  })

  it('待支付订单可直接取消，已关闭订单不能退单', async () => {
    const { api } = setup()
    const res = await api.checkout(user, { productId: 'TS-2002', type: 'single' })
    if (res.kind !== 'demo') throw new Error('expected demo')
    await expect(api.refund(user, res.order.orderId)).resolves.toBe('CLOSE')
    await expect(api.refund(user, res.order.orderId)).rejects.toMatchObject({ code: 'REFUND_DENIED' })
  })

  it('损坏的本地数据会重新初始化', async () => {
    window.localStorage.setItem(DEMO_STORAGE_KEY, '{broken')
    const { api } = setup()
    await expect(api.listActiveTeams(4)).resolves.toHaveLength(4)
  })
})
