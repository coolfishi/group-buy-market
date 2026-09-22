import type { AppConfig } from '@/config/env'
import { findProduct, products } from '@/data/products'
import type { ActiveTeam, MarketInfo, Order, OrderPage, OrderStatus, OrderTeam, Team, User } from '@/types'
import { maskUserId } from '../demo/demoApi'
import { ApiError, request } from '../http'
import type { ShopApi } from '../types'
import { parsePayForm } from './payForm'

interface GoodsMarketResponse {
  activityId: number
  goods: { goodsId: string; originalPrice: number; deductionPrice: number; payPrice: number }
  teamList?: {
    userId: string
    teamId: string
    activityId: number
    targetCount: number
    completeCount: number
    lockCount: number
    validStartTime?: string | number
    validEndTime?: string | number
  }[]
  teamStatistic?: { allTeamCount?: number; allTeamCompleteCount?: number; allTeamUserCount?: number }
}

interface OrderListResponse {
  orderList?: {
    orderId: string
    productId?: string
    productName?: string
    status: string
    orderTime?: string | number
    payAmount?: number
    totalAmount?: number
    marketType?: number
    team?: RawOrderTeam | null
  }[]
  hasMore?: boolean
  lastId?: string | number | null
}

interface RawOrderTeam {
  teamId: string
  /** 0 拼团中、1 已成团、2 失败、3 成团含退单 */
  status: number
  targetCount: number
  lockCount: number
  completeCount: number
  validEndTime: number
  members?: { label: string; paid: boolean; isMe: boolean; isLeader: boolean }[]
}

export function mapOrderTeam(raw: RawOrderTeam, now = Date.now()): OrderTeam {
  const validEndTime = Number(raw.validEndTime)
  const state =
    raw.status === 1 || raw.status === 3 ? 'done' : raw.status === 2 || validEndTime <= now ? 'failed' : 'open'
  return {
    teamId: String(raw.teamId),
    state,
    targetCount: Number(raw.targetCount),
    lockCount: Number(raw.lockCount),
    completeCount: Number(raw.completeCount),
    validEndTime,
    members: raw.members ?? [],
  }
}

interface RefundResponse {
  success?: boolean
  message?: string
}

const knownStatus: OrderStatus[] = ['CREATE', 'PAY_WAIT', 'PAY_SUCCESS', 'DEAL_DONE', 'WAIT_REFUND', 'CLOSE']

/** 后端时间可能是时间戳或 "yyyy-MM-dd HH:mm:ss" 字符串 */
export function parseTime(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'number') return value
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') : value
  const t = new Date(normalized).getTime()
  return Number.isNaN(t) ? 0 : t
}

// 拼团配置接口按用户限流 1 次/秒，超限会被拉黑，因此前端串行并节流
const MARKET_MIN_INTERVAL_MS = 1200

export function createLiveApi(config: AppConfig, fetchDelay = (ms: number) => new Promise((r) => setTimeout(r, ms))): ShopApi {
  let lastMarketCall = 0
  let marketQueue: Promise<unknown> = Promise.resolve()
  const reverseSku = new Map(Object.entries(config.liveSkuMap).map(([local, sku]) => [sku, local]))

  function gbmUrl(path: string) {
    if (config.gbmApiBase === null) throw new ApiError('config', '未配置拼团服务地址，无法进行真实交易。')
    return `${config.gbmApiBase}${path}`
  }
  function mallUrl(path: string) {
    if (config.mallApiBase === null) throw new ApiError('config', '未配置支付商城地址，无法进行真实交易。')
    return `${config.mallApiBase}${path}`
  }
  function skuOf(productId: string): string {
    const sku = config.liveSkuMap[productId]
    if (!sku || !findProduct(productId)) {
      throw new ApiError('not_purchasable', '这件商品还没有配置真实 SKU，暂不能购买。')
    }
    return sku
  }

  /** 商城接口用令牌识别用户，请求体里的 userId 只作兼容 */
  function auth(user: User): Record<string, string> {
    if (!user.token) throw new ApiError('unauthorized', '登录已失效，请重新登录。')
    return { Authorization: `Bearer ${user.token}` }
  }

  function mapOrder(raw: NonNullable<OrderListResponse['orderList']>[number]): Order {
    const localId = raw.productId ? reverseSku.get(String(raw.productId)) : undefined
    const product = localId ? findProduct(localId) : products.find((p) => p.name === raw.productName)
    const team = raw.team ? mapOrderTeam(raw.team) : undefined
    return {
      orderId: String(raw.orderId),
      productId: product?.id,
      productName: product?.name ?? raw.productName ?? '商品',
      payAmount: Number(raw.payAmount ?? raw.totalAmount ?? 0),
      orderTime: parseTime(raw.orderTime),
      status: (knownStatus.includes(raw.status as OrderStatus) ? raw.status : 'CREATE') as OrderStatus,
      purchaseType: raw.marketType === 0 ? 'single' : raw.marketType === 1 ? 'open' : undefined,
      team,
      teamProgress: team ? { target: team.targetCount, complete: team.completeCount } : undefined,
    }
  }

  async function listOrders(user: User, lastId: string | null, pageSize: number): Promise<OrderPage> {
    const data = await request<OrderListResponse>(mallUrl('/api/v1/alipay/query_user_order_list'), {
      body: { userId: user.userId, lastId, pageSize },
      headers: auth(user),
      timeoutMs: config.timeoutMs,
    })
    const orders = (data?.orderList ?? []).map(mapOrder)
    return {
      orders,
      hasMore: !!data?.hasMore,
      lastId: data?.lastId === undefined || data?.lastId === null ? null : String(data.lastId),
    }
  }

  return {
    mode: 'live',

    purchasability(productId) {
      if (config.gbmApiBase === null || config.mallApiBase === null) {
        return { ok: false, reason: '真实模式缺少服务地址配置，暂不能购买。' }
      }
      if (config.payAllowedOrigins.length === 0) {
        return { ok: false, reason: '真实模式没有配置允许的支付地址，暂不能购买。' }
      }
      if (!config.liveSkuMap[productId]) {
        return { ok: false, reason: '这件商品还没有对接真实 SKU，暂不能购买。' }
      }
      return { ok: true }
    },

    async getMarket(productId, user): Promise<MarketInfo> {
      const goodsId = skuOf(productId)
      if (!user) throw new ApiError('unauthorized', '登录后查看拼团价和队伍。')
      const run = async () => {
        const gap = Date.now() - lastMarketCall
        if (gap < MARKET_MIN_INTERVAL_MS) await fetchDelay(MARKET_MIN_INTERVAL_MS - gap)
        lastMarketCall = Date.now()
        return request<GoodsMarketResponse>(gbmUrl('/api/v1/gbm/index/query_group_buy_market_config'), {
          body: { userId: user.userId, source: config.source, channel: config.channel, goodsId },
          timeoutMs: config.timeoutMs,
        })
      }
      const next = marketQueue.then(run, run)
      marketQueue = next.catch(() => undefined)
      const data = await next
      const teams: Team[] = (data.teamList ?? []).map((t) => ({
        teamId: t.teamId,
        activityId: t.activityId,
        ownerLabel: maskUserId(t.userId ?? ''),
        targetCount: t.targetCount,
        lockCount: t.lockCount,
        completeCount: t.completeCount,
        validEndTime: parseTime(t.validEndTime),
        isMine: t.userId === user.userId,
      }))
      return {
        productId,
        activityId: data.activityId,
        originalPrice: Number(data.goods.originalPrice),
        deductionPrice: Number(data.goods.deductionPrice),
        payPrice: Number(data.goods.payPrice),
        teams,
        stats: {
          teamCount: data.teamStatistic?.allTeamCount ?? 0,
          completeCount: data.teamStatistic?.allTeamCompleteCount ?? 0,
          userCount: data.teamStatistic?.allTeamUserCount ?? 0,
        },
      }
    },

    async listActiveTeams(limit) {
      const data = await request<
        { teamId: string; productId: string; activityId: number; targetCount: number; lockCount: number; completeCount: number; validEndTime: number; ownerLabel: string }[]
      >(mallUrl('/api/v1/mall/active_teams'), { method: 'GET', query: { limit: String(limit) }, timeoutMs: config.timeoutMs })
      // 只展示前端有商品资料的队伍；后端 SKU 映射回前端商品 ID
      return (data ?? [])
        .map((t): ActiveTeam | null => {
          const productId = reverseSku.get(String(t.productId))
          if (!productId || !findProduct(productId)) return null
          return { ...t, productId, validEndTime: Number(t.validEndTime), isMine: false }
        })
        .filter((t): t is ActiveTeam => t !== null)
    },

    async demoLogin() {
      throw new ApiError('config', '真实模式请使用微信扫码登录。')
    },

    async wechatQrTicket(sceneStr) {
      return request<string>(mallUrl('/api/v1/login/weixin_qrcode_ticket_scene'), {
        method: 'GET',
        query: { sceneStr },
        timeoutMs: config.timeoutMs,
      })
    },

    async wechatCheckLogin(ticket, sceneStr) {
      try {
        const data = await request<string | { token: string; userId: string; displayName?: string }>(
          mallUrl('/api/v1/login/check_login_scene'),
          { method: 'GET', query: { ticket, sceneStr }, timeoutMs: config.timeoutMs },
        )
        if (!data) return null
        // 商城服务返回签名令牌与 openid；兼容只返回 openid 字符串的旧接口
        if (typeof data === 'string') return { userId: data, displayName: `微信用户 ${maskUserId(data)}`, token: data }
        return { userId: data.userId, displayName: data.displayName ?? `微信用户 ${maskUserId(data.userId)}`, token: data.token }
      } catch (e) {
        // 未扫码时后端返回非成功码，视为等待
        if (e instanceof ApiError && e.kind === 'business') return null
        throw e
      }
    },

    async checkout(user, req) {
      const productId = skuOf(req.productId)
      if (req.type !== 'single' && !req.activityId) {
        throw new ApiError('business', '拼团活动信息缺失，请刷新页面后重试。', 'NO_ACTIVITY')
      }
      const data = await request<string | { form: string; orderId: string }>(mallUrl('/api/v1/alipay/create_pay_order'), {
        body:
          req.type === 'single'
            ? { userId: user.userId, productId, marketType: 0 }
            : {
                userId: user.userId,
                productId,
                teamId: req.type === 'join' ? req.teamId : null,
                activityId: req.activityId,
                marketType: 1,
              },
        headers: auth(user),
        timeoutMs: config.timeoutMs,
      })
      // 新接口返回 { form, orderId }；兼容只返回表单 HTML 的旧支付商城
      const html = typeof data === 'string' ? data : data?.form
      const orderId = typeof data === 'string' ? undefined : data?.orderId
      return { kind: 'redirect', form: parsePayForm(html, config.payAllowedOrigins), startedAt: Date.now(), orderId }
    },

    async settleDemoPayment() {
      throw new ApiError('config', '真实模式的付款结果以订单查询为准。')
    },

    async findRecentOrder(user, productId, since, orderId) {
      const page = await listOrders(user, null, 10)
      // 有订单号时精确匹配：复用的未付款订单创建时间可能早于本次下单
      if (orderId) return page.orders.find((o) => o.orderId === orderId) ?? null
      // 允许少量客户端与服务端时钟偏差
      return page.orders.find((o) => o.productId === productId && o.orderTime >= since - 60_000) ?? null
    },

    listOrders,

    async refund(user, orderId) {
      const data = await request<RefundResponse>(mallUrl('/api/v1/alipay/refund_order'), {
        body: { userId: user.userId, orderId },
        headers: auth(user),
        timeoutMs: config.timeoutMs,
      })
      if (!data?.success) {
        throw new ApiError('business', data?.message || '退单没有成功，请稍后重试。', 'REFUND_FAILED')
      }
      // 退款由支付商城异步处理，最终状态以订单列表为准
      return 'WAIT_REFUND'
    },
  }
}
