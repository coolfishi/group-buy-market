import { Redis } from 'ioredis'
import { createAdminService } from './admin/adminService.js'
import { buildApp } from './app.js'
import { alipayConfigured, assertStartable, loadConfig, wechatConfigured } from './config.js'
import { createPool, openMallDb } from './db.js'
import { createGbmClient } from './gbm.js'
import { createOrderService } from './orders.js'
import { createAlipayProvider } from './pay/alipay.js'
import { createMockProvider } from './pay/mock.js'
import { createMysqlStore } from './store.js'
import { createWechatService } from './wechat.js'

const config = loadConfig()
assertStartable(config)

const mallDb = await openMallDb(config.mallDb)
const gbmDb = createPool(config.gbmDb)
const redis = new Redis({ host: config.redis.host, port: config.redis.port, lazyConnect: false, maxRetriesPerRequest: 3 })
const gbm = createGbmClient({ baseUrl: config.gbmBaseUrl, source: config.source, channel: config.channel })

const pay =
  config.pay.provider === 'mock'
    ? createMockProvider(`${config.publicBaseUrl}/mock-pay`)
    : alipayConfigured(config)
      ? createAlipayProvider(config.pay.alipay)
      : createMockProvider('https://unconfigured.invalid') // 未配置时下单接口会直接拒绝，不会走到这里

const wechat = wechatConfigured(config) ? createWechatService(config.wechat, mallDb) : null

// 日志在 app 创建后才可用，这里延迟转发
let logger: { info(o: unknown, m?: string): void; error(o: unknown, m?: string): void } | null = null
const orders = createOrderService({
  store: createMysqlStore(mallDb, gbmDb),
  gbm,
  pay,
  publicBaseUrl: config.publicBaseUrl,
  internalBaseUrl: config.internalBaseUrl,
  payNotifyUrl: config.payNotifyUrl,
  payTimeoutMinutes: config.payTimeoutMinutes,
  log: { info: (o, m) => logger?.info(o, m), error: (o, m) => logger?.error(o, m) },
})

const app = buildApp({
  config,
  pay,
  wechat,
  orders,
  admin: createAdminService({
    gbmDb,
    mallDb,
    redis,
    gbm,
    internalBaseUrl: config.internalBaseUrl,
    source: config.source,
    channel: config.channel,
  }),
})

// 测试环境：模拟支付宝到账
if (config.pay.provider === 'mock' && 'markPaid' in pay) {
  app.post('/api/v1/alipay/mock_paid', async (req) => {
    const { orderId } = (req.body ?? {}) as { orderId?: string }
    ;(pay as ReturnType<typeof createMockProvider>).markPaid(String(orderId))
    return { code: '0000' }
  })
}

logger = app.log

// 定时同步：补单、超时关单、结算与退款重试
let syncing = false
const timer = setInterval(async () => {
  if (syncing) return
  syncing = true
  try {
    await orders.sync()
    await wechat?.cleanup()
  } catch (e) {
    app.log.error({ err: e }, '定时同步失败')
  } finally {
    syncing = false
  }
}, 20_000)

async function shutdown() {
  clearInterval(timer)
  await app.close()
  await Promise.allSettled([mallDb.end(), gbmDb.end(), redis.quit()])
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

app.log.info(
  { payProvider: config.pay.provider, alipay: alipayConfigured(config), wechat: wechatConfigured(config) },
  '商城服务配置',
)
await app.listen({ host: '0.0.0.0', port: config.port })
