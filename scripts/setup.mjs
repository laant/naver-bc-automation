import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
if (!fs.existsSync(".env")) {
  fs.writeFileSync(
    ".env",
    'AI_PROVIDER="gemini"\nGEMINI_API_KEY=""\nOPENAI_API_KEY=""\nNAVER_BLOG_ID=""\nDATABASE_URL="file:./dev.db"\n',
    { mode: 0o600 },
  );
}
const env = { ...process.env, ...parse(fs.readFileSync(".env")) };
if (!env.DATABASE_URL?.startsWith("file:"))
  throw new Error("SQLite DATABASE_URL이 필요합니다.");
const filename = env.DATABASE_URL.slice(5);
const database = path.isAbsolute(filename)
  ? filename
  : path.resolve("prisma", filename);
fs.mkdirSync(path.dirname(database), { recursive: true });
if (!fs.existsSync(database)) fs.closeSync(fs.openSync(database, "wx", 0o600));
for (const args of [["migrate", "deploy"], ["generate"]])
  execFileSync(path.resolve("node_modules/.bin/prisma"), args, {
    stdio: "inherit",
    env,
  });
execFileSync(
  path.resolve("node_modules/.bin/playwright"),
  ["install", "chromium"],
  { stdio: "inherit", env },
);
console.log(
  "준비 완료. .env 설정 후 npm run login, npm run dev, npm run worker를 실행하세요.",
);
