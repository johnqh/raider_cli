import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Home from './pages/Home.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/users', component: () => import('./pages/Users.vue') },
    { path: '/users/:id', component: () => import('./pages/UserDetail.vue') },
    { path: '/stats', component: () => import('./pages/Stats.vue') },
  ],
});

createApp(App).use(router).mount('#app');
