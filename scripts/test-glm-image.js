/**
 * 测试 GLM API 的 image_url 格式兼容性
 */

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

// 用 fetch 测试 GLM API（Node.js 18+ 原生支持）
async function testGlmImageUrl(imageUrl) {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    console.error("请先设置 GLM_API_KEY 环境变量");
    return;
  }

  const body = {
    model: "glm-4.6v",
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
    const res = await fetch(GLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (res.ok) {
      console.log("✅ GLM 解析成功");
      console.log("回复:", data.choices?.[0]?.message?.content?.slice(0, 100));
    } else {
      console.log("❌ GLM 错误:", res.status, JSON.stringify(data.error));
    }
  } catch (err) {
    console.error("请求异常:", err.message);
  }
}

// 测试不同的图片格式
async function main() {
  const apiKey = process.argv[2];
  if (!apiKey) {
    console.log("用法: node test-glm-image.js <GLM_API_KEY> [imageUrl]");
    process.exit(1);
  }
  process.env.GLM_API_KEY = apiKey;

  const testUrls = process.argv[3]
    ? [process.argv[3]]
    : [
        // 公网测试图片
        "https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png",
      ];

  for (const url of testUrls) {
    console.log(`\n--- 测试: ${url} ---`);
    await testGlmImageUrl(url);
  }
}

main();
