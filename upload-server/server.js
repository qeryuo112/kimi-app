const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, "uploads");

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ========== 定时清理超过24小时的文件 ==========
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24小时
const FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;     // 文件保留24小时

function cleanupOldFiles() {
  const now = Date.now();
  let deletedCount = 0;
  let totalCount = 0;

  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    for (const filename of files) {
      const filePath = path.join(UPLOAD_DIR, filename);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        totalCount++;
        const age = now - stat.mtime.getTime();
        if (age > FILE_MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (e) {
        console.error(`[UploadServer] 清理文件失败: ${filename}`, e.message);
      }
    }
    if (deletedCount > 0) {
      console.log(`[UploadServer] 清理完成: 删除 ${deletedCount} 个过期文件 (共检查 ${totalCount} 个)`);
    } else {
      console.log(`[UploadServer] 清理检查完成: 无过期文件 (共检查 ${totalCount} 个)`);
    }
  } catch (e) {
    console.error("[UploadServer] 清理任务异常:", e.message);
  }
}

// 启动时立即执行一次清理，然后每24小时执行
setTimeout(cleanupOldFiles, 5000);
setInterval(cleanupOldFiles, CLEANUP_INTERVAL_MS);
console.log("[UploadServer] 文件清理任务已启用: 每24小时清理一次过期文件");

// 允许的扩展名
const ALLOWED_EXTS = new Set([
  ".pdf", ".doc", ".docx", ".txt", ".md", ".json",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
  ".mp4", ".mov", ".avi", ".mkv", ".webm"
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("不支持的文件类型: " + ext));
    }
  },
});

// 健康检查
app.get("/ping", (_req, res) => {
  res.json({ ok: true });
});

// 文件上传
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "没有收到文件" });
  }

  // 公网访问URL：使用服务器公网IP或域名
  // 你可以通过环境变量 PUBLIC_URL 自定义前缀
  const publicUrlBase = process.env.PUBLIC_URL || `http://${req.headers.host}`;
  const url = `${publicUrlBase}/uploads/${req.file.filename}`;

  res.json({
    url,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

// 静态文件服务（让上传的文件可被公网访问）
app.use("/uploads", express.static(UPLOAD_DIR));

// 错误处理
app.use((err, _req, res, _next) => {
  console.error("[UploadServer]", err.message);
  res.status(500).json({ error: err.message || "服务器错误" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[UploadServer] 运行中: http://0.0.0.0:${PORT}`);
  console.log(`[UploadServer] 上传目录: ${UPLOAD_DIR}`);
  console.log(`[UploadServer] 公网URL前缀: ${process.env.PUBLIC_URL || "自动检测 (请配置 PUBLIC_URL 环境变量以获得正确公网URL)"}`);
});
