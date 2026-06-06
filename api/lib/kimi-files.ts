// Kimi 文件上传与模型检测
import axios from "axios";
import FormData from "form-data";

/**
 * 检测模型名是否为 Kimi 平台模型
 */
export function isKimiModel(modelName?: string): boolean {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return lower.includes("kimi") || lower.includes("moonshot");
}

interface KimiFileObject {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: string;
}

/**
 * 上传文件到 Kimi 文件接口
 * @param buffer 文件内容
 * @param filename 文件名
 * @param purpose 文件用途: "image" | "video" | "file-extract"
 * @param apiKey Kimi API Key
 * @param baseUrl Kimi API Base URL，默认 https://api.moonshot.cn/v1
 * @returns 上传后的文件元数据
 */
export async function uploadFileToKimi(
  buffer: Buffer,
  filename: string,
  purpose: "image" | "video" | "file-extract",
  apiKey: string,
  baseUrl = "https://api.moonshot.cn/v1"
): Promise<{ id: string; bytes: number; filename: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/files`;

  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", buffer, filename);

  const response = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 60000,
  });

  const data = response.data as KimiFileObject;
  return {
    id: data.id,
    bytes: data.bytes,
    filename: data.filename,
  };
}
