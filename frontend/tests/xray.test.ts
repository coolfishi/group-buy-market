import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readConfig } from '@/config/env'
import { createDemoApi } from '@/services/demo/demoApi'
import { createLiveApi } from '@/services/live/liveApi'
import { withXray } from '@/services'
import type { Order } from '@/types'
import { demoEndpointOf, endpointOf, mechanisms } from '@/xray/mechanisms'
import { observeOrders, resetObserved } from '@/xray/serverEvents'
import { clearTrace, entries, recordEnd, recordStart, redact, setXray } from '@/xray/trace'

const user = { userId: 'oUserOpenid123456', displayName: '体验玩家', token: 'signed.secret.token' }

beforeEach(() => {
  clearTrace()
  resetObserved()
  setXray(true)
})
afterEach(() => setXray(false))

describe('脱敏', () => {
  it('隐藏令牌和签名，打码用户标识，支付表单只留网关和字段名', () => {
    const out = redact({
      Authorization: 'Bearer abc',
      token: 'signed.secret.token',
      userId: 'oUserOpenid123456',
      nested: { openid: 'oABCDEFG' },
      form: '<form name="punchout_form" method="get" action="https://openapi.alipay.com/gateway.do?x=1"><input name="biz_content" value="{secret}"><input name="sign" value="SIG"></form>',
    }) as Record<string, unknown>
    expect(out.Authorization).toBe('（已隐藏）')
    expect(out.token).toBe('（已隐藏）')
    expect(out.userId).toBe('oU****56')
    expect((out.nested as Record<string, unknown>).openid).toBe('oA****FG')
    expect(out.form).toBe('支付表单 → https://openapi.alipay.com/gateway.do（字段：biz_content、sign，值已隐藏）')
    expect(JSON.stringify(out)).not.toContain('SIG')
    expect(JSON.stringify(out)).not.toContain('secret')
  })

  it('截断长字符串和长数组', () => {
    expect(String(redact('x'.repeat(500)))).toContain('共 500 字')
    expect(redact(Array.from({ length: 20 }, (_, i) => i))).toHaveLength(9)
  })
})

describe('追踪', () => {
  it('开关关闭时不记录', () => {
    setXray(false)
    expect(recordStart({ source: 'live', endpoint: 'x', method: 'GET' })).toBeNull()
    expect(entries).toHaveLength(0)
  })

  it('连续轮询同一接口合并为一条并计数', () => {
    for (let i = 0; i < 3; i++) recordEnd(recordStart({ source: 'live', endpoint: 'check_login_scene', method: 'GET' }), { ok: true })
    expect(entries).toHaveLength(1)
    expect(entries[0].repeat).toBe(3)
  })

  it('从地址取接口名', () => {
    expect(endpointOf('/api/v1/alipay/create_pay_order')).toBe('create_pay_order')
    expect(endpointOf('https://x.example.com/api/v1/login/check_login_scene?ticket=1')).toBe('check_login_scene')
  })
})

describe('机制目录', () => {
  it('演示模式每个方法都有对应的机制说明', () => {
    for (const endpoint of Object.values(demoEndpointOf)) expect(mechanisms[endpoint], endpoint).toBeDefined()
    for (const key of ['pay_success', 'team_success', 'auto_refund', 'check_login_scene', 'weixin_qrcode_ticket_scene']) {
      expect(mechanisms[key], key).toBeDefined()
    }
  })

  it('锁单链路包含三个责任链过滤器且顺序正确', () => {
    const names = mechanisms.create_pay_order.steps.map((s) => s.name)
    const idx = ['ActivityUsabilityRuleFilter', 'UserTakeLimitRuleFilter', 'TeamStockOccupyRuleFilter'].map((n) => names.indexOf(n))
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })
})

describe('演示模式包装', () => {
  it('记录模拟请求，不改变返回值，并推断付款到账事件', async () => {
    const api = withXray(createDemoApi({ storage: window.localStorage, latencyMs: 0 }))
    const market = await api.getMarket('NR-01', user)
    const res = await api.checkout(user, { productId: 'NR-01', type: 'open', activityId: market.activityId })
    if (res.kind !== 'demo') throw new Error('expected demo')
    const paid = await api.settleDemoPayment(user, res.order.orderId, 'confirm')
    expect(paid.status).toBe('PAY_SUCCESS')

    const names = entries.map((e) => e.endpoint).reverse()
    expect(names).toEqual(['query_group_buy_market_config', 'create_pay_order', 'demo_cashier', 'pay_success'])
    expect(entries.every((e) => e.source === 'demo')).toBe(true)
    // 请求参数不包含用户对象（第一个参数）
    expect(JSON.stringify(entries.map((e) => e.request))).not.toContain('signed.secret.token')
  })
})

describe('服务端事件推断', () => {
  const order = (status: Order['status'], closeReason?: string): Order => ({
    orderId: '100000000001',
    productName: '五条悟',
    payAmount: 169,
    orderTime: 0,
    status,
    purchaseType: 'open',
    closeReason,
  })

  it('状态变化对应到付款、成团、到期退款', () => {
    expect(observeOrders([order('PAY_WAIT')], 'server')).toEqual([])
    expect(observeOrders([order('PAY_SUCCESS')], 'server')).toEqual(['pay_success'])
    expect(observeOrders([order('DEAL_DONE')], 'server')).toEqual(['team_success'])
    resetObserved()
    observeOrders([order('PAY_SUCCESS')], 'server')
    expect(observeOrders([order('WAIT_REFUND', '拼团到期未成团，已自动退款')], 'server')).toEqual(['auto_refund'])
    expect(entries[0].detail).toBe('订单 100000000001：已付款 → 退款处理中')
  })

  it('首次看到的订单只记住状态，不产生事件', () => {
    expect(observeOrders([order('DEAL_DONE')], 'server')).toEqual([])
  })
})

describe('真实模式', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('记录真实请求、耗时和业务码，令牌不进入面板，订单变化推断为服务端事件', async () => {
    const config = readConfig({
      VITE_APP_MODE: 'live',
      VITE_GBM_API_BASE: 'https://gbm.example.com',
      VITE_MALL_API_BASE: 'https://mall.example.com',
      VITE_LIVE_SKU_MAP: '{"JJ-01":"JJ-01"}',
      VITE_PAY_ALLOWED_ORIGINS: 'https://openapi.alipay.com',
      VITE_REQUEST_TIMEOUT_MS: '2000',
    })
    let status = 'PAY_WAIT'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: '0000',
            data: { orderList: [{ orderId: '100000000001', productId: 'JJ-01', status, orderTime: 1, payAmount: 169, marketType: 1 }] },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const api = withXray(createLiveApi(config, async () => {}))
    await api.listOrders(user, null, 5)
    status = 'PAY_SUCCESS'
    await api.listOrders(user, null, 5)

    const req = entries.find((e) => e.source === 'live')!
    expect(req).toMatchObject({ endpoint: 'query_user_order_list', method: 'POST', status: 'ok', code: '0000', repeat: 2 })
    expect(JSON.stringify(req.request)).not.toContain('signed.secret.token')
    expect((req.request as Record<string, unknown>).userId).toBe('oU****56')
    expect(entries[0]).toMatchObject({ source: 'server', endpoint: 'pay_success' })
  })
})
