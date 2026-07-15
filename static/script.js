const chatWindow = document.getElementById("chat-window");
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");

let sessionId = localStorage.getItem("partiful_session_id");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("partiful_session_id", sessionId);
}

function appendMessage(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

appendMessage("Hi! I understand you'd like help with your Partiful account. What's going on?", "agent");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  appendMessage(text, "user");
  input.value = "";

  const typing = appendMessage("...", "agent typing");

  try {
    const res = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, message: text }),
    });
    const data = await res.json();
    typing.remove();
    if (data.reply) {
      appendMessage(data.reply, "agent");
    } else {
      appendMessage("Sorry, something went wrong. Please try again.", "agent");
    }
  } catch (err) {
    typing.remove();
    appendMessage("Sorry, something went wrong. Please try again.", "agent");
  }
});
