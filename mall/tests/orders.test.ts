import { describe, expect, it } from 'vitest'
import { GbmError } from '../src/gbm.js'
import { createOrderService, newOrderId } from '../src/orders.js'
import { createMockProvider } from '../src/pay/mock.js'
import { fakeGbm, memoryStore } from './fakes.js'

const product = { goodsId: 'TS-1002', goodsName: '夜航猫船长', originalPrice: 169 }

function setup() {
  const store = memoryStore([product])
  const gbm = fakeGbm()
  let t = new Date('2026-09-22T10:00:00+08:00').getTime()
  // 模拟支付宝与订单服务共用同一个测试时钟
  const pay = createMockProvider('https://pay.example.com/gateway', () => new Date(t))
  const service = createOrderService({
    store,
    gbm: gbm.client,
    pay,
    publicBaseUrl: 'https://shop.example.com',
    internalBaseUrl: 'http://mall:3100',
    payTimeoutMinutes: 30,
    now: () => new Date(t),
  })
  return { store, gbm, pay, service, advance: (ms: number) => (t += ms) }
}

describe('订单号', () => {
  it('固定 12 位数字，满足拼团库字段长度', () => {
    for (let i = 0; i < 50; i++) expect(newOrderId()).toMatch(/^\d{12}$/)
  })
})

describe('拼团下单与支付', () => {
  it('锁单 → 付款 → 结算 → 成团回调 → 拼团成功', async () => {
    const { store, gbm, pay, service } = setup()
    const { form, orderId } = await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 200102 })
    expect(form).toContain('<form')
    expect(orderId).toBe(store.all[0].orderId)
    const order = store.all[0]
    expect(order).toMatchObject({ status: 'PAY_WAIT', payAmount: 139, marketDeduction: 30, teamId: expect.any(String) })

    const lock = gbm.calls.find((c) => c.op === 'lock')!.args as Record<string, unknown>
    expect(lock).toMatchObject({ outTradeNo: order.orderId, activityId: 200102, notifyUrl: 'http://mall:3100/api/v1/alipay/group_buy_notify' })

    pay.markPaid(order.orderId)
    await service.sync()
    expect(store.all[0]).toMatchObject({ status: 'PAY_SUCCESS', settleStatus: 1 })
    expect(gbm.calls.some((c) => c.op === 'settle')).toBe(true)

    await service.onTeamComplete(order.teamId!, [order.orderId])
    expect(store.all[0].status).toBe('DEAL_DONE')
  })

  it('支付通知重复到达只处理一次', async () => {
    const { store, gbm, service } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    const id = store.all[0].orderId
    await service.markPaid(id, 'T1')
    await service.markPaid(id, 'T1')
    expect(gbm.calls.filter((c) => c.op === 'settle')).toHaveLength(1)
  })

  it('未支付的同款订单复用，订单号不变、不重复锁单', async () => {
    const { gbm, service } = setup()
    const a = await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    const b = await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    expect(b.orderId).toBe(a.orderId)
    expect(gbm.calls.filter((c) => c.op === 'lock')).toHaveLength(1)
  })

  it('并发提交被拦截', async () => {
    const { service } = setup()
    const first = service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 0 })
    await expect(service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 0 })).rejects.toMatchObject({ code: 'DUPLICATE' })
    await first
  })

  it('拼团服务拒绝锁单时透传原因，不创建订单', async () => {
    const { store, gbm, service } = setup()
    gbm.state.lockError = new GbmError('E0006', '拼团组队完结，锁单量已达成')
    await expect(service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1, teamId: '12345678' })).rejects.toMatchObject({
      code: 'E0006',
    })
    expect(store.all).toHaveLength(0)
  })

  it('单独购买不调用拼团接口，付款后为支付完成', async () => {
    const { store, gbm, pay, service } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 0 })
    expect(store.all[0].payAmount).toBe(169)
    pay.markPaid(store.all[0].orderId)
    await service.sync()
    expect(store.all[0].status).toBe('PAY_SUCCESS')
    expect(gbm.calls).toHaveLength(0)
  })

  it('付款时拼团已结束：结算被拒，自动退款关单', async () => {
    const { store, gbm, pay, service } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    gbm.state.settleError = new GbmError('E0106', '订单交易时间不在拼团有效时间范围内')
    pay.markPaid(store.all[0].orderId)
    await service.sync()
    expect(store.all[0]).toMatchObject({ status: 'CLOSE', settleStatus: 2, closeReason: '拼团已结束，已退款' })
  })

  it('结算遇到临时故障会在定时任务里重试', async () => {
    const { store, gbm, pay, service, advance } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    gbm.state.settleError = new GbmError('HTTP_502', '不可用')
    pay.markPaid(store.all[0].orderId)
    await service.sync()
    expect(store.all[0]).toMatchObject({ status: 'PAY_SUCCESS', settleStatus: 0 })
    gbm.state.settleError = null
    advance(60_000)
    await service.sync()
    expect(store.all[0].settleStatus).toBe(1)
  })

  it('超时未支付自动关单并释放拼团名额', async () => {
    const { store, gbm, service, advance } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    advance(31 * 60_000)
    await service.sync()
    expect(store.all[0]).toMatchObject({ status: 'CLOSE', closeReason: '超时未支付' })
    expect(gbm.calls.some((c) => c.op === 'refund')).toBe(true)
  })
})

describe('退单', () => {
  it('已付款的拼团订单：先退拼团再退款', async () => {
    const { store, gbm, pay, service } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 1, activityId: 1 })
    const id = store.all[0].orderId
    pay.markPaid(id)
    await service.sync()
    await expect(service.refund('oUserA', id)).resolves.toMatchObject({ success: true })
    expect(store.all[0]).toMatchObject({ status: 'CLOSE', closeReason: '已退款' })
    expect(gbm.calls.map((c) => c.op)).toEqual(['lock', 'settle', 'refund'])
  })

  it('未付款订单直接取消；不能退别人的订单', async () => {
    const { store, service } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 0 })
    const id = store.all[0].orderId
    await expect(service.refund('oUserB', id)).rejects.toMatchObject({ code: 'E0104' })
    await expect(service.refund('oUserA', id)).resolves.toMatchObject({ success: true, message: '订单已取消' })
    expect(store.all[0].status).toBe('CLOSE')
    await expect(service.refund('oUserA', id)).resolves.toMatchObject({ success: false })
  })

  it('取消前发现其实已付款：按已付款退单处理', async () => {
    const { store, pay, service } = setup()
    await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 0 })
    const id = store.all[0].orderId
    pay.markPaid(id)
    await expect(service.refund('oUserA', id)).resolves.toMatchObject({ success: true, message: '已提交退单' })
    expect(store.all[0]).toMatchObject({ status: 'CLOSE', closeReason: '已退款' })
  })
})

describe('订单列表', () => {
  it('按 id 游标分页', async () => {
    const { service, pay, store } = setup()
    for (let i = 0; i < 3; i++) {
      await service.createPayOrder('oUserA', { productId: 'TS-1002', marketType: 0 })
      pay.markPaid(store.all[i].orderId)
      await service.sync()
    }
    const p1 = await service.listOrders('oUserA', null, 2)
    expect(p1.orderList).toHaveLength(2)
    expect(p1.hasMore).toBe(true)
    const p2 = await service.listOrders('oUserA', p1.lastId, 2)
    expect(p2.orderList).toHaveLength(1)
    expect(p2.hasMore).toBe(false)
  })
})
