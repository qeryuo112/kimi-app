# 部署指南

> 本文档描述实际生产环境的部署流程（阿里云 VPS + PM2）。

---

## 一、服务器环境

| 项目 | 实际配置 |
|------|---------|
| 服务器 | 阿里云 ECS |
| IP | `47.103.72.72` |
| OS | Ubuntu 22.04 |
| Node.js | v22.22.3 |
| 进程管理 | PM2 |
| 数据库 | MySQL 8.0 |
| 项目路径 | `/opt/kimiokc` |
| 上传服务路径 | `/root/upload-server` |

---

## 二、首次部署

### 1. 上传代码到服务器

```bash
# 把整个项目传到 VPS
scp -r . root@47.103.72.72:/opt/kimiokc
```

### 2. 安装依赖并构建

在服务器上执行：

```bash
cd /opt/kimiokc
npm ci
npm run build
```

### 3. 配置环境变量

```bash
cp .env.example .env
vim .env
```

必填项：

```env
APP_SECRET=随机生成的强密码（用于JWT签名和AI API fallback key）
DATABASE_URL=mysql://username:password@host:3306/kimiokc
AI_API_BASE_URL=https://api.openai.com
OWNER_UNION_ID=（可选）管理员Union ID
```

### 4. 数据库迁移

```bash
cd /opt/kimiokc
npm run db:migrate
```

### 5. 用 PM2 启动服务

```bash
cd /opt/kimiokc
pm2 start dist/boot.js --name kimiokc
pm2 save
pm2 startup
```

### 6. 配置 Nginx 反向代理（推荐）

```nginx
server {
    listen 80;
    server_name 47.103.72.72;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 三、日常更新（本地构建 → 上传 → 重启）

> 这是目前实际使用的更新流程。修改代码后在**本地**构建，只把产物上传到服务器。

### 1. 本地构建

```bash
npm run build
```

产物：
- `dist/boot.js` —— 后端服务（包含所有 API 路由和 AI 逻辑）
- `dist/public/` —— 前端静态文件

### 2. 上传到服务器

```bash
# 上传后端产物
scp -i ~/.ssh/ab12.pem dist/boot.js root@47.103.72.72:/opt/kimiokc/dist/boot.js

# 如果前端也有修改，一并上传
scp -i ~/.ssh/ab12.pem -r dist/public/* root@47.103.72.72:/opt/kimiokc/dist/public/
```

### 3. 重启服务

```bash
ssh -i ~/.ssh/ab12.pem root@47.103.72.72 "pm2 restart kimiokc"
```

### 4. 查看状态

```bash
ssh -i ~/.ssh/ab12.pem root@47.103.72.72 "pm2 status && pm2 logs kimiokc --lines 20"
```

---

## 四、文件上传服务（upload-server）

upload-server 是独立部署的文件上传服务，端口 `3001`。

### 首次部署

参考 `upload-server/DEPLOY.md`，使用 systemd 管理：

```bash
sudo systemctl start upload-server
sudo systemctl enable upload-server
```

### 更新

```bash
scp -r upload-server root@47.103.72.72:/root/upload-server
ssh root@47.103.72.72 "sudo systemctl restart upload-server"
```

---

## 五、常用运维命令

```bash
# 查看服务状态
pm2 status
pm2 logs kimiokc

# 重启
pm2 restart kimiokc

# 停止
pm2 stop kimiokc

# 数据库迁移
npm run db:migrate

# 数据库生成迁移文件
npm run db:generate
```

---

## 六、环境变量说明

| 变量名 | 说明 | 获取方式 |
|--------|------|---------|
| `APP_SECRET` | JWT 签名密钥 / AI API fallback key | 自行生成随机字符串 |
| `DATABASE_URL` | MySQL 连接字符串 | 本地或远程 MySQL |
| `AI_API_BASE_URL` | 全局默认 AI API base URL | 如 `https://api.openai.com` |
| `OWNER_UNION_ID` | 管理员 Union ID | （可选） |

---

## 七、注意事项

1. **源码与产物分离**：服务器上的 `api/lib/ai.ts` 等源码只是备份，生产环境实际运行的是 `dist/boot.js`。本地构建后只需上传 `dist/boot.js` 即可。
2. **PM2 配置**：`ecosystem.config.cjs` 在 `/opt/kimiokc/` 下，如需修改启动参数请编辑该文件后 `pm2 restart`。
3. **上传服务独立**：`upload-server` 使用 systemd 管理，与主服务分离，更新时互不影响。
