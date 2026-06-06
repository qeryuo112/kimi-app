/**
 * 阿里云 OSS 上传模块（兼容 S3 协议）
 *
 * 环境变量：
 *   OSS_REGION            - 地域，如 oss-cn-hangzhou
 *   OSS_ENDPOINT          - 端点，如 https://oss-cn-hangzhou.aliyuncs.com
 *   OSS_BUCKET            - Bucket 名称
 *   OSS_ACCESS_KEY_ID     - AccessKey ID
 *   OSS_ACCESS_KEY_SECRET - AccessKey Secret
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const region = process.env.OSS_REGION || "";
const endpoint = process.env.OSS_ENDPOINT || "";
const bucket = process.env.OSS_BUCKET || "";
const accessKeyId = process.env.OSS_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.OSS_ACCESS_KEY_SECRET || "";

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    if (!region || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "OSS 配置不完整，请检查环境变量: OSS_REGION, OSS_ENDPOINT, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET"
      );
    }
    s3Client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: false,
    });
  }
  return s3Client;
}

export function isOSSConfigured(): boolean {
  return !!(bucket && accessKeyId && secretAccessKey && endpoint && region);
}

/** 上传 Buffer 到 OSS，返回公网可访问 URL */
export async function uploadBufferToOSS(
  buffer: Buffer,
  key: string,
  contentType?: string
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  // 虚拟主机风格公网 URL（region 必须是 oss-xx-xxxx 格式）
  const urlRegion = region.startsWith("oss-") ? region : `oss-${region}`;
  return `https://${bucket}.${urlRegion}.aliyuncs.com/${key}`;
}
