<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { authService, userService, adminService, versionService } from '@/services/api'
import type { VersionInfo, LatestVersionInfo } from '@/services/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eye, EyeOff, Sparkles, KeyRound, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-vue-next'

const teleportReady = ref(false)

// 版本检查相关
const versionLoading = ref(false)
const versionDialogOpen = ref(false)
const currentVersion = ref<VersionInfo | null>(null)
const latestVersion = ref<LatestVersionInfo | null>(null)
const versionError = ref('')

const hasNewVersion = computed(() => {
  if (!currentVersion.value || !latestVersion.value) return false
  return currentVersion.value.version !== latestVersion.value.version
})

const checkForUpdates = async () => {
  versionLoading.value = true
  versionError.value = ''
  currentVersion.value = null
  latestVersion.value = null

  try {
    const [current, latest] = await Promise.all([
      versionService.getVersion(),
      versionService.getLatest().catch(err => {
        if (err.response?.status === 404) {
          return null
        }
        throw err
      })
    ])
    currentVersion.value = current
    latestVersion.value = latest
    versionDialogOpen.value = true
  } catch (err: any) {
    versionError.value = err.response?.data?.error || '检查更新失败'
    versionDialogOpen.value = true
  } finally {
    versionLoading.value = false
  }
}

// API密钥相关
const apiKey = ref('')
const apiKeyError = ref('')
const apiKeySuccess = ref('')
const apiKeyLoading = ref(false)
const showApiKey = ref(false)

const isSuperAdmin = computed(() => {
  const user = authService.getCurrentUser()
  return Array.isArray(user?.roles) && user.roles.includes('super_admin')
})

// SMTP 邮件告警配置（仅超级管理员）
const smtpHost = ref('')
const smtpPort = ref('465')
const smtpSecure = ref<'true' | 'false'>('true')
const smtpUser = ref('')
const smtpPass = ref('')
const smtpPassSet = ref(false)
const smtpPassStored = ref(false)
const smtpFrom = ref('')
const adminAlertEmail = ref('')
const smtpError = ref('')
const smtpSuccess = ref('')
const smtpLoading = ref(false)
const showSmtpPass = ref(false)

// Cloudflare Turnstile 配置（仅超级管理员）
const turnstileSiteKey = ref('')
const turnstileSecretKey = ref('')
const turnstileEnabled = ref(false)
const turnstileSecretSet = ref(false)
const turnstileSecretStored = ref(false)
const turnstileSiteKeyStored = ref(false)
const turnstileError = ref('')
const turnstileSuccess = ref('')
const turnstileLoading = ref(false)
const showTurnstileSecretKey = ref(false)

onMounted(async () => {
  await nextTick()
  teleportReady.value = !!document.getElementById('header-actions')

  if (!isSuperAdmin.value) return
  await loadApiKey()
  await Promise.all([
    loadSmtpSettings(),
    loadTurnstileSettings(),
  ])
})

onUnmounted(() => {
  teleportReady.value = false
})

const loadApiKey = async () => {
  try {
    const response = await userService.getApiKey()
    apiKey.value = typeof response.apiKey === 'string' ? response.apiKey : ''
  } catch (err: any) {
    console.error('Load API key error:', err)
  }
}

const handleUpdateApiKey = async () => {
  apiKeyError.value = ''
  apiKeySuccess.value = ''

  if (!apiKey.value) {
    apiKeyError.value = '请输入API密钥'
    return
  }

  if (apiKey.value.length < 16) {
    apiKeyError.value = 'API密钥至少需要 16 个字符以确保安全性'
    return
  }

  apiKeyLoading.value = true

  try {
    await userService.updateApiKey(apiKey.value)
    apiKeySuccess.value = 'API密钥更新成功！请在油猴脚本中使用新密钥'

    setTimeout(() => {
      apiKeySuccess.value = ''
    }, 5000)
  } catch (err: any) {
    apiKeyError.value = err.response?.data?.error || '更新API密钥失败，请重试'
  } finally {
    apiKeyLoading.value = false
  }
}

const generateApiKey = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const length = 32
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  apiKey.value = result
  showApiKey.value = true
  apiKeySuccess.value = '✅ 已生成随机密钥，点击"更新 API 密钥"保存'
}

const toggleShowApiKey = () => {
  showApiKey.value = !showApiKey.value
}

const toggleShowSmtpPass = () => {
  showSmtpPass.value = !showSmtpPass.value
}

const toggleShowTurnstileSecretKey = () => {
  showTurnstileSecretKey.value = !showTurnstileSecretKey.value
}

const loadSmtpSettings = async () => {
  smtpError.value = ''
  smtpSuccess.value = ''
  try {
    const response = await adminService.getSettings()
    smtpHost.value = response.smtp?.host || ''
    smtpPort.value = String(response.smtp?.port ?? 465)
    smtpSecure.value = response.smtp?.secure ? 'true' : 'false'
    smtpUser.value = response.smtp?.user || ''
    smtpFrom.value = response.smtp?.from || ''
    adminAlertEmail.value = response.adminAlertEmail || ''
    smtpPass.value = ''
    smtpPassSet.value = Boolean(response.smtp?.passSet)
    smtpPassStored.value = Boolean(response.smtp?.passStored)
  } catch (err: any) {
    smtpError.value = err.response?.data?.error || '加载 SMTP 配置失败'
  }
}

const saveSmtpSettings = async () => {
  smtpError.value = ''
  smtpSuccess.value = ''

  const host = smtpHost.value.trim()
  const port = Number.parseInt(smtpPort.value.trim(), 10)
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    smtpError.value = '请输入有效的 SMTP 端口（1-65535）'
    return
  }

  const secure = smtpSecure.value === 'true'
  const user = smtpUser.value.trim()
  const from = smtpFrom.value.trim()
  const recipients = adminAlertEmail.value.trim()

  const passTrimmed = smtpPass.value.trim()

  smtpLoading.value = true
  try {
    const payload: any = {
      smtp: {
        host,
        port,
        secure,
        user,
        from,
      },
      adminAlertEmail: recipients,
    }
    if (passTrimmed) {
      payload.smtp.pass = passTrimmed
    }

    const response = await adminService.updateSmtpSettings(payload)
    smtpHost.value = response.smtp?.host || host
    smtpPort.value = String(response.smtp?.port ?? port)
    smtpSecure.value = response.smtp?.secure ? 'true' : 'false'
    smtpUser.value = response.smtp?.user || user
    smtpFrom.value = response.smtp?.from || from
    adminAlertEmail.value = response.adminAlertEmail || recipients
    smtpPass.value = ''
    smtpPassSet.value = Boolean(response.smtp?.passSet)
    smtpPassStored.value = Boolean(response.smtp?.passStored)
    smtpSuccess.value = '已保存'
    setTimeout(() => (smtpSuccess.value = ''), 3000)
  } catch (err: any) {
    smtpError.value = err.response?.data?.error || '保存失败'
  } finally {
    smtpLoading.value = false
  }
}

const loadTurnstileSettings = async () => {
  turnstileError.value = ''
  turnstileSuccess.value = ''
  try {
    const response = await adminService.getSettings()
    turnstileSiteKey.value = response.turnstile?.siteKey || ''
    turnstileSecretKey.value = ''
    turnstileEnabled.value = Boolean(response.turnstileEnabled)
    turnstileSecretSet.value = Boolean(response.turnstile?.secretSet)
    turnstileSecretStored.value = Boolean(response.turnstile?.secretStored)
    turnstileSiteKeyStored.value = Boolean(response.turnstile?.siteKeyStored)
  } catch (err: any) {
    turnstileError.value = err.response?.data?.error || '加载 Turnstile 配置失败'
  }
}

const saveTurnstileSettings = async () => {
  turnstileError.value = ''
  turnstileSuccess.value = ''

  const siteKey = turnstileSiteKey.value.trim()
  const secretTrimmed = turnstileSecretKey.value.trim()

  turnstileLoading.value = true
  try {
    const payload: any = { turnstile: { siteKey } }
    if (secretTrimmed) {
      payload.turnstile.secretKey = secretTrimmed
    }

    const response = await adminService.updateTurnstileSettings(payload)
    turnstileSiteKey.value = response.turnstile?.siteKey || siteKey
    turnstileSecretKey.value = ''
    turnstileEnabled.value = Boolean(response.turnstileEnabled)
    turnstileSecretSet.value = Boolean(response.turnstile?.secretSet)
    turnstileSecretStored.value = Boolean(response.turnstile?.secretStored)
    turnstileSiteKeyStored.value = Boolean(response.turnstile?.siteKeyStored)

    turnstileSuccess.value = '已保存'
    setTimeout(() => (turnstileSuccess.value = ''), 3000)
  } catch (err: any) {
    turnstileError.value = err.response?.data?.error || '保存失败'
  } finally {
    turnstileLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <!-- Header Actions -->
    <Teleport v-if="teleportReady && isSuperAdmin" to="#header-actions">
      <Button
        variant="outline"
        :disabled="versionLoading"
        class="h-10 px-4 border-gray-200 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 rounded-xl transition-all"
        @click="checkForUpdates"
      >
        <RefreshCw v-if="versionLoading" class="w-4 h-4 mr-2 animate-spin" />
        <RefreshCw v-else class="w-4 h-4 mr-2" />
        检查更新
      </Button>
    </Teleport>

    <!-- 版本检查对话框 -->
    <Dialog v-model:open="versionDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="text-xl font-bold text-gray-900">版本信息</DialogTitle>
          <DialogDescription class="text-gray-500">
            查看当前版本和最新版本信息
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <div v-if="versionError" class="rounded-xl bg-red-50 p-4 text-red-600 border border-red-100 text-sm font-medium">
            {{ versionError }}
          </div>

          <template v-else>
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <div class="space-y-1">
                <p class="text-sm text-gray-500">当前版本</p>
                <p class="font-mono font-semibold text-gray-900">{{ currentVersion?.version || '-' }}</p>
              </div>
            </div>

            <div class="flex items-center justify-between p-4 rounded-2xl border" :class="hasNewVersion ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'">
              <div class="space-y-1">
                <p class="text-sm" :class="hasNewVersion ? 'text-green-600' : 'text-gray-500'">最新版本</p>
                <p class="font-mono font-semibold" :class="hasNewVersion ? 'text-green-700' : 'text-gray-900'">
                  {{ latestVersion?.version || '尚未发布' }}
                </p>
                <p v-if="latestVersion?.publishedAt" class="text-xs text-gray-400">
                  发布于 {{ new Date(latestVersion.publishedAt).toLocaleDateString('zh-CN') }}
                </p>
              </div>
              <div v-if="hasNewVersion" class="flex items-center gap-2">
                <span class="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">有新版本</span>
              </div>
            </div>

            <div v-if="hasNewVersion && latestVersion?.htmlUrl" class="pt-2">
              <a
                :href="latestVersion.htmlUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center justify-center w-full h-11 px-4 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
              >
                前往 GitHub 查看新版本
              </a>
            </div>

            <div v-else-if="!hasNewVersion && currentVersion" class="text-center text-sm text-gray-500 py-2">
              已是最新版本
            </div>
          </template>
        </div>
      </DialogContent>
    </Dialog>

    <div class="grid gap-8 lg:grid-cols-2">
      <!-- 非超级管理员提示 -->
      <Card
        v-if="!isSuperAdmin"
        class="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col lg:col-span-2"
      >
        <CardHeader class="border-b border-gray-50 bg-gray-50/30 px-6 py-5 sm:px-8 sm:py-6">
          <CardTitle class="text-xl font-bold text-gray-900">系统设置</CardTitle>
          <CardDescription class="text-gray-500">仅超级管理员可查看与修改系统级配置。</CardDescription>
        </CardHeader>
      </Card>

      <!-- API密钥管理 -->
      <Card
        v-if="isSuperAdmin"
        class="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col"
      >
        <CardHeader class="border-b border-gray-50 bg-gray-50/30 px-6 py-5 sm:px-8 sm:py-6">
          <div class="flex items-center gap-3 mb-1">
            <div class="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
              <KeyRound class="w-5 h-5" />
            </div>
            <CardTitle class="text-xl font-bold text-gray-900">API 密钥</CardTitle>
          </div>
          <CardDescription class="text-gray-500 pl-[52px]">用于外部调用API接口。</CardDescription>
        </CardHeader>
        <CardContent class="p-6 sm:p-8 space-y-6 flex-1">
          <form @submit.prevent="handleUpdateApiKey" class="space-y-5">
            <div class="space-y-2">
              <Label for="apiKey" class="text-xs font-semibold text-gray-500 uppercase tracking-wider">API 密钥</Label>
              <div class="flex flex-col sm:flex-row gap-3">
                <div class="relative w-full sm:flex-1">
                  <Input
                    id="apiKey"
                    v-model="apiKey"
                    :type="showApiKey ? 'text' : 'password'"
                    placeholder="至少 16 个字符"
                    required
                    class="h-11 pr-10 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-100 focus:border-purple-500 transition-all font-mono text-sm"
                  />
                  <button
                    type="button"
                    @click="toggleShowApiKey"
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <EyeOff v-if="showApiKey" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4" />
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  @click="generateApiKey"
                  class="w-full sm:w-auto h-11 px-4 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 rounded-xl transition-all"
                >
                  <Sparkles class="h-4 w-4 mr-2" />
                  生成
                </Button>
              </div>
              <p class="text-xs text-gray-400">建议使用 32 位随机字符。</p>
            </div>

            <div v-if="apiKeyError" class="rounded-xl bg-red-50 p-4 flex items-center gap-3 text-red-600 border border-red-100">
              <AlertCircle class="w-5 h-5 flex-shrink-0" />
              <span class="text-sm font-medium">{{ apiKeyError }}</span>
            </div>

            <div v-if="apiKeySuccess" class="rounded-xl bg-green-50 p-4 flex items-center gap-3 text-green-600 border border-green-100">
              <CheckCircle2 class="w-5 h-5 flex-shrink-0" />
              <span class="text-sm font-medium">{{ apiKeySuccess }}</span>
            </div>

            <Button
              type="submit"
              :disabled="apiKeyLoading"
              class="w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200"
            >
              {{ apiKeyLoading ? '更新中...' : '更新 API 密钥' }}
            </Button>
          </form>

          <div class="rounded-2xl bg-blue-50/50 border border-blue-100 p-5 space-y-2">
            <p class="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <AlertCircle class="w-4 h-4" />
              安全提示
            </p>
            <ul class="list-disc list-inside space-y-1 text-xs text-blue-700/80 pl-1">
              <li>定期轮换密钥可提升安全性。</li>
              <li>请勿将密钥泄露给他人。</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <!-- SMTP 邮件告警配置 -->
      <Card v-if="isSuperAdmin" class="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col lg:col-span-2">
        <CardHeader class="border-b border-gray-50 bg-gray-50/30 px-6 py-5 sm:px-8 sm:py-6">
          <CardTitle class="text-xl font-bold text-gray-900">SMTP 邮件告警配置</CardTitle>
          <CardDescription class="text-gray-500">用于发送系统告警邮件（保存后实时生效）。</CardDescription>
        </CardHeader>
        <CardContent class="p-6 sm:p-8 space-y-6 flex-1">
          <div class="grid gap-4 lg:grid-cols-3">
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">SMTP Host</Label>
              <Input
                v-model="smtpHost"
                type="text"
                placeholder="smtp.example.com"
                class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
                :disabled="smtpLoading"
              />
            </div>
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">端口</Label>
              <Input
                v-model="smtpPort"
                type="text"
                placeholder="465"
                class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
                :disabled="smtpLoading"
              />
            </div>
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">安全连接</Label>
              <Select v-model="smtpSecure" :disabled="smtpLoading">
                <SelectTrigger class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all">
                  <SelectValue placeholder="选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">启用 TLS/SSL</SelectItem>
                  <SelectItem value="false">不启用 TLS/SSL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-3">
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">用户名</Label>
              <Input
                v-model="smtpUser"
                type="text"
                placeholder="bot@example.com"
                class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
                :disabled="smtpLoading"
              />
            </div>
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">密码</Label>
              <div class="relative">
                <Input
                  v-model="smtpPass"
                  :type="showSmtpPass ? 'text' : 'password'"
                  placeholder="留空表示不修改"
                  class="h-11 pr-10 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
                  :disabled="smtpLoading"
                />
                <button
                  type="button"
                  @click="toggleShowSmtpPass"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <EyeOff v-if="showSmtpPass" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
              <p class="text-xs text-gray-400">
                <template v-if="smtpPassStored">密码已入库；留空表示不修改。</template>
                <template v-else-if="smtpPassSet">当前密码未入库；保存时可自动从 .env 迁移或在此重新填写。</template>
                <template v-else>未设置密码。</template>
              </p>
            </div>
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">发件人 From</Label>
              <Input
                v-model="smtpFrom"
                type="text"
                placeholder="留空则使用 SMTP_USER"
                class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-sm"
                :disabled="smtpLoading"
              />
            </div>
          </div>

          <div class="space-y-2">
            <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">告警收件人（ADMIN_ALERT_EMAIL）</Label>
            <Input
              v-model="adminAlertEmail"
              type="text"
              placeholder="admin@example.com,ops@example.com"
              class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
              :disabled="smtpLoading"
            />
            <p class="text-xs text-gray-400">多个收件人用逗号分隔；留空则不发送系统告警邮件。</p>
          </div>

          <div v-if="smtpError" class="rounded-xl bg-red-50 p-4 text-red-600 border border-red-100 text-sm font-medium">
            {{ smtpError }}
          </div>

          <div v-if="smtpSuccess" class="rounded-xl bg-green-50 p-4 text-green-600 border border-green-100 text-sm font-medium">
            {{ smtpSuccess }}
          </div>

          <div class="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              class="w-full sm:w-auto h-11 rounded-xl"
              :disabled="smtpLoading"
              @click="loadSmtpSettings"
            >
              刷新
            </Button>
            <Button
              type="button"
              class="w-full sm:flex-1 h-11 rounded-xl bg-black hover:bg-gray-800 text-white shadow-lg shadow-black/5"
              :disabled="smtpLoading"
              @click="saveSmtpSettings"
            >
              {{ smtpLoading ? '保存中...' : '保存 SMTP 配置' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Cloudflare Turnstile 配置 -->
      <Card v-if="isSuperAdmin" class="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden flex flex-col lg:col-span-2">
        <CardHeader class="border-b border-gray-50 bg-gray-50/30 px-6 py-5 sm:px-8 sm:py-6">
          <CardTitle class="text-xl font-bold text-gray-900">Cloudflare Turnstile 配置</CardTitle>
          <CardDescription class="text-gray-500">用于人机验证（保存后实时生效）。</CardDescription>
        </CardHeader>
        <CardContent class="p-6 sm:p-8 space-y-6 flex-1">
          <div class="text-xs text-gray-500">
            当前状态：<span class="font-semibold">{{ turnstileEnabled ? '已启用' : '未启用' }}</span>
            <span class="text-gray-400">（需同时配置 Site Key + Secret Key）</span>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Site Key</Label>
              <Input
                v-model="turnstileSiteKey"
                type="text"
                placeholder="0x..."
                class="h-11 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
                :disabled="turnstileLoading"
              />
              <p class="text-xs text-gray-400">留空表示禁用人机验证。</p>
            </div>

            <div class="space-y-2">
              <Label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Secret Key</Label>
              <div class="relative">
                <Input
                  v-model="turnstileSecretKey"
                  :type="showTurnstileSecretKey ? 'text' : 'password'"
                  placeholder="留空表示不修改"
                  class="h-11 pr-10 bg-gray-50 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono text-sm"
                  :disabled="turnstileLoading"
                />
                <button
                  type="button"
                  @click="toggleShowTurnstileSecretKey"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <EyeOff v-if="showTurnstileSecretKey" class="h-4 w-4" />
                  <Eye v-else class="h-4 w-4" />
                </button>
              </div>
              <p class="text-xs text-gray-400">
                <template v-if="turnstileSecretStored">Secret Key 已入库；留空表示不修改。</template>
                <template v-else-if="turnstileSecretSet">Secret Key 未入库；保存时可从 .env 自动迁移或在此重新填写。</template>
                <template v-else>未设置 Secret Key。</template>
              </p>
            </div>
          </div>

          <div v-if="turnstileError" class="rounded-xl bg-red-50 p-4 text-red-600 border border-red-100 text-sm font-medium">
            {{ turnstileError }}
          </div>

          <div v-if="turnstileSuccess" class="rounded-xl bg-green-50 p-4 text-green-600 border border-green-100 text-sm font-medium">
            {{ turnstileSuccess }}
          </div>

          <div class="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              class="w-full sm:w-auto h-11 rounded-xl"
              :disabled="turnstileLoading"
              @click="loadTurnstileSettings"
            >
              刷新
            </Button>
            <Button
              type="button"
              class="w-full sm:flex-1 h-11 rounded-xl bg-black hover:bg-gray-800 text-white shadow-lg shadow-black/5"
              :disabled="turnstileLoading"
              @click="saveTurnstileSettings"
            >
              {{ turnstileLoading ? '保存中...' : '保存 Turnstile 配置' }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
