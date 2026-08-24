<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { get } from '../api';

const route = useRoute();
const user = ref<{ name?: string } | null>(null);
onMounted(async () => {
  user.value = await get<{ name: string }>(`/api/users/${route.params.id}`);
});
</script>

<template><main><h1>User {{ route.params.id }}</h1><p>{{ user?.name ?? 'loading' }}</p></main></template>
