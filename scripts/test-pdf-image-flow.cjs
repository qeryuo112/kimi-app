/**
 * 测试完整流程：PDF → 图片 → 上传 → GLM 解析
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FILE_SERVER_URL = "https://xutaostudy.xyz:3001";
const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const GLM_API_KEY = "7c8db5866cfe408eaf3e4be064ba0517.KIAKgU028V0eh74u"; // 从数据库读取

async function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.platform === "win32" ? "C:/Python314/python.exe" : "/c/Python314/python";
    const proc = spawn(pythonPath, [scriptPath, ...args]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`退出码 ${code}: ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function uploadBuffer(buffer, filename) {
  const uploadUrl = `${FILE_SERVER_URL}/upload`;
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), filename);

  const res = await fetch(uploadUrl, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`上传失败: ${res.status}`);
  const data = await res.json();
  console.log("上传响应:", JSON.stringify(data));
  return `${FILE_SERVER_URL}/uploads/${data.filename}`;
}

async function testGlm(imageUrl) {
  const body = {
    model: "glm-4.6v",
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: "描述这张图片的内容" },
        ],
      },
    ],
  };

  const res = await fetch(GLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GLM_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (res.ok) {
    console.log("✅ GLM 成功解析");
    console.log("回复:", data.choices?.[0]?.message?.content?.slice(0, 200));
    return true;
  } else {
    console.log("❌ GLM 错误:", res.status, JSON.stringify(data.error));
    return false;
  }
}

async function main() {
  console.log("=== 1. 生成测试 PDF ===");
  const testPdfPath = path.join(process.cwd(), "temp", "test-glm.pdf");
  fs.mkdirSync(path.dirname(testPdfPath), { recursive: true });
  await runPython(
    path.join(process.cwd(), "scripts", "pdf-to-images.py"),
    ["--create-test", testPdfPath]
  ).catch(() => {
    // 如果没有 create-test 参数，手动创建
    const { execSync } = require("child_process");
    try {
      execSync("C:/Python314/python.exe -c \"import fitz; doc=fitz.open(); p=doc.new_page(); p.insert_text((100,100),'Test Page'); doc.save('" + testPdfPath + "'); doc.close()\"");
    } catch(e) {
      console.log("用现有测试PDF:", "temp/test-input.pdf");
    }
  });

  const pdfPath = fs.existsSync(testPdfPath) ? testPdfPath : path.join(process.cwd(), "temp", "test-input.pdf");
  console.log("PDF 路径:", pdfPath);

  console.log("\n=== 2. PDF 转图片 ===");
  const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "pdf-test-"));
  const result = await runPython(
    path.join(process.cwd(), "scripts", "pdf-to-images.py"),
    [pdfPath, tempDir, "--dpi", "150"]
  );
  const pages = JSON.parse(result.stdout).pages;
  console.log("转图片完成，页数:", pages.length);

  console.log("\n=== 3. 上传第一张图片 ===");
  const pngPath = path.join(tempDir, pages[0].filename);
  const pngBuffer = fs.readFileSync(pngPath);
  const imageUrl = await uploadBuffer(pngBuffer, `test-${Date.now()}.png`);
  console.log("图片公网 URL:", imageUrl);

  console.log("\n=== 4. 用 GLM 测试图片 URL ===");
  const ok = await testGlm(imageUrl);

  // 清理
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

  if (!ok) {
    console.log("\n=== 5. 测试不同格式 ===");
    // 测试只有 image_url，没有其他 content
    const body2 = {
      model: "glm-4.6v",
      messages: [{
        role: "user",
        content: [{ type: "image_url", image_url: { url: imageUrl } }],
      }],
    };
    const res2 = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify(body2),
    });
    const data2 = await res2.json();
    if (res2.ok) {
      console.log("✅ 纯 image_url 格式成功");
    } else {
      console.log("❌ 纯 image_url 也失败:", JSON.stringify(data2.error));
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
