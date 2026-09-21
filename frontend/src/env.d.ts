/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string
  readonly VITE_GBM_API_BASE?: string
  readonly VITE_MALL_API_BASE?: string
  readonly VITE_SOURCE?: string
  readonly VITE_CHANNEL?: string
  readonly VITE_LIVE_SKU_MAP?: string
  readonly VITE_PAY_ALLOWED_ORIGINS?: string
  readonly VITE_REQUEST_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
