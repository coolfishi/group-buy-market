<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api, fmtTime, type Page } from '@/api'
import Badge from '@/components/Badge.vue'
import Pager from '@/components/Pager.vue'
import { toast } from '@/toast'

interface Task {
  id: number
  activity_id: number
  team_id: string
  notify_category: string | null
  notify_type: string
  notify_mq: string | null
  notify_url: string | null
  notify_count: number
  notify_status: number
  parameter_json: string
  create_time: string
  update_time: string
}

const statusView: Record<number, { label: string; tone: 'muted' | 'ok' | 'warn' | 'danger' }> = {
  0: { label: '待发送', tone: 'muted' },
  1: { label: '已送达', tone: 'ok' },
  2: { label: '待重试', tone: 'warn' },
  3: { label: '失败', tone: 'danger' },
}
const categories: Record<string, string> = {
  trade_settlement: '成团结算',
  trade_unpaid2refund: '未付款退单',
  trade_paid2refund: '已付款退单',
  trade_paid_team2refund: '已成团退单',
}

const route = useRoute()
const status = ref(typeof route.query.status === 'string' ? route.query.status : '')
const page = ref(1)
const data = ref<Page<Task> | null>(null)
const loading = ref(true)
const error = ref('')
const retrying = ref<number | null>(null)
const shown = ref<number | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const q = new URLSearchParams({ page: String(page.value), pageSize: '20', status: status.value })
    data.value = await api<Page<Task>>(`/notify-tasks?${q}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function retry(t: Task) {
  retrying.value = t.id
  try {
    const res = await api<{ result: 'success' | 'failed' | 'queued' }>(`/notify-tasks/${t.id}/retry`, { method: 'POST' })
    if (res.result === 'success') toast('已重新发送，对方已确认收到')
    else if (res.result === 'queued') toast('已改为待重试，拼团服务的通知任务会重新投递')
    else toast('重新发送没有成功，已改为待重试', 'error')
    await load()
  } catch (e) {
    toast(e instanceof Error ? e.message : '重试失败', 'error')
  } finally {
    retrying.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="toolbar">
    <select v-model="status" class="input narrow" aria-label="通知状态" @change="((page = 1), load())">
      <option value="">全部状态</option>
      <option v-for="(s, k) in statusView" :key="k" :value="k">{{ s.label }}</option>
    </select>
    <span class="spacer" />
    <span class="muted">成团和退单结果会通知给商城（HTTP）或消息队列（MQ）</span>
  </div>

  <p v-if="loading && !data" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">{{ error }} <button type="button" class="btn btn-link" @click="load">重试</button></div>
  <div v-else-if="data && !data.list.length" class="empty">没有符合条件的通知任务。</div>
  <template v-else-if="data">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="num">#</th>
            <th>类型</th>
            <th>队伍</th>
            <th>方式</th>
            <th>状态</th>
            <th class="num">发送次数</th>
            <th>创建</th>
            <th>最近更新</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="t in data.list" :key="t.id">
            <tr>
              <td class="num">{{ t.id }}</td>
              <td>{{ categories[t.notify_category ?? ''] ?? t.notify_category ?? '—' }}</td>
              <td class="num">{{ t.team_id }}</td>
              <td>{{ t.notify_type }} <span class="muted">{{ t.notify_type === 'MQ' ? t.notify_mq : '' }}</span></td>
              <td><Badge :tone="statusView[t.notify_status]?.tone ?? 'muted'" :label="statusView[t.notify_status]?.label ?? String(t.notify_status)" /></td>
              <td class="num">{{ t.notify_count }}</td>
              <td class="muted">{{ fmtTime(t.create_time) }}</td>
              <td class="muted">{{ fmtTime(t.update_time) }}</td>
              <td>
                <button type="button" class="btn btn-link" :aria-expanded="shown === t.id" @click="shown = shown === t.id ? null : t.id">参数</button>
                <button
                  v-if="t.notify_status !== 1"
                  type="button"
                  class="btn btn-link"
                  :disabled="retrying === t.id"
                  @click="retry(t)"
                >
                  {{ retrying === t.id ? '发送中' : '重新发送' }}
                </button>
              </td>
            </tr>
            <tr v-if="shown === t.id" class="detail">
              <td colspan="9"><pre>{{ t.parameter_json }}</pre></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <Pager :page="data.page" :page-size="data.pageSize" :total="data.total" @change="(p) => ((page = p), load())" />
  </template>
</template>

<style scoped>
.narrow {
  width: 160px;
}
.detail > td {
  background: #fdfbf7;
}
pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
}
</style>
