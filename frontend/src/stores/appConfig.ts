import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { configService, type AppRuntimeConfig } from '@/services/api'

const DEFAULT_TIMEZONE = 'Asia/Shanghai'
const DEFAULT_LOCALE = 'zh-CN'
const FALLBACK_TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim()

export const useAppConfigStore = defineStore('app-config', () => {
  const timezone = ref<string>(DEFAULT_TIMEZONE)
  const locale = ref<string>(DEFAULT_LOCALE)
  const loaded = ref(false)
  const turnstileSiteKey = ref('')
  const turnstileEnabled = ref<boolean | null>(null)

  const resolvedTurnstileSiteKey = computed(() => (turnstileSiteKey.value || FALLBACK_TURNSTILE_SITE_KEY || '').trim())
  const resolvedTurnstileEnabled = computed(() => {
    if (!resolvedTurnstileSiteKey.value) {
      return false
    }
    if (typeof turnstileEnabled.value === 'boolean') {
      return turnstileEnabled.value
    }
    return Boolean(resolvedTurnstileSiteKey.value)
  })

  const applyConfig = (config?: Partial<AppRuntimeConfig>) => {
    if (!config) return
    if (config.timezone) {
      timezone.value = config.timezone
    }
    if (config.locale) {
      locale.value = config.locale
    }
    if ('turnstileSiteKey' in config) {
      turnstileSiteKey.value = (config.turnstileSiteKey || '').trim()
    }
    if ('turnstileEnabled' in config) {
      const value = (config.turnstileEnabled ?? null) as boolean | null
      turnstileEnabled.value = value === null ? null : Boolean(value)
    }
  }

  const loadConfig = async () => {
    if (loaded.value) return
    try {
      const runtimeConfig = await configService.getRuntimeConfig()
      applyConfig(runtimeConfig)
    } catch (error) {
      console.warn('加载系统配置失败，使用默认值', error)
    } finally {
      loaded.value = true
    }
  }

  return {
    timezone,
    locale,
    loaded,
    turnstileSiteKey,
    turnstileEnabled,
    resolvedTurnstileSiteKey,
    resolvedTurnstileEnabled,
    loadConfig
  }
})
