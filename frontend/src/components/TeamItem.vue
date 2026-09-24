<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
import type { Team } from '@/types'
import { formatCountdown } from '@/utils/format'

const props = defineProps<{
  team: Team
  /** 提交中：禁止重复点击 */
  busy?: boolean
  disabledReason?: string
}>()
defineEmits<{ join: [team: Team] }>()

const now = useNow()
const remaining = computed(() => props.team.validEndTime - now.value)
const expired = computed(() => remaining.value <= 0)
const full = computed(() => props.team.lockCount >= props.team.targetCount)
const done = computed(() => props.team.completeCount >= props.team.targetCount)
const left = computed(() => Math.max(0, props.team.targetCount - props.team.lockCount))

const blockedLabel = computed(() => {
  if (done.value) return '已成团'
  if (props.team.isMine) return '已参团'
  if (expired.value) return '已结束'
  if (full.value) return '已满员'
  return null
})
</script>

<template>
  <li class="team" :class="{ inactive: expired || full }">
    <div class="seats" :aria-label="`${team.lockCount} / ${team.targetCount} 人`">
      <span
        v-for="i in team.targetCount"
        :key="i"
        class="seat"
        :class="{ taken: i <= team.lockCount }"
        aria-hidden="true"
      />
    </div>
    <div class="info">
      <p class="owner">
        {{ team.isMine ? '我的拼团' : `${team.ownerLabel} 的拼团` }}
      </p>
      <p class="meta">
        <template v-if="done">人已凑齐，拼团成功</template>
        <template v-else-if="expired">拼团已结束</template>
        <template v-else-if="full">名额已满，等待付款</template>
        <template v-else>
          还差 <strong>{{ left }}</strong> 人，剩余
          <time class="num countdown" :datetime="new Date(team.validEndTime).toISOString()">{{
            formatCountdown(remaining)
          }}</time>
        </template>
      </p>
    </div>
    <button
      type="button"
      class="btn btn-small"
      :class="blockedLabel ? 'btn-secondary' : 'btn-primary'"
      :disabled="!!blockedLabel || busy || !!disabledReason"
      :title="disabledReason"
      @click="$emit('join', team)"
    >
      {{ blockedLabel ?? '参与拼团' }}
    </button>
  </li>
</template>

<style scoped>
/* 拼团票：白色票面，左侧厚色边；名额用方格表示 */
.team {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 12px 14px 12px 16px;
  border-radius: 12px;
  border-left: 8px solid var(--violet);
  background: var(--card);
  box-shadow: var(--shadow-box);
}

.inactive {
  border-left-color: var(--line);
  background: var(--plinth);
  box-shadow: none;
  color: var(--graphite);
}

.seats {
  display: flex;
  gap: 4px;
}

.seat {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 2px solid var(--violet);
  background: var(--card);
}

.seat.taken {
  background: var(--violet);
}

.inactive .seat {
  border-color: var(--graphite);
  background: transparent;
}

.inactive .seat.taken {
  background: var(--graphite);
}

.owner {
  font-weight: 900;
  font-size: var(--t-sm);
}

.meta {
  font-size: var(--t-xs);
  color: var(--graphite);
}

.meta strong {
  color: var(--violet);
}

.countdown {
  font-family: var(--font-num);
  font-size: 0.95rem;
  letter-spacing: 0.03em;
  color: var(--ink);
}

@media (max-width: 420px) {
  .team {
    grid-template-columns: 1fr auto;
    gap: 10px 12px;
  }
  .seats {
    grid-column: 1 / -1;
  }
}
</style>
