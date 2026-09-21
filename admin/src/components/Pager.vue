<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ change: [page: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <nav v-if="total > 0" class="pager" aria-label="分页">
    <span class="muted">共 <span class="num">{{ total }}</span> 条</span>
    <button type="button" class="btn btn-secondary" :disabled="page <= 1" @click="emit('change', page - 1)">上一页</button>
    <span class="num">{{ page }} / {{ pages }}</span>
    <button type="button" class="btn btn-secondary" :disabled="page >= pages" @click="emit('change', page + 1)">下一页</button>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
</style>
