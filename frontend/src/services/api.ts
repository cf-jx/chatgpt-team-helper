import axios from 'axios'

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  if (import.meta.env.PROD) {
    return '/api'
  }

  return 'http://localhost:3000/api'
}

export const API_URL = getApiUrl()

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})

const notifyAuthUpdated = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('auth-updated'))
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authService = {
  async login(username: string, password: string) {
    const response = await api.post('/auth/login', { username, password })
    if (response.data.token) {
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      notifyAuthUpdated()
    }
    return response.data
  },

  setCurrentUser(user: any) {
    localStorage.setItem('user', JSON.stringify(user))
    notifyAuthUpdated()
  },

  logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    notifyAuthUpdated()
  },

  getCurrentUser() {
    const userStr = localStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  },

  isAuthenticated() {
    return !!localStorage.getItem('token')
  }
}

export const userService = {
  async getMe() {
    const response = await api.get('/user/me')
    return response.data
  },

  async getApiKey() {
    const response = await api.get('/user/api-key')
    return response.data
  },

  async updateApiKey(apiKey: string) {
    const response = await api.put('/user/api-key', { apiKey })
    return response.data
  }
}

export interface GptAccount {
  id: number
  email: string
  token: string
  refreshToken?: string
  userCount: number
  inviteCount?: number
  idNumber?: string
  isOpen?: boolean
  isBanned?: boolean
  chatgptAccountId?: string
  oaiDeviceId?: string
  expireAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateGptAccountDto {
  email: string
  token: string
  refreshToken?: string
  userCount?: number
  idNumber?: string
  isBanned?: boolean
  chatgptAccountId: string
  oaiDeviceId?: string
  expireAt?: string
}

export interface ChatgptAccountCheckInfo {
  accountId: string
  name: string
  planType: string | null
  expiresAt: string | null
  hasActiveSubscription: boolean
  isDemoted: boolean
}

export interface CheckGptAccessTokenResponse {
  accounts: ChatgptAccountCheckInfo[]
}

export interface ChatgptAccountUser {
  id: string
  account_user_id?: string
  email?: string
  role?: string
  name?: string
  created_time?: string
  is_scim_managed?: boolean
}

export interface ChatgptAccountUsersResponse {
  items: ChatgptAccountUser[]
  total: number
  limit: number
  offset: number
}

export interface SyncUserCountResponse {
  message: string
  account: GptAccount
  syncedUserCount: number
  users: ChatgptAccountUsersResponse
}

export type AccountStatus = 'normal' | 'expired' | 'banned' | 'failed'

export interface CheckAccountStatusItem {
  id: number
  email: string
  createdAt: string
  expireAt?: string | null
  status: AccountStatus
  reason?: string | null
  refreshed?: boolean
}

export interface CheckAccountStatusResponse {
  message: string
  rangeDays: 7 | 15 | 30
  checkedTotal: number
  summary: {
    normal: number
    expired: number
    banned: number
    failed: number
  }
  refreshedCount: number
  items: CheckAccountStatusItem[]
  truncated: boolean
  skipped: number
}

export interface RefreshTokenResponse {
  message: string
  account: GptAccount
  accessToken: string
  idToken?: string
  refreshToken?: string
  expiresIn?: number
}

export interface AppRuntimeConfig {
  timezone: string
  locale: string
  turnstileSiteKey?: string | null
  turnstileEnabled?: boolean
}

export interface AdminSettingsResponse {
  smtp: {
    host: string
    port: number
    secure: boolean
    user: string
    from: string
    passSet: boolean
    passStored?: boolean
  }
  adminAlertEmail: string
  turnstile: {
    siteKey: string
    siteKeyStored?: boolean
    secretSet: boolean
    secretStored?: boolean
  }
  turnstileEnabled: boolean
}

export interface VersionInfo {
  version: string
}

export interface LatestVersionInfo {
  version: string
  tagName: string | null
  name: string | null
  publishedAt: string | null
  htmlUrl: string | null
  body: string | null
}

export interface GptAccountsListParams {
  page?: number
  pageSize?: number
  search?: string
  openStatus?: 'open' | 'closed'
}

export interface GptAccountsListResponse {
  accounts: GptAccount[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

export const gptAccountService = {
  async getAll(params?: GptAccountsListParams): Promise<GptAccountsListResponse> {
    const response = await api.get('/gpt-accounts', { params })
    return response.data
  },

  async getById(id: number): Promise<GptAccount> {
    const response = await api.get(`/gpt-accounts/${id}`)
    return response.data
  },

  async create(data: CreateGptAccountDto): Promise<GptAccount> {
    const response = await api.post('/gpt-accounts', data)
    return response.data.account
  },

  async update(id: number, data: CreateGptAccountDto): Promise<GptAccount> {
    const response = await api.put(`/gpt-accounts/${id}`, data)
    return response.data
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/gpt-accounts/${id}`)
  },

  async checkAccessToken(token: string): Promise<CheckGptAccessTokenResponse> {
    const response = await api.post('/gpt-accounts/check-token', { token })
    return response.data
  },

  async checkStatusRange(rangeDays: 7 | 15 | 30): Promise<CheckAccountStatusResponse> {
    const response = await api.post('/gpt-accounts/check-status', { rangeDays })
    return response.data
  },

  async syncUserCount(id: number): Promise<SyncUserCountResponse> {
    const response = await api.post(`/gpt-accounts/${id}/sync-user-count`)
    return response.data
  },

  async deleteAccountUser(accountId: number, userId: string): Promise<SyncUserCountResponse> {
    const response = await api.delete(`/gpt-accounts/${accountId}/users/${encodeURIComponent(userId)}`)
    return response.data
  },

  async refreshToken(id: number): Promise<RefreshTokenResponse> {
    const response = await api.post(`/gpt-accounts/${id}/refresh-token`)
    return response.data
  },

  async setOpen(id: number, isOpen: boolean): Promise<GptAccount> {
    const response = await api.patch(`/gpt-accounts/${id}/open`, { isOpen })
    return response.data
  },

  async ban(id: number): Promise<GptAccount> {
    const response = await api.patch(`/gpt-accounts/${id}/ban`)
    return response.data
  }
}

export const adminService = {
  async getSettings(): Promise<AdminSettingsResponse> {
    const response = await api.get('/admin/settings')
    return response.data
  },

  async updateSmtpSettings(payload: {
    smtp: { host: string; port: number; secure: boolean; user: string; pass?: string; from?: string }
    adminAlertEmail: string
  }): Promise<AdminSettingsResponse> {
    const response = await api.put('/admin/settings/smtp', payload)
    return response.data
  },

  async updateTurnstileSettings(payload: { turnstile: { siteKey: string; secretKey?: string } }): Promise<AdminSettingsResponse> {
    const response = await api.put('/admin/settings/turnstile', payload)
    return response.data
  }
}

export const configService = {
  async getRuntimeConfig(): Promise<AppRuntimeConfig> {
    const response = await api.get('/config/runtime')
    return response.data
  }
}

export const versionService = {
  async getVersion(): Promise<VersionInfo> {
    const response = await api.get('/version')
    return response.data
  },

  async getLatest(): Promise<LatestVersionInfo> {
    const response = await api.get('/version/latest')
    return response.data
  }
}

export default api
