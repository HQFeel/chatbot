const crypto = require("crypto");
const { promisify } = require("util");
const pool = require("../db");

const scrypt = promisify(crypto.scrypt);

const COOKIE_NAME = "chat_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET 환경변수를 32자 이상으로 설정해 주세요.");
  }
  return secret;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  const [algo, saltB64, keyB64] = String(stored).split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

function sign(data) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

// 서버리스라 세션 저장소 없이, 사용자 번호와 만료 시각을 서명한 토큰을 쿠키에 둔다.
function createToken(userNo) {
  const payload = Buffer.from(JSON.stringify({ u: userNo, exp: Date.now() + SESSION_MS })).toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Number.isInteger(data.u) || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}

function readCookie(header, name) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function setSessionCookie(res, userNo) {
  res.cookie(COOKIE_NAME, createToken(userNo), {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production",
    maxAge: SESSION_MS,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

async function requireUser(req, res, next) {
  try {
    const userNo = readToken(readCookie(req.headers.cookie, COOKIE_NAME));
    if (!userNo) return res.status(401).json({ error: "로그인이 필요합니다." });

    const [rows] = await pool.query(
      "SELECT USER_NO, LOGIN_ID, NICKNAME FROM `USER` WHERE USER_NO = ?",
      [userNo]
    );
    if (rows.length === 0) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "로그인이 필요합니다." });
    }

    req.user = { userNo: Number(rows[0].USER_NO), loginId: rows[0].LOGIN_ID, nickname: rows[0].NICKNAME };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  requireUser,
};
