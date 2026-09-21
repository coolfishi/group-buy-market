import type {
  ActiveTeam,
  CheckoutResult,
  MarketInfo,
  Order,
  OrderPage,
  PurchaseRequest,
  User,
} from '@/types'

export type Purchasability = { ok: true } | { ok: false; reason: string }

/** 演示与真实模式共用的商城服务接口 */
export interface ShopApi {
  readonly mode: 'demo' | 'live'

  // 商品
  purchasability(productId: string): Purchasability
  getMarket(productId: string, user: User | null): Promise<MarketInfo>
  /** 首页“正在拼团”；真实模式没有跨商品查询接口，返回 null */
  listActiveTeams(limit: number): Promise<ActiveTeam[] | null>

  // 登录
  demoLogin(): Promise<User>
  wechatQrTicket(sceneStr: string): Promise<string>
  /** 未扫码返回 null，登录成功返回用户 */
  wechatCheckLogin(ticket: string, sceneStr: string): Promise<User | null>

  // 交易
  checkout(user: User, req: PurchaseRequest): Promise<CheckoutResult>
  /** 仅演示模式：模拟收银台确认或取消 */
  settleDemoPayment(user: User, orderId: string, action: 'confirm' | 'cancel'): Promise<Order>
  /** 付款结果以订单查询为准：有订单号时按订单号查找，否则查找 since 之后创建的该商品订单 */
  findRecentOrder(user: User, productId: string, since: number, orderId?: string): Promise<Order | null>

  // 订单
  listOrders(user: User, lastId: string | null, pageSize: number): Promise<OrderPage>
  refund(user: User, orderId: string): Promise<Order['status']>
}
