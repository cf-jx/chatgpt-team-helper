import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import MainLayout from '../views/MainLayout.vue'
import AccountsView from '../views/AccountsView.vue'
import SettingsView from '../views/SettingsView.vue'
import { authService } from '@/services/api'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/admin',
      component: MainLayout,
      meta: { requiresAuth: true },
      redirect: '/admin/accounts',
      children: [
        {
          path: 'accounts',
          name: 'accounts',
          component: AccountsView,
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsView,
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const isAuthenticated = authService.isAuthenticated()

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
    return
  }

  if (to.path === '/login' && isAuthenticated) {
    next('/admin/accounts')
    return
  }

  next()
})

export default router
