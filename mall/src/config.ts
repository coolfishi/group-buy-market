/** 商城服务配置，全部来自环境变量；密钥类配置只在服务器 .env 中填写 */
export interface MallConfig {
  port: number
  sessionSecret: string
  /** 对外访问地址，用于支付回调与跳转，例如 http://40.160.139.154:8898 */
  publicBaseUrl: string
  /** 支付宝异步通知地址；不填时用 PUBLIC_BASE_URL 拼接。建议用 80/443 端口 */
  payNotifyUrl: string
  /** 拼团服务内部地址，例如 http://app:8091 */
  gbmBaseUrl: string
  /** 商城服务在内部网络的地址，拼团服务回调用，例如 http://mall:3100 */
  internalBaseUrl: string
  source: string
  channel: string
  mallDb: DbConfig
  gbmDb: DbConfig
  redis: { host: string; port: number }
  admin: { username: string; password: string }
  pay: {
    provider: 'alipay' | 'mock'
    alipay: {
      appId: string
      privateKey: string
      alipayPublicKey: string
      gateway: string
      keyType: 'PKCS1' | 'PKCS8' | ''
    }
  }
  wechat: { appId: string; appSecret: string; token: string }
  /** 仅用于自动化测试：允许用 openid 直接登录 */
  devLogin: boolean
  /** 未支付订单超时关闭（分钟） */
  payTimeoutMinutes: number
  /** 进行中的可参团队伍少于这个数时自动补充演示拼团；0 表示关闭 */
  demoTeamsMin: number
}

export interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim()
}

/** PEM 内容允许写成一行，\n 转成换行 */
function pem(value: string): string {
  return value.replace(/\\n/g, '\n')
}

export function loadConfig(): MallConfig {
  const dbHost = env('DB_HOST', '127.0.0.1')
  const dbPort = Number(env('DB_PORT', '3306'))
  const dbUser = env('DB_USER', 'root')
  const dbPassword = env('DB_PASSWORD')
  const provider = env('PAY_PROVIDER', 'alipay') === 'mock' ? 'mock' : 'alipay'
  return {
    port: Number(env('PORT', '3100')),
    sessionSecret: env('SESSION_SECRET'),
    publicBaseUrl: env('PUBLIC_BASE_URL').replace(/\/+$/, ''),
    payNotifyUrl: env('ALIPAY_NOTIFY_URL'),
    gbmBaseUrl: env('GBM_BASE_URL', 'http://127.0.0.1:8091').replace(/\/+$/, ''),
    internalBaseUrl: env('INTERNAL_BASE_URL', 'http://127.0.0.1:3100').replace(/\/+$/, ''),
    source: env('GBM_SOURCE', 's01'),
    channel: env('GBM_CHANNEL', 'c01'),
    mallDb: { host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: env('MALL_DB_NAME', 'toyspace_mall') },
    gbmDb: { host: dbHost, port: dbPort, user: dbUser, password: dbPassword, database: env('GBM_DB_NAME', 'group_buy_market') },
    redis: { host: env('REDIS_HOST', '127.0.0.1'), port: Number(env('REDIS_PORT', '6379')) },
    admin: { username: env('ADMIN_USERNAME', 'admin'), password: env('ADMIN_PASSWORD') },
    pay: {
      provider,
      alipay: {
        appId: env('ALIPAY_APP_ID'),
        privateKey: pem(env('ALIPAY_PRIVATE_KEY')),
        alipayPublicKey: pem(env('ALIPAY_PUBLIC_KEY')),
        gateway: env('ALIPAY_GATEWAY', 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'),
        keyType: (['PKCS1', 'PKCS8'].includes(env('ALIPAY_KEY_TYPE')) ? env('ALIPAY_KEY_TYPE') : '') as 'PKCS1' | 'PKCS8' | '',
      },
    },
    wechat: { appId: env('WECHAT_APP_ID'), appSecret: env('WECHAT_APP_SECRET'), token: env('WECHAT_TOKEN') },
    devLogin: env('DEV_LOGIN') === 'true',
    payTimeoutMinutes: Number(env('PAY_TIMEOUT_MINUTES', '30')),
    demoTeamsMin: Math.max(0, Math.min(20, Number(env('DEMO_TEAMS_MIN', '0')) || 0)),
  }
}

export function alipayConfigured(c: MallConfig): boolean {
  const a = c.pay.alipay
  return c.pay.provider === 'mock' || (!!a.appId && !!a.privateKey && !!a.alipayPublicKey)
}

export function wechatConfigured(c: MallConfig): boolean {
  return !!c.wechat.appId && !!c.wechat.appSecret && !!c.wechat.token
}

/** 启动前检查：缺少必需项直接退出，避免带着空密钥运行 */
export function assertStartable(c: MallConfig) {
  const missing: string[] = []
  if (c.sessionSecret.length < 32) missing.push('SESSION_SECRET（至少 32 位）')
  if (!c.publicBaseUrl) missing.push('PUBLIC_BASE_URL')
  if (!c.mallDb.password) missing.push('DB_PASSWORD')
  if (c.admin.password.length < 12) missing.push('ADMIN_PASSWORD（至少 12 位）')
  if (missing.length) throw new Error(`缺少配置：${missing.join('、')}`)
}
