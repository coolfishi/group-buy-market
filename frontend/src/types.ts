export type CategoryId = 'vinyl' | 'anime' | 'mecha'

export interface ProductImage {
  src: string
  alt: string
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
  weight: string
  edition: string
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
  | { kind: 'redirect'; form: PayForm; startedAt: number }

export interface User {
  userId: string
  displayName: string
}
