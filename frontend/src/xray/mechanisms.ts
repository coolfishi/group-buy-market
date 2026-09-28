/**
 * 透视模式的机制目录：每个接口 / 服务端事件在后端经过哪些处理。
 * 类名与仓库中的 Java 代码一致（group-buy-market-domain / trigger），
 * “商城服务”指本仓库 mall/ 下的 Node 服务。
 */

export type Stage = 'trial' | 'lock' | 'pay' | 'settle' | 'notify' | 'refund'

export const stages: { id: Stage; label: string }[] = [
  { id: 'trial', label: '试算' },
  { id: 'lock', label: '锁单' },
  { id: 'pay', label: '支付' },
  { id: 'settle', label: '结算' },
  { id: 'notify', label: '成团回调' },
  { id: 'refund', label: '退单退款' },
]

export interface MechanismStep {
  name: string
  what: string
  /** 代码位置：Java 类名或商城服务文件 */
  where?: string
}

export interface Mechanism {
  title: string
  service: '拼团服务' | '商城服务' | '商城服务 → 拼团服务' | '本地模拟'
  summary: string
  stage?: Stage
  steps: MechanismStep[]
}

export const mechanisms: Record<string, Mechanism> = {
  query_group_buy_market_config: {
    title: '拼团价试算',
    service: '拼团服务',
    stage: 'trial',
    summary: '先限流，再用规则树一个节点一个节点地决定：这个用户能不能看到拼团、能拿到什么价格。',
    steps: [
      { name: '接口限流', what: '按用户每秒 1 次，超出直接走降级方法，多次超限进黑名单', where: '@RateLimiterAccessInterceptor（MarketIndexController）' },
      { name: 'RootNode', what: '规则树根节点，校验用户、商品、渠道参数', where: 'trial/node/RootNode' },
      { name: 'SwitchNode', what: '读取 DCC 动态配置：全局降级开关、按用户 ID 切量', where: 'trial/node/SwitchNode' },
      { name: 'MarketNode', what: '多线程并发查询活动配置和商品信息，再按折扣类型选计算策略（直减 ZJ、满减 MJ、折扣 ZK、N 元购）', where: 'trial/node/MarketNode + discount/impl/*CalculateService' },
      { name: 'TagNode', what: '人群标签：活动限定人群时，判断用户是否可见、可参与', where: 'trial/node/TagNode' },
      { name: 'EndNode', what: '组装原价、优惠金额、拼团价和正在进行的队伍返回；无活动时走 ErrorNode', where: 'trial/node/EndNode' },
    ],
  },

  active_teams: {
    title: '正在拼团列表',
    service: '商城服务',
    summary: '跨商品列出进行中、未满员的队伍，响应带 15 秒公共缓存；另有后台任务保证首页始终有可参加的队伍。',
    steps: [
      { name: '查询队伍', what: '拼团库中状态为进行中、未过截止时间、锁单数小于目标人数的队伍', where: 'mall/src/demoTeams.ts listOpen' },
      { name: '演示队伍补足', what: '每 20 秒检查一次，可参团队伍不足时补开，队伍名额计数同步写入 Redis', where: 'mall/src/demoTeams.ts ensure' },
    ],
  },

  weixin_qrcode_ticket_scene: {
    title: '微信扫码登录：生成二维码',
    service: '商城服务',
    summary: '用公众号接口生成带场景值的临时二维码。',
    steps: [
      { name: '换取 access_token', what: '调用微信接口并缓存，过期前复用', where: 'mall/src/wechat.ts' },
      { name: '生成带参二维码', what: '场景值由前端随机生成，扫码事件会带回这个场景值', where: 'mall/src/wechat.ts createTicket' },
    ],
  },

  check_login_scene: {
    title: '微信扫码登录：轮询结果',
    service: '商城服务',
    summary: '用户扫码关注后，微信把事件推给商城服务，商城把场景值绑定到 openid，前端轮询拿到签名令牌。',
    steps: [
      { name: '微信事件推送', what: '校验微信签名，解析 XML，把场景值绑定到 openid', where: 'mall/src/app.ts /api/v1/weixin/portal/receive' },
      { name: '签发令牌', what: 'HMAC 签名的用户令牌，7 天有效；后续下单、查单都凭令牌识别用户，不信任请求里的 userId', where: 'mall/src/tokens.ts' },
    ],
  },

  demo_login: {
    title: '体验账号登录',
    service: '本地模拟',
    summary: '演示站用体验账号代替微信扫码登录，真实站走微信扫码 + 签名令牌。',
    steps: [{ name: '本地登录', what: '在浏览器里生成体验用户，不经过后端' }],
  },

  create_pay_order: {
    title: '下单：拼团锁单 + 生成支付单',
    service: '商城服务 → 拼团服务',
    stage: 'lock',
    summary: '商城先让拼团服务锁定名额，锁单成功才去支付宝下单；锁单走一条责任链，组队名额用 Redis 原子计数防超卖。',
    steps: [
      { name: '防重复下单', what: '同一用户同一商品的请求串行处理；15 分钟内未付款的订单直接复用，不重复锁单', where: 'mall/src/orders.ts createPayOrder' },
      { name: '幂等检查', what: '按外部交易单号查询，已锁过单直接返回原结果', where: 'MarketTradeController.lockMarketPayOrder' },
      { name: '满员检查 + 重新试算', what: '参团时先看队伍是否已满（E0006），再走一遍试算规则树拿到最终价格和人群限定', where: 'MarketTradeController' },
      { name: 'ActivityUsabilityRuleFilter', what: '责任链第 1 环：活动状态有效、在活动时间内', where: 'trade/service/lock/filter' },
      { name: 'UserTakeLimitRuleFilter', what: '责任链第 2 环：用户在该活动的参与次数没超上限', where: 'trade/service/lock/filter' },
      { name: 'TeamStockOccupyRuleFilter', what: '责任链第 3 环：Redis incr 抢占组队名额，超过目标人数即失败；退单时通过 recovery key 回补', where: 'trade/service/lock/filter' },
      { name: '写入锁单记录', what: '开团时新建队伍（有效期为活动配置的分钟数），同一事务写用户订单', where: 'TradeRepository.lockMarketPayOrder' },
      { name: '支付宝下单', what: '生成电脑网站支付单，付款时限不超过订单剩余时间；失败则回滚锁单', where: 'mall/src/pay/alipay.ts' },
    ],
  },

  repay_order: {
    title: '继续付款',
    service: '商城服务',
    stage: 'pay',
    summary: '为本人未超时的待支付订单重新生成支付单；生成前先向支付宝确认是否其实已经付过。',
    steps: [
      { name: '归属与状态校验', what: '只能是本人的待支付订单，拼团已结束或超过付款时限直接拒绝', where: 'mall/src/orders.ts repayOrder' },
      { name: '查询支付宝', what: '已付款但通知未到时，直接按已付款处理，避免重复付款', where: 'mall/src/orders.ts' },
      { name: '重新生成支付单', what: '同一订单号、新的签名，时限按剩余时间计算', where: 'mall/src/pay/alipay.ts' },
    ],
  },

  demo_cashier: {
    title: '模拟收银台付款',
    service: '本地模拟',
    stage: 'pay',
    summary: '演示站用模拟收银台代替支付宝；真实站此时由支付宝异步通知商城，下面的“付款到账”事件描述真实链路。',
    steps: [{ name: '本地付款', what: '在浏览器里把订单标为已付款，并更新本地拼团进度' }],
  },

  pay_success: {
    title: '付款到账 → 拼团结算',
    service: '商城服务 → 拼团服务',
    stage: 'settle',
    summary: '支付宝异步通知（或商城每 20 秒主动查单兜底）确认到账后，商城调用拼团结算；结算也是一条责任链。',
    steps: [
      { name: '确认到账', what: '验签支付宝异步通知；通知丢失时由定时同步任务主动查单补上', where: 'mall/src/orders.ts markPaid / sync' },
      { name: 'SCRuleFilter', what: '结算责任链第 1 环：来源渠道黑名单拦截（DCC 配置）', where: 'trade/service/settlement/filter' },
      { name: 'OutTradeNoRuleFilter', what: '第 2 环：按外部交易单号查到锁单记录', where: 'trade/service/settlement/filter' },
      { name: 'SettableRuleFilter', what: '第 3 环：付款时间必须早于队伍截止时间，否则拒绝结算、商城自动原路退款', where: 'trade/service/settlement/filter' },
      { name: 'EndRuleFilter', what: '第 4 环：组装结算数据；完成人数 +1，满员时写入成团回调任务', where: 'trade/service/settlement/filter' },
    ],
  },

  team_success: {
    title: '成团回调',
    service: '拼团服务',
    stage: 'notify',
    summary: '最后一人结算后，拼团服务通过 HTTP（或 MQ）通知商城“这个队伍成团了”，商城把队伍里的订单改为拼团成功。',
    steps: [
      { name: '写回调任务', what: '成团与回调任务在同一事务里落库，保证不丢', where: 'TradeRepository.settlementMarketPayOrder' },
      { name: '立即回调', what: '结算后马上执行一次 HTTP 回调；配置为 MQ 时由 TeamSuccessTopicListener 消费', where: 'TradeSettlementOrderService / TradeTaskService' },
      { name: '失败重试', what: '回调失败的任务由定时任务在分布式锁保护下补偿重试', where: 'trigger/job/GroupBuyNotifyJob' },
      { name: '商城处理回调', what: '只接受内网回调，返回 success；把队伍内已付款订单改为拼团成功（幂等）', where: 'mall/src/orders.ts onTeamComplete' },
    ],
  },

  query_user_order_list: {
    title: '我的订单',
    service: '商城服务',
    summary: '按游标分页查询本人订单，附带拼团队伍进度；最近的待付款订单会顺便向支付宝查一次结果。',
    steps: [
      { name: '令牌识别用户', what: '只返回令牌对应用户的订单', where: 'mall/src/app.ts requireUser' },
      { name: '主动查单', what: '最近 3 笔待付款订单向支付宝确认，到账则立即走结算', where: 'mall/src/orders.ts refreshRecent' },
      { name: '队伍进度', what: '从拼团库查询队伍状态和成员，成员名脱敏', where: 'mall/src/store.ts teamsByIds' },
    ],
  },

  refund_order: {
    title: '取消 / 退单',
    service: '商城服务 → 拼团服务',
    stage: 'refund',
    summary: '拼团服务用责任链做数据准备和幂等检查，再按订单所处状态选择三种退单策略之一。',
    steps: [
      { name: 'DataNodeFilter', what: '查询外部交易单、队伍 ID 和拼团状态写入上下文', where: 'trade/service/refund/filter' },
      { name: 'UniqueRefundNodeFilter', what: '已退过的单直接返回成功（幂等）', where: 'trade/service/refund/filter' },
      { name: 'RefundOrderNodeFilter', what: '按状态选策略：未付款 Unpaid2RefundStrategy、已付款未成团 Paid2RefundStrategy、已成团 PaidTeam2RefundStrategy', where: 'trade/service/refund/business/impl' },
      { name: '恢复名额', what: '退单成功发 MQ，RefundSuccessTopicListener 通过 Redis 回补组队名额', where: 'trigger/listener/RefundSuccessTopicListener' },
      { name: '支付宝退款', what: '已付款订单原路退款，失败保持“退款处理中”由定时任务重试', where: 'mall/src/orders.ts refundMoney' },
    ],
  },

  auto_refund: {
    title: '到期未成团 → 自动退款',
    service: '商城服务 → 拼团服务',
    stage: 'refund',
    summary: '商城定时任务发现队伍过了截止时间还没凑齐，自动为已付款成员退单并原路退款。',
    steps: [
      { name: '发现到期队伍', what: '每 20 秒扫描已付款、等待成团的订单，队伍过截止时间 1 分钟后处理', where: 'mall/src/orders.ts refundExpiredTeams' },
      { name: '拼团退单', what: '调用拼团退单接口，走退单责任链和 Paid2RefundStrategy', where: 'trade/service/refund' },
      { name: '支付宝退款', what: '原路退回，订单关闭为“拼团到期未成团，已自动退款”', where: 'mall/src/orders.ts refundMoney' },
    ],
  },
}

/** 演示模式下 ShopApi 方法对应的真实接口 */
export const demoEndpointOf: Record<string, string> = {
  getMarket: 'query_group_buy_market_config',
  listActiveTeams: 'active_teams',
  demoLogin: 'demo_login',
  checkout: 'create_pay_order',
  repay: 'repay_order',
  settleDemoPayment: 'demo_cashier',
  listOrders: 'query_user_order_list',
  findRecentOrder: 'query_user_order_list',
  refund: 'refund_order',
}

/** 从请求地址取出机制目录的键，例如 /api/v1/alipay/create_pay_order → create_pay_order */
export function endpointOf(url: string): string {
  const path = url.split('?')[0].replace(/\/+$/, '')
  return path.slice(path.lastIndexOf('/') + 1) || path
}

export function mechanismOf(endpoint: string): Mechanism | undefined {
  return mechanisms[endpoint]
}
