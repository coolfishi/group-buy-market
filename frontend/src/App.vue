<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import ToastHost from '@/components/ToastHost.vue'
import { appConfig } from '@/config/env'
import { copyrightNotice } from '@/data/products'
import { asset } from '@/utils/asset'

const isLive = appConfig.mode === 'live'
</script>

<template>
  <a class="skip" href="#main">跳到主要内容</a>
  <AppHeader />
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <footer class="site-footer">
    <div class="container foot">
      <p class="brand">玩集 TOYSPACE</p>
      <p>
        {{ copyrightNotice }}页面不展示销量与评价。
      </p>
      <p v-if="isLive"><a :href="asset('demo/')">打开演示站</a>：不用登录和付款，先体验完整拼团流程。</p>
    </div>
  </footer>
  <ToastHost />
</template>

<style scoped>
.skip {
  position: absolute;
  left: 16px;
  top: -60px;
  z-index: 300;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--paper);
}

.skip:focus {
  top: 12px;
}

main {
  display: block;
  min-height: 60vh;
}

main:focus {
  outline: none;
}

.site-footer {
  margin-top: 96px;
  border-top: 1px solid var(--line);
  color: var(--graphite);
  font-size: var(--t-xs);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  padding-block: 28px 40px;
}

.brand {
  font-weight: 700;
  color: var(--ink);
}

.foot p:last-child {
  max-width: 44em;
}
</style>
