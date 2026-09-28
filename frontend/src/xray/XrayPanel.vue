<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { api } from '@/services'
import { mechanismOf, stages, type Stage } from './mechanisms'
import { clearTrace, entries, setXray, xrayEnabled, type TraceEntry } from './trace'

const isDemo = api.mode === 'demo'
const expanded = ref(new Set<number>())
// 手机上默认收起成侧边小标签，展开后是底部抽屉，避免一打开就挡住页面
const minimized = ref(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1099px)').matches === true)

// 新出现的关键步骤自动展开，让操作和后端链路一一对上
watch(
  () => entries[0]?.id,
  (id) => {
    const e = entries[0]
    if (id === undefined || !e || e.repeat) return
    const stage = mechanismOf(e.endpoint)?.stage
    // 交易步骤（锁单、支付、结算……）出现时展开它；价格查询只在没有展开项时展开，避免下单后的刷新把锁单链路挤下去
    if (stage && (stage !== 'trial' || expanded.value.size === 0)) expanded.value = new Set([id])
  },
)

function toggle(id: number) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

const reached = computed(() => {
  const set = new Set<Stage>()
  for (const e of entries) {
    const stage = mechanismOf(e.endpoint)?.stage
    if (stage && e.status !== 'error') set.add(stage)
  }
  return set
})

// 当前步骤看最近一次交易动作；下单后页面刷新价格属于查询，不让流程条倒退回“试算”
const current = computed<Stage | undefined>(() => {
  let sawTrial = false
  for (const e of entries) {
    const stage = mechanismOf(e.endpoint)?.stage
    if (stage === 'trial') sawTrial = true
    else if (stage && e.status !== 'error') return stage
  }
  return sawTrial ? 'trial' : undefined
})

const sourceLabel: Record<TraceEntry['source'], string> = { live: '真实请求', demo: '本地模拟', server: '服务端事件' }

function titleOf(e: TraceEntry) {
  return mechanismOf(e.endpoint)?.title ?? e.endpoint
}

function json(v: unknown) {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function time(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 桌面宽屏时给页面右侧让出面板宽度，不遮挡内容
watch(
  () => xrayEnabled.value && !minimized.value,
  (open) => document.documentElement.classList.toggle('xray-open', open),
  { immediate: true },
)
onBeforeUnmount(() => document.documentElement.classList.remove('xray-open'))
</script>

<template>
  <!-- 收起时只留右侧一个小标签，尽量不挡页面 -->
  <button
    v-if="xrayEnabled && minimized"
    type="button"
    class="tab"
    aria-label="展开透视面板"
    title="展开透视面板"
    @click="minimized = false"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
    <span v-if="entries.length" class="count num">{{ entries.length }}</span>
  </button>
  <aside v-if="xrayEnabled && !minimized" class="xray" aria-labelledby="xray-title">
    <header class="head">
      <div>
        <h2 id="xray-title">透视</h2>
        <p class="sub">{{ isDemo ? '演示站：请求在本地模拟，链路按真实后端说明' : '真实站：下面是浏览器发出的真实请求' }}</p>
      </div>
      <div class="tools">
        <button v-if="entries.length" type="button" class="tool" @click="clearTrace">清空</button>
        <button type="button" class="tool" @click="minimized = true">收起</button>
        <button type="button" class="tool close" aria-label="关闭透视模式" @click="setXray(false)">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

      <!-- 拼团交易的真实先后顺序，所以用编号 -->
      <ol class="flow" aria-label="交易流程">
        <li
          v-for="(s, i) in stages"
          :key="s.id"
          :class="{ reached: reached.has(s.id), current: current === s.id }"
          :aria-current="current === s.id ? 'step' : undefined"
        >
          <span class="num">{{ i + 1 }}</span>{{ s.label }}
        </li>
      </ol>

      <p v-if="!entries.length" class="empty">
        在页面上操作试试：打开一件商品看拼团价，发起拼团，再付款。每一步背后的处理链会出现在这里。
      </p>

      <ul v-else class="list" aria-live="polite">
        <li v-for="e in entries" :key="e.id" class="entry" :class="[e.source, e.status]">
          <button type="button" class="row" :aria-expanded="expanded.has(e.id)" @click="toggle(e.id)">
            <span class="badge">{{ sourceLabel[e.source] }}</span>
            <span class="title">
              {{ titleOf(e) }}
              <small>{{ e.method === 'EVENT' ? e.detail : e.endpoint }}</small>
            </span>
            <span class="meta">
              <span v-if="e.repeat" class="repeat">×{{ e.repeat }}</span>
              <span v-if="e.status === 'pending'" class="spinner" aria-label="处理中" />
              <span v-else-if="e.method !== 'EVENT'" class="num ms">{{ e.durationMs }}ms</span>
              <span v-if="e.status === 'error'" class="err">{{ e.code }}</span>
            </span>
          </button>

          <div v-if="expanded.has(e.id)" class="body">
            <template v-if="mechanismOf(e.endpoint)">
              <p class="svc">{{ mechanismOf(e.endpoint)!.service }}，{{ time(e.at) }}</p>
              <p class="summary">{{ mechanismOf(e.endpoint)!.summary }}</p>
              <ol class="steps">
                <li v-for="st in mechanismOf(e.endpoint)!.steps" :key="st.name">
                  <b>{{ st.name }}</b>
                  <span>{{ st.what }}</span>
                  <code v-if="st.where">{{ st.where }}</code>
                </li>
              </ol>
            </template>
            <details v-if="e.request !== undefined && json(e.request) !== '{}' && json(e.request) !== '[]'">
              <summary>请求参数（已脱敏）</summary>
              <pre>{{ json(e.request) }}</pre>
            </details>
            <details v-if="e.response !== undefined">
              <summary>{{ e.status === 'error' ? '错误信息' : '返回数据（已脱敏）' }}</summary>
              <pre>{{ json(e.response) }}</pre>
            </details>
          </div>
        </li>
      </ul>
  </aside>
</template>

<style scoped>
.xray {
  position: fixed;
  /* 高于弹窗遮罩（100），下单弹窗打开时也能看着链路一步步出现；低于提示（200） */
  z-index: 150;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: var(--xray-w);
  background: var(--ink);
  color: #fff;
  box-shadow: -12px 0 30px -18px rgba(0, 0, 0, 0.6);
}

/* 收起后的小标签 */
.tab {
  position: fixed;
  z-index: 150;
  top: 38%;
  right: 0;
  display: grid;
  place-items: center;
  width: 44px;
  height: 48px;
  border: 0;
  border-radius: 12px 0 0 12px;
  background: var(--sticker);
  color: var(--ink);
  box-shadow: 0 8px 18px -8px rgba(22, 26, 58, 0.6);
  cursor: pointer;
}

.tab .count {
  position: absolute;
  top: -6px;
  left: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 0.75rem;
  line-height: 20px;
}

.tab:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: 2px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.head h2 {
  font-size: 1.5rem;
  line-height: 1.1;
  color: var(--sticker);
}

.sub {
  margin-top: 2px;
  font-size: var(--t-xs);
  color: rgba(255, 255, 255, 0.7);
}

.tools {
  display: flex;
  gap: 4px;
  flex: none;
}

.tool {
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: var(--t-xs);
  font-weight: 700;
  cursor: pointer;
}

.tool:hover {
  background: rgba(255, 255, 255, 0.2);
}

.tool.close {
  padding: 0;
}

.flow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 12px 16px;
  list-style: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.flow li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px 3px 4px;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.6);
  font-size: var(--t-xs);
}

.flow .num {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  font-size: 0.75rem;
}

.flow li.reached {
  border-color: rgba(255, 217, 46, 0.6);
  color: #fff;
}

.flow li.current {
  background: var(--sticker);
  border-color: var(--sticker);
  color: var(--ink);
  font-weight: 900;
}

.flow li.current .num {
  background: var(--ink);
  color: var(--sticker);
}

.empty {
  padding: 20px 16px;
  font-size: var(--t-sm);
  color: rgba(255, 255, 255, 0.75);
}

.list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 8px 10px 16px;
  list-style: none;
  overscroll-behavior: contain;
}

.entry {
  margin-bottom: 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border-left: 4px solid #7d80e6;
}

.entry.demo {
  border-left-color: rgba(255, 255, 255, 0.35);
}

.entry.server {
  border-left-color: var(--sticker);
}

.entry.error {
  border-left-color: #ff7a66;
}

.row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.badge {
  padding: 1px 6px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 0.6875rem;
  white-space: nowrap;
}

.server .badge {
  background: var(--sticker);
  color: var(--ink);
  font-weight: 900;
}

.title {
  display: grid;
  min-width: 0;
  font-size: var(--t-sm);
  font-weight: 700;
  line-height: 1.35;
}

.title small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.6);
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-xs);
  color: rgba(255, 255, 255, 0.7);
}

.meta .spinner {
  width: 14px;
  height: 14px;
}

.repeat {
  padding: 0 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.12);
}

.err {
  color: #ffb3a6;
  font-weight: 700;
}

.body {
  padding: 0 12px 12px;
  font-size: var(--t-xs);
}

.svc {
  color: rgba(255, 255, 255, 0.6);
}

.summary {
  margin-top: 4px;
  font-size: var(--t-sm);
  color: #fff;
}

.steps {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps li {
  position: relative;
  display: grid;
  gap: 1px;
  padding-left: 26px;
  counter-increment: step;
}

/* 竖线把步骤串起来，编号表示真实执行顺序 */
.steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 1px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--sticker);
  color: var(--ink);
  font-weight: 900;
  font-size: 0.6875rem;
}

.steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 8.5px;
  top: 21px;
  bottom: -9px;
  width: 1px;
  background: rgba(255, 217, 46, 0.4);
}

.steps b {
  color: #fff;
}

.steps span {
  color: rgba(255, 255, 255, 0.78);
}

.steps code {
  width: fit-content;
  max-width: 100%;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #c7c9ff;
  font-size: 0.6875rem;
  overflow-wrap: anywhere;
}

details {
  margin-top: 10px;
}

summary {
  cursor: pointer;
  color: rgba(255, 255, 255, 0.75);
}

pre {
  max-height: 220px;
  overflow: auto;
  margin: 6px 0 0;
  padding: 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  color: #e6e7ff;
  font-size: 0.6875rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.row:focus-visible,
.tool:focus-visible {
  outline: 2px solid var(--sticker);
  outline-offset: -2px;
}

/* 手机：底部抽屉，占下半屏 */
@media (max-width: 1099px) {
  .xray {
    /* 手机上弹窗也是底部抽屉，面板要让在弹窗下面，不能挡住付款按钮 */
    z-index: 90;
    top: auto;
    left: 0;
    width: auto;
    height: var(--xray-h);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -12px 30px -12px rgba(0, 0, 0, 0.5);
  }
  .tab {
    z-index: 90;
  }
}
</style>
