import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAlipayProvider, urlToGetForm } from '../src/pay/alipay.js'

describe('支付宝支付表单', () => {
  it('网址转成 GET 表单：参数进隐藏字段，特殊字符转义', () => {
    const form = urlToGetForm('https://gw.example.com/gateway.do?method=a.b&timestamp=2026-09-22+01%3A00%3A00&biz_content=%7B%22s%22%3A%22%E4%BA%91%3C%22%7D')
    expect(form).toContain('method="get" action="https://gw.example.com/gateway.do"')
    expect(form).toContain('name="timestamp" value="2026-09-22 01:00:00"')
    expect(form).toContain('name="biz_content" value="{&quot;s&quot;:&quot;云&lt;&quot;}"')
    expect(form).not.toContain('?')
  })

  it('下单返回 GET 表单，包含签名与业务参数（不再用会带 Origin 的 POST）', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pay = createAlipayProvider({
      appId: '2021000000000000',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      alipayPublicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
      keyType: 'PKCS8',
    })
    const form = await pay.pagePay({
      orderId: '123456789012',
      amount: 99,
      subject: '云朵小芽',
      notifyUrl: 'http://shop.example.com/api/v1/alipay/alipay_notify_url',
      returnUrl: 'http://shop.example.com/orders',
      timeoutMinutes: 30,
    })
    expect(form).toMatch(/method="get" action="https:\/\/openapi-sandbox\.dl\.alipaydev\.com\/gateway\.do"/)
    for (const name of ['app_id', 'method', 'sign', 'sign_type', 'timestamp', 'notify_url', 'return_url', 'biz_content']) {
      expect(form).toContain(`name="${name}"`)
    }
    expect(form).toContain('&quot;out_trade_no&quot;:&quot;123456789012&quot;')
    expect(form).toContain('&quot;total_amount&quot;:&quot;99.00&quot;')
  })
})
