import { AlipaySdk } from 'alipay-sdk'
import type { MallConfig } from '../config.js'
import { PayError, type PayProvider } from './types.js'

const PAID = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED'])

function parseTime(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v.replace(' ', 'T') + '+08:00')
  return Number.isNaN(d.getTime()) ? undefined : d
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
      return sdk.pageExecute('alipay.trade.page.pay', 'POST', {
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
