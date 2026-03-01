import { Users, Settings } from 'lucide-vue-next'

export interface AdminMenuNode {
  key: string
  label: string
  path: string
  icon: any
  children?: AdminMenuNode[]
}

const ICONS_BY_MENU_KEY: Record<string, any> = {
  accounts: Users,
  settings: Settings,
}

const FALLBACK_ADMIN_MENU_TREE: AdminMenuNode[] = [
  { key: 'accounts', path: '/admin/accounts', label: '账号管理', icon: Users },
  { key: 'settings', path: '/admin/settings', label: '系统设置', icon: Settings },
]

const withIcons = (tree: any[]): AdminMenuNode[] => {
  const normalize = (node: any): AdminMenuNode | null => {
    const key = String(node?.menuKey ?? node?.key ?? '').trim()
    if (!key) return null
    const children = Array.isArray(node?.children) ? node.children.map(normalize).filter(Boolean) : []
    return {
      key,
      label: String(node?.label ?? '').trim(),
      path: String(node?.path ?? ''),
      icon: ICONS_BY_MENU_KEY[key] || Settings,
      children: children.length ? children : undefined,
    }
  }

  return (tree || []).map(normalize).filter(Boolean) as AdminMenuNode[]
}

export const getFallbackAdminMenuTree = (_menuKeys?: string[] | null, _roleKeys?: string[] | null) => {
  return withIcons(FALLBACK_ADMIN_MENU_TREE)
}

export const normalizeAdminMenuTree = (tree: any[] | null | undefined): AdminMenuNode[] => {
  if (!Array.isArray(tree)) return []
  return withIcons(tree)
}

export const getDefaultAdminPath = () => {
  return '/admin/accounts'
}
