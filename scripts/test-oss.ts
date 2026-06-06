/**
 * 验证阿里云 OSS 上传配置
 * 用法: npx tsx scripts/test-oss.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { uploadBufferToOSS, isOSSConfigured } from "../api/lib/oss";

async function main() {
  console.log("=== OSS 上传验证 ===\n");

  if (!isOSSConfigured()) {
    console.error("❌ OSS 未配置，请检查 .env 中的 OSS_* 环境变量");
    process.exit(1);
  }

  console.log("📋 配置检查:");
  console.log(`  REGION: ${process.env.OSS_REGION}`);
  console.log(`  ENDPOINT: ${process.env.OSS_ENDPOINT}`);
  console.log(`  BUCKET: ${process.env.OSS_BUCKET}`);
  console.log(`  ACCESS_KEY_ID: ${process.env.OSS_ACCESS_KEY_ID?.slice(0, 6)}...`);

  const testImage = path.join(process.cwd(), "temp", "test-rgb.jpg");
  if (!fs.existsSync(testImage)) {
    console.error("❌ 测试图片不存在:", testImage);
    process.exit(1);
  }

  console.log("\n📁 上传测试图片到 OSS...");
  const buffer = fs.readFileSync(testImage);
  const key = `test-upload-${Date.now()}.jpg`;

  try {
    const url = await uploadBufferToOSS(buffer, key, "image/jpeg");
    console.log(`  ✅ 上传成功!`);
    console.log(`  🌐 公网 URL: ${url}`);
    console.log(`  🔗 浏览器直接打开即可查看图片`);
    console.log("\n提示: 如果 URL 打不开，请检查 Bucket 是否已设置为【公共读】权限。");
  } catch (err: any) {
    console.error(`  ❌ 上传失败: ${err.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
