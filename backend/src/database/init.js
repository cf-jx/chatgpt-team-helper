import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let db = null

const LOCALTIME_MIGRATION_USER_VERSION = 1
const LOCALTIME_LIKE_PATTERN = '____-__-__ __:__:__%'

const getUserVersion = (database) => {
  try {
    const result = database.exec('PRAGMA user_version')
    const value = result[0]?.values?.[0]?.[0]
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

const setUserVersion = (database, version) => {
  if (!database) return
  const normalized = Number.isFinite(Number(version)) ? Math.max(0, Number(version)) : 0
  database.run(`PRAGMA user_version = ${normalized}`)
}

const tableExists = (database, tableName) => {
  if (!database || !tableName) return false
  const result = database.exec(
    'SELECT name FROM sqlite_master WHERE type = "table" AND name = ? LIMIT 1',
    [String(tableName)]
  )
  return Boolean(result[0]?.values?.length)
}

const getTableColumns = (database, tableName) => {
  if (!database || !tableName) return new Set()
  try {
    const result = database.exec(`PRAGMA table_info(${tableName})`)
    const rows = result[0]?.values || []
    return new Set(rows.map(row => String(row[1] || '')))
  } catch {
    return new Set()
  }
}

const ensureRbacTables = (database) => {
  let changed = false

  try {
    const indexExists = (indexName) => {
      if (!indexName) return false
      const result = database.exec(
        'SELECT name FROM sqlite_master WHERE type = "index" AND name = ? LIMIT 1',
        [String(indexName)]
      )
      return Boolean(result[0]?.values?.length)
    }

    const userColumns = getTableColumns(database, 'users')
    const addUserColumn = (name, ddl) => {
      if (userColumns.has(name)) return
      database.run(`ALTER TABLE users ADD COLUMN ${ddl}`)
      console.log(`[DB] 已添加 users.${name} 列`)
      changed = true
      userColumns.add(name)
    }

    addUserColumn('invite_code', 'invite_code TEXT')
    addUserColumn('invited_by_user_id', 'invited_by_user_id INTEGER')
    addUserColumn('points', 'points INTEGER DEFAULT 0')
    addUserColumn('invite_enabled', 'invite_enabled INTEGER DEFAULT 0')
    addUserColumn('telegram_id', 'telegram_id TEXT')

    const duplicateEmail = database.exec(`
      SELECT 1
      FROM (
        SELECT email, COUNT(*) AS cnt
        FROM users
        GROUP BY email
        HAVING cnt > 1
      )
      LIMIT 1
    `)
    if (!duplicateEmail[0]?.values?.length) {
      if (!indexExists('idx_users_email_unique')) {
        database.run('CREATE UNIQUE INDEX idx_users_email_unique ON users(email)')
        changed = true
      }
    } else {
      console.warn('[DB] users.email 存在重复值，跳过创建唯一索引 idx_users_email_unique')
    }

    if (!indexExists('idx_users_invite_code_unique')) {
      database.run('CREATE UNIQUE INDEX idx_users_invite_code_unique ON users(invite_code)')
      changed = true
    }

    const rolesExists = tableExists(database, 'roles')
    database.run(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_key TEXT UNIQUE NOT NULL,
        role_name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
        updated_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
      )
    `)
    if (!rolesExists) changed = true

    const menusExists = tableExists(database, 'menus')
    database.run(`
      CREATE TABLE IF NOT EXISTS menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        menu_key TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        path TEXT NOT NULL,
        parent_id INTEGER,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
        updated_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
      )
    `)
    if (!menusExists) changed = true

    const deletedMenuKeysExists = tableExists(database, 'deleted_menu_keys')
    database.run(`
      CREATE TABLE IF NOT EXISTS deleted_menu_keys (
        menu_key TEXT PRIMARY KEY,
        deleted_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
      )
    `)
    if (!deletedMenuKeysExists) changed = true

    const menuColumns = getTableColumns(database, 'menus')
    const addMenuColumn = (name, ddl) => {
      if (menuColumns.has(name)) return
      database.run(`ALTER TABLE menus ADD COLUMN ${ddl}`)
      console.log(`[DB] 已添加 menus.${name} 列`)
      changed = true
      menuColumns.add(name)
    }

    addMenuColumn('parent_id', 'parent_id INTEGER')
    addMenuColumn('sort_order', 'sort_order INTEGER DEFAULT 0')
    addMenuColumn('is_active', 'is_active INTEGER DEFAULT 1')

    const userRolesExists = tableExists(database, 'user_roles')
    database.run(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
        PRIMARY KEY (user_id, role_id)
      )
    `)
    if (!userRolesExists) changed = true

    const roleMenusExists = tableExists(database, 'role_menus')
    database.run(`
      CREATE TABLE IF NOT EXISTS role_menus (
        role_id INTEGER NOT NULL,
        menu_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
        PRIMARY KEY (role_id, menu_id)
      )
    `)
    if (!roleMenusExists) changed = true

    const emailCodesExists = tableExists(database, 'email_verification_codes')
    database.run(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME,
        created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
      )
    `)
    if (!emailCodesExists) changed = true

    if (!indexExists('idx_user_roles_user_id')) {
      database.run('CREATE INDEX idx_user_roles_user_id ON user_roles(user_id)')
      changed = true
    }
    if (!indexExists('idx_menus_parent_id')) {
      database.run('CREATE INDEX idx_menus_parent_id ON menus(parent_id)')
      changed = true
    }
    if (!indexExists('idx_menus_is_active')) {
      database.run('CREATE INDEX idx_menus_is_active ON menus(is_active)')
      changed = true
    }
    if (!indexExists('idx_role_menus_role_id')) {
      database.run('CREATE INDEX idx_role_menus_role_id ON role_menus(role_id)')
      changed = true
    }
    if (!indexExists('idx_email_verification_codes_lookup')) {
      database.run('CREATE INDEX idx_email_verification_codes_lookup ON email_verification_codes(email, purpose, created_at)')
      changed = true
    }

    const ensureRole = (roleKey, roleName, description = '') => {
      if (!roleKey) return null
      const existing = database.exec('SELECT id FROM roles WHERE role_key = ? LIMIT 1', [roleKey])
      if (existing[0]?.values?.length) {
        return { id: existing[0].values[0][0], created: false }
      }
      database.run(
        `
          INSERT INTO roles (role_key, role_name, description, created_at, updated_at)
          VALUES (?, ?, ?, DATETIME('now', 'localtime'), DATETIME('now', 'localtime'))
        `,
        [roleKey, roleName, description]
      )
      changed = true
      const created = database.exec('SELECT id FROM roles WHERE role_key = ? LIMIT 1', [roleKey])
      return created[0]?.values?.length ? { id: created[0].values[0][0], created: true } : null
    }

    const ensureMenu = (menuKey, label, pathValue, options = {}) => {
      if (!menuKey) return null
      const existing = database.exec('SELECT id FROM menus WHERE menu_key = ? LIMIT 1', [menuKey])
      if (existing[0]?.values?.length) {
        return { id: existing[0].values[0][0], created: false }
      }
      const deleted = database.exec('SELECT 1 FROM deleted_menu_keys WHERE menu_key = ? LIMIT 1', [menuKey])
      if (deleted[0]?.values?.length) {
        return null
      }
      const normalizeParentId = (value) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null
      }

      let parentId = normalizeParentId(options?.parentId)
      if (parentId === null && options?.parentKey) {
        const parentKey = String(options.parentKey || '').trim()
        if (parentKey) {
          const parent = database.exec('SELECT id FROM menus WHERE menu_key = ? LIMIT 1', [parentKey])
          parentId = parent[0]?.values?.length ? normalizeParentId(parent[0].values[0][0]) : null
        }
      }
      const sortOrder = Number.isFinite(Number(options?.sortOrder)) ? Number(options.sortOrder) : 0
      const isActive = Number(options?.isActive ?? 1) !== 0 ? 1 : 0
      database.run(
        `
          INSERT INTO menus (menu_key, label, path, parent_id, sort_order, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, DATETIME('now', 'localtime'), DATETIME('now', 'localtime'))
        `,
        [menuKey, label, pathValue, parentId, sortOrder, isActive]
      )
      changed = true
      const created = database.exec('SELECT id FROM menus WHERE menu_key = ? LIMIT 1', [menuKey])
      return created[0]?.values?.length ? { id: created[0].values[0][0], created: true } : null
    }

    const superAdminRole = ensureRole('super_admin', '超级管理员', '拥有全部后台权限')
    const defaultUserRole = ensureRole('user', '普通用户', '默认无后台菜单权限')
    const superAdminRoleId = superAdminRole?.id || null
    const defaultUserRoleId = defaultUserRole?.id || null

    const defaultMenus = [
      { key: 'accounts', label: '账号管理', path: '/admin/accounts', sortOrder: 1 },
      { key: 'settings', label: '系统设置', path: '/admin/settings', sortOrder: 2 },
    ]

    const menuInfosByKey = new Map()
    for (const item of defaultMenus) {
      const menuInfo = ensureMenu(item.key, item.label, item.path, {
        parentId: item.parentId ?? null,
        parentKey: item.parentKey ?? null,
        sortOrder: item.sortOrder ?? 0,
        isActive: item.isActive ?? 1,
      })
      if (menuInfo?.id) {
        menuInfosByKey.set(item.key, menuInfo)
      }
    }

    const resolveMenuIdByKey = (menuKey) => {
      const key = String(menuKey || '').trim()
      if (!key) return null
      const result = database.exec('SELECT id FROM menus WHERE menu_key = ? LIMIT 1', [key])
      const id = result[0]?.values?.length ? Number(result[0].values[0][0]) : null
      return Number.isFinite(id) && id > 0 ? id : null
    }

    const menuIdExists = (id) => {
      const parsed = Number(id)
      if (!Number.isFinite(parsed) || parsed <= 0) return false
      const result = database.exec('SELECT 1 FROM menus WHERE id = ? LIMIT 1', [parsed])
      return Boolean(result[0]?.values?.length)
    }

    const normalizeExistingParentId = (value) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }

    for (const item of defaultMenus) {
      if (!item?.key) continue
      const row = database.exec('SELECT id, parent_id FROM menus WHERE menu_key = ? LIMIT 1', [String(item.key)])
      if (!row[0]?.values?.length) continue
      const menuId = Number(row[0].values[0][0])
      if (!Number.isFinite(menuId) || menuId <= 0) continue

      const currentParentId = normalizeExistingParentId(row[0].values[0][1])
      const expectedParentId = item.parentKey ? resolveMenuIdByKey(item.parentKey) : null

      const shouldFixToExpected =
        expectedParentId !== null &&
        (currentParentId === null || !menuIdExists(currentParentId))

      const shouldFixToNull =
        expectedParentId === null &&
        currentParentId !== null &&
        !menuIdExists(currentParentId)

      if (shouldFixToExpected || shouldFixToNull) {
        database.run(
          `
            UPDATE menus
            SET parent_id = ?,
                updated_at = DATETIME('now', 'localtime')
            WHERE id = ?
          `,
          [shouldFixToExpected ? expectedParentId : null, menuId]
        )
        changed = true
      }
    }

    const grantRoleMenus = (roleId, menuIds) => {
      if (!roleId || !menuIds?.length) return
      for (const menuId of menuIds) {
        const hasMenu = database.exec(
          'SELECT 1 FROM role_menus WHERE role_id = ? AND menu_id = ? LIMIT 1',
          [roleId, menuId]
        )
        if (!hasMenu[0]?.values?.length) {
          database.run(
            'INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)',
            [roleId, menuId]
          )
          changed = true
        }
      }
    }

    const superAdminExcludedMenuKeys = new Set()
    const superAdminRoleCreated = Boolean(superAdminRole?.created)
    if (superAdminRoleId) {
      const menuIds = []
      for (const [menuKey, menuInfo] of menuInfosByKey.entries()) {
        if (superAdminExcludedMenuKeys.has(menuKey)) continue
        if (!superAdminRoleCreated && !menuInfo.created) continue
        menuIds.push(menuInfo.id)
      }

      grantRoleMenus(superAdminRoleId, menuIds)
    }

    const defaultUserMenuKeys = []
    const defaultUserRoleCreated = Boolean(defaultUserRole?.created)
    if (defaultUserRoleId) {
      const menuIds = defaultUserMenuKeys
        .map(menuKey => menuInfosByKey.get(menuKey))
        .filter(Boolean)
        .filter(menuInfo => defaultUserRoleCreated || Boolean(menuInfo.created))
        .map(menuInfo => menuInfo.id)

      grantRoleMenus(defaultUserRoleId, menuIds)
    }

    const adminUserResult = database.exec('SELECT id FROM users WHERE username = ? LIMIT 1', ['admin'])
    const adminUserId = adminUserResult[0]?.values?.length ? adminUserResult[0].values[0][0] : null
    if (adminUserId && superAdminRoleId) {
      const hasRole = database.exec(
        'SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1',
        [adminUserId, superAdminRoleId]
      )
      if (!hasRole[0]?.values?.length) {
        database.run(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
          [adminUserId, superAdminRoleId]
        )
        changed = true
      }
    }

    if (defaultUserRoleId) {
      const missingRolesResult = database.exec(`
        SELECT COUNT(*)
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
        )
      `)
      const missingRoles = Number(missingRolesResult[0]?.values?.[0]?.[0] || 0)
      if (missingRoles > 0) {
        database.run(
          `
            INSERT OR IGNORE INTO user_roles (user_id, role_id)
            SELECT u.id, ?
            FROM users u
            WHERE NOT EXISTS (
              SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
            )
          `,
          [defaultUserRoleId]
        )
        changed = true
      }
    }
  } catch (error) {
    console.warn('[DB] 无法初始化 RBAC 表结构:', error?.message || error)
  }

  return changed
}

const migrateUtcTimestampsToLocaltime = (database) => {
  if (!database) return { migrated: false, reason: 'no_db' }
  const currentVersion = getUserVersion(database)
  if (currentVersion >= LOCALTIME_MIGRATION_USER_VERSION) {
    return { migrated: false, skipped: true, version: currentVersion }
  }

  const targets = [
    { table: 'users', columns: ['created_at'] },
    { table: 'system_config', columns: ['updated_at'] },
    { table: 'gpt_accounts', columns: ['created_at', 'updated_at'] },
  ]

  const startedAt = Date.now()
  let touchedTables = 0
  let touchedColumns = 0

  database.run('BEGIN')
  try {
    for (const target of targets) {
      const table = target.table
      if (!tableExists(database, table)) {
        continue
      }

      const existingColumns = getTableColumns(database, table)
      const columns = (target.columns || []).filter(col => existingColumns.has(col))
      if (!columns.length) continue

      const setClauses = columns
        .map(col => {
          return `${col} = CASE
            WHEN ${col} IS NULL OR TRIM(${col}) = '' THEN ${col}
            WHEN ${col} LIKE '${LOCALTIME_LIKE_PATTERN}' THEN DATETIME(${col}, 'localtime')
            ELSE ${col}
          END`
        })
        .join(',\n')

      const whereClauses = columns
        .map(col => `(${col} IS NOT NULL AND TRIM(${col}) != '' AND ${col} LIKE '${LOCALTIME_LIKE_PATTERN}')`)
        .join(' OR ')

      database.run(
        `
          UPDATE ${table}
          SET ${setClauses}
          WHERE ${whereClauses}
        `
      )

      touchedTables += 1
      touchedColumns += columns.length
    }

    setUserVersion(database, LOCALTIME_MIGRATION_USER_VERSION)
    database.run('COMMIT')
    console.log('[DB] 已将历史时间从 UTC 迁移为本地时间', {
      version: LOCALTIME_MIGRATION_USER_VERSION,
      touchedTables,
      touchedColumns,
      durationMs: Date.now() - startedAt,
    })
    return { migrated: true, touchedTables, touchedColumns }
  } catch (error) {
    try {
      database.run('ROLLBACK')
    } catch {
      // ignore
    }
    console.error('[DB] 历史时间迁移失败', error?.message || error)
    return { migrated: false, error: error?.message || String(error) }
  }
}

function getDatabasePath() {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH
  }
  const dbDir = path.join(dirname(dirname(__dirname)), 'db')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'database.sqlite')
}

export async function getDatabase() {
  if (!db) {
    const SQL = await initSqlJs()

    const dbPath = getDatabasePath()
    try {
      const buffer = fs.readFileSync(dbPath)
      db = new SQL.Database(buffer)
    } catch (err) {
      db = new SQL.Database()
    }
  }
  return db
}

export async function saveDatabase() {
  const database = db || (await getDatabase())
  const data = database.export()
  const buffer = Buffer.from(data)
  const dbPath = getDatabasePath()

  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  fs.writeFileSync(dbPath, buffer)
}

export async function initDatabase() {
  const database = await getDatabase()
  const dbPath = getDatabasePath()

  const dbFileExists = fs.existsSync(dbPath)

  if (dbFileExists) {
    try {
      const usersTable = database.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="users"')
      const gptAccountsTable = database.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="gpt_accounts"')
      const systemConfigTable = database.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="system_config"')

      if (usersTable.length > 0 && gptAccountsTable.length > 0 && systemConfigTable.length > 0) {
        console.log('数据库已存在且表结构完整，跳过初始化')

        const rbacInitialized = ensureRbacTables(database)
        if (rbacInitialized) {
          saveDatabase()
        }

        try {
          const tableInfo = database.exec('PRAGMA table_info(gpt_accounts)')
          if (tableInfo.length > 0) {
            const columns = tableInfo[0].values.map(row => row[1])

            if (!columns.includes('chatgpt_account_id')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN chatgpt_account_id TEXT')
              console.log('已添加 chatgpt_account_id 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('oai_device_id')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN oai_device_id TEXT')
              console.log('已添加 oai_device_id 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('refresh_token')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN refresh_token TEXT')
              console.log('已添加 refresh_token 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('invite_count')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN invite_count INTEGER DEFAULT 0')
              console.log('已添加 invite_count 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('is_open')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN is_open INTEGER DEFAULT 0')
              console.log('已添加 is_open 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('is_demoted')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN is_demoted INTEGER DEFAULT 0')
              console.log('已添加 is_demoted 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('expire_at')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN expire_at TEXT')
              console.log('已添加 expire_at 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('is_banned')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN is_banned INTEGER DEFAULT 0')
              console.log('已添加 is_banned 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('ban_processed')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN ban_processed INTEGER DEFAULT 0')
              console.log('已添加 ban_processed 列到 gpt_accounts 表')
              saveDatabase()
            }

            if (!columns.includes('id_number')) {
              database.run('ALTER TABLE gpt_accounts ADD COLUMN id_number TEXT')
              console.log('已添加 id_number 列到 gpt_accounts 表')
              saveDatabase()
            }
          }
        } catch (err) {
          console.log('列检查/添加已跳过:', err.message)
        }

        const migration = migrateUtcTimestampsToLocaltime(database)
        if (migration.migrated) {
          await saveDatabase()
        }

        return
      }
    } catch (err) {
      console.log('检查表结构时出错，将执行完整初始化:', err.message)
    }
  }

  console.log('开始初始化数据库...')

  // Create users table
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT NOT NULL,
      telegram_id TEXT,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    )
  `)

  // Create system_config table
  database.run(`
    CREATE TABLE IF NOT EXISTS system_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      updated_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    )
  `)

  // Create gpt_accounts table
  database.run(`
    CREATE TABLE IF NOT EXISTS gpt_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      refresh_token TEXT,
      user_count INTEGER DEFAULT 0,
      invite_count INTEGER DEFAULT 0,
      chatgpt_account_id TEXT,
      oai_device_id TEXT,
      expire_at TEXT,
      is_open INTEGER DEFAULT 0,
      is_demoted INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      ban_processed INTEGER DEFAULT 0,
      id_number TEXT,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      updated_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    )
  `)

  // Check if columns exist and add them if they don't (for existing databases)
  try {
    const tableInfo = database.exec('PRAGMA table_info(gpt_accounts)')
    if (tableInfo.length > 0) {
      const columns = tableInfo[0].values.map(row => row[1])

      if (!columns.includes('chatgpt_account_id')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN chatgpt_account_id TEXT')
        console.log('已添加 chatgpt_account_id 列到 gpt_accounts 表')
      }

      if (!columns.includes('oai_device_id')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN oai_device_id TEXT')
        console.log('已添加 oai_device_id 列到 gpt_accounts 表')
      }

      if (!columns.includes('refresh_token')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN refresh_token TEXT')
        console.log('已添加 refresh_token 列到 gpt_accounts 表')
      }

      if (!columns.includes('invite_count')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN invite_count INTEGER DEFAULT 0')
        console.log('已添加 invite_count 列到 gpt_accounts 表')
      }

      if (!columns.includes('is_open')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN is_open INTEGER DEFAULT 0')
        console.log('已添加 is_open 列到 gpt_accounts 表')
      }

      if (!columns.includes('is_demoted')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN is_demoted INTEGER DEFAULT 0')
        console.log('已添加 is_demoted 列到 gpt_accounts 表')
      }

      if (!columns.includes('expire_at')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN expire_at TEXT')
        console.log('已添加 expire_at 列到 gpt_accounts 表')
      }

      if (!columns.includes('is_banned')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN is_banned INTEGER DEFAULT 0')
        console.log('已添加 is_banned 列到 gpt_accounts 表')
      }

      if (!columns.includes('ban_processed')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN ban_processed INTEGER DEFAULT 0')
        console.log('已添加 ban_processed 列到 gpt_accounts 表')
      }

      if (!columns.includes('id_number')) {
        database.run('ALTER TABLE gpt_accounts ADD COLUMN id_number TEXT')
        console.log('已添加 id_number 列到 gpt_accounts 表')
      }
    }
  } catch (err) {
    console.log('列检查/添加已跳过:', err.message)
  }

  // Check if admin user exists
  const adminUserResult = database.exec('SELECT id FROM users WHERE username = ? LIMIT 1', ['admin'])
  const adminUserExists = Boolean(adminUserResult?.[0]?.values?.length)

  if (!adminUserExists) {
    const envPassword = String(process.env.INIT_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '').trim()
    const generatedPassword = crypto.randomBytes(16).toString('hex')
    const plainPassword = envPassword || generatedPassword
    const hashedPassword = bcrypt.hashSync(plainPassword, 10)
    database.run(
      `INSERT INTO users (username, password, email, created_at) VALUES (?, ?, ?, DATETIME('now', 'localtime'))`,
      ['admin', hashedPassword, 'admin@example.com']
    )

    console.log('默认管理员用户已创建: username=admin')
    if (envPassword) {
      console.log('初始密码已从环境变量 INIT_ADMIN_PASSWORD 读取')
    } else {
      console.log('初始密码(随机生成):', plainPassword)
    }
    console.log('请尽快登录后台修改密码')
  }

  ensureRbacTables(database)

  // Initialize default API key if not exists
  const apiKeyResult = database.exec(
    'SELECT config_value FROM system_config WHERE config_key = ? LIMIT 1',
    ['auto_boarding_api_key']
  )
  const hasApiKeyRow = Boolean(apiKeyResult?.[0]?.values?.length)
  const existingApiKey = hasApiKeyRow ? String(apiKeyResult[0].values[0][0] || '').trim() : ''

  if (!existingApiKey) {
    const envApiKey = String(process.env.AUTO_BOARDING_API_KEY || '').trim()

    if (envApiKey) {
      if (envApiKey.length < 16) {
        console.warn('[SECURITY] AUTO_BOARDING_API_KEY 太短，已跳过初始化（至少 16 位）')
      } else if (hasApiKeyRow) {
        database.run(
          'UPDATE system_config SET config_value = ?, updated_at = DATETIME(\'now\', \'localtime\') WHERE config_key = ?',
          [envApiKey, 'auto_boarding_api_key']
        )
        console.log('auto_boarding_api_key 已从环境变量更新')
      } else {
        database.run(
          'INSERT INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, DATETIME(\'now\', \'localtime\'))',
          ['auto_boarding_api_key', envApiKey]
        )
        console.log('auto_boarding_api_key 已从环境变量初始化')
      }
    } else {
      console.log('未配置 auto_boarding_api_key，外部 API 默认禁用（可在后台系统设置中配置）')
    }
  }

  setUserVersion(database, LOCALTIME_MIGRATION_USER_VERSION)
  saveDatabase()
  console.log('数据库初始化成功')
}
