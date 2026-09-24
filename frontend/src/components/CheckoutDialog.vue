<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePolling } from '@/composables/usePolling'
import { api, errorMessage, isApiError } from '@/services'
import { submitPayForm } from '@/services/live/payForm'
import type { MarketInfo, Order, Product, PurchaseRequest, User } from '@/types'
import { savePendingPayment } from '@/utils/pendingPayment'
import BaseModal from './BaseModal.vue'
import PriceTag from './PriceTag.vue'

const props = defineProps<{
  open: boolean
  product: Product
  market: MarketInfo
  request: PurchaseRequest | null
  user: User
}>()
const emit = defineEmits<{ close: []; changed: []; unauthorized: [] }>()

type Phase = 'confirm' | 'cashier' | 'waiting' | 'result'
type Result = { tone: 'success' | 'closed' | 'error'; title: string; detail: string }

const phase = ref<Phase>('confirm')
const busy = ref(false)
const error = ref('')
const order = ref<Order | null>(null)
const result = ref<Result | null>(null)
const payStartedAt = ref(0)
const payOrderId = ref<string | undefined>()
const checking = ref(false)

const PAY_WINDOW = 'toyspace-pay'

const amount = computed(() =>
  props.request?.type === 'single' ? props.market.originalPrice : props.market.payPrice,
)
const team = computed(() => props.market.teams.find((t) => t.teamId === props.request?.teamId))

const copy = computed(() => {
  switch (props.request?.type) {
    case 'single':
      return { title: '确认单独购买', action: '确认购买', note: '按原价购买，不参与拼团。' }
    case 'join':
      return {
        title: '确认参与拼团',
        action: '确认参团',
        note: team.value
          ? `加入 ${team.value.ownerLabel} 的拼团，还差 ${team.value.targetCount - team.value.lockCount} 人。`
          : '加入这个拼团。',
      }
    default:
      return { title: '确认发起拼团', action: '确认开团', note: '付款后拼团开始计时，人齐即成团。' }
  }
})

const title = computed(() => {
  if (phase.value === 'cashier') return '模拟收银台'
  if (phase.value === 'waiting') return '等待支付结果'
  if (phase.value === 'result') return result.value?.title ?? '支付结果'
  return copy.value.title
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      phase.value = 'confirm'
      busy.value = false
      error.value = ''
      order.value = null
      result.value = null
    } else {
      poller.stop()
    }
  },
)

function handleError(e: unknown) {
  if (isApiError(e) && e.kind === 'unauthorized') {
    emit('unauthorized')
    return
  }
  error.value = errorMessage(e)
}

async function confirm() {
  if (!props.request || busy.value) return
  busy.value = true
  error.value = ''
  // 真实模式：在点击当下打开支付窗口，避免被浏览器拦截
  let payWindow: Window | null = null
  if (api.mode === 'live') payWindow = window.open('', PAY_WINDOW)
  try {
    const res = await api.checkout(props.user, props.request)
    if (res.kind === 'demo') {
      order.value = res.order
      phase.value = 'cashier'
      emit('changed')
    } else {
      payStartedAt.value = res.startedAt
      payOrderId.value = res.orderId
      if (payWindow && !payWindow.closed) {
        submitPayForm(res.form, PAY_WINDOW)
        phase.value = 'waiting'
        poller.start()
      } else {
        // 弹窗被拦截：当前页跳转支付，回来后在订单页确认结果
        savePendingPayment({ productId: props.product.id, since: res.startedAt, orderId: res.orderId })
        submitPayForm(res.form)
      }
    }
  } catch (e) {
    payWindow?.close()
    handleError(e)
  } finally {
    busy.value = false
  }
}

/** 支付页出错（如支付宝提示用户未登录）时，为同一笔订单重新生成支付页 */
async function reopenPay() {
  if (!payOrderId.value || busy.value) return
  busy.value = true
  error.value = ''
  const payWindow = window.open('', PAY_WINDOW)
  try {
    const res = await api.repay(props.user, payOrderId.value)
    if (res.kind !== 'redirect') return
    if (payWindow && !payWindow.closed) submitPayForm(res.form, PAY_WINDOW)
    else {
      savePendingPayment({ productId: props.product.id, since: payStartedAt.value, orderId: payOrderId.value })
      submitPayForm(res.form)
    }
  } catch (e) {
    payWindow?.close()
    handleError(e)
    // 可能已经付款或订单已关闭，查一次结果
    await checkPayment()
  } finally {
    busy.value = false
  }
}

async function settle(action: 'confirm' | 'cancel') {
  if (!order.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const settled = await api.settleDemoPayment(props.user, order.value.orderId, action)
    order.value = settled
    result.value = describe(settled, action === 'cancel')
    phase.value = 'result'
    emit('changed')
  } catch (e) {
    handleError(e)
  } finally {
    busy.value = false
  }
}

function describe(o: Order, cancelled = false): Result {
  if (cancelled || o.status === 'CLOSE') {
    return {
      tone: 'closed',
      title: '已取消支付',
      detail: o.closeReason && o.closeReason !== '已取消支付' ? `${o.closeReason}。` : '订单已关闭，没有扣款。想要的话可以重新下单。',
    }
  }
  if (o.status === 'DEAL_DONE') {
    return {
      tone: 'success',
      title: o.purchaseType === 'single' ? '支付完成' : '拼团成功',
      detail: o.purchaseType === 'single' ? '订单已完成。' : '人已凑齐，拼团成功，等待发货。',
    }
  }
  if (o.teamProgress) {
    const left = o.teamProgress.target - o.teamProgress.complete
    return {
      tone: 'success',
      title: '支付完成',
      detail: `名额已锁定，还差 ${left} 人成团。到期没凑齐会原路退款。`,
    }
  }
  return { tone: 'success', title: '支付完成', detail: '订单已支付，可以在“我的订单”里查看。' }
}

// 真实模式：付款结果以订单查询为准
async function checkPayment(): Promise<boolean> {
  checking.value = true
  try {
    const found = await api.findRecentOrder(props.user, props.product.id, payStartedAt.value, payOrderId.value)
    if (found && ['PAY_SUCCESS', 'DEAL_DONE', 'CLOSE', 'WAIT_REFUND'].includes(found.status)) {
      result.value = describe(found)
      phase.value = 'result'
      emit('changed')
      return true
    }
    return false
  } catch (e) {
    if (isApiError(e) && e.kind === 'unauthorized') {
      emit('unauthorized')
      return true
    }
    return false
  } finally {
    checking.value = false
  }
}

const poller = usePolling(checkPayment, 5000, 15 * 60_000)

async function checkNow() {
  const done = await checkPayment()
  if (!done) error.value = '还没有查到付款结果。付款完成后稍等几秒再查。'
}

const locked = computed(() => busy.value || phase.value === 'cashier')
</script>

<template>
  <BaseModal :open="open" :title="title" :locked="locked" @close="emit('close')">
    <div class="summary">
      <img :src="product.images[0].src" alt="" width="72" height="72" />
      <div>
        <p class="name">{{ product.name }}</p>
        <p class="sub">{{ product.size }}</p>
      </div>
      <PriceTag :value="amount" :tone="request?.type === 'single' ? 'ink' : 'violet'" />
    </div>

    <template v-if="phase === 'confirm'">
      <p class="note">{{ copy.note }}</p>
      <p v-if="api.mode === 'live'" class="hint">确认后会打开支付页面，请在新页面完成付款。</p>
    </template>

    <template v-else-if="phase === 'cashier'">
      <p class="note">这是模拟收银台，不会产生真实扣款。确认后订单变为已支付。</p>
      <p class="order-no">订单号 <span class="num">{{ order?.orderId }}</span></p>
    </template>

    <template v-else-if="phase === 'waiting'">
      <p class="note">请在新打开的页面完成付款。付款结果以订单查询为准，这里会自动刷新。</p>
      <p class="hint">暂时不付也可以，稍后在“我的订单”里点“去付款”继续；超时未付的订单会自动关闭。</p>
      <p class="hint">支付宝页面提示“用户未登录”时，关掉那个页面，点下面的“重新打开支付页”即可，不会重复下单。</p>
      <p class="checking" aria-live="polite">
        <span class="spinner" aria-hidden="true" /> {{ checking ? '正在查询订单…' : '等待付款中' }}
      </p>
    </template>

    <template v-else-if="result">
      <div class="result" :class="result.tone">
        <svg v-if="result.tone === 'success'" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="currentColor" />
          <path d="M14 25l7 7 13-15" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <svg v-else viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill="currentColor" />
          <path d="M16 24h16" stroke="#fff" stroke-width="4" stroke-linecap="round" />
        </svg>
        <p>{{ result.detail }}</p>
      </div>
    </template>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template #actions>
      <template v-if="phase === 'confirm'">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="emit('close')">再想想</button>
        <button type="button" class="btn btn-primary" :disabled="busy || !request" data-autofocus @click="confirm">
          <span v-if="busy" class="spinner" aria-hidden="true" />
          {{ busy ? '正在提交' : `${copy.action} ¥${amount}` }}
        </button>
      </template>
      <template v-else-if="phase === 'cashier'">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="settle('cancel')">取消支付</button>
        <button type="button" class="btn btn-primary" :disabled="busy" data-autofocus @click="settle('confirm')">
          <span v-if="busy" class="spinner" aria-hidden="true" />
          {{ busy ? '正在支付' : `确认支付 ¥${amount}` }}
        </button>
      </template>
      <template v-else-if="phase === 'waiting'">
        <button type="button" class="btn btn-secondary" @click="emit('close')">稍后再付</button>
        <button v-if="payOrderId" type="button" class="btn btn-secondary" :disabled="busy" @click="reopenPay">
          {{ busy ? '正在打开' : '重新打开支付页' }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="checking" data-autofocus @click="checkNow">我已付款，查询结果</button>
      </template>
      <template v-else>
        <RouterLink to="/orders" class="btn btn-secondary" @click="emit('close')">查看订单</RouterLink>
        <button type="button" class="btn btn-primary" data-autofocus @click="emit('close')">继续逛逛</button>
      </template>
    </template>
  </BaseModal>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 10px 16px 10px 10px;
  border-radius: 16px;
  background: var(--plinth);
}

.summary img {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  background: var(--card);
  object-fit: cover;
  object-position: center 25%;
}

.name {
  font-weight: 700;
}

.sub {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.note {
  margin-top: 16px;
}

.hint,
.order-no {
  margin-top: 8px;
  font-size: var(--t-sm);
  color: var(--graphite);
}

.checking {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  color: var(--violet);
  font-weight: 500;
}

.result {
  display: grid;
  grid-template-columns: 44px 1fr;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
}

.result.success {
  color: var(--ok);
}

.result.closed {
  color: var(--graphite);
}

.result p {
  color: var(--ink);
}

.error {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: var(--r-field);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: var(--t-sm);
}
</style>
