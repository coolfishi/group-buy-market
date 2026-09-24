<script setup lang="ts">
defineProps<{
  kind: 'loading' | 'empty' | 'error'
  title: string
  detail?: string
  actionLabel?: string
}>()
defineEmits<{ action: [] }>()
</script>

<template>
  <div class="state" :class="kind" :role="kind === 'error' ? 'alert' : 'status'">
    <span v-if="kind === 'loading'" class="spinner" aria-hidden="true" />
    <p class="title">{{ title }}</p>
    <p v-if="detail" class="detail">{{ detail }}</p>
    <button v-if="actionLabel" type="button" class="btn btn-secondary btn-small" @click="$emit('action')">
      {{ actionLabel }}
    </button>
    <slot />
  </div>
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 20px;
  text-align: center;
  border-radius: var(--r-plinth);
  background: var(--card);
  border: 2px dashed var(--line);
}

.title {
  font-family: var(--font-display);
  font-size: 1.375rem;
}

.detail {
  max-width: 36em;
  color: var(--graphite);
  font-size: var(--t-sm);
}

.error {
  background: var(--danger-bg);
  border-color: transparent;
}

.error .title {
  color: var(--danger);
}

.state .btn {
  margin-top: 6px;
}

.loading .spinner {
  width: 26px;
  height: 26px;
  color: var(--violet);
}
</style>
