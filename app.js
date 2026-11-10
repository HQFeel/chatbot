require("dotenv").config();
const express = require("express");
const path = require("path");
const pool = require("./db");

const app = express();

const MAX_NICKNAME = 30;
const MAX_CONTENT = 1000;
const INITIAL_LIMIT = 50;
const POLL_LIMIT = 100;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

function toMessage(row) {
  return {
    id: Number(row.id),
    nickname: row.nickname,
    content: row.content,
    createdAt: row.created_at,
  };
}

// 처음 입장 시에는 최근 메시지를, after가 있으면 그 이후 메시지만 돌려준다.
app.get("/api/messages", async (req, res) => {
  const after = Number(req.query.after);

  try {
    let rows;
    if (Number.isInteger(after) && after > 0) {
      [rows] = await pool.query(
        "SELECT id, nickname, content, created_at FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?",
        [after, POLL_LIMIT]
      );
    } else {
      [rows] = await pool.query(
        "SELECT * FROM (SELECT id, nickname, content, created_at FROM messages ORDER BY id DESC LIMIT ?) t ORDER BY id ASC",
        [INITIAL_LIMIT]
      );
    }
    res.json({ messages: rows.map(toMessage) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "메시지를 불러오지 못했습니다." });
  }
});

app.post("/api/messages", async (req, res) => {
  const nickname = typeof req.body.nickname === "string" ? req.body.nickname.trim() : "";
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!nickname || nickname.length > MAX_NICKNAME) {
    return res.status(400).json({ error: `닉네임은 1~${MAX_NICKNAME}자로 입력해 주세요.` });
  }
  if (!content || content.length > MAX_CONTENT) {
    return res.status(400).json({ error: `메시지는 1~${MAX_CONTENT}자로 입력해 주세요.` });
  }

  try {
    const [result] = await pool.query("INSERT INTO messages (nickname, content) VALUES (?, ?)", [
      nickname,
      content,
    ]);
    const [rows] = await pool.query(
      "SELECT id, nickname, content, created_at FROM messages WHERE id = ?",
      [result.insertId]
    );
    res.status(201).json({ message: toMessage(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "메시지를 저장하지 못했습니다." });
  }
});

module.exports = app;
