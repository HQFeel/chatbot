const MESSAGE_POLL_MS = 2000;
const ROOM_POLL_MS = 5000;
const THEME_KEY = "chat.theme";
const AVATAR_COLORS = ["#9bb2c9", "#c7a594", "#9fbf95", "#b19fcf", "#d0b26f", "#8bb8b2", "#cf98a8"];

const $ = (id) => document.getElementById(id);

const authView = $("auth-view");
const authForm = $("auth-form");
const authError = $("auth-error");
const authHint = $("auth-hint");
const authSubmit = $("auth-submit");
const authSwitch = $("auth-switch");
const authSwitchText = $("auth-switch-text");

const appView = $("app-view");
const meAvatar = $("me-avatar");
const meName = $("me-name");
const meId = $("me-id");
const roomListEl = $("room-list");
const roomEmptyEl = $("room-empty");

const placeholderEl = $("room-placeholder");
const roomEl = $("room");
const roomTitleEl = $("room-title");
const roomCountEl = $("room-count");
const messagesEl = $("messages");
const messageForm = $("message-form");
const messageInput = $("message-input");
const sendButton = $("send");

const drawerEl = $("drawer");
const memberListEl = $("member-list");
const inviteForm = $("invite-form");
const inviteInput = $("invite-id");

const roomDialog = $("room-dialog");
const roomForm = $("room-form");
const roomNameInput = $("room-name");
const toastEl = $("toast");

const state = {
  user: null,
  authMode: "login",
  rooms: [],
  roomNo: null,
  lastMsgNo: 0,
  loadingRoomNo: null,
  // 메시지 묶음 판단용: 마지막으로 그린 메시지의 작성자, 분, 날짜, 시간 요소
  lastRendered: null,
  timers: [],
};

/* ───── 공통 ───── */

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));

  if (res.status === 401 && state.user) showAuth();
  if (!res.ok) throw new ApiError(res.status, data.error || "요청을 처리하지 못했습니다.");
  return data;
}

let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

function firstChar(text) {
  return Array.from(text.trim())[0] || "?";
}

function fillAvatar(el, label, seed) {
  el.textContent = firstChar(label);
  el.style.setProperty("--avatar", AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length]);
  return el;
}

function makeAvatar(label, seed, size = "") {
  const el = document.createElement("div");
  el.className = `avatar ${size}`.trim();
  el.setAttribute("aria-hidden", "true");
  return fillAvatar(el, label, seed);
}

const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
const shortDateFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });
const fullDateFmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// 목록 시간: 오늘은 시각, 어제는 "어제", 올해는 "11월 8일", 그 전은 "2025. 11. 8."
function listTime(value) {
  if (!value) return "";
  const d = new Date(value);
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return timeFmt.format(d);
  if (dayKey(d) === dayKey(yesterday)) return "어제";
  if (d.getFullYear() === now.getFullYear()) return shortDateFmt.format(d);
  return fullDateFmt.format(d);
}

/* ───── 테마 ───── */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === "dark" ? "light" : "dark";
  for (const btn of document.querySelectorAll(".theme-toggle")) {
    btn.querySelector("use").setAttribute("href", next === "light" ? "#i-sun" : "#i-moon");
    btn.setAttribute("aria-label", next === "light" ? "라이트 모드로 전환" : "다크 모드로 전환");
    btn.title = btn.getAttribute("aria-label");
  }
}

for (const btn of document.querySelectorAll(".theme-toggle")) {
  btn.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 저장하지 못해도 이번 화면에는 적용된다.
    }
  });
}

/* ───── 로그인 / 회원가입 ───── */

function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  authForm.nickname.hidden = !signup;
  authForm.nickname.required = signup;
  authHint.hidden = !signup;
  authSubmit.textContent = signup ? "가입하기" : "로그인";
  authSwitchText.textContent = signup ? "이미 계정이 있나요?" : "계정이 없나요?";
  authSwitch.textContent = signup ? "로그인" : "회원가입";
  authForm.password.autocomplete = signup ? "new-password" : "current-password";
  authError.textContent = "";
}

authSwitch.addEventListener("click", () => {
  setAuthMode(state.authMode === "login" ? "signup" : "login");
  authForm.loginId.focus();
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;

  const body = { loginId: authForm.loginId.value.trim(), password: authForm.password.value };
  if (state.authMode === "signup") body.nickname = authForm.nickname.value.trim();

  try {
    const { user } = await api(`/api/auth/${state.authMode}`, { method: "POST", body });
    authForm.reset();
    setAuthMode("login");
    showApp(user);
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    authSubmit.disabled = false;
  }
});

function showAuth() {
  state.user = null;
  for (const t of state.timers) clearInterval(t);
  state.timers = [];
  state.roomNo = null;
  if (roomDialog.open) roomDialog.close();
  appView.hidden = true;
  authView.hidden = false;
  authForm.password.value = "";
  authForm.loginId.focus();
}

function showApp(user) {
  state.user = user;
  fillAvatar(meAvatar, user.nickname, user.userNo);
  meName.textContent = user.nickname;
  meId.textContent = user.loginId;
  authView.hidden = true;
  appView.hidden = false;
  selectRoom(null);
  loadRooms();
  state.timers = [setInterval(loadMessages, MESSAGE_POLL_MS), setInterval(loadRooms, ROOM_POLL_MS)];
}

$("logout").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  showAuth();
});

/* ───── 채팅방 목록 ───── */

function renderRooms() {
  roomListEl.replaceChildren(
    ...state.rooms.map((room) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = room.roomNo === state.roomNo ? "room-item active" : "room-item";
      if (room.roomNo === state.roomNo) btn.setAttribute("aria-current", "true");

      const main = document.createElement("div");
      main.className = "room-main";

      const top = document.createElement("div");
      top.className = "room-top";
      const name = document.createElement("span");
      name.className = "room-name";
      name.textContent = room.roomName;
      const members = document.createElement("span");
      members.className = "room-members";
      members.textContent = room.memberCount;
      members.setAttribute("aria-label", `${room.memberCount}명`);
      top.append(name, members);

      const last = document.createElement("div");
      last.className = "room-last";
      last.textContent = room.lastContent ? room.lastContent.replace(/\s+/g, " ") : "아직 메시지가 없습니다.";

      main.append(top, last);

      const time = document.createElement("time");
      time.className = "room-time";
      time.textContent = listTime(room.lastAt || room.createdAt);

      btn.append(makeAvatar(room.roomName, room.roomNo), main, time);
      btn.addEventListener("click", () => selectRoom(room.roomNo));
      li.append(btn);
      return li;
    })
  );
  roomEmptyEl.hidden = state.rooms.length > 0;
}

function renderRoomHeader() {
  const room = state.rooms.find((r) => r.roomNo === state.roomNo);
  if (!room) return;
  roomTitleEl.textContent = room.roomName;
  roomCountEl.textContent = room.memberCount;
  roomCountEl.setAttribute("aria-label", `${room.memberCount}명`);
}

async function loadRooms() {
  if (!state.user) return;
  try {
    const { rooms } = await api("/api/rooms");
    state.rooms = rooms;
    if (state.roomNo && !rooms.some((r) => r.roomNo === state.roomNo)) {
      selectRoom(null);
      toast("채팅방에서 나갔습니다.");
    }
    renderRooms();
    renderRoomHeader();
  } catch (err) {
    toast(err.message);
  }
}

function openRoomDialog() {
  roomNameInput.value = "";
  roomDialog.showModal();
  roomNameInput.focus();
}

$("new-room").addEventListener("click", openRoomDialog);
$("room-empty-create").addEventListener("click", openRoomDialog);
$("room-cancel").addEventListener("click", () => roomDialog.close());

roomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const roomName = roomNameInput.value.trim();
  if (!roomName) return;

  try {
    const { room } = await api("/api/rooms", { method: "POST", body: { roomName } });
    roomDialog.close();
    await loadRooms();
    selectRoom(room.roomNo);
  } catch (err) {
    toast(err.message);
  }
});

/* ───── 채팅방 ───── */

function selectRoom(roomNo) {
  state.roomNo = roomNo;
  state.lastMsgNo = 0;
  state.lastRendered = null;
  messagesEl.replaceChildren();
  memberListEl.replaceChildren();
  setDrawer(false);

  const active = Boolean(roomNo);
  roomEl.hidden = !active;
  placeholderEl.hidden = active;
  appView.classList.toggle("room-open", active);

  renderRooms();
  if (!active) return;

  renderRoomHeader();
  messageInput.value = "";
  resizeInput();
  loadMessages();
  loadMembers();
  messageInput.focus();
}

$("back").addEventListener("click", () => selectRoom(null));

/* 서랍: 대화상대, 초대, 나가기 */

function setDrawer(open) {
  roomEl.classList.toggle("drawer-open", open);
  drawerEl.inert = !open;
  if (open) inviteInput.focus();
}

$("drawer-open").addEventListener("click", () => {
  setDrawer(true);
  loadMembers();
});
$("drawer-close").addEventListener("click", () => setDrawer(false));
$("scrim").addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && roomEl.classList.contains("drawer-open")) setDrawer(false);
});

async function loadMembers() {
  const roomNo = state.roomNo;
  if (!roomNo) return;
  try {
    const { members } = await api(`/api/rooms/${roomNo}/members`);
    if (roomNo !== state.roomNo) return;

    memberListEl.replaceChildren(
      ...members.map((m) => {
        const li = document.createElement("li");
        li.className = "member";

        const text = document.createElement("div");
        text.className = "member-text";
        const name = document.createElement("span");
        name.className = "member-name";
        name.textContent = m.nickname;
        if (m.userNo === state.user.userNo) {
          const badge = document.createElement("span");
          badge.className = "me-badge";
          badge.textContent = "나";
          name.append(badge);
        }
        const id = document.createElement("span");
        id.className = "member-id";
        id.textContent = m.loginId;
        text.append(name, id);

        li.append(makeAvatar(m.nickname, m.userNo, "avatar-sm"), text);
        return li;
      })
    );
  } catch (err) {
    toast(err.message);
  }
}

inviteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const loginId = inviteInput.value.trim();
  if (!loginId || !state.roomNo) return;

  try {
    const { member } = await api(`/api/rooms/${state.roomNo}/members`, { method: "POST", body: { loginId } });
    inviteInput.value = "";
    toast(`${member.nickname}님을 초대했습니다.`);
    loadMembers();
    loadRooms();
  } catch (err) {
    toast(err.message);
  }
});

$("leave-room").addEventListener("click", async () => {
  const room = state.rooms.find((r) => r.roomNo === state.roomNo);
  if (!room || !confirm(`'${room.roomName}' 채팅방에서 나갈까요?\n나가면 대화 목록에서 사라집니다.`)) return;

  try {
    await api(`/api/rooms/${room.roomNo}/members/me`, { method: "DELETE" });
    state.rooms = state.rooms.filter((r) => r.roomNo !== room.roomNo);
    selectRoom(null);
    loadRooms();
  } catch (err) {
    toast(err.message);
  }
});

/* ───── 메시지 ───── */

function dateSeparator(d) {
  const li = document.createElement("li");
  li.className = "date-sep";
  const pill = document.createElement("span");
  pill.innerHTML = '<svg aria-hidden="true"><use href="#i-calendar"/></svg>';
  pill.append(dateFmt.format(d));
  li.append(pill);
  return li;
}

// 같은 사람이 같은 분에 연달아 보낸 메시지는 하나로 묶는다:
// 프로필과 이름은 첫 메시지에만, 시간은 마지막 메시지에만 표시한다.
function renderMessage(msg) {
  const d = new Date(msg.createdAt);
  const dKey = dayKey(d);
  const minuteKey = `${dKey} ${d.getHours()}:${d.getMinutes()}`;
  const nodes = [];

  if (!state.lastRendered || state.lastRendered.dayKey !== dKey) {
    nodes.push(dateSeparator(d));
    state.lastRendered = { dayKey: dKey };
  }

  const prev = state.lastRendered;
  const mine = msg.userNo === state.user.userNo;
  const cont = prev.userNo === msg.userNo && prev.minuteKey === minuteKey;
  if (cont && prev.timeEl) prev.timeEl.remove();

  const li = document.createElement("li");
  li.className = `msg ${mine ? "mine" : "other"}${cont ? " cont" : ""}`;

  if (!mine) {
    if (cont) {
      const slot = document.createElement("div");
      slot.className = "avatar-slot";
      li.append(slot);
    } else {
      li.append(makeAvatar(msg.nickname, msg.userNo));
    }
  }

  const body = document.createElement("div");
  body.className = "msg-body";

  if (!mine && !cont) {
    const name = document.createElement("div");
    name.className = "msg-name";
    name.textContent = msg.nickname;
    body.append(name);
  }

  const line = document.createElement("div");
  line.className = "msg-line";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = msg.content;
  const time = document.createElement("time");
  time.dateTime = d.toISOString();
  time.textContent = timeFmt.format(d);
  line.append(bubble, time);
  body.append(line);
  li.append(body);

  nodes.push(li);
  state.lastRendered = { dayKey: dKey, minuteKey, userNo: msg.userNo, timeEl: time };
  return nodes;
}

function appendMessages(list) {
  const fresh = list.filter((msg) => msg.msgNo > state.lastMsgNo);
  if (fresh.length === 0) return;

  const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;

  for (const msg of fresh) messagesEl.append(...renderMessage(msg));
  state.lastMsgNo = fresh[fresh.length - 1].msgNo;

  if (nearBottom || fresh.some((msg) => msg.userNo === state.user.userNo)) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function loadMessages() {
  const roomNo = state.roomNo;
  // 같은 방에 대한 요청이 이미 진행 중이면 건너뛴다. 방을 옮긴 직후에는 바로 불러온다.
  if (!roomNo || state.loadingRoomNo === roomNo) return;

  state.loadingRoomNo = roomNo;
  try {
    const query = state.lastMsgNo > 0 ? `?after=${state.lastMsgNo}` : "";
    const { messages } = await api(`/api/rooms/${roomNo}/messages${query}`);
    if (roomNo !== state.roomNo) return;
    appendMessages(messages);
  } catch (err) {
    if (roomNo !== state.roomNo) return;
    if (err.status === 403) {
      selectRoom(null);
      loadRooms();
    }
    toast(err.message);
  } finally {
    if (state.loadingRoomNo === roomNo) state.loadingRoomNo = null;
  }
}

/* 입력창: Enter 전송, Shift+Enter 줄바꿈 */

function resizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  sendButton.disabled = !messageInput.value.trim();
}

messageInput.addEventListener("input", resizeInput);

messageInput.addEventListener("keydown", (e) => {
  // 한글 조합 중 Enter는 글자 확정이므로 전송하지 않는다.
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    messageForm.requestSubmit();
  }
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  const roomNo = state.roomNo;
  if (!content || !roomNo || sendButton.dataset.sending) return;

  sendButton.dataset.sending = "1";
  sendButton.disabled = true;
  try {
    await api(`/api/rooms/${roomNo}/messages`, { method: "POST", body: { content } });
    messageInput.value = "";
    resizeInput();
    await loadMessages();
    loadRooms();
  } catch (err) {
    toast(err.message);
    resizeInput();
  } finally {
    delete sendButton.dataset.sending;
    messageInput.focus();
  }
});

/* ───── 시작 ───── */

applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
setAuthMode("login");
api("/api/auth/me")
  .then(({ user }) => showApp(user))
  .catch(() => showAuth());
