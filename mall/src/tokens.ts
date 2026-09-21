import { createHmac, timingSafeEqual } from 'node:crypto'

/** 简单的签名令牌：base64url(payload).base64url(hmac) */
export interface TokenPayload {
  sub: string
  role: 'user' | 'admin'
  exp: number
}

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString('base64url')

export function signToken(secret: string, payload: TokenPayload): string {
  const body = b64(JSON.stringify(payload))
  const sig = b64(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

export function verifyToken(secret: string, token: string | undefined, role: TokenPayload['role'], now = Date.now()): TokenPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
    if (payload.role !== role || typeof payload.sub !== 'string' || payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

export function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m?.[1]
}

/** 常量时间比较字符串，用于管理员密码 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', 'cmp').update(a).digest()
  const hb = createHmac('sha256', 'cmp').update(b).digest()
  return timingSafeEqual(ha, hb)
}
