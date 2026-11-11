// .env(또는 dotenv_config_path로 지정한 파일)의 DB에 접속해 버전과 테이블 목록을 출력한다.
require("dotenv").config();
const pool = require("../db");

async function main() {
  const [[{ version }]] = await pool.query("SELECT VERSION() AS version");
  const [tables] = await pool.query("SHOW TABLES");
  console.log(`접속 성공: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  console.log(`버전: ${version}`);
  console.log(`테이블: ${tables.map((row) => Object.values(row)[0]).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
