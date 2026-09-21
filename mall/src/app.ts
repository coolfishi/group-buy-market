import formbody from '@fastify/formbody'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import type { AdminService } from './admin/adminService.js'
import { alipayConfigured, wechatConfigured, type MallConfig } from './config.js'
import { MallError, type OrderService } from './orders.js'
import type { PayProvider } from './pay/types.js'
import { bearer, safeEqual, signToken, verifyToken } from './tokens.js'
import { checkSignature, parseMessage, textReply } from './wechat.js'

export interface WechatLike {
  createTicket(sceneStr: string): Promise<string>
  bindScene(sceneStr: string, openid: string): Promise<boolean>
  checkScene(sceneStr: string): Promise<string | null>
}

export interface AppDeps {
  config: MallConfig
  orders: OrderService
  pay: PayProvider
  admin: AdminService
  wechat: WechatLike | null
}

const USER_TOKEN_TTL = 7 * 24 * 3600_000
const ADMIN_TOKEN_TTL = 12 * 3600_000

const ok = <T>(data?: T, info = '成功') => ({ code: '0000', info, data })

function maskOpenid(id: string) {
  return id.length <= 6 ? id : `${id.slice(0, 3)}***${id.slice(-3)}`
}

export function buildApp(deps: AppDeps) {
  const { config, orders, admin } = deps
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization'] },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  })
  app.register(formbody)
  app.addContentTypeParser(['text/xml', 'application/xml'], { parseAs: 'string' }, (_req, body, done) => done(null, body))

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof MallError) return reply.status(err.httpStatus).send({ code: err.code, info: err.message })
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ code: '0002', info: '请求格式不正确。' })
    req.log.error({ err }, '未处理的异常')
    return reply.status(500).send({ code: '0001', info: '服务暂时不可用，请稍后重试。' })
  })

  function requireUser(req: FastifyRequest): string {
    const p = verifyToken(config.sessionSecret, bearer(req.headers.authorization), 'user')
    if (!p) throw new MallError('UNAUTHORIZED', '登录已失效，请重新登录。', 401)
    return p.sub
  }

  function issueUser(openid: string) {
    const token = signToken(config.sessionSecret, { sub: openid, role: 'user', exp: Date.now() + USER_TOKEN_TTL })
    return { token, userId: openid, displayName: `微信用户 ${maskOpenid(openid)}` }
  }

  app.get('/healthz', async () => ({ ok: true }))

  // ---------------- 登录 ----------------
  app.get('/api/v1/login/weixin_qrcode_ticket_scene', async (req) => {
    const { sceneStr } = req.query as { sceneStr?: string }
    if (!sceneStr || !/^[A-Za-z0-9]{16,64}$/.test(sceneStr)) throw new MallError('0002', '场景值不正确。', 400)
    if (!deps.wechat) throw new MallError('WECHAT_UNCONFIGURED', '微信登录还没有配置，请联系管理员。')
    return ok(await deps.wechat.createTicket(sceneStr))
  })

  app.get('/api/v1/login/check_login_scene', async (req) => {
    const { sceneStr } = req.query as { sceneStr?: string }
    if (!sceneStr || !deps.wechat) return { code: '0001', info: '未登录' }
    const openid = await deps.wechat.checkScene(sceneStr)
    return openid ? ok(issueUser(openid)) : { code: '0001', info: '未登录' }
  })

  if (config.devLogin) {
    // 仅自动化测试环境开启
    app.get('/api/v1/login/dev_login', async (req) => {
      const { openid } = req.query as { openid?: string }
      if (!openid || !/^[A-Za-z0-9_-]{4,32}$/.test(openid)) throw new MallError('0002', 'openid 不正确。', 400)
      return ok(issueUser(openid))
    })
  }

  // 微信服务器回调：GET 校验，POST 推送事件
  app.get('/api/v1/weixin/portal/receive', async (req, reply) => {
    const q = req.query as Record<string, string>
    if (!config.wechat.token || !checkSignature(config.wechat.token, q)) return reply.status(403).send('invalid')
    return reply.type('text/plain').send(q.echostr ?? '')
  })

  app.post('/api/v1/weixin/portal/receive', async (req, reply) => {
    const q = req.query as Record<string, string>
    if (!config.wechat.token || !checkSignature(config.wechat.token, q)) return reply.status(403).send('invalid')
    const msg = parseMessage(typeof req.body === 'string' ? req.body : '')
    if (!msg || !deps.wechat) return reply.type('text/plain').send('success')
    if (msg.sceneStr && (msg.event === 'subscribe' || msg.event === 'scan')) {
      const bound = await deps.wechat.bindScene(msg.sceneStr, msg.openid)
      const text = bound ? '登录成功，回到网页就可以继续逛了。' : '二维码已过期，请在网页上刷新后重新扫码。'
      return reply.type('application/xml').send(textReply(msg.openid, msg.officialId, text))
    }
    return reply.type('text/plain').send('success')
  })

  // ---------------- 交易 ----------------
  app.post('/api/v1/alipay/create_pay_order', async (req) => {
    const userId = requireUser(req)
    if (!alipayConfigured(config)) throw new MallError('PAY_UNCONFIGURED', '支付还没有配置，暂时不能下单。')
    const b = (req.body ?? {}) as Record<string, unknown>
    const productId = String(b.productId ?? '')
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(productId)) throw new MallError('0002', '商品不正确。', 400)
    const marketType = Number(b.marketType) === 1 ? 1 : 0
    const teamId = b.teamId ? String(b.teamId) : null
    if (teamId && !/^\d{1,8}$/.test(teamId)) throw new MallError('0002', '拼团队伍不正确。', 400)
    // 返回订单号，前端据此确认付款结果（复用未付款订单时订单号不变）
    const { form, orderId } = await orders.createPayOrder(userId, {
      productId,
      marketType,
      activityId: b.activityId === undefined || b.activityId === null ? null : Number(b.activityId),
      teamId,
    })
    return ok({ form, orderId })
  })

  app.post('/api/v1/alipay/query_user_order_list', async (req) => {
    const userId = requireUser(req)
    const b = (req.body ?? {}) as { lastId?: string | number | null; pageSize?: number }
    return ok(await orders.listOrders(userId, b.lastId === null || b.lastId === undefined ? null : String(b.lastId), Number(b.pageSize)))
  })

  app.post('/api/v1/alipay/refund_order', async (req) => {
    const userId = requireUser(req)
    const { orderId } = (req.body ?? {}) as { orderId?: string }
    if (!orderId || !/^\d{12}$/.test(String(orderId))) throw new MallError('0002', '订单号不正确。', 400)
    return ok(await orders.refund(userId, String(orderId)))
  })

  // 支付宝异步通知
  app.post('/api/v1/alipay/alipay_notify_url', async (req, reply: FastifyReply) => {
    const params = Object.fromEntries(Object.entries((req.body ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
    const n = deps.pay.verifyNotify(params)
    if (!n.valid || !n.orderId) {
      req.log.warn({ orderId: params.out_trade_no }, '支付宝通知验签失败')
      return reply.type('text/plain').send('fail')
    }
    if (n.status === 'PAID') await orders.markPaid(n.orderId, n.tradeNo, n.paidAt)
    return reply.type('text/plain').send('success')
  })

  // 拼团服务成团回调（仅内部网络可达，Nginx 不对外转发）
  app.post('/api/v1/alipay/group_buy_notify', async (req, reply) => {
    const b = (req.body ?? {}) as { teamId?: string; outTradeNoList?: string[] }
    if (!b.teamId || !Array.isArray(b.outTradeNoList)) return reply.type('text/plain').send('error')
    await orders.onTeamComplete(String(b.teamId), b.outTradeNoList.map(String))
    return reply.type('text/plain').send('success')
  })

  // ---------------- 管理后台 ----------------
  const loginFailures = new Map<string, { count: number; until: number }>()

  app.post('/api/admin/login', async (req) => {
    const ip = req.ip
    const f = loginFailures.get(ip)
    if (f && f.count >= 5 && f.until > Date.now()) throw new MallError('LOCKED', '登录失败次数过多，请 10 分钟后再试。', 429)
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    const good = safeEqual(String(username ?? ''), config.admin.username) && safeEqual(String(password ?? ''), config.admin.password)
    if (!good) {
      const next = { count: (f && f.until > Date.now() ? f.count : 0) + 1, until: Date.now() + 10 * 60_000 }
      loginFailures.set(ip, next)
      throw new MallError('BAD_CREDENTIALS', '用户名或密码不正确。', 401)
    }
    loginFailures.delete(ip)
    return ok({
      token: signToken(config.sessionSecret, { sub: config.admin.username, role: 'admin', exp: Date.now() + ADMIN_TOKEN_TTL }),
      username: config.admin.username,
    })
  })

  app.register(async (scope) => {
    scope.addHook('onRequest', async (req) => {
      if (!verifyToken(config.sessionSecret, bearer(req.headers.authorization), 'admin')) {
        throw new MallError('UNAUTHORIZED', '登录已失效，请重新登录。', 401)
      }
    })

    type P = { Params: Record<string, string>; Querystring: Record<string, string>; Body: Record<string, unknown> }

    scope.get('/overview', async () =>
      ok({ ...(await admin.overview()), integrations: { alipay: alipayConfigured(config), wechat: wechatConfigured(config), payProvider: config.pay.provider } }),
    )

    scope.get('/skus', async () => ok(await admin.listSkus()))
    scope.post<P>('/skus', async (req) => ok(await admin.saveSku(req.body ?? {})))
    scope.put<P>('/skus/:goodsId', async (req) => ok(await admin.saveSku(req.body ?? {}, req.params.goodsId)))
    scope.delete<P>('/skus/:goodsId', async (req) => ok(await admin.deleteSku(req.params.goodsId)))

    scope.get('/discounts', async () => ok(await admin.listDiscounts()))
    scope.post<P>('/discounts', async (req) => ok(await admin.saveDiscount(req.body ?? {})))
    scope.put<P>('/discounts/:id', async (req) => ok(await admin.saveDiscount(req.body ?? {}, req.params.id)))
    scope.delete<P>('/discounts/:id', async (req) => ok(await admin.deleteDiscount(req.params.id)))

    scope.get('/activities', async () => ok(await admin.listActivities()))
    scope.post<P>('/activities', async (req) => ok(await admin.saveActivity(req.body ?? {})))
    scope.put<P>('/activities/:id', async (req) => ok(await admin.saveActivity(req.body ?? {}, Number(req.params.id))))
    scope.delete<P>('/activities/:id', async (req) => ok(await admin.deleteActivity(Number(req.params.id))))

    scope.get<P>('/teams', async (req) => ok(await admin.listTeams(req.query)))
    scope.get<P>('/teams/:teamId/members', async (req) => ok(await admin.teamMembers(req.params.teamId)))
    scope.get<P>('/orders', async (req) => ok(await admin.listOrders(req.query)))

    scope.get('/dcc', async () => ok(await admin.dcc()))
    scope.put<P>('/dcc/:key', async (req) => ok(await admin.updateDcc(req.params.key, String(req.body?.value ?? ''))))

    scope.get<P>('/notify-tasks', async (req) => ok(await admin.listNotifyTasks(req.query)))
    scope.post<P>('/notify-tasks/:id/retry', async (req) => ok(await admin.retryNotifyTask(Number(req.params.id))))
  }, { prefix: '/api/admin' })

  return app
}
