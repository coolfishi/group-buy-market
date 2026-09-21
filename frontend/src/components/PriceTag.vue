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
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}
.yen {
  font-size: 0.6em;
  margin-right: 0.08em;
  font-weight: 600;
}
.sm {
  font-size: var(--t-md);
}
.md {
  font-size: var(--t-xl);
}
.lg {
  font-size: clamp(2.5rem, 5vw, 3.5rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.violet {
  color: var(--violet);
}
.muted {
  color: var(--graphite);
  font-weight: 500;
}
.strike {
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
</style>
