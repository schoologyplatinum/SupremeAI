const $ = (id) => document.getElementById(id);
const input = $("messageInput");
const messagesEl = $("messages");
const welcome = $("welcome");
const historyList = $("historyList");
const sendButton = $("sendButton");
const STORAGE_KEY = "supreme-ai-conversations-v1";

let conversations = loadConversations();
let activeId = conversations[0]?.id || null;
let busy = false;

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 30)));
  renderHistory();
}
function currentConversation() {
  return conversations.find(c => c.id === activeId);
}
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function renderMarkdown(text) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}
function renderHistory() {
  historyList.innerHTML = "";
  conversations.forEach(c => {
    const button = document.createElement("button");
    button.className = "history-item" + (c.id === activeId ? " selected" : "");
    button.textContent = c.title || "New conversation";
    button.title = button.textContent;
    button.onclick = () => openConversation(c.id);
    historyList.append(button);
  });
}
function addMessageElement(role, text, streaming = false) {
  const wrap = document.createElement("article");
  wrap.className = `message ${role === "user" ? "user" : "assistant"}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "Y" : "S";
  const body = document.createElement("div");
  body.className = "message-body";
  body.innerHTML = streaming ? '<span class="typing">•••</span>' : renderMarkdown(text);
  wrap.append(avatar, body);
  messagesEl.append(wrap);
  scrollToBottom();
  return { wrap, body };
}
function scrollToBottom() {
  const area = $("chatArea");
  area.scrollTop = area.scrollHeight;
}
function renderConversation() {
  messagesEl.innerHTML = "";
  const conversation = currentConversation();
  const hasMessages = Boolean(conversation?.messages?.length);
  welcome.hidden = hasMessages;
  if (hasMessages) {
    conversation.messages.forEach(m => {
      const el = addMessageElement(m.role, m.text);
      if (m.role === "model") addActions(el.wrap, m.text);
    });
  }
  renderHistory();
}
function addActions(wrap, text) {
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copy = document.createElement("button");
  copy.textContent = "Copy response";
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); showToast("Response copied"); }
    catch { showToast("Couldn't access clipboard"); }
  };
  actions.append(copy);
  wrap.querySelector(".message-body").append(actions);
}
function newConversation() {
  const c = { id: makeId(), title: "New conversation", messages: [] };
  conversations.unshift(c);
  activeId = c.id;
  save();
  renderConversation();
  input.focus();
}
function openConversation(id) {
  activeId = id;
  renderConversation();
  $("sidebar").classList.remove("open");
}
async function sendMessage(text) {
  text = text.trim();
  if (!text || busy) return;
  if (!currentConversation()) newConversation();
  const conversation = currentConversation();
  conversation.messages.push({ role: "user", text });
  if (conversation.messages.length === 1) conversation.title = text.slice(0, 34) + (text.length > 34 ? "…" : "");
  welcome.hidden = true;
  addMessageElement("user", text);
  input.value = "";
  resizeInput();
  updateCount();
  busy = true;
  sendButton.disabled = true;
  const assistant = addMessageElement("model", "", true);
  let answer = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversation.messages.slice(-30).map(m => ({ role: m.role, text: m.text }))
      })
    });

    if (!response.ok) {
      let message = "The server returned an error.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    if (!response.body) throw new Error("Streaming isn't supported by this browser.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const line = event.split("\n").find(l => l.startsWith("data: "));
        if (!line) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        const data = JSON.parse(payload);
        if (data.error) throw new Error(data.error);
        answer += data.text || "";
        assistant.body.innerHTML = renderMarkdown(answer);
        scrollToBottom();
      }
    }

    if (!answer.trim()) throw new Error("Gemini returned an empty response. Please try again.");
    conversation.messages.push({ role: "model", text: answer });
    addActions(assistant.wrap, answer);
    save();
  } catch (error) {
    assistant.body.textContent = error.message || "Something went wrong. Please try again.";
    assistant.body.style.color = "#ff9baf";
    showToast("Couldn't complete the request");
  } finally {
    busy = false;
    sendButton.disabled = false;
    input.focus();
    scrollToBottom();
  }
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}
function updateCount() {
  $("charCount").textContent = `${input.value.length.toLocaleString()} / 12,000`;
  sendButton.disabled = busy || !input.value.trim();
}

$("chatForm").addEventListener("submit", e => {
  e.preventDefault();
  sendMessage(input.value);
});
input.addEventListener("input", () => { resizeInput(); updateCount(); });
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!busy) sendMessage(input.value);
  }
});
$("newChat").onclick = newConversation;
$("clearHistory").onclick = () => {
  if (!conversations.length) return;
  conversations = [];
  activeId = null;
  save();
  renderConversation();
  showToast("Local conversation history cleared");
};
$("mobileMenu").onclick = () => $("sidebar").classList.toggle("open");
$("themeButton").onclick = () => document.body.classList.toggle("light");
document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

if (activeId) renderConversation();
else renderConversation();
updateCount();