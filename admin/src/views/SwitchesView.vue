<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import AdminModal from '@/components/AdminModal.vue'
import { toast } from '@/toast'

interface Item {
  key: string
  label: string
  kind: 'switch' | 'range' | 'text'
  on?: string
  off?: string
  hint: string
  value: string | null
}

const items = ref<Item[]>([])
const drafts = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')
const saving = ref<string | null>(null)
const pending = ref<{ item: Item; value: string } | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await api<Item[]>('/dcc')
    drafts.value = Object.fromEntries(items.value.map((i) => [i.key, i.value ?? '']))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

/** 降级开启、切量调低这类会直接影响用户的改动，先确认 */
function request(item: Item, value: string) {
  const risky = (item.key === 'downgradeSwitch' && value === item.on) || (item.key === 'cutRange' && Number(value) < 100) || (item.key === 'rateLimiterSwitch' && value === item.off)
  if (risky) pending.value = { item, value }
  else apply(item, value)
}

async function apply(item: Item, value: string) {
  saving.value = item.key
  try {
    await api(`/dcc/${item.key}`, { method: 'PUT', body: { value } })
    toast(`${item.label}已更新，立即生效`)
    pending.value = null
    // 配置通过消息下发，稍等再读取
    setTimeout(load, 600)
  } catch (e) {
    toast(e instanceof Error ? e.message : '更新失败', 'error')
  } finally {
    saving.value = null
  }
}

onMounted(load)
</script>

<template>
  <p class="muted intro">改动通过拼团服务的动态配置中心下发，所有实例立即生效，不需要重启。</p>
  <p v-if="loading && !items.length" class="muted">正在加载…</p>
  <div v-else-if="error" class="error-line" role="alert">{{ error }} <button type="button" class="btn btn-link" @click="load">重试</button></div>
  <ul v-else class="list">
    <li v-for="item in items" :key="item.key">
      <div class="text">
        <p class="name">{{ item.label }} <code>{{ item.key }}</code></p>
        <p class="muted">{{ item.hint }}</p>
      </div>
      <div class="control">
        <template v-if="item.kind === 'switch'">
          <button
            type="button"
            role="switch"
            class="switch"
            :aria-checked="item.value === item.on"
            :aria-label="item.label"
            :disabled="saving === item.key"
            @click="request(item, item.value === item.on ? item.off! : item.on!)"
          >
            <span class="knob" />
          </button>
          <span class="state">{{ item.value === item.on ? '开启' : '关闭' }}</span>
        </template>
        <form v-else class="inline" @submit.prevent="request(item, drafts[item.key])">
          <input
            v-model="drafts[item.key]"
            class="input"
            :type="item.kind === 'range' ? 'number' : 'text'"
            :min="item.kind === 'range' ? 0 : undefined"
            :max="item.kind === 'range' ? 100 : undefined"
            :aria-label="item.label"
          />
          <button type="submit" class="btn btn-secondary" :disabled="saving === item.key || drafts[item.key] === (item.value ?? '')">保存</button>
        </form>
      </div>
    </li>
  </ul>

  <AdminModal :open="!!pending" :title="`确认修改${pending?.item.label}？`" :busy="!!saving" @close="pending = null">
    <p v-if="pending?.item.key === 'downgradeSwitch'">开启降级后，所有用户都无法查看拼团价和参与拼团，直到手动关闭。</p>
    <p v-else-if="pending?.item.key === 'cutRange'">切量比例改为 {{ pending?.value }}% 后，其余用户将无法参与拼团。</p>
    <p v-else>关闭限流后，拼团查询接口不再按用户限速。</p>
    <template #actions>
      <button type="button" class="btn btn-secondary" :disabled="!!saving" @click="pending = null">取消</button>
      <button type="button" class="btn btn-danger" :disabled="!!saving" @click="pending && apply(pending.item, pending.value)">确认修改</button>
    </template>
  </AdminModal>
</template>

<style scoped>
.intro {
  margin-bottom: 14px;
}
.list {
  max-width: 820px;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 2px solid var(--ink);
}
.list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.name {
  font-weight: 700;
}
code {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--graphite);
}
.control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.inline {
  display: flex;
  gap: 8px;
}
.inline .input {
  width: 160px;
}
.switch {
  position: relative;
  width: 46px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--line);
  cursor: pointer;
}
.switch[aria-checked='true'] {
  background: var(--violet);
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.switch[aria-checked='true'] .knob {
  transform: translateX(20px);
}
.state {
  width: 2.5em;
  font-size: 13px;
}
@media (max-width: 700px) {
  .list li {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
