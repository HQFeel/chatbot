// .env의 접속 정보로 DB와 테이블을 만든다. 로컬/클라우드 DB 모두 같은 스크립트를 쓴다.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

async function main() {
  const dbName = process.env.DB_NAME || "chat";
  if (!/^\w+$/.test(dbName)) throw new Error(`잘못된 DB_NAME: ${dbName}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${dbName}\``);
    const schema = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
    await conn.query(schema);
    console.log(`DB '${dbName}' 준비 완료`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
