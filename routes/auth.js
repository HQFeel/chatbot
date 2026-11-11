const express = require("express");
const pool = require("../db");
const {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  requireUser,
} = require("../lib/auth");

const router = express.Router();

const LOGIN_ID_RE = /^[A-Za-z0-9_]{4,30}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 100;
const MAX_NICKNAME = 30;

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/signup", async (req, res, next) => {
  const loginId = str(req.body.loginId);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const nickname = str(req.body.nickname);

  if (!LOGIN_ID_RE.test(loginId)) {
    return res.status(400).json({ error: "아이디는 영문, 숫자, _ 로 4~30자여야 합니다." });
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return res.status(400).json({ error: `비밀번호는 ${MIN_PASSWORD}~${MAX_PASSWORD}자여야 합니다.` });
  }
  if (!nickname || nickname.length > MAX_NICKNAME) {
    return res.status(400).json({ error: `닉네임은 1~${MAX_NICKNAME}자로 입력해 주세요.` });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.query(
      "INSERT INTO `USER` (LOGIN_ID, PASSWORD_HASH, NICKNAME) VALUES (?, ?, ?)",
      [loginId, passwordHash, nickname]
    );
    const user = { userNo: Number(result.insertId), loginId, nickname };
    setSessionCookie(res, user.userNo);
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "이미 사용 중인 아이디입니다." });
    }
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  const loginId = str(req.body.loginId);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  try {
    const [rows] = await pool.query(
      "SELECT USER_NO, LOGIN_ID, NICKNAME, PASSWORD_HASH FROM `USER` WHERE LOGIN_ID = ?",
      [loginId]
    );
    const row = rows[0];
    if (!row || !(await verifyPassword(password, row.PASSWORD_HASH))) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    const user = { userNo: Number(row.USER_NO), loginId: row.LOGIN_ID, nickname: row.NICKNAME };
    setSessionCookie(res, user.userNo);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
