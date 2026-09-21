import { describe, expect, it } from 'vitest'
import type { AdminService } from '../src/admin/adminService.js'
import { buildApp } from '../src/app.js'
import type { MallConfig } from '../src/config.js'
import { createOrderService } from '../src/orders.js'
import { createMockProvider } from '../src/pay/mock.js'
import { signToken } from '../src/tokens.js'
import { fakeGbm, memoryStore } from './fakes.js'

const secret = 's'.repeat(40)

function config(overrides: Partial<MallConfig> = {}): MallConfig {
  return {
    port: 0,
    sessionSecret: secret,
    publicBaseUrl: 'https://shop.example.com',
    gbmBaseUrl: 'http://gbm',
    internalBaseUrl: 'http://mall:3100',
    source: 's01',
    channel: 'c01',
    mallDb: { host: '', port: 0, user: '', password: 'x', database: 'm' },
    gbmDb: { host: '', port: 0, user: '', password: 'x', database: 'g' },
    redis: { host: '', port: 0 },
    admin: { username: 'admin', password: 'correct-horse-battery' },
    pay: { provider: 'mock', alipay: { appId: '', privateKey: '', alipayPublicKey: '', gateway: '', keyType: '' } },
    wechat: { appId: '', appSecret: '', token: '' },
    devLogin: false,
    payTimeoutMinutes: 30,
    ...overrides,
  }
}

function build(overrides: Partial<MallConfig> = {}) {
  const pay = createMockProvider('https://pay.example.com')
  const store = memoryStore([{ goodsId: 'TS-2001', goodsName: '星轨旅人·澪', originalPrice: 699 }])
  const orders = createOrderService({
    store,
    gbm: fakeGbm().client,
    pay,
    publicBaseUrl: 'https://shop.example.com',
    internalBaseUrl: 'http://mall:3100',
    payTimeoutMinutes: 30,
  })
  const admin = { dcc: async () => [] } as unknown as AdminService
  return { app: buildApp({ config: config(overrides), orders, pay, admin, wechat: null }), store }
}

const userToken = signToken(secret, { sub: 'oUserA', role: 'user', exp: Date.now() + 60_000 })

describe('商城接口', () => {
  it('没有令牌返回 401', async () => {
    const { app } = build()
    const res = await app.inject({ method: 'POST', url: '/api/v1/alipay/query_user_order_list', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('用户身份来自令牌，忽略请求体里的 userId', async () => {
    const { app, store } = build()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alipay/create_pay_order',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { userId: 'someone-else', productId: 'TS-2001', marketType: 0 },
    })
    expect(res.json()).toMatchObject({ code: '0000' })
    expect(store.all[0].userId).toBe('oUserA')
  })

  it('参数校验', async () => {
    const { app } = build()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alipay/create_pay_order',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { productId: "'; drop table", marketType: 0 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('支付未配置时拒绝下单', async () => {
    const { app } = build({ pay: { provider: 'alipay', alipay: { appId: '', privateKey: '', alipayPublicKey: '', gateway: '', keyType: '' } } })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alipay/create_pay_order',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { productId: 'TS-2001', marketType: 0 },
    })
    expect(res.json()).toMatchObject({ code: 'PAY_UNCONFIGURED' })
  })

  it('微信未配置时给出明确提示，测试登录默认关闭', async () => {
    const { app } = build()
    const res = await app.inject({ method: 'GET', url: '/api/v1/login/weixin_qrcode_ticket_scene?sceneStr=ABCDEF0123456789ABCD' })
    expect(res.json()).toMatchObject({ code: 'WECHAT_UNCONFIGURED' })
    const dev = await app.inject({ method: 'GET', url: '/api/v1/login/dev_login?openid=abcd' })
    expect(dev.statusCode).toBe(404)
  })

  it('支付宝通知验签失败返回 fail', async () => {
    const { app } = build()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alipay/alipay_notify_url',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'out_trade_no=123456789012&trade_status=TRADE_SUCCESS&sign=fake',
    })
    expect(res.body).toBe('fail')
  })
})

describe('管理接口', () => {
  it('需要管理员令牌，用户令牌无效', async () => {
    const { app } = build()
    expect((await app.inject({ method: 'GET', url: '/api/admin/dcc' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/api/admin/dcc', headers: { authorization: `Bearer ${userToken}` } })).statusCode).toBe(401)
  })

  it('登录成功拿到令牌；连续失败后锁定', async () => {
    const { app } = build()
    const good = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password: 'correct-horse-battery' } })
    const token = good.json().data.token
    expect((await app.inject({ method: 'GET', url: '/api/admin/dcc', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200)

    for (let i = 0; i < 5; i++) {
      const bad = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password: 'wrong' } })
      expect(bad.statusCode).toBe(401)
    }
    const locked = await app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password: 'correct-horse-battery' } })
    expect(locked.statusCode).toBe(429)
  })
})
