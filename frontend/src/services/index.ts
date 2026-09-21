import { appConfig } from '@/config/env'
import { createDemoApi } from './demo/demoApi'
import { createLiveApi } from './live/liveApi'
import type { ShopApi } from './types'

const demo = appConfig.mode === 'demo' ? createDemoApi({ storage: window.localStorage }) : null

export const api: ShopApi = demo ?? createLiveApi(appConfig)

/** 仅演示模式可用：清空本地演示数据 */
export function resetDemoData() {
  demo?.reset()
}

export { ApiError, errorMessage, isApiError } from './http'
