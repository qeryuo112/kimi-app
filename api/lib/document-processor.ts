/**
 * 统一文档处理模块
 *
 * 将各种文件 URL 转换为 AI 可直接消费的 content blocks：
 * - 文本类（txt/md/json...）：下载内容 → text block
 * - PDF：PyMuPDF 转 PNG（150 DPI）→ 上传远程服务器 → image_url（带页码标注）
 * - PPT/PPTX：python-pptx 提取文本 → text block（带页码标注）
 * - 图片：image_url
 * - 视频：video_url
 *
 * 不再使用 file_url，彻底解决模型兼容性问题。
 */
import { spawn } from "child_process";
import axios from "axios";
import path from "path";
import fs from "fs";
import os from "os";
import { uploadBufferToOSS, isOSSConfigured } from "./oss";
import { isKimiModel, uploadFileToKimi } from "./kimi-files";

// ========== 类型 ==========
export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageUrlContent {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "low" | "high" | "auto";
  };
}

export interface VideoUrlContent {
  type: "video_url";
  video_url: {
    url: string;
  };
}

/** 处理后的 content blocks，不再包含 file_url */
export type ProcessedContent = TextContent | ImageUrlContent | VideoUrlContent;

// ========== 调试日志 ==========
const DEBUG_LOG_FILE = path.join(process.cwd(), "ai-debug.log");

function debugLog(label: string, data?: unknown) {
  const now = new Date().toISOString();
  const line =
    data !== undefined
      ? `[${now}] [DOC-PROCESSOR] ${label} | ${typeof data === "string" ? data : JSON.stringify(data)}`
      : `[${now}] [DOC-PROCESSOR] ${label}`;
  console.log(line);
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, line + "\n");
  } catch {
    /* ignore */
  }
}

function debugLogError(label: string, error: unknown) {
  const now = new Date().toISOString();
  const errMsg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const line = `[${now}] [DOC-PROCESSOR-ERROR] ${label}\n${errMsg}`;
  console.error(line);
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, line + "\n");
  } catch {
    /* ignore */
  }
}

// ========== 工具函数 ==========

/** 下载远程文件到 Buffer */
export async function downloadFileToBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

/** PDF 逐页转 PNG（150 DPI） */
export async function convertPdfToImages(
  pdfBuffer: Buffer,
  dpi = 150
): Promise<Array<{ pageNumber: number; pngBuffer: Buffer }>> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-convert-"));
  const inputPath = path.join(tempDir, "input.pdf");

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    const scriptPath = path.join(process.cwd(), "scripts", "pdf-to-images.py");
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const pythonPath = process.platform === "win32" ? "C:/Python314/python.exe" : "/c/Python314/python";
        const proc = spawn(pythonPath, [
          scriptPath,
          inputPath,
          tempDir,
          "--dpi",
          String(dpi),
        ]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        proc.on("close", (code) => {
          if (code !== 0)
            reject(new Error(`pdf-to-images.py 退出码 ${code}: ${stderr}`));
          else resolve({ stdout, stderr });
        });
      }
    );

    const result = JSON.parse(stdout) as {
      pages: Array<{ pageNumber: number; filename: string }>;
      dpi: number;
    };
    if ("error" in result && result.error) {
      throw new Error(String(result.error));
    }

    const pages: Array<{ pageNumber: number; pngBuffer: Buffer }> = [];
    for (const p of result.pages) {
      const pngPath = path.join(tempDir, p.filename);
      const pngBuffer = fs.readFileSync(pngPath);
      pages.push({ pageNumber: p.pageNumber, pngBuffer });
    }
    return pages;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}

/** PPTX 提取每页文本 */
export async function extractPptxText(
  pptxBuffer: Buffer
): Promise<Array<{ pageNumber: number; text: string }>> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pptx-extract-"));
  const inputPath = path.join(tempDir, "input.pptx");

  try {
    fs.writeFileSync(inputPath, pptxBuffer);

    const scriptPath = path.join(process.cwd(), "scripts", "pptx-to-text.py");
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const pythonPath = process.platform === "win32" ? "C:/Python314/python.exe" : "/c/Python314/python";
        const proc = spawn(pythonPath, [scriptPath, inputPath]);
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        proc.on("close", (code) => {
          if (code !== 0)
            reject(new Error(`pptx-to-text.py 退出码 ${code}: ${stderr}`));
          else resolve({ stdout, stderr });
        });
      }
    );

    const result = JSON.parse(stdout) as {
      slides: Array<{ pageNumber: number; text: string }>;
    };
    if ("error" in result && result.error) {
      throw new Error(String(result.error));
    }
    return result.slides || [];
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}

/** 从 URL 提取扩展名（去除查询参数） */
function getUrlExtension(url: string): string {
  return url.split("?")[0].split(".").pop()?.toLowerCase() || "";
}

/** 获取文件名（用于日志展示） */
function getUrlFileName(url: string): string {
  return url.split("?")[0].split("/").pop() || "unknown";
}

// ========== 核心入口 ==========

/**
 * 统一处理 URL 列表，转换为 AI 可直接消费的 content blocks。
 *
 * 处理规则：
 * - 图片 → image_url
 * - 视频 → video_url
 * - txt/md/json/csv 等纯文本 → 下载后直接作为 text block
 * - pdf → 转 PNG（150 DPI）→ 上传 OSS → image_url 数组（带页码标注）
 *   当使用 Kimi 模型时，PNG 上传至 Kimi 文件接口，通过 ms://{file_id} 引用
 * - ppt/pptx → 提取每页文本 → text block 数组（带页码标注）
 * - 其他 → 尝试作为文本下载，失败则报错
 *
 * @throws 当 OSS 未配置或处理失败时
 */
export async function processUrlsToContentBlocks(
  urls: string[],
  options?: {
    modelName?: string;
    apiKey?: string;
    apiBaseUrl?: string;
  }
): Promise<ProcessedContent[]> {
  const useKimi = isKimiModel(options?.modelName);
  debugLog("processUrlsToContentBlocks 开始", { urlCount: urls.length, useKimi, modelName: options?.modelName });

  if (!useKimi && !isOSSConfigured()) {
    throw new Error("处理文档需要配置阿里云 OSS，请在环境变量中配置 OSS 相关参数");
  }

  if (useKimi && !options?.apiKey) {
    throw new Error("使用 Kimi 模型处理文档需要提供 API Key");
  }

  const blocks: ProcessedContent[] = [];

  for (const url of urls) {
    // ---- data URL（plan-router 等内部生成的数据） ----
    if (url.startsWith("data:")) {
      const commaIndex = url.indexOf(",");
      if (commaIndex === -1) {
        throw new Error(`无效的 data URL: ${url.slice(0, 50)}`);
      }
      const meta = url.slice(5, commaIndex); // e.g. "application/json;base64"
      const payload = url.slice(commaIndex + 1);
      let text: string;
      if (meta.includes("base64")) {
        text = Buffer.from(payload, "base64").toString("utf-8");
      } else {
        text = decodeURIComponent(payload);
      }
      blocks.push({
        type: "text",
        text: `[数据内容]\n${text}\n[/数据内容]`,
      });
      continue;
    }

    const ext = getUrlExtension(url);
    debugLog("处理 URL", { url: url.slice(0, 100), ext });

    // ---- 图片 ----
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
    if (imageExts.includes(ext)) {
      if (useKimi) {
        try {
          const imageBuffer = await downloadFileToBuffer(url);
          const fileObj = await uploadFileToKimi(
            imageBuffer,
            getUrlFileName(url),
            "image",
            options!.apiKey!,
            options?.apiBaseUrl
          );
          blocks.push({ type: "image_url", image_url: { url: `ms://${fileObj.id}` } });
        } catch (err) {
          debugLogError(`Kimi 图片上传失败: ${url}`, err);
          throw new Error(`Kimi 图片上传失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        blocks.push({ type: "image_url", image_url: { url } });
      }
      continue;
    }

    // ---- 视频 ----
    const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
    if (videoExts.includes(ext)) {
      blocks.push({ type: "video_url", video_url: { url } });
      continue;
    }

    // ---- 纯文本 ----
    const textExts = [
      "txt",
      "md",
      "json",
      "csv",
      "js",
      "ts",
      "html",
      "xml",
      "yaml",
      "yml",
    ];
    if (textExts.includes(ext)) {
      try {
        const buffer = await downloadFileToBuffer(url);
        const text = buffer.toString("utf-8");
        blocks.push({
          type: "text",
          text: `[文件: ${getUrlFileName(url)}]\n${text}\n[/文件]`,
        });
      } catch (err) {
        debugLogError(`文本下载失败: ${url}`, err);
        throw new Error(`无法下载文本文件: ${url}`);
      }
      continue;
    }

    // ---- PDF → 图片 ----
    if (ext === "pdf") {
      try {
        const pdfBuffer = await downloadFileToBuffer(url);
        const pages = await convertPdfToImages(pdfBuffer, 150);
        debugLog("PDF 转图片完成", { pageCount: pages.length, useKimi });

        if (useKimi) {
          // Kimi 平台：上传 PNG 到 Kimi 文件接口，通过 ms:// 引用
          const uploadResults = await Promise.all(
            pages.map(async (page) => {
              const filename = `page-${page.pageNumber}.png`;
              const fileObj = await uploadFileToKimi(
                page.pngBuffer,
                filename,
                "image",
                options!.apiKey!,
                options?.apiBaseUrl
              );
              return { pageNumber: page.pageNumber, fileId: fileObj.id };
            })
          );

          blocks.push({ type: "text", text: `[PDF 文档: ${getUrlFileName(url)}，共 ${pages.length} 页]` });
          for (const r of uploadResults) {
            blocks.push({ type: "text", text: `--- 第 ${r.pageNumber} 页 ---` });
            blocks.push({
              type: "image_url",
              image_url: { url: `ms://${r.fileId}` },
            });
          }
        } else {
          // 其他平台：上传 OSS，返回公网 URL
          const uploadResults = await Promise.all(
            pages.map(async (page) => {
              const filename = `pdf-page-${Date.now()}-${page.pageNumber}.png`;
              const imageUrl = await uploadBufferToOSS(
                page.pngBuffer,
                `uploads/${filename}`
              );
              return { pageNumber: page.pageNumber, imageUrl };
            })
          );

          blocks.push({ type: "text", text: `[PDF 文档: ${getUrlFileName(url)}，共 ${pages.length} 页]` });
          for (const r of uploadResults) {
            blocks.push({ type: "text", text: `--- 第 ${r.pageNumber} 页 ---` });
            blocks.push({
              type: "image_url",
              image_url: { url: r.imageUrl },
            });
          }
        }
      } catch (err) {
        debugLogError(`PDF 处理失败: ${url}`, err);
        throw new Error(
          `PDF 处理失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      continue;
    }

    // ---- PPT/PPTX → 文本 ----
    if (ext === "pptx" || ext === "ppt") {
      try {
        const pptxBuffer = await downloadFileToBuffer(url);
        const slides = await extractPptxText(pptxBuffer);
        debugLog("PPTX 文本提取完成", { slideCount: slides.length });

        blocks.push({ type: "text", text: `[PPT 文档: ${getUrlFileName(url)}，共 ${slides.length} 页]` });
        for (const slide of slides) {
          blocks.push({
            type: "text",
            text: `--- 第 ${slide.pageNumber} 页 ---\n${slide.text || "(无文本内容)"}`,
          });
        }
      } catch (err) {
        debugLogError(`PPTX 处理失败: ${url}`, err);
        throw new Error(
          `PPTX 处理失败: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      continue;
    }

    // ---- 其他类型（doc/docx 等）：尝试作为文本下载 ----
    debugLog("未知类型，尝试文本读取", { ext, url: url.slice(0, 100) });
    try {
      const buffer = await downloadFileToBuffer(url);
      const text = buffer.toString("utf-8");
      blocks.push({
        type: "text",
        text: `[文件: ${getUrlFileName(url)}]\n${text}\n[/文件]`,
      });
    } catch (err) {
      debugLogError(`文件处理失败: ${url}`, err);
      throw new Error(
        `不支持的文件类型或处理失败: ${ext || "unknown"} (${url})`
      );
    }
  }

  debugLog("processUrlsToContentBlocks 完成", { blockCount: blocks.length });
  return blocks;
}
