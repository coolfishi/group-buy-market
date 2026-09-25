<script setup lang="ts">
import { useRouter } from 'vue-router'
import { appConfig, liveConfigIssues } from '@/config/env'
import { resetDemoData } from '@/services'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import { setXray, xrayEnabled } from '@/xray/trace'

const session = useSessionStore()
const toast = useToastStore()
const router = useRouter()
const isDemo = appConfig.mode === 'demo'
const issues = liveConfigIssues(appConfig)

function logout() {
  session.logout()
  toast.show('已退出登录')
  router.push('/')
}

function resetDemo() {
  resetDemoData()
  session.logout()
  toast.show('演示数据已重置', 'success')
  router.push('/').then(() => window.location.reload())
}
</script>

<template>
  <div class="masthead">
    <div v-if="isDemo" class="mode demo" role="note">
      <div class="container mode-inner">
        <p><strong>演示模式</strong>：商品、拼团和订单都是本机模拟数据，不会真实扣款。</p>
        <button type="button" class="mode-btn" @click="resetDemo">重置演示数据</button>
      </div>
    </div>
    <div v-else-if="issues.length" class="mode warn" role="alert">
      <div class="container mode-inner">
        <p><strong>真实模式配置不完整</strong>：缺少{{ issues.join('、') }}，相关商品暂不能购买。</p>
      </div>
    </div>
    <header class="bar">
      <div class="container bar-inner">
        <RouterLink to="/" class="brand" aria-label="玩集 TOYSPACE 首页">
          <span class="brand-cn">玩集</span>
          <span class="brand-en">TOYSPACE</span>
        </RouterLink>
        <nav aria-label="主导航">
          <button
            type="button"
            class="nav-link xray-toggle"
            :aria-pressed="xrayEnabled"
            title="透视模式：边操作边看后端处理链"
            @click="setXray(!xrayEnabled)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" fill="currentColor" />
              <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
            透视
          </button>
          <RouterLink to="/" class="nav-link" exact-active-class="current">首页</RouterLink>
          <RouterLink to="/orders" class="nav-link" active-class="current">我的订单</RouterLink>
          <button v-if="session.isLoggedIn" type="button" class="nav-link as-btn" @click="logout">退出</button>
          <RouterLink v-else to="/login" class="nav-link login" active-class="current">登录</RouterLink>
        </nav>
      </div>
    </header>
  </div>
</template>

<style scoped>
.masthead {
  position: sticky;
  top: 0;
  z-index: 50;
}

.mode {
  font-size: var(--t-xs);
  line-height: 1.4;
}

.mode.demo {
  background: var(--violet);
  color: #fff;
}

.mode.warn {
  background: var(--warn-bg);
  color: var(--warn);
}

.mode-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  padding-block: 6px;
}

.mode-btn {
  flex: none;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  padding: 3px 12px;
  font-size: var(--t-xs);
  cursor: pointer;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.16);
}

.bar {
  background: var(--ink);
  color: #fff;
}

.bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-h);
  gap: 16px;
}

.brand {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  text-decoration: none;
  line-height: 1;
}

.brand-cn {
  font-family: var(--font-display);
  font-size: 1.75rem;
}

.brand-en {
  font-family: var(--font-num);
  font-size: 1rem;
  letter-spacing: 0.04em;
  color: var(--sticker);
}

nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.78);
  text-decoration: none;
  font-size: var(--t-sm);
  font-weight: 500;
}

.nav-link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.nav-link.current {
  color: #fff;
  font-weight: 700;
  box-shadow: inset 0 -3px 0 var(--sticker);
  border-radius: 0;
}

.as-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.xray-toggle {
  gap: 5px;
  margin-right: 6px;
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  background: transparent;
  cursor: pointer;
}

.xray-toggle[aria-pressed='true'] {
  border-color: var(--sticker);
  background: var(--sticker);
  color: var(--ink);
  font-weight: 900;
}

.login {
  margin-left: 6px;
  background: var(--sticker);
  color: var(--ink);
  font-weight: 900;
  padding: 0 18px;
}

.login:hover,
.login.current {
  background: #fff;
  color: var(--ink);
  box-shadow: none;
  border-radius: 10px;
}

@media (max-width: 480px) {
  .brand-en {
    display: none;
  }
  .nav-link {
    padding: 0 10px;
  }
}
</style>
