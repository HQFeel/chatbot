const POLL_INTERVAL_MS = 2000;
const NICKNAME_KEY = "chat.nickname";

const messagesEl = document.getElementById("messages");
const statusEl = document.getElementById("status");
const nicknamePanel = document.getElementById("nickname-panel");
const nicknameForm = document.getElementById("nickname-form");
const nicknameInput = document.getElementById("nickname-input");
const changeNicknameBtn = document.getElementById("change-nickname");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const sendButton = messageForm.querySelector("button");

let nickname = "";
let lastId = 0;
let polling = false;

function loadNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) || "";
  } catch {
    return "";
  }
}

function saveNickname(value) {
  try {
    localStorage.setItem(NICKNAME_KEY, value);
  } catch {
    // 저장소를 쓸 수 없어도 이번 세션에서는 계속 사용한다.
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function renderMessage(msg) {
  const li = document.createElement("li");
  li.className = msg.nickname === nickname ? "message mine" : "message";
  li.dataset.id = msg.id;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${msg.nickname} · ${formatTime(msg.createdAt)}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = msg.content;

  li.append(meta, bubble);
  return li;
}

function appendMessages(list) {
  // 전송 응답과 폴링 결과가 겹칠 수 있어 id로 중복을 거른다.
  const fresh = list.filter((msg) => msg.id > lastId);
  if (fresh.length === 0) return;

  const nearBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;

  for (const msg of fresh) messagesEl.appendChild(renderMessage(msg));
  lastId = fresh[fresh.length - 1].id;

  if (nearBottom || fresh.some((msg) => msg.nickname === nickname)) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function fetchMessages() {
  if (polling) return;
  polling = true;
  try {
    const query = lastId > 0 ? `?after=${lastId}` : "";
    const res = await fetch(`/api/messages${query}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "메시지를 불러오지 못했습니다.");
    appendMessages(data.messages);
    setStatus("");
  } catch (err) {
    setStatus(err.message);
  } finally {
    polling = false;
  }
}

function rerenderOwnership() {
  for (const li of messagesEl.children) {
    const meta = li.querySelector(".meta").textContent;
    li.classList.toggle("mine", meta.startsWith(`${nickname} · `));
  }
}

function enterChat(value) {
  nickname = value;
  saveNickname(value);
  nicknamePanel.hidden = true;
  changeNicknameBtn.hidden = false;
  changeNicknameBtn.textContent = `${value} (변경)`;
  messageInput.disabled = false;
  sendButton.disabled = false;
  rerenderOwnership();
  messageInput.focus();
}

nicknameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = nicknameInput.value.trim();
  if (value) enterChat(value);
});

changeNicknameBtn.addEventListener("click", () => {
  nicknameInput.value = nickname;
  nicknamePanel.hidden = false;
  changeNicknameBtn.hidden = true;
  messageInput.disabled = true;
  sendButton.disabled = true;
  nicknameInput.focus();
});

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content || !nickname) return;

  sendButton.disabled = true;
  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "메시지를 보내지 못했습니다.");
    messageInput.value = "";
    // 내 메시지보다 먼저 들어온 다른 사람의 메시지를 놓치지 않도록 폴링으로 반영한다.
    await fetchMessages();
    setStatus("");
  } catch (err) {
    setStatus(err.message);
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
});

const saved = loadNickname();
if (saved) {
  nicknameInput.value = saved;
  enterChat(saved);
}

fetchMessages();
setInterval(fetchMessages, POLL_INTERVAL_MS);
