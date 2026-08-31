# upload-server 部署指南（阿里云 VPS / Ubuntu 22.04）

## 一、准备环境（在 VPS 上执行）

用 SSH 登录你的阿里云 VPS，然后执行以下命令安装 Node.js 20：

```bash
# 更新软件源
sudo apt update

# 安装 Node.js 20（LTS）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x
```

> 如果已经安装了 Node.js 18+，可以跳过这一步。

---

## 二、上传代码到 VPS

**方式 A：用 scp 命令（推荐，最简单）**

在**你的本地电脑**上打开终端（PowerShell / Git Bash / CMD），执行：

```bash
# 先进入项目目录
cd C:\Users\Administrator\Downloads\kimiOKC\app

# 把 upload-server 目录传到 VPS 的 /root/upload-server
# 注意：把 你的VPSIP 替换成实际 IP，root 替换成实际用户名
scp -r upload-server root@你的VPSIP:/root/upload-server
```

然后输入 VPS 密码即可上传。

**方式 B：用宝塔面板**

如果你安装了宝塔：
1. 登录宝塔面板 → 文件
2. 进入 `/root` 目录
3. 点击"上传" → 选择本地 `upload-server` 文件夹（先压缩成 zip 上传，再解压）

**方式 C：用 Git**

如果你把整个项目推到了 git 仓库，在 VPS 上直接 clone：

```bash
cd /root
git clone <你的仓库地址> my-app
cp -r my-app/upload-server ./upload-server
```

---

## 三、启动服务

在 **VPS 上**执行：

```bash
cd /root/upload-server
npm install

# 临时启动（前台运行，按 Ctrl+C 停止）
PUBLIC_URL=http://你的VPS公网IP:3001 node server.js
```

看到 `[UploadServer] 运行中: http://0.0.0.0:3001` 即表示启动成功。

**测试上传：**

在本地电脑的浏览器访问：
```
http://你的VPS公网IP:3001/ping
```
如果返回 `{"ok":true}`，说明服务正常。

---

## 四、开放防火墙端口

**阿里云安全组（必须做）：**
1. 登录阿里云控制台 → ECS → 安全组
2. 找到你的实例对应的安全组，点击"配置规则"
3. 入方向 → 手动添加：
   - 协议类型：自定义 TCP
   - 端口范围：`3001`
   - 授权对象：`0.0.0.0/0`
   - 描述：upload-server

**VPS 自带防火墙（ufw，可选）：**

```bash
sudo ufw allow 3001/tcp
sudo ufw reload
```

---

## 五、配置 systemd 开机自启（推荐）

前台运行关闭 SSH 后服务会停止，建议配置 systemd：

```bash
# 创建服务文件
sudo tee /etc/systemd/system/upload-server.service > /dev/null <<'EOF'
[Unit]
Description=Upload Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/upload-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment="PUBLIC_URL=http://你的VPS公网IP:3001"
Environment="PORT=3001"

[Install]
WantedBy=multi-user.target
EOF

# 重载配置并启动
sudo systemctl daemon-reload
sudo systemctl enable upload-server
sudo systemctl start upload-server

# 查看状态
sudo systemctl status upload-server
```

**常用命令：**

```bash
sudo systemctl start upload-server    # 启动
sudo systemctl stop upload-server     # 停止
sudo systemctl restart upload-server  # 重启
sudo systemctl status upload-server   # 查看状态
```

---

## 六、在本地项目配置地址

1. 启动本地项目（`npm run dev`）
2. 打开浏览器 → 设置页面
3. 在"文件上传服务器地址"填入：
   ```
   http://你的VPS公网IP:3001
   ```
4. 保存设置
5. 进入题库页面 → 点击"文档识别" → 上传文件测试

---

## 常见问题

**Q: 上传后返回的 URL 是 `http://0.0.0.0:3001/...` 或内网 IP？**

A: 必须设置 `PUBLIC_URL` 环境变量为 VPS 的公网 IP，例如：
```bash
PUBLIC_URL=http://123.45.67.89:3001 node server.js
```

**Q: 提示 "不支持的文件类型"？**

A: 目前支持 `.pdf` `.doc` `.docx` `.txt` `.md` `.png` `.jpg` `.jpeg` `.gif` `.webp` `.bmp`，其他类型会被拒绝。如需扩展，修改 `server.js` 中的 `ALLOWED_EXTS`。

**Q: 文件上传到 VPS 后占满磁盘？**

A: `upload-server` 没有自动清理逻辑，建议定期手动清理 `/root/upload-server/uploads/` 目录，或配置 crontab 定时删除旧文件。

**Q: 没有域名，只能用 IP，会不会不安全？**

A: 这个服务只提供文件上传和静态下载，没有敏感操作。如需更安全，可以：
- 在阿里云安全组限制端口 3001 只允许你的本地 IP 访问
- 或配置 Nginx 反向代理 + Basic Auth
