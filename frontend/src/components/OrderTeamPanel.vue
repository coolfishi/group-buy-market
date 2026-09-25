<script setup lang="ts">
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
import type { OrderTeam } from '@/types'
import { formatCountdown } from '@/utils/format'
import XrayNote from '@/xray/XrayNote.vue'

const props = defineProps<{ team: OrderTeam; productId?: string }>()

const now = useNow()
const remaining = computed(() => props.team.validEndTime - now.value)
// 到期后即使接口还没刷新，也按已结束展示
const state = computed(() => (props.team.state === 'open' && remaining.value <= 0 ? 'failed' : props.team.state))
const left = computed(() => Math.max(0, props.team.targetCount - props.team.completeCount))
const empty = computed(() => Math.max(0, props.team.targetCount - props.team.members.length))
</script>

<template>
  <div class="panel" :class="`state-${state}`">
    <p class="headline">
      <template v-if="state === 'done'">
        <strong>已成团</strong>，{{ team.targetCount }} 人全部付款
        <XrayNote
          label="成团回调"
          text="最后一人结算后，拼团服务在同一事务里写入回调任务并立即通知商城，商城把队伍里的订单改为拼团成功；回调失败由定时任务在分布式锁保护下重试。"
        />
      </template>
      <template v-else-if="state === 'failed'">
        <strong>拼团已结束</strong>，到期未凑齐 {{ team.targetCount }} 人，已付款的会自动原路退款
        <XrayNote
          label="自动退款"
          text="商城定时任务每 20 秒扫描，发现队伍过了截止时间还没凑齐，就调用拼团退单（退单责任链 + Paid2RefundStrategy），再向支付宝原路退款。"
        />
      </template>
      <template v-else>
        <strong>拼团中</strong>，已付款 {{ team.completeCount }}/{{ team.targetCount }}，还差
        <strong class="num">{{ left }}</strong> 人 · 剩余
        <time class="num countdown" :datetime="new Date(team.validEndTime).toISOString()">{{
          formatCountdown(remaining)
        }}</time>
        <XrayNote
          label="等待成团"
          text="付款后商城调用拼团结算：结算责任链校验渠道、交易单号和付款时间（必须早于截止时间），通过后完成人数加一；满员时触发成团回调。"
        />
      </template>
    </p>

    <ul class="members" :aria-label="`队伍成员 ${team.members.length}/${team.targetCount}`">
      <li
        v-for="(m, i) in team.members"
        :key="i"
        class="member"
        :class="{ me: m.isMe, unpaid: !m.paid }"
      >
        <span class="dot" aria-hidden="true">{{ m.isMe ? '我' : m.label.slice(0, 1).toUpperCase() }}</span>
        <span class="who">
          {{ m.isMe ? '我' : m.label }}
          <em v-if="m.isLeader" class="tag">团长</em>
        </span>
        <span class="paid">{{ m.paid ? '已付款' : '待付款' }}</span>
      </li>
      <li v-for="i in state === 'open' ? empty : 0" :key="`e${i}`" class="member vacant">
        <span class="dot" aria-hidden="true">?</span>
        <span class="who">虚位以待</span>
      </li>
    </ul>

    <p class="foot">
      <span class="num">队伍号 {{ team.teamId }}</span>
      <RouterLink v-if="state === 'open' && productId" :to="`/products/${productId}`" class="link">
        去商品页邀请好友参团
      </RouterLink>
    </p>
  </div>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--violet-mist);
}

.state-done {
  background: var(--ok-bg);
}

.state-failed {
  background: var(--plinth);
}

.headline {
  font-size: var(--t-sm);
}

.headline strong {
  color: var(--violet);
}

.state-done .headline strong {
  color: var(--ok);
}

.state-failed .headline strong {
  color: var(--graphite);
}

.countdown {
  font-weight: 700;
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.member {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  align-items: center;
  padding: 6px 12px 6px 6px;
  border-radius: 999px;
  background: var(--card);
  font-size: var(--t-xs);
}

.dot {
  grid-row: 1 / 3;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--violet);
  color: #fff;
  font-weight: 700;
}

.me .dot {
  background: var(--ink);
}

.unpaid .dot {
  background: var(--card);
  color: var(--violet);
  border: 2px solid var(--violet);
}

.vacant {
  background: transparent;
  border: 1.5px dashed var(--graphite);
  color: var(--graphite);
}

.vacant .dot {
  grid-row: auto;
  background: transparent;
  color: var(--graphite);
}

.vacant {
  grid-template-rows: auto;
}

.who {
  font-weight: 700;
}

.tag {
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--violet);
  color: #fff;
  font-style: normal;
  font-size: 11px;
}

.paid {
  color: var(--graphite);
}

.unpaid .paid {
  color: var(--warn);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 16px;
  font-size: var(--t-xs);
  color: var(--graphite);
}

.link {
  color: var(--violet);
  font-weight: 700;
}
</style>
