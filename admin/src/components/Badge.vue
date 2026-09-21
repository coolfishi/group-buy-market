<script setup lang="ts">
defineProps<{ tone: 'ok' | 'warn' | 'danger' | 'violet' | 'muted'; label: string }>()
</script>

<template>
  <span class="badge" :class="tone">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 1px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.ok {
  background: var(--ok-bg);
  color: var(--ok);
}
.warn {
  background: var(--warn-bg);
  color: var(--warn);
}
.danger {
  background: var(--danger-bg);
  color: var(--danger);
}
.violet {
  background: var(--violet-mist);
  color: var(--violet);
}
.muted {
  background: var(--plinth);
  color: var(--graphite);
}
</style>
