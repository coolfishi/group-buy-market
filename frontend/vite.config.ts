/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发代理目标只在本地 .env.*.local 中配置，不写入仓库
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy: Record<string, object> = {}
  if (env.GBM_PROXY_TARGET) {
    proxy['/api/v1/gbm'] = { target: env.GBM_PROXY_TARGET, changeOrigin: true }
  }
  if (env.MALL_PROXY_TARGET) {
    for (const path of ['/api/v1/alipay', '/api/v1/login']) {
      proxy[path] = { target: env.MALL_PROXY_TARGET, changeOrigin: true }
    }
  }

  return {
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
    },
  }
})
