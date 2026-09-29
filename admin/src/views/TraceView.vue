<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, fmtMoney, fmtTime, type Page } from '@/api'
import Badge from '@/components/Badge.vue'
import {
  buildTimeline,
  type Timeline,
  type Tone,
  type TraceMember,
  type TraceNotify,
  type TraceOrder,
  type TraceTeam,
} from '@/trace/timeline'

const route = useRoute()
const router = useRouter()

const input = ref(typeof route.query.orderId === 'string' ? route.query.orderId : '')
const loading = ref(false)
const error = ref('')
const order = ref<TraceOrder | null>(null)
const team = ref<TraceTeam | null>(null)
const timeline = ref<Timeline | null>(null)

const NOTIFY_PAGES = 3

async function notifiesFor(teamId: string | null, orderId: string): Promise<TraceNotify[]> {
  // 通知任务接口只能按状态筛选，这里取最近几页后按队伍和交易单号过滤
  const found: TraceNotify[] = []
  for (let p = 1; p <= NOTIFY_PAGES; p++) {
    const page = await api<Page<TraceNotify>>(`/notify-tasks?page=${p}&pageSize=100`)
    found.push(...page.list.filter((t) => t.team_id === teamId || (t.parameter_json ?? '').includes(orderId)))
    if (p * page.pageSize >= page.total) break
  }
  return found
}

async function lookup(orderId: string) {
  error.value = ''
  order.value = null
  team.value = null
  timeline.value = null
  if (!/^\d{12}$/.test(orderId)) {
    error.value = '订单号是 12 位数字。'
    return
  }
  loading.value = true
  try {
    const orders = await api<Page<TraceOrder>>(`/orders?keyword=${orderId}&pageSize=5`)
    const o = orders.list.find((x) => x.order_id === orderId)
    if (!o) {
      error.value = `没有找到订单 ${orderId}。`
      return
    }
    let t: TraceTeam | null = null
    let members: TraceMember[] = []
    if (o.team_id) {
      const [teams, mem] = await Promise.all([
        api<Page<TraceTeam>>(`/teams?keyword=${o.team_id}&pageSize=5`),
        api<TraceMember[]>(`/teams/${o.team_id}/members`),
      ])
      t = teams.list.find((x) => x.team_id === o.team_id) ?? null
      members = mem
    }
    const tasks = Number(o.market_type) === 1 ? await notifiesFor(o.team_id, orderId) : []
    order.value = o
    team.value = t
    timeline.value = buildTimeline(o, t, members, tasks)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '查询失败'
  } finally {
    loading.value = false
  }
}

function submit() {
  const id = input.value.trim()
  router.replace({ query: id ? { orderId: id } : {} })
}

watch(
  () => route.query.orderId,
  (id) => {
    if (typeof id === 'string' && id) {
      input.value = id
      lookup(id)
    }
  },
)
onMounted(() => {
  if (input.value) lookup(input.value)
})

const toneBadge: Record<Tone, 'ok' | 'violet' | 'warn' | 'danger'> = { ok: 'ok', wait: 'violet', warn: 'warn', fail: 'danger' }
const toneLabel: Record<Tone, string> = { ok: '完成', wait: '进行中', warn: '注意', fail: '失败' }
</script>

<template>
  <form class="toolbar" @submit.prevent="submit">
    <input
      v-model="input"
      class="input search"
      inputmode="numeric"
      maxlength="12"
      placeholder="输入 12 位商城订单号"
      aria-label="订单号"
    />
    <button type="submit" class="btn btn-primary" :disabled="loading">{{ loading ? '正在查询' : '查询链路' }}</button>
    <span class="spacer" />
    <span class="muted">把商城库、拼团库和通知任务里的记录串成一条时间线</span>
  </form>

  <div v-if="error" class="error-line" role="alert">{{ error }}</div>
  <p v-else-if="loading" class="muted">正在查询…</p>
  <p v-else-if="!order" class="empty">输入订单号，或在“商城订单”列表里点某一行的“链路”。</p>

  <template v-else-if="order && timeline">
    <section class="summary" aria-label="订单摘要">
      <div>
        <p class="muted">订单 <span class="num">{{ order.order_id }}</span></p>
        <h2>{{ order.product_name }}</h2>
        <p class="facts">
          <span>{{ Number(order.market_type) === 1 ? '拼团' : '单独购买' }}</span>
          <span>实付 {{ fmtMoney(order.pay_amount) }}</span>
          <span v-if="team">
            队伍 <span class="num">{{ team.team_id }}</span>：{{ team.complete_count }}/{{ team.target_count }} 人付款，截止
            {{ fmtTime(team.valid_end_time) }}
          </span>
        </p>
      </div>
      <p class="now" :class="timeline.summaryTone">{{ timeline.summary }}</p>
    </section>

    <!-- 编号表示事件的先后顺序 -->
    <ol class="timeline">
      <li v-for="s in timeline.steps" :key="s.key" :class="s.tone">
        <div class="head">
          <h3>{{ s.title }}</h3>
          <Badge :tone="toneBadge[s.tone]" :label="toneLabel[s.tone]" />
          <span class="source">{{ s.source }}</span>
        </div>
        <p class="detail">{{ s.detail }}</p>
        <p class="at num">{{ s.at ? fmtTime(s.at) : '—' }}</p>
      </li>
    </ol>
  </template>
</template>

<style scoped>
.toolbar .search {
  width: min(100%, 280px);
}

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px 24px;
  padding: 18px 20px;
  border-radius: 14px;
  background: var(--panel);
  border: 1px solid var(--line);
}

.summary h2 {
  margin: 2px 0 6px;
  font-size: 20px;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 14px;
  color: var(--graphite);
}

.now {
  padding: 8px 14px;
  border-radius: 10px;
  font-weight: 700;
}

.now.ok {
  background: var(--ok-bg);
  color: var(--ok);
}
.now.wait {
  background: var(--violet-mist);
  color: var(--violet);
}
.now.warn {
  background: var(--warn-bg);
  color: var(--warn);
}
.now.fail {
  background: var(--danger-bg);
  color: var(--danger);
}

.timeline {
  position: relative;
  display: grid;
  gap: 4px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.timeline li {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 16px;
  padding: 10px 0 14px 44px;
  counter-increment: step;
}

.timeline li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 8px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ok);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}

.timeline li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 13.5px;
  top: 38px;
  bottom: -6px;
  width: 1px;
  background: var(--line);
}

.timeline li.wait::before {
  background: var(--panel);
  color: var(--violet);
  border: 2px dashed var(--violet);
}
.timeline li.warn::before {
  background: var(--warn);
}
.timeline li.fail::before {
  background: var(--danger);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.head h3 {
  margin: 0;
  font-size: 16px;
}

.source {
  font-size: 12px;
  color: var(--graphite);
}

.detail {
  grid-column: 1;
  margin-top: 4px;
  color: var(--ink);
  font-size: 14px;
}

.at {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: start;
  padding-top: 2px;
  color: var(--graphite);
  font-size: 13px;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .timeline li {
    grid-template-columns: 1fr;
  }
  .at {
    grid-column: 1;
    grid-row: auto;
  }
}
</style>
