import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { checkMarketExpr } from '../src/admin/validate.js'
import { signToken, verifyToken } from '../src/tokens.js'
import { checkSignature, parseMessage, textReply } from '../src/wechat.js'

const secret = 'x'.repeat(40)

describe('令牌', () => {
  it('签名校验、角色区分、过期', () => {
    const t = signToken(secret, { sub: 'oUser', role: 'user', exp: Date.now() + 1000 })
    expect(verifyToken(secret, t, 'user')?.sub).toBe('oUser')
    expect(verifyToken(secret, t, 'admin')).toBeNull()
    expect(verifyToken('y'.repeat(40), t, 'user')).toBeNull()
    expect(verifyToken(secret, t, 'user', Date.now() + 5000)).toBeNull()
    const [body] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'other', role: 'user', exp: Date.now() + 1000 })).toString('base64url')
    expect(verifyToken(secret, t.replace(body, forged), 'user')).toBeNull()
    expect(verifyToken(secret, 'garbage', 'user')).toBeNull()
  })
})

describe('微信回调', () => {
  it('校验签名', () => {
    const q = { timestamp: '1700000000', nonce: 'abc' }
    const signature = createHash('sha1').update(['tok', q.timestamp, q.nonce].sort().join('')).digest('hex')
    expect(checkSignature('tok', { ...q, signature })).toBe(true)
    expect(checkSignature('tok', { ...q, signature: 'bad' })).toBe(false)
    expect(checkSignature('tok', {})).toBe(false)
  })

  it('解析关注与扫码事件的场景值', () => {
    const subscribe = `<xml><ToUserName><![CDATA[gh_1]]></ToUserName><FromUserName><![CDATA[oOpen1]]></FromUserName><CreateTime>1</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event><EventKey><![CDATA[qrscene_ABC123]]></EventKey></xml>`
    expect(parseMessage(subscribe)).toMatchObject({ openid: 'oOpen1', officialId: 'gh_1', event: 'subscribe', sceneStr: 'ABC123' })
    const scan = subscribe.replace('subscribe', 'SCAN').replace('qrscene_ABC123', 'XYZ789')
    expect(parseMessage(scan)).toMatchObject({ event: 'scan', sceneStr: 'XYZ789' })
    expect(parseMessage('<xml><MsgType>text</MsgType></xml>')).toBeNull()
    expect(parseMessage('not xml <<<')).toBeNull()
  })

  it('被动回复转义 CDATA 结束符', () => {
    expect(textReply('a', 'b', 'x]]>y')).toContain('x]]]]><![CDATA[>y')
  })
})

describe('优惠表达式', () => {
  it('各方式的合法与非法写法', () => {
    expect(checkMarketExpr('ZJ', '20')).toBe('20')
    expect(checkMarketExpr('MJ', '100, 10')).toBe('100,10')
    expect(checkMarketExpr('ZK', '0.8')).toBe('0.8')
    expect(checkMarketExpr('N', '9.9')).toBe('9.9')
    expect(() => checkMarketExpr('ZJ', '-1')).toThrow()
    expect(() => checkMarketExpr('MJ', '10,100')).toThrow(/减免小于门槛/)
    expect(() => checkMarketExpr('ZK', '1.2')).toThrow()
    expect(() => checkMarketExpr('XX', '1')).toThrow()
  })
})
