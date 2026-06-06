import "dotenv/config";
import { createConnection } from "mysql2/promise";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const conn = await createConnection(dbUrl);
  await conn.execute(
    "INSERT INTO app_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
    ["fileServerUrl", "http://localhost:3001", "http://localhost:3001"]
  );
  await conn.execute(
    "UPDATE user_settings SET fileServerUrl = ? WHERE fileServerUrl IS NOT NULL",
    ["http://localhost:3001"]
  );
  console.log("✅ fileServerUrl 已更新为 http://localhost:3001");
  await conn.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
