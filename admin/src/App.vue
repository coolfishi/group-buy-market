<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearToken, session } from './api'
import { toasts } from './toast'

const route = useRoute()
const router = useRouter()
const navOpen = ref(false)
const inShell = computed(() => route.name !== 'login' && !!session.token)

const groups = [
  { label: '经营', items: [{ to: '/', name: '概览' }] },
  {
    label: '商品与活动',
    items: [
      { to: '/products', name: '商品' },
      { to: '/activities', name: '拼团活动' },
    ],
  },
  {
    label: '交易',
    items: [
      { to: '/teams', name: '拼团队伍' },
      { to: '/orders', name: '商城订单' },
    ],
  },
  {
    label: '运维',
    items: [
      { to: '/switches', name: '运行开关' },
      { to: '/notify', name: '通知任务' },
    ],
  },
]

watch(() => route.fullPath, () => (navOpen.value = false))

function logout() {
  clearToken()
  router.push('/login')
}
</script>

<template>
  <div v-if="inShell" class="shell">
    <aside class="side" :class="{ open: navOpen }">
      <div class="brand">
        <span class="cn">玩集</span>
        <span class="en">TOYSPACE</span>
        <span class="tag">管理台</span>
      </div>
      <nav aria-label="管理导航">
        <div v-for="g in groups" :key="g.label" class="group">
          <p class="group-label">{{ g.label }}</p>
          <RouterLink v-for="item in g.items" :key="item.to" :to="item.to" class="link" exact-active-class="current">
            {{ item.name }}
          </RouterLink>
        </div>
      </nav>
      <div class="side-foot">
        <a href="/" target="_blank" rel="noopener" class="link">打开商城</a>
        <button type="button" class="link as-btn" @click="logout">退出登录</button>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button type="button" class="menu" aria-label="打开导航" @click="navOpen = !navOpen">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
        <h1>{{ route.meta.title }}</h1>
      </header>
      <main class="content">
        <RouterView />
      </main>
    </div>
  </div>
  <RouterView v-else />

  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.tone" role="status">{{ t.text }}</div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--sidebar) minmax(0, 1fr);
  min-height: 100vh;
}

.side {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 22px 14px;
  background: var(--ink);
  color: #e9e4dc;
}

.brand {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 0 10px 22px;
}

.cn {
  font-weight: 900;
  font-size: 18px;
  color: #fff;
}

.en {
  font-family: var(--font-display);
  font-weight: 800;
  color: #b89bff;
}

.tag {
  width: 100%;
  font-size: 12px;
  color: #a39c93;
}

nav {
  flex: 1;
  overflow-y: auto;
}

.group + .group {
  margin-top: 18px;
}

.group-label {
  padding: 0 10px 6px;
  font-size: 12px;
  color: #8f877d;
}

.link {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
  text-align: left;
}

.link:hover {
  background: rgba(255, 255, 255, 0.07);
}

.link.current {
  background: var(--violet);
  color: #fff;
  font-weight: 700;
}

.as-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.side-foot {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 12px;
}

.main {
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 22px 32px 0;
}

.menu {
  display: none;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.content {
  padding: 20px 32px 48px;
}

.toasts {
  position: fixed;
  right: 20px;
  top: 20px;
  z-index: 200;
  display: grid;
  gap: 8px;
  width: min(360px, calc(100vw - 40px));
}

.toast {
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--ink);
  color: #fff;
}

.toast.ok {
  background: var(--ok);
}

.toast.error {
  background: var(--danger);
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
  }
  .side {
    position: fixed;
    z-index: 60;
    left: 0;
    width: 240px;
    transform: translateX(-100%);
    transition: transform 0.2s;
  }
  .side.open {
    transform: none;
  }
  .menu {
    display: grid;
  }
  .top,
  .content {
    padding-inline: 16px;
  }
}
</style>
