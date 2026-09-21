export type CategoryId = 'naruto' | 'jjk'

export interface ProductImage {
  src: string
  alt: string
  /** 图集缩略图下的短标签，例如“正面” */
  label: string
}

export interface Product {
  /** 前端商品 ID（独立于后端 SKU） */
  id: string
  name: string
  category: CategoryId
  tagline: string
  description: string[]
  size: string
  material: string
  scale: string
  /** 厂商 */
  maker: string
  /** 产品线，例如 POP UP PARADE、粘土人 */
  line: string
  /** 厂商官方定价（日元），仅作资料展示 */
  officialPriceJpy: number
  /** 商品资料与图片来源 */
  sourceUrl: string
  images: ProductImage[]
  /** 仅演示模式使用的价格；真实模式价格以接口为准 */
  demoPrice: { original: number; group: number }
  /** 演示模式成团人数 */
  demoTarget: number
}

export interface Team {
  teamId: string
  activityId: number
  ownerLabel: string
  targetCount: number
  lockCount: number
  completeCount: number
  /** 结束时间（毫秒时间戳） */
  validEndTime: number
  isMine: boolean
}

export interface MarketInfo {
  productId: string
  activityId: number
  originalPrice: number
  deductionPrice: number
  payPrice: number
  teams: Team[]
  stats: { teamCount: number; completeCount: number; userCount: number }
}

export interface ActiveTeam extends Team {
  productId: string
}

export type PurchaseType = 'single' | 'open' | 'join'

export interface PurchaseRequest {
  productId: string
  type: PurchaseType
  activityId?: number
  teamId?: string
}

export type OrderStatus = 'CREATE' | 'PAY_WAIT' | 'PAY_SUCCESS' | 'DEAL_DONE' | 'WAIT_REFUND' | 'CLOSE'

export interface Order {
  orderId: string
  productId?: string
  productName: string
  payAmount: number
  orderTime: number
  status: OrderStatus
  purchaseType?: PurchaseType
  teamProgress?: { target: number; complete: number }
  closeReason?: string
}

export interface OrderPage {
  orders: Order[]
  hasMore: boolean
  lastId: string | null
}

export interface PayForm {
  action: string
  method: 'GET' | 'POST'
  fields: [string, string][]
}

export type CheckoutResult =
  | { kind: 'demo'; order: Order }
  | { kind: 'redirect'; form: PayForm; startedAt: number; /** 商城返回的订单号（复用未付款订单时是旧单号） */ orderId?: string }

export interface User {
  userId: string
  displayName: string
  /** 真实模式：商城服务签发的登录令牌 */
  token?: string
}
