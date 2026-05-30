# 部署指南

## 推荐方案：Render + PlanetScale（完全免费）

### 1. 准备数据库（PlanetScale - 免费 MySQL）

1. 访问 https://planetscale.com 注册账号
2. 点击 "New Database" → 选择免费版
3. 创建后进入数据库 → "Connect" → 选择 "Connect with: `@planetscale/database`" 或一般 MySQL
4. 复制连接字符串（格式：`mysql://username:password@host.com/dbname`）
5. 保存好这个字符串，后面需要填入 `DATABASE_URL`

### 2. 部署到 Render

#### 方式 A：通过 Blueprint 一键部署（推荐）

1. 将本仓库推送到 GitHub（见下方步骤）
2. 访问 https://dashboard.render.com/blueprints
3. 点击 "New Blueprint Instance"
4. 连接你的 GitHub 仓库
5. Render 会自动读取 `render.yaml` 创建服务
6. 在服务设置中填入环境变量（见下方）
7. 点击部署

#### 方式 B：手动创建 Web Service

1. 访问 https://dashboard.render.com/ → "New +" → "Web Service"
2. 连接 GitHub 仓库
3. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm run db:migrate && npm start`
   - **Plan**: Free
4. 在 "Environment" 中添加下方环境变量
5. 点击 "Create Web Service"

### 3. 环境变量配置

在 Render 的 Environment 中填入以下变量：

```env
APP_ID=你的Kimi应用ID
APP_SECRET=随机生成的强密码（用于JWT签名）
DATABASE_URL=PlanetScale提供的MySQL连接字符串
VITE_KIMI_AUTH_URL=https://auth.kimi.com
VITE_APP_ID=你的Kimi应用ID
KIMI_AUTH_URL=https://auth.kimi.com
KIMI_OPEN_URL=https://open.kimi.com
OWNER_UNION_ID=你的Kimi Union ID
```

### 4. Kimi OAuth 回调地址配置

部署成功后，Render 会给你一个域名（如 `https://my-app.onrender.com`）。

前往 Kimi 开放平台（https://open.kimi.com），在你的应用设置中添加 OAuth 回调地址：

```
https://my-app.onrender.com/api/oauth/callback
```

### 5. 推送代码到 GitHub

```bash
git remote add origin https://github.com/你的用户名/仓库名.git
git branch -M main
git push -u origin main
```

---

## 备选方案：Railway（一体化部署）

如果你不想分开管理数据库和服务器：

1. 访问 https://railway.app
2. 从 GitHub 部署本仓库
3. 添加 MySQL 插件（Railway 内一键添加）
4. 配置环境变量
5. 自动生成域名，直接访问

Railway 提供 $5/月免费额度，小项目通常够用。

---

## 环境变量说明

| 变量名 | 说明 | 获取方式 |
|--------|------|---------|
| `APP_ID` | Kimi 应用 ID | Kimi 开放平台 |
| `APP_SECRET` | JWT 签名密钥 | 自行生成随机字符串 |
| `DATABASE_URL` | MySQL 连接字符串 | PlanetScale 或 Railway |
| `VITE_KIMI_AUTH_URL` | 前端 OAuth 地址 | 固定为 `https://auth.kimi.com` |
| `VITE_APP_ID` | 前端使用的 App ID | 同 `APP_ID` |
| `KIMI_AUTH_URL` | 后端 OAuth 地址 | 固定为 `https://auth.kimi.com` |
| `KIMI_OPEN_URL` | Kimi 开放平台地址 | 固定为 `https://open.kimi.com` |
| `OWNER_UNION_ID` | 管理员 Union ID | Kimi 账号的 Union ID |
