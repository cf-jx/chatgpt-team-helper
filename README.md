# ChatGPT Team Helper

一个简洁的 GPT Team 账号管理平台，专注于账号管理与状态监控。使用 Vue 3、Node.js、shadcn-vue 和 SQLite 构建。

## 功能特性

### 账号管理
- Team 账号全生命周期管理（创建、编辑、删除、封号）
- 账号用户数、邀请数实时同步（通过 OpenAI API）
- 账号到期管理与状态监控
- Token 有效性检测与自动刷新
- 批量账号状态检查

### 权限管理（RBAC）
- 用户登录认证（JWT）
- 角色管理（超级管理员 / 自定义角色）
- 菜单权限动态分配
- 邮箱域名白名单控制

### 系统运维
- 邮件告警（SMTP）
- Cloudflare Turnstile 人机验证
- 数据统计与监控

## 技术栈

### 前端
- Vue 3 + TypeScript + Vite
- Vue Router + Pinia
- shadcn-vue UI 组件
- Tailwind CSS v3
- Axios

### 后端
- Node.js + Express
- SQLite (sql.js)
- JWT 认证
- Nginx 反向代理（Docker 部署）
- Supervisor 进程管理（Docker 部署）

## 部署

### Docker Compose 部署（推荐）

#### 1. 克隆仓库

```bash
git clone https://github.com/cf-jx/chatgpt-team-helper.git
cd chatgpt-team-helper
```

#### 2. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`，至少配置以下必填项：

```env
# 必须设置为强随机字符串，否则后端拒绝启动
JWT_SECRET=你的随机密钥

# 管理员初始密码（可选，不设则首次启动随机生成并输出到日志）
INIT_ADMIN_PASSWORD=你的初始密码

# 如前后端分离部署，配置允许的前端域名
CORS_ORIGINS=https://你的域名
```

#### 3. 启动服务

```bash
docker compose up -d
```

#### 4. 访问应用

浏览器打开 `http://你的服务器IP:5173`

#### 5. 登录

- 用户名：`admin`
- 密码：`INIT_ADMIN_PASSWORD` 环境变量值，或查看容器日志获取随机密码：
  ```bash
  docker compose logs app | grep -i password
  ```

#### 数据持久化

`docker-compose.yml` 默认将数据库目录挂载到宿主机：

| 容器路径 | 宿主机路径 | 说明 |
| --- | --- | --- |
| `/app/backend/db` | `./data` | SQLite 数据库文件 |

#### 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看实时日志
docker compose logs -f app

# 重启服务
docker compose restart app

# 停止服务
docker compose down

# 重新构建并启动（代码更新后）
docker compose up -d --build
```

### 本地开发

#### 1. 安装依赖

```bash
npm install
```

#### 2. 启动开发服务器

终端 1 - 启动后端：
```bash
cd backend
npm run dev
```

终端 2 - 启动前端：
```bash
cd frontend
npm run dev
```

#### 3. 访问应用

- 前端：http://localhost:5173
- 后端 API：http://localhost:3000

## 可选功能配置

### 邮件服务（SMTP）

用于发送系统通知、告警邮件等。

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@example.com
ADMIN_ALERT_EMAIL=admin@example.com
```

### Cloudflare Turnstile 人机验证

```env
TURNSTILE_SITE_KEY=your-site-key
TURNSTILE_SECRET_KEY=your-secret-key
TURNSTILE_TIMEOUT_MS=5000
```

### 代理配置

用于 OpenAI API 调用等场景。

```env
# 代理地址（支持 http/https/socks5/socks5h）
CHATGPT_PROXY_URL=socks5h://127.0.0.1:1080
```

## 数据库

SQLite 数据库文件：`backend/db/database.sqlite`

重置数据库：
```bash
rm backend/db/database.sqlite
# 重启后端服务会自动重建数据库
```

## 项目结构

```
.
├── frontend/              # Vue 3 前端应用
│   ├── src/
│   │   ├── components/ui/ # shadcn-vue 组件
│   │   ├── views/         # 页面视图
│   │   ├── router/        # 路由配置
│   │   ├── services/      # API 服务
│   │   └── lib/           # 工具函数与菜单配置
│   └── package.json
├── backend/               # Node.js 后端应用
│   ├── src/
│   │   ├── database/      # 数据库初始化
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务服务
│   │   ├── middleware/    # 认证与权限中间件
│   │   └── server.js      # 服务器入口
│   └── package.json
├── Dockerfile             # 多阶段构建
├── docker-compose.yml     # 容器编排
├── nginx.conf             # Nginx 配置
├── supervisord.conf       # 进程管理配置
└── package.json           # 根配置（workspaces）
```

## 故障排除

### Docker 部署问题

**容器启动失败：**
```bash
docker compose logs app
```

**数据库权限问题：**
```bash
chmod 777 ./data
docker compose restart app
```

### 本地开发端口占用

```bash
# 后端（3000）
lsof -ti:3000 | xargs kill -9

# 前端（5173）
lsof -ti:5173 | xargs kill -9
```

## License

ISC
