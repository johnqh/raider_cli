<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { get } from '../api';

const stats = ref<Record<string, unknown> | null>(null);
onMounted(async () => {
  stats.value = await get<Record<string, unknown>>('/api/stats');
});
</script>

<template><main><h1>Stats</h1><pre>{{ JSON.stringify(stats, null, 2) }}</pre></main></template>
