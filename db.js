const mysql = require("mysql2/promise");

// 서버리스 환경에서는 인스턴스마다 모듈이 한 번만 로드되므로 풀을 재사용한다.
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "chat",
  charset: "utf8mb4",
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  // 클라우드 DB는 대부분 TLS 접속을 요구한다.
  ssl: process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
});

module.exports = pool;
