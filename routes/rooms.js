const express = require("express");
const pool = require("../db");
const { requireUser } = require("../lib/auth");

const router = express.Router();

const MAX_ROOM_NAME = 50;
const MAX_CONTENT = 1000;
const INITIAL_LIMIT = 50;
const POLL_LIMIT = 100;

router.use(requireUser);

function toMessage(row) {
  return {
    msgNo: Number(row.MSG_NO),
    userNo: Number(row.USER_NO),
    nickname: row.NICKNAME,
    content: row.CONTENT,
    createdAt: row.CREATED_AT,
  };
}

// 내가 참여한 방 목록. 마지막 메시지와 함께, 최근 대화가 있는 방부터 돌려준다.
// TiDB는 JOIN ON 절의 서브쿼리를 지원하지 않으므로 방별 집계를 파생 테이블로 만들어 조인한다.
router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.ROOM_NO, m.ROOM_NAME, m.CREATED_AT,
              mc.MEMBER_COUNT,
              d.CONTENT AS LAST_CONTENT, d.CREATED_AT AS LAST_AT
         FROM MESSAGE_MST m
         JOIN MESSAGE_MEMBER mm ON mm.ROOM_NO = m.ROOM_NO AND mm.USER_NO = ?
         JOIN (SELECT ROOM_NO, COUNT(*) AS MEMBER_COUNT
                 FROM MESSAGE_MEMBER
                WHERE ROOM_NO IN (SELECT ROOM_NO FROM MESSAGE_MEMBER WHERE USER_NO = ?)
                GROUP BY ROOM_NO) mc ON mc.ROOM_NO = m.ROOM_NO
         LEFT JOIN (SELECT ROOM_NO, MAX(MSG_NO) AS LAST_MSG_NO
                      FROM MESSAGE_DTL
                     WHERE ROOM_NO IN (SELECT ROOM_NO FROM MESSAGE_MEMBER WHERE USER_NO = ?)
                     GROUP BY ROOM_NO) lm ON lm.ROOM_NO = m.ROOM_NO
         LEFT JOIN MESSAGE_DTL d ON d.MSG_NO = lm.LAST_MSG_NO
        ORDER BY COALESCE(d.CREATED_AT, m.CREATED_AT) DESC, m.ROOM_NO DESC`,
      [req.user.userNo, req.user.userNo, req.user.userNo]
    );
    res.json({
      rooms: rows.map((r) => ({
        roomNo: Number(r.ROOM_NO),
        roomName: r.ROOM_NAME,
        memberCount: Number(r.MEMBER_COUNT),
        createdAt: r.CREATED_AT,
        lastContent: r.LAST_CONTENT,
        lastAt: r.LAST_AT,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 방을 만들고 만든 사람을 첫 참여자로 등록한다.
router.post("/", async (req, res, next) => {
  const roomName = typeof req.body.roomName === "string" ? req.body.roomName.trim() : "";
  if (!roomName || roomName.length > MAX_ROOM_NAME) {
    return res.status(400).json({ error: `방 이름은 1~${MAX_ROOM_NAME}자로 입력해 주세요.` });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO MESSAGE_MST (ROOM_NAME, CREATE_USER_NO) VALUES (?, ?)",
      [roomName, req.user.userNo]
    );
    await conn.query("INSERT INTO MESSAGE_MEMBER (ROOM_NO, USER_NO) VALUES (?, ?)", [
      result.insertId,
      req.user.userNo,
    ]);
    await conn.commit();
    res.status(201).json({ room: { roomNo: Number(result.insertId), roomName, memberCount: 1 } });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// 이하 /:roomNo 경로는 참여자만 접근할 수 있다.
router.use("/:roomNo", async (req, res, next) => {
  const roomNo = Number(req.params.roomNo);
  if (!Number.isInteger(roomNo) || roomNo <= 0) {
    return res.status(404).json({ error: "방을 찾을 수 없습니다." });
  }
  try {
    const [rows] = await pool.query(
      "SELECT 1 FROM MESSAGE_MEMBER WHERE ROOM_NO = ? AND USER_NO = ?",
      [roomNo, req.user.userNo]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: "참여하지 않은 방입니다." });
    }
    req.roomNo = roomNo;
    next();
  } catch (err) {
    next(err);
  }
});

router.get("/:roomNo/members", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.USER_NO, u.LOGIN_ID, u.NICKNAME
         FROM MESSAGE_MEMBER mm
         JOIN \`USER\` u ON u.USER_NO = mm.USER_NO
        WHERE mm.ROOM_NO = ?
        ORDER BY mm.JOINED_AT`,
      [req.roomNo]
    );
    res.json({
      members: rows.map((r) => ({ userNo: Number(r.USER_NO), loginId: r.LOGIN_ID, nickname: r.NICKNAME })),
    });
  } catch (err) {
    next(err);
  }
});

// 참여자는 아이디로 다른 사용자를 초대할 수 있다.
router.post("/:roomNo/members", async (req, res, next) => {
  const loginId = typeof req.body.loginId === "string" ? req.body.loginId.trim() : "";
  if (!loginId) return res.status(400).json({ error: "초대할 아이디를 입력해 주세요." });

  try {
    const [users] = await pool.query("SELECT USER_NO, NICKNAME FROM `USER` WHERE LOGIN_ID = ?", [loginId]);
    if (users.length === 0) return res.status(404).json({ error: "존재하지 않는 아이디입니다." });

    const [result] = await pool.query(
      "INSERT IGNORE INTO MESSAGE_MEMBER (ROOM_NO, USER_NO) VALUES (?, ?)",
      [req.roomNo, users[0].USER_NO]
    );
    if (result.affectedRows === 0) return res.status(409).json({ error: "이미 참여 중인 사용자입니다." });

    res.status(201).json({ member: { userNo: Number(users[0].USER_NO), loginId, nickname: users[0].NICKNAME } });
  } catch (err) {
    next(err);
  }
});

router.delete("/:roomNo/members/me", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM MESSAGE_MEMBER WHERE ROOM_NO = ? AND USER_NO = ?", [
      req.roomNo,
      req.user.userNo,
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// 처음에는 최근 메시지를, after가 있으면 그 이후 메시지만 돌려준다.
router.get("/:roomNo/messages", async (req, res, next) => {
  const after = Number(req.query.after);
  const select = `SELECT d.MSG_NO, d.USER_NO, u.NICKNAME, d.CONTENT, d.CREATED_AT
                    FROM MESSAGE_DTL d
                    JOIN \`USER\` u ON u.USER_NO = d.USER_NO
                   WHERE d.ROOM_NO = ?`;
  try {
    let rows;
    if (Number.isInteger(after) && after > 0) {
      [rows] = await pool.query(`${select} AND d.MSG_NO > ? ORDER BY d.MSG_NO ASC LIMIT ?`, [
        req.roomNo,
        after,
        POLL_LIMIT,
      ]);
    } else {
      [rows] = await pool.query(`${select} ORDER BY d.MSG_NO DESC LIMIT ?`, [req.roomNo, INITIAL_LIMIT]);
      rows.reverse();
    }
    res.json({ messages: rows.map(toMessage) });
  } catch (err) {
    next(err);
  }
});

router.post("/:roomNo/messages", async (req, res, next) => {
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > MAX_CONTENT) {
    return res.status(400).json({ error: `메시지는 1~${MAX_CONTENT}자로 입력해 주세요.` });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO MESSAGE_DTL (ROOM_NO, USER_NO, CONTENT) VALUES (?, ?, ?)",
      [req.roomNo, req.user.userNo, content]
    );
    res.status(201).json({ msgNo: Number(result.insertId) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
