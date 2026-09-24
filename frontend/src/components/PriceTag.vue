<script setup lang="ts">
import { formatPrice } from '@/utils/format'

withDefaults(
  defineProps<{
    value: number
    size?: 'sm' | 'md' | 'lg'
    tone?: 'violet' | 'ink' | 'muted'
    strike?: boolean
  }>(),
  { size: 'md', tone: 'ink', strike: false },
)
</script>

<template>
  <span class="price num" :class="[size, tone, { strike }]">
    <span class="yen">¥</span>{{ formatPrice(value) }}
  </span>
</template>

<style scoped>
.price {
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
}
.yen {
  font-size: 0.55em;
  margin-right: 0.06em;
}
.sm {
  font-size: var(--t-md);
}
.md {
  font-size: var(--t-xl);
}
.lg {
  font-size: clamp(2.75rem, 5.4vw, 3.75rem);
}
.violet {
  color: var(--violet);
}
.muted {
  color: var(--graphite);
}
.strike {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
</style>
