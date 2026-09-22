import { afterEach, describe, expect, it, vi } from 'vitest'
import { readConfig } from '@/config/env'
import { createLiveApi, mapOrderTeam } from '@/services/live/liveApi'
import { parsePayForm } from '@/services/live/payForm'

const config = readConfig({
  VITE_APP_MODE: 'live',
  VITE_GBM_API_BASE: 'https://gbm.example.com/',
  VITE_MALL_API_BASE: 'https://mall.example.com',
  VITE_LIVE_SKU_MAP: '{"JJ-01":"7001"}',
  VITE_PAY_ALLOWED_ORIGINS: 'https://openapi.alipay.com',
  VITE_REQUEST_TIMEOUT_MS: '2000',
})
const user = { userId: 'oUser123456', displayName: '微信用户', token: 'signed.token' }
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

function mockFetch(handler: (url: string, body: any) => unknown) {
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const res = handler(url, init.body ? JSON.parse(init.body as string) : undefined)
    return res instanceof Response ? res : json(res)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('真实模式配置', () => {
  it('只有映射了 SKU 的商品可购买', () => {
    const api = createLiveApi(config, async () => {})
    expect(api.purchasability('JJ-01').ok).toBe(true)
    expect(api.purchasability('NR-01').ok).toBe(false)
  })

  it('未映射商品不会发起请求，也不会退回演示数据', async () => {
    const fetch = mockFetch(() => ({ code: '0000' }))
    const api = createLiveApi(config, async () => {})
    await expect(api.getMarket('NR-01', user)).rejects.toMatchObject({ kind: 'not_purchasable' })
    await expect(api.checkout(user, { productId: 'NR-01', type: 'single' })).rejects.toMatchObject({
      kind: 'not_purchasable',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('缺少服务地址时明确报错', async () => {
    const api = createLiveApi(readConfig({ VITE_APP_MODE: 'live', VITE_LIVE_SKU_MAP: '{"JJ-01":"7001"}' }), async () => {})
    expect(api.purchasability('JJ-01')).toMatchObject({ ok: false })
    await expect(api.listOrders(user, null, 10)).rejects.toMatchObject({ kind: 'config' })
  })

  it('真实模式没有模拟付款和体验账号', async () => {
    const api = createLiveApi(config, async () => {})
    await expect(api.settleDemoPayment(user, 'x', 'confirm')).rejects.toMatchObject({ kind: 'config' })
    await expect(api.demoLogin()).rejects.toMatchObject({ kind: 'config' })
  })
})

describe('拼团配置', () => {
  it('用真实 SKU 请求，价格和队伍以接口为准', async () => {
    const end = '2030-01-01 10:00:00'
    const fetch = mockFetch(() => ({
      code: '0000',
      data: {
        activityId: 100123,
        goods: { goodsId: '7001', originalPrice: 500, deductionPrice: 80, payPrice: 420 },
        teamList: [
          { userId: 'oUser123456', teamId: 't1', activityId: 100123, targetCount: 3, completeCount: 1, lockCount: 1, validEndTime: end },
          { userId: 'someoneelse', teamId: 't2', activityId: 100123, targetCount: 3, completeCount: 2, lockCount: 3, validEndTime: 1893456000000 },
        ],
        teamStatistic: { allTeamCount: 5, allTeamCompleteCount: 2, allTeamUserCount: 11 },
      },
    }))
    const api = createLiveApi(config, async () => {})
    const market = await api.getMarket('JJ-01', user)
    expect(fetch.mock.calls[0][0]).toBe('https://gbm.example.com/api/v1/gbm/index/query_group_buy_market_config')
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      userId: 'oUser123456',
      source: 's01',
      channel: 'c01',
      goodsId: '7001',
    })
    expect(market).toMatchObject({ activityId: 100123, originalPrice: 500, payPrice: 420 })
    expect(market.teams[0]).toMatchObject({ isMine: true, validEndTime: new Date('2030-01-01T10:00:00').getTime() })
    expect(market.teams[1].ownerLabel).toBe('so****se')
    expect(market.stats).toEqual({ teamCount: 5, completeCount: 2, userCount: 11 })
  })

  it('连续查询会节流，避免触发后端限流拉黑', async () => {
    mockFetch(() => ({ code: '0000', data: { activityId: 1, goods: { goodsId: '7001', originalPrice: 1, deductionPrice: 0, payPrice: 1 } } }))
    const delays: number[] = []
    const api = createLiveApi(config, async (ms) => {
      delays.push(ms)
    })
    await api.getMarket('JJ-01', user)
    await api.getMarket('JJ-01', user)
    expect(delays.length).toBe(1)
    expect(delays[0]).toBeGreaterThan(1000)
  })

  it('未登录不查询', async () => {
    const api = createLiveApi(config, async () => {})
    await expect(api.getMarket('JJ-01', null)).rejects.toMatchObject({ kind: 'unauthorized' })
  })
})

describe('首页正在拼团', () => {
  it('把后端 SKU 映射回前端商品，丢弃前端没有资料的商品', async () => {
    const fetch = mockFetch(() => ({
      code: '0000',
      data: [
        { teamId: '11112222', productId: '7001', activityId: 1, targetCount: 3, lockCount: 2, completeCount: 2, validEndTime: 1893456000000, ownerLabel: 'sa****27' },
        { teamId: '33334444', productId: '9890001', activityId: 2, targetCount: 3, lockCount: 1, completeCount: 1, validEndTime: 1893456000000, ownerLabel: 'ka****11' },
      ],
    }))
    const api = createLiveApi(config, async () => {})
    const teams = await api.listActiveTeams(4)
    expect(fetch.mock.calls[0][0]).toBe('https://mall.example.com/api/v1/mall/active_teams?limit=4')
    expect(teams).toEqual([
      { teamId: '11112222', productId: 'JJ-01', activityId: 1, targetCount: 3, lockCount: 2, completeCount: 2, validEndTime: 1893456000000, ownerLabel: 'sa****27', isMine: false },
    ])
  })
})

describe('订单', () => {
  it('分页透传 lastId，并映射商品与状态', async () => {
    const fetch = mockFetch((_url, body) =>
      body.lastId === null
        ? {
            code: '0000',
            data: {
              orderList: [{ orderId: 'A2', productId: '7001', productName: '后端名', status: 'PAY_SUCCESS', orderTime: '2025-09-01 12:00:00', payAmount: 420 }],
              hasMore: true,
              lastId: 18,
            },
          }
        : { code: '0000', data: { orderList: [{ orderId: 'A1', productName: '其他', status: 'WEIRD', totalAmount: 9 }], hasMore: false, lastId: 17 } },
    )
    const api = createLiveApi(config, async () => {})
    const first = await api.listOrders(user, null, 10)
    expect(first).toMatchObject({ hasMore: true, lastId: '18' })
    expect(first.orders[0]).toMatchObject({ productId: 'JJ-01', productName: 'POP UP PARADE 五条悟', status: 'PAY_SUCCESS', payAmount: 420 })
    const second = await api.listOrders(user, first.lastId, 10)
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({ userId: 'oUser123456', lastId: '18', pageSize: 10 })
    expect(second).toMatchObject({ hasMore: false })
    expect(second.orders[0]).toMatchObject({ productId: undefined, status: 'CREATE', payAmount: 9 })
  })

  it('退单成功进入退款处理中，失败给出原因', async () => {
    mockFetch(() => ({ code: '0000', data: { success: true } }))
    const api = createLiveApi(config, async () => {})
    await expect(api.refund(user, 'A2')).resolves.toBe('WAIT_REFUND')
    mockFetch(() => ({ code: '0000', data: { success: false, message: '订单已发货' } }))
    await expect(api.refund(user, 'A2')).rejects.toMatchObject({ kind: 'business', message: '订单已发货' })
  })

  it('商城接口携带登录令牌；没有令牌时不发请求', async () => {
    const fetch = mockFetch(() => ({ code: '0000', data: { orderList: [], hasMore: false, lastId: null } }))
    const api = createLiveApi(config, async () => {})
    await api.listOrders(user, null, 10)
    expect((fetch.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer signed.token')
    await expect(api.listOrders({ userId: 'x', displayName: 'x' }, null, 10)).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('扫码登录返回令牌与 openid', async () => {
    mockFetch(() => ({ code: '0000', data: { token: 't.sig', userId: 'oOpen', displayName: '微信用户 oOp***pen' } }))
    const api = createLiveApi(config, async () => {})
    await expect(api.wechatCheckLogin('tk', 'SCENE')).resolves.toEqual({ token: 't.sig', userId: 'oOpen', displayName: '微信用户 oOp***pen' })
    mockFetch(() => ({ code: '0001', info: '未登录' }))
    await expect(api.wechatCheckLogin('tk', 'SCENE')).resolves.toBeNull()
  })

  it('登录失效向上抛出', async () => {
    mockFetch(() => new Response('', { status: 401 }))
    const api = createLiveApi(config, async () => {})
    await expect(api.listOrders(user, null, 10)).rejects.toMatchObject({ kind: 'unauthorized' })
  })
})

describe('订单里的拼团队伍', () => {
  const now = 1_000_000
  const raw = { teamId: '12345678', status: 0, targetCount: 3, lockCount: 2, completeCount: 1, validEndTime: now + 60_000 }

  it('按队伍状态和到期时间归类', () => {
    expect(mapOrderTeam(raw, now).state).toBe('open')
    expect(mapOrderTeam({ ...raw, validEndTime: now - 1 }, now).state).toBe('failed')
    expect(mapOrderTeam({ ...raw, status: 1 }, now).state).toBe('done')
    expect(mapOrderTeam({ ...raw, status: 3 }, now).state).toBe('done')
    expect(mapOrderTeam({ ...raw, status: 2 }, now).state).toBe('failed')
  })

  it('订单列表带出队伍进度与成员', async () => {
    mockFetch(() => ({
      code: '0000',
      data: {
        orderList: [
          {
            orderId: '100000000001',
            productId: '7001',
            status: 'PAY_SUCCESS',
            orderTime: now,
            payAmount: 139,
            marketType: 1,
            team: { ...raw, validEndTime: Date.now() + 60_000, members: [{ label: 'sa**27', paid: true, isMe: false, isLeader: true }] },
          },
          { orderId: '100000000002', productId: '7001', status: 'DEAL_DONE', orderTime: now, payAmount: 169, marketType: 0, team: null },
        ],
        hasMore: false,
        lastId: '1',
      },
    }))
    const api = createLiveApi(config, async () => {})
    const [group, single] = (await api.listOrders(user, null, 10)).orders
    expect(group.team).toMatchObject({ teamId: '12345678', state: 'open', members: [{ label: 'sa**27', isLeader: true }] })
    expect(group.teamProgress).toEqual({ target: 3, complete: 1 })
    expect(single.team).toBeUndefined()
    expect(single.purchaseType).toBe('single')
  })
})

describe('支付表单适配器', () => {
  const form = `<form name="punchout_form" method="post" action="https://openapi.alipay.com/gateway.do?charset=utf-8&amp;method=alipay.trade.page.pay">
    <input type="hidden" name="biz_content" value="{&quot;out_trade_no&quot;:&quot;123&quot;}">
    <input type="submit" value="立即支付" style="display:none">
  </form><script>window.__hacked = true; document.forms[0].submit();</script>`

  it('只提取表单字段，不执行脚本', () => {
    const parsed = parsePayForm(form, ['https://openapi.alipay.com'])
    expect(parsed.method).toBe('POST')
    expect(parsed.action).toContain('https://openapi.alipay.com/gateway.do')
    expect(parsed.fields).toContainEqual(['biz_content', '{"out_trade_no":"123"}'])
    expect((window as any).__hacked).toBeUndefined()
  })

  it('拒绝不在允许列表中的地址', () => {
    expect(() => parsePayForm(form, ['https://pay.example.com'])).toThrow(/允许列表/)
    expect(() => parsePayForm(form.replace('https://openapi.alipay.com', 'javascript:alert(1)//'), ['https://openapi.alipay.com'])).toThrow()
    expect(() => parsePayForm('<p>no form</p>', ['https://openapi.alipay.com'])).toThrow()
  })

  it('下单返回订单号；复用的旧订单按订单号确认付款结果', async () => {
    mockFetch(() => ({ code: '0000', data: { form, orderId: '116229990525' } }))
    const api = createLiveApi(config, async () => {})
    const res = await api.checkout(user, { productId: 'JJ-01', type: 'single' })
    expect(res).toMatchObject({ kind: 'redirect', orderId: '116229990525' })
    // 订单创建时间早于本次下单（复用），按时间找不到，按订单号能找到
    mockFetch(() => ({
      code: '0000',
      data: { orderList: [{ orderId: '116229990525', productId: '7001', status: 'PAY_SUCCESS', orderTime: Date.now() - 13 * 60_000, payAmount: 99 }], hasMore: false, lastId: 1 },
    }))
    expect(await api.findRecentOrder(user, 'JJ-01', Date.now())).toBeNull()
    expect(await api.findRecentOrder(user, 'JJ-01', Date.now(), '116229990525')).toMatchObject({ status: 'PAY_SUCCESS' })
  })

  it('下单时解析支付表单', async () => {
    const fetch = mockFetch(() => ({ code: '0000', data: form }))
    const api = createLiveApi(config, async () => {})
    const result = await api.checkout(user, { productId: 'JJ-01', type: 'join', activityId: 100123, teamId: 't2' })
    expect(result.kind).toBe('redirect')
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      userId: 'oUser123456',
      productId: '7001',
      teamId: 't2',
      activityId: 100123,
      marketType: 1,
    })
  })
})
