import { AlipaySdk } from 'alipay-sdk'
import type { MallConfig } from '../config.js'
import { PayError, type PayProvider } from './types.js'

const PAID = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED'])

function parseTime(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v.replace(' ', 'T') + '+08:00')
  return Number.isNaN(d.getTime()) ? undefined : d
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * 把带签名的支付网址转成 GET 表单：action 只保留网关地址，参数全部放进隐藏字段。
 * 浏览器提交 GET 表单时会用这些字段重新拼出查询串，签名参数保持不变。
 */
export function urlToGetForm(url: string): string {
  const u = new URL(url)
  const inputs = [...u.searchParams]
    .map(([k, v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}">`)
    .join('\n')
  return `<form name="punchout_form" method="get" action="${escapeAttr(u.origin + u.pathname)}">\n${inputs}\n</form>`
}

/** 支付宝电脑网站支付（沙箱或正式环境由 ALIPAY_GATEWAY 决定） */
export function createAlipayProvider(config: MallConfig['pay']['alipay']): PayProvider {
  const sdk = new AlipaySdk({
    appId: config.appId,
    privateKey: config.privateKey,
    alipayPublicKey: config.alipayPublicKey,
    gateway: config.gateway,
    signType: 'RSA2',
    // 未指定时按 PEM 头判断；支付宝密钥工具生成的无头私钥默认是 PKCS8
    keyType: config.keyType || (config.privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS1' : 'PKCS8'),
    timeout: 10_000,
  })

  return {
    name: 'alipay',

    async pagePay(req) {
      // 用 GET 跳转而不是 POST 表单：浏览器跨站 POST 会带 Origin 头，
      // 支付宝网关对带商城 Origin 的请求返回 404；GET 页面跳转不带 Origin
      const url = sdk.pageExecute('alipay.trade.page.pay', 'GET', {
        bizContent: {
          out_trade_no: req.orderId,
          total_amount: req.amount.toFixed(2),
          subject: req.subject,
          product_code: 'FAST_INSTANT_TRADE_PAY',
          timeout_express: `${req.timeoutMinutes}m`,
        },
        notifyUrl: req.notifyUrl,
        returnUrl: req.returnUrl,
      })
      return urlToGetForm(url)
    },

    async query(orderId) {
      const res = await sdk.exec('alipay.trade.query', { bizContent: { out_trade_no: orderId } })
      if (res.code === '40004' && res.subCode === 'ACQ.TRADE_NOT_EXIST') return { status: 'NOT_FOUND' }
      if (res.code !== '10000') throw new PayError(`支付宝查询失败：${res.subMsg ?? res.msg}`)
      return {
        status: String(res.tradeStatus),
        tradeNo: res.tradeNo as string | undefined,
        paidAt: parseTime(res.sendPayDate),
      }
    },

    async refund(orderId, amount, reason) {
      const res = await sdk.exec('alipay.trade.refund', {
        bizContent: {
          out_trade_no: orderId,
          refund_amount: amount.toFixed(2),
          refund_reason: reason,
          out_request_no: `${orderId}R`,
        },
      })
      if (res.code !== '10000') throw new PayError(`支付宝退款失败：${res.subMsg ?? res.msg}`)
    },

    async close(orderId) {
      const res = await sdk.exec('alipay.trade.close', { bizContent: { out_trade_no: orderId } })
      // 用户没扫码时交易在支付宝侧不存在，视为已关闭
      if (res.code !== '10000' && res.subCode !== 'ACQ.TRADE_NOT_EXIST') {
        throw new PayError(`支付宝关单失败：${res.subMsg ?? res.msg}`)
      }
    },

    verifyNotify(params) {
      let valid = false
      try {
        valid = sdk.checkNotifySign(params)
      } catch {
        valid = false
      }
      if (!valid || params.app_id !== config.appId) return { valid: false }
      return {
        valid: true,
        orderId: params.out_trade_no,
        status: PAID.has(params.trade_status) ? 'PAID' : params.trade_status,
        tradeNo: params.trade_no,
        paidAt: parseTime(params.gmt_payment),
        amount: Number(params.total_amount),
      }
    },
  }
}
