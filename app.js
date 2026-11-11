require("dotenv").config();
const express = require("express");
const path = require("path");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/rooms");

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "요청한 API가 없습니다." });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // 잘못된 JSON 본문 등 express가 붙인 4xx 상태는 그대로 돌려준다.
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: "잘못된 요청입니다." });
  }
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

module.exports = app;
