import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: process.env.APP_ID ?? "",
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  aiApiBaseUrl: process.env.AI_API_BASE_URL ?? "",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  mcpApiKey: process.env.MCP_API_KEY ?? "",
  mcpUserId: Number(process.env.MCP_USER_ID) || 1,
};
