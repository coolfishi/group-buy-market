import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// 管理台部署在 /admin/ 路径下；本地开发时 /api 代理到商城服务
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/admin/',
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5180,
      proxy: env.MALL_PROXY_TARGET ? { '/api/admin': { target: env.MALL_PROXY_TARGET, changeOrigin: true } } : undefined,
    },
  }
})
