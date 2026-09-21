<script setup lang="ts">
import { useRouter } from 'vue-router'
import { appConfig, liveConfigIssues } from '@/config/env'
import { resetDemoData } from '@/services'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'

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
  background: rgba(250, 247, 242, 0.92);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
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
}

.brand-cn {
  font-weight: 900;
  font-size: 1.25rem;
}

.brand-en {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.125rem;
  letter-spacing: -0.01em;
  color: var(--violet);
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
  border-radius: 999px;
  text-decoration: none;
  font-size: var(--t-sm);
  font-weight: 500;
}

.nav-link:hover {
  background: var(--plinth);
}

.nav-link.current {
  font-weight: 700;
  background: var(--plinth);
}

.as-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.login {
  background: var(--ink);
  color: var(--paper);
  padding: 0 18px;
}

.login:hover,
.login.current {
  background: var(--violet);
  color: #fff;
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
