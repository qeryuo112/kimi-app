/**
 * 测试本地 AI 图片配置
 * 验证：1) 文件服务器是否可用  2) AI API 是否能收到图片(base64方式)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createConnection } from "mysql2/promise";

const TEST_IMAGE = path.join(process.cwd(), "temp", "test-rgb.jpg");

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testFileServer(fileServerUrl: string) {
  const uploadUrl = `${fileServerUrl.replace(/\/$/, "")}/upload`;
  console.log(`  上传端点: ${uploadUrl}`);

  const buffer = fs.readFileSync(TEST_IMAGE);
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), "test-rgb.jpg");

  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "unknown");
      console.log(`  ❌ 上传失败: ${res.status} ${text}`);
      return null;
    }
    const data = (await res.json()) as { url?: string; filename?: string };
    const filename = data.filename || data.url?.split("/").pop() || "";
    const publicUrl = `${fileServerUrl.replace(/\/$/, "")}/uploads/${filename}`;
    console.log(`  ✅ 上传成功: ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.log(`  ❌ 上传异常: ${err.message}`);
    return null;
  }
}

async function testAiWithImage(
  label: string,
  imageUrl: string,
  apiUrl: string,
  apiKey: string,
  model: string
) {
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "描述这张图片" },
        ],
      },
    ],
  };

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`  ✅ ${label} 成功`);
      console.log(
        `     回复: ${data.choices?.[0]?.message?.content?.slice(0, 80)}...`
      );
      return true;
    } else {
      console.log(`  ❌ ${label} 失败: ${res.status}`);
      console.log(`     错误: ${JSON.stringify(data.error || data)}`);
      return false;
    }
  } catch (err: any) {
    console.log(`  ❌ ${label} 异常: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("=== 本地 AI 图片配置测试 ===\n");

  // ── 1. 读取数据库配置 ──
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL 环境变量未配置，无法读取数据库");
    process.exit(1);
  }

  let conn;
  try {
    conn = await createConnection(dbUrl);
    console.log("✅ 数据库连接成功\n");
  } catch (err: any) {
    console.error("❌ 数据库连接失败:", err.message);
    process.exit(1);
  }

  const [appRows]: any = await conn.execute(
    "SELECT `key`, `value` FROM app_settings WHERE `key` IN ('fileServerUrl','aiApiBaseUrl')"
  );
  const appFileServerUrl = appRows.find((r: any) => r.key === "fileServerUrl")?.value;
  const appAiBaseUrl = appRows.find((r: any) => r.key === "aiApiBaseUrl")?.value;

  const [userRows]: any = await conn.execute(
    "SELECT aiApiKey, aiApiEndpoint, aiModel, fileServerUrl FROM user_settings LIMIT 1"
  );
  const user = userRows[0] || {};
  await conn.end();

  const fileServerUrl = (user.fileServerUrl || appFileServerUrl || "").trim();
  let apiUrl = (user.aiApiEndpoint || appAiBaseUrl || process.env.AI_API_BASE_URL || "").trim();
  const apiKey = user.aiApiKey || process.env.APP_SECRET || "";
  const model = user.aiModel || "glm-4.6v";

  // 补齐 /v1/chat/completions
  if (apiUrl && !apiUrl.includes("/chat/completions")) {
    const clean = apiUrl.replace(/\/$/, "");
    apiUrl = clean.endsWith("/v1") ? clean + "/chat/completions" : clean + "/v1/chat/completions";
  }

  console.log("📋 读取到的配置:");
  console.log(`  fileServerUrl : ${fileServerUrl || "(未配置)"}`);
  console.log(`  aiApiEndpoint : ${apiUrl || "(未配置)"}`);
  console.log(`  aiModel       : ${model}`);
  console.log(`  aiApiKey      : ${apiKey ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4) : "(未配置)"}\n`);

  if (!apiUrl || !apiKey) {
    console.error("❌ AI API 配置不完整，无法继续测试");
    process.exit(1);
  }

  // ── 2. 测试文件服务器 ──
  let publicImageUrl: string | null = null;
  if (fileServerUrl) {
    console.log("📁 测试文件上传服务器...");
    publicImageUrl = await testFileServer(fileServerUrl);
    console.log("");
  } else {
    console.log("⚠️ fileServerUrl 未配置，跳过文件上传测试\n");
  }

  // ── 3. 测试 AI 接收外部图片 URL ──
  if (publicImageUrl) {
    console.log("🤖 测试 AI 接收【外部图片 URL】...");
    await testAiWithImage("外部 URL", publicImageUrl, apiUrl, apiKey, model);
    console.log("");
    await sleep(500);
  }

  // ── 4. 测试 AI 接收 base64 图片 ──
  console.log("🤖 测试 AI 接收【base64 data URL】...");
  const buffer = fs.readFileSync(TEST_IMAGE);
  const base64 = buffer.toString("base64");
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  const base64Ok = await testAiWithImage("base64", dataUrl, apiUrl, apiKey, model);
  console.log("");

  // ── 5. 结论 ──
  console.log("=== 测试结论 ===");
  if (publicImageUrl) {
    console.log("• 文件上传服务器: 正常");
  } else {
    console.log("• 文件上传服务器: 未配置或不可用");
  }

  if (base64Ok) {
    console.log("• AI 接收图片(base64): ✅ 正常");
  } else {
    console.log("• AI 接收图片(base64): ❌ 失败，请检查 API Key 和 Endpoint");
  }

  if (publicImageUrl && base64Ok) {
    console.log("\n⚠️ 重要发现:");
    console.log("  如果【外部 URL】测试失败而【base64】成功，说明当前 AI 提供商");
    console.log("  (如 Kimi/Moonshot) 不支持通过公网 URL 访问图片。");
    console.log("  建议修改 document-processor.ts，在发送给 AI 前将图片转为 base64 data URL。");
  }
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
