<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, fmtMoney } from '@/api'
import Badge from '@/components/Badge.vue'

interface Overview {
  skuCount: number
  activeActivityCount: number
  teams: { ongoing: number; complete: number; failed: number }
  todayOrders: Record<string, { count: number; amount: number }>
  pendingRefunds: number
  failedNotifies: number
  dcc: { key: string; label: string; value: string | null; on?: string; kind: string }[]
  integrations: { alipay: boolean; wechat: boolean; payProvider: string }
}

const data = ref<Overview | null>(null)
const error = ref('')
const loading = ref(true)

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api<Overview>('/overview')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

const paid = computed(() => {
  const t = data.value?.todayOrders ?? {}
  const keys = ['PAY_SUCCESS', 'DEAL_DONE']
  return {
    count: keys.reduce((s, k) => s + (t[k]?.count ?? 0), 0),
    amount: keys.reduce((s, k) => s + (t[k]?.amount ?? 0), 0),
  }
})
const created = computed(() => Object.values(data.value?.todayOrders ?? {}).reduce((s, v) => s + v.count, 0))
const downgraded = computed(() => data.value?.dcc.find((d) => d.key === 'downgradeSwitch')?.value === '1')

onMounted(load)
</script>

<template>
  <p v-if="loading" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">
    {{ error }} <button type="button" class="btn btn-link" @click="load">重试</button>
  </div>
  <div v-else-if="data" class="stack">
    <div v-if="downgraded" class="alert" role="alert">
      降级开关已开启，用户现在无法参与拼团。
      <RouterLink to="/switches">去运行开关关闭</RouterLink>
    </div>
    <div v-if="!data.integrations.alipay || !data.integrations.wechat" class="alert warn" role="note">
      <template v-if="!data.integrations.wechat">微信登录未配置，用户无法登录商城。</template>
      <template v-if="!data.integrations.alipay">支付宝未配置，用户无法下单付款。</template>
      在服务器的 <code>/opt/toyspace-backend/mall.env</code> 中填写后重启商城服务即可。
    </div>

    <section class="figures" aria-label="今日经营">
      <div class="figure main">
        <p class="label">今日已付款</p>
        <p class="value num">{{ fmtMoney(paid.amount) }}</p>
        <p class="sub"><span class="num">{{ paid.count }}</span> 笔付款，共下单 <span class="num">{{ created }}</span> 笔</p>
      </div>
      <div class="figure">
        <p class="label">进行中的拼团</p>
        <p class="value num">{{ data.teams.ongoing }}</p>
        <p class="sub">累计成团 <span class="num">{{ data.teams.complete }}</span>，失败或超时 <span class="num">{{ data.teams.failed }}</span></p>
      </div>
      <div class="figure">
        <p class="label">生效中的活动</p>
        <p class="value num">{{ data.activeActivityCount }}</p>
        <p class="sub">商品 <span class="num">{{ data.skuCount }}</span> 件</p>
      </div>
    </section>

    <section class="attention" aria-labelledby="att-title">
      <h2 id="att-title">需要处理</h2>
      <ul>
        <li>
          <span>退款处理中的订单</span>
          <RouterLink :to="{ path: '/orders', query: { status: 'WAIT_REFUND' } }" class="num">{{ data.pendingRefunds }}</RouterLink>
        </li>
        <li>
          <span>发送失败的通知</span>
          <RouterLink :to="{ path: '/notify', query: { status: '3' } }" class="num">{{ data.failedNotifies }}</RouterLink>
        </li>
      </ul>
    </section>

    <section class="attention" aria-labelledby="int-title">
      <h2 id="int-title">接入状态</h2>
      <ul>
        <li>
          <span>微信扫码登录</span>
          <Badge :tone="data.integrations.wechat ? 'ok' : 'warn'" :label="data.integrations.wechat ? '已配置' : '未配置'" />
        </li>
        <li>
          <span>支付宝支付</span>
          <Badge
            :tone="data.integrations.alipay ? 'ok' : 'warn'"
            :label="data.integrations.payProvider === 'mock' ? '测试模式' : data.integrations.alipay ? '已配置' : '未配置'"
          />
        </li>
        <li v-for="d in data.dcc" :key="d.key">
          <span>{{ d.label }}</span>
          <span class="num">{{ d.value ?? '未设置' }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.alert {
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--danger-bg);
  color: var(--danger);
  font-weight: 500;
}
.alert.warn {
  background: var(--warn-bg);
  color: var(--warn);
}
.alert a {
  color: inherit;
}
.figures {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 14px;
}
.figure {
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--plinth);
}
.figure.main {
  background: var(--ink);
  color: #fff;
}
.label {
  font-size: 13px;
  opacity: 0.75;
}
.value {
  margin-top: 4px;
  font-size: 34px;
  font-weight: 800;
  line-height: 1.1;
}
.figure.main .value {
  color: #c9b2ff;
}
.sub {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.8;
}
.attention {
  max-width: 560px;
}
.attention ul {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  border-top: 2px solid var(--ink);
}
.attention li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}
.attention a {
  color: var(--violet);
  font-weight: 700;
}
code {
  font-size: 12px;
}
@media (max-width: 860px) {
  .figures {
    grid-template-columns: 1fr;
  }
}
</style>
