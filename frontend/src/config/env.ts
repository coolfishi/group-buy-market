export type AppMode = 'demo' | 'live'

export interface AppConfig {
  mode: AppMode
  gbmApiBase: string | null
  mallApiBase: string | null
  source: string
  channel: string
  /** 前端商品 ID -> 后端 SKU */
  liveSkuMap: Record<string, string>
  payAllowedOrigins: string[]
  timeoutMs: number
}

type EnvLike = Partial<Record<keyof ImportMetaEnv, string>>

function normalizeBase(raw: string | undefined): string | null {
  if (raw === undefined || raw.trim() === '') return null
  // "/" 表示同源代理，归一化为空前缀
  return raw.trim().replace(/\/+$/, '')
}

function parseSkuMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
        .map(([k, v]) => [k, v.trim()]),
    )
  } catch {
    return {}
  }
}

export function readConfig(env: EnvLike = import.meta.env): AppConfig {
  return {
    mode: env.VITE_APP_MODE === 'live' ? 'live' : 'demo',
    gbmApiBase: normalizeBase(env.VITE_GBM_API_BASE),
    mallApiBase: normalizeBase(env.VITE_MALL_API_BASE),
    source: env.VITE_SOURCE?.trim() || 's01',
    channel: env.VITE_CHANNEL?.trim() || 'c01',
    liveSkuMap: parseSkuMap(env.VITE_LIVE_SKU_MAP),
    payAllowedOrigins: (env.VITE_PAY_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    timeoutMs: Number(env.VITE_REQUEST_TIMEOUT_MS) > 0 ? Number(env.VITE_REQUEST_TIMEOUT_MS) : 10000,
  }
}

/** 真实模式缺失的配置项，用于页面提示 */
export function liveConfigIssues(config: AppConfig): string[] {
  if (config.mode !== 'live') return []
  const issues: string[] = []
  if (config.gbmApiBase === null) issues.push('拼团服务地址（VITE_GBM_API_BASE）')
  if (config.mallApiBase === null) issues.push('支付商城地址（VITE_MALL_API_BASE）')
  if (Object.keys(config.liveSkuMap).length === 0) issues.push('潮玩商品 SKU 映射（VITE_LIVE_SKU_MAP）')
  if (config.payAllowedOrigins.length === 0) issues.push('允许的支付地址（VITE_PAY_ALLOWED_ORIGINS）')
  return issues
}

export const appConfig = readConfig()
