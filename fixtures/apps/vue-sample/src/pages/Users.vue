<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { get } from '../api';

const users = ref<Array<{ id: number; name: string }>>([]);
onMounted(async () => {
  users.value = (await get<{ users: Array<{ id: number; name: string }> }>('/api/users')).users;
});
</script>

<template><main><h1>Users</h1><ul><li v-for="u in users" :key="u.id">{{ u.name }}</li></ul></main></template>
