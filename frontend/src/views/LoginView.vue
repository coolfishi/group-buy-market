<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePolling } from '@/composables/usePolling'
import { api, errorMessage, isApiError } from '@/services'
import { useSessionStore } from '@/stores/session'
import { useToastStore } from '@/stores/toast'
import type { User } from '@/types'
import { asset } from '@/utils/asset'
import { safeRedirect } from '@/utils/intent'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const toast = useToastStore()

const isDemo = api.mode === 'demo'
const redirect = computed(() => safeRedirect(route.query.redirect))
const returningToProduct = computed(() => redirect.value.startsWith('/products/'))

const busy = ref(false)
const error = ref('')

function finish(user: User) {
  session.login(user)
  toast.show(`已登录：${user.displayName}`, 'success')
  router.replace(redirect.value)
}

async function demoLogin() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    finish(await api.demoLogin())
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

// 真实模式：微信扫码
const QR_TTL_MS = 5 * 60_000
const qrState = ref<'loading' | 'ready' | 'expired' | 'error' | 'unavailable'>('loading')
const qrSrc = ref('')
let ticket = ''
let sceneStr = ''

function newScene() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

const poller = usePolling(
  async () => {
    const user = await api.wechatCheckLogin(ticket, sceneStr)
    if (user) {
      finish(user)
      return true
    }
    return false
  },
  3000,
  QR_TTL_MS,
)

async function loadQr() {
  poller.stop()
  qrState.value = 'loading'
  error.value = ''
  try {
    sceneStr = newScene()
    ticket = await api.wechatQrTicket(sceneStr)
    qrSrc.value = `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`
    qrState.value = 'ready'
    poller.start()
    setTimeout(() => {
      if (qrState.value === 'ready' && !session.isLoggedIn) {
        poller.stop()
        qrState.value = 'expired'
      }
    }, QR_TTL_MS)
  } catch (e) {
    // 服务端还没配置微信公众号：不是临时故障，不提示重试
    if (isApiError(e) && e.code === 'WECHAT_UNCONFIGURED') {
      qrState.value = 'unavailable'
      return
    }
    error.value = errorMessage(e)
    qrState.value = 'error'
  }
}

onMounted(() => {
  if (!isDemo) loadQr()
})
</script>

<template>
  <section class="container login">
    <div class="art" aria-hidden="true">
      <img :src="asset('art/TS-1002-main.svg')" alt="" width="800" height="800" />
    </div>

    <div class="panel">
      <h1>登录玩集</h1>
      <p class="lead">
        <template v-if="returningToProduct">登录后回到刚才的商品，确认后再下单。</template>
        <template v-else>登录后可以开团、参团和查看订单。</template>
      </p>

      <div v-if="isDemo" class="method">
        <div class="account">
          <p class="acc-name">体验账号：体验玩家</p>
          <p class="acc-note">演示专用账号，订单只保存在这台设备上，可随时在页面顶部重置。</p>
        </div>
        <button type="button" class="btn btn-primary btn-block" :disabled="busy" @click="demoLogin">
          <span v-if="busy" class="spinner" aria-hidden="true" />
          {{ busy ? '正在登录' : '用体验账号登录' }}
        </button>
      </div>

      <div v-else-if="qrState === 'unavailable'" class="method">
        <div class="account">
          <p class="acc-name">微信登录暂未开通</p>
          <p class="acc-note">商城正在接入微信公众号，开通后就可以扫码登录下单。现在可以先在演示站体验完整的拼团流程，演示站的订单不会真实扣款。</p>
        </div>
        <a :href="asset('demo/')" class="btn btn-primary btn-block">打开演示站</a>
      </div>

      <div v-else class="method">
        <div class="qr" :class="qrState">
          <img v-if="qrState === 'ready' || qrState === 'expired'" :src="qrSrc" alt="微信登录二维码" width="220" height="220" />
          <span v-if="qrState === 'loading'" class="spinner" aria-hidden="true" />
          <div v-if="qrState === 'expired'" class="qr-mask">
            <p>二维码已过期</p>
            <button type="button" class="btn btn-primary btn-small" @click="loadQr">刷新二维码</button>
          </div>
        </div>
        <p v-if="qrState === 'ready'" class="qr-tip" aria-live="polite">用微信扫码并关注公众号，登录会自动完成。</p>
        <button v-if="qrState === 'error'" type="button" class="btn btn-secondary" @click="loadQr">重新获取二维码</button>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.login {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
  gap: clamp(24px, 6vw, 80px);
  align-items: center;
  padding-top: clamp(24px, 5vw, 64px);
}

.art {
  border-radius: var(--r-plinth);
  background: var(--plinth);
  overflow: hidden;
  aspect-ratio: 1 / 1;
  max-height: 560px;
}

.art img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

h1 {
  font-size: var(--t-3xl);
  letter-spacing: -0.02em;
}

.lead {
  margin-top: 10px;
  color: var(--graphite);
}

.method {
  display: grid;
  gap: 16px;
  margin-top: 28px;
}

.account {
  padding: 18px 20px;
  border-radius: var(--r-plinth);
  background: var(--violet-mist);
}

.acc-name {
  font-weight: 700;
}

.acc-note {
  margin-top: 4px;
  font-size: var(--t-sm);
  color: var(--graphite);
}

.qr {
  position: relative;
  display: grid;
  place-items: center;
  width: 240px;
  height: 240px;
  border-radius: var(--r-plinth);
  background: #fff;
  border: 1.5px solid var(--line);
}

.qr img {
  width: 220px;
  height: 220px;
}

.qr .spinner {
  width: 28px;
  height: 28px;
  color: var(--violet);
}

.qr-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  border-radius: inherit;
  background: rgba(250, 247, 242, 0.94);
  font-weight: 700;
}

.qr-tip {
  font-size: var(--t-sm);
  color: var(--graphite);
}

.error {
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: var(--r-field);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: var(--t-sm);
}

@media (max-width: 760px) {
  .login {
    grid-template-columns: 1fr;
  }
  .art {
    max-width: 200px;
  }
}
</style>
