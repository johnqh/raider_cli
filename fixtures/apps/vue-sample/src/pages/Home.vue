<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { get, login } from '../api';

const me = ref<{ name?: string } | null>(null);
onMounted(async () => {
  await login();
  me.value = await get<{ name: string }>('/api/me');
});
</script>

<template><main><h1>Home</h1><p>{{ me?.name ?? 'loading' }}</p></main></template>
