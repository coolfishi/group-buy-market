export interface PagePayRequest {
  orderId: string
  amount: number
  subject: string
  notifyUrl: string
  returnUrl: string
  timeoutMinutes: number
}

export interface TradeStatus {
  /** WAIT_BUYER_PAY / TRADE_SUCCESS / TRADE_FINISHED / TRADE_CLOSED / NOT_FOUND */
  status: string
  tradeNo?: string
  paidAt?: Date
}

export interface NotifyResult {
  valid: boolean
  orderId?: string
  status?: string
  tradeNo?: string
  paidAt?: Date
  amount?: number
}

/** 支付渠道：生产用支付宝，自动化测试用 mock */
export interface PayProvider {
  readonly name: 'alipay' | 'mock'
  /** 返回自动提交的支付表单 HTML */
  pagePay(req: PagePayRequest): Promise<string>
  query(orderId: string): Promise<TradeStatus>
  refund(orderId: string, amount: number, reason: string): Promise<void>
  close(orderId: string): Promise<void>
  verifyNotify(params: Record<string, string>): NotifyResult
}

export class PayError extends Error {}
