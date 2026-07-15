const openBtn = document.getElementById("open-wizard-btn");
const overlay = document.getElementById("modal-overlay");
const closeBtn = document.getElementById("modal-close");
const body = document.getElementById("modal-body");
const dots = Array.from(document.querySelectorAll("#step-dots .dot"));

const STEP_ORDER = ["access", "phone", "id", "result"];
let sessionId = null;

function setActiveDot(stepName) {
  const idx = STEP_ORDER.indexOf(stepName);
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === idx);
    dot.classList.toggle("done", i < idx);
  });
}

function renderLoading(label) {
  body.innerHTML = `<div class="step-loading">${label}</div>`;
}

function renderError() {
  body.innerHTML = `
    <div class="result-card result-warning">
      <div class="result-icon">!</div>
      <div class="result-title">Something went wrong</div>
      <p class="result-message">Please close this and try again.</p>
      <button class="btn btn-primary" id="result-close">Close</button>
    </div>`;
  document.getElementById("result-close").addEventListener("click", closeModal);
}

async function send(message) {
  const res = await fetch("/api/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  if (!res.ok) throw new Error("request failed");
  return res.json();
}

function renderAccessStep(question) {
  setActiveDot("access");
  body.innerHTML = `
    <p class="step-question">${question}</p>
    <div class="step-actions">
      <button class="btn btn-outline" id="access-yes">Yes, I have it</button>
      <button class="btn btn-primary" id="access-no">No, I lost it</button>
    </div>`;
  document.getElementById("access-yes").addEventListener("click", () => handleReply("yes"));
  document.getElementById("access-no").addEventListener("click", () => handleReply("no"));
}

function formatPhoneDigits(digits) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function renderPhoneStep(question, errorText) {
  setActiveDot("phone");
  body.innerHTML = `
    ${errorText ? `<p class="step-error">${errorText}</p>` : ""}
    <p class="step-question">${question}</p>
    <input class="step-input" id="step-input" type="tel" inputmode="numeric"
           placeholder="555-123-4567" autocomplete="off" maxlength="12" />
    <p class="step-hint" id="phone-hint">Enter a 10-digit US phone number (0/10)</p>
    <div class="step-actions">
      <button class="btn btn-primary" id="step-submit" disabled>Continue</button>
    </div>`;

  const input = document.getElementById("step-input");
  const submitBtn = document.getElementById("step-submit");
  const hint = document.getElementById("phone-hint");

  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 10);
    input.value = formatPhoneDigits(digits);
    const complete = digits.length === 10;
    submitBtn.disabled = !complete;
    hint.textContent = complete
      ? "Looks good"
      : `Enter a 10-digit US phone number (${digits.length}/10)`;
    hint.classList.toggle("step-hint-complete", complete);
  });

  const submit = () => {
    const digits = input.value.replace(/\D/g, "");
    if (digits.length !== 10) return;
    handleReply(input.value, "One sec…");
  };
  submitBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !submitBtn.disabled) submit();
  });
  input.focus();
}

function renderIdUploadStep(question, errorText) {
  setActiveDot("id");
  body.innerHTML = `
    ${errorText ? `<p class="step-error">${errorText}</p>` : ""}
    <p class="step-question">${question}</p>
    <label class="file-drop" id="file-drop">
      <input type="file" id="id-file-input" accept="image/jpeg" hidden />
      <span id="file-drop-label">Choose a JPEG photo of your ID</span>
    </label>
    <div class="step-actions">
      <button class="btn btn-primary" id="step-submit" disabled>Submit for verification</button>
    </div>`;

  const fileInput = document.getElementById("id-file-input");
  const dropLabel = document.getElementById("file-drop-label");
  const submitBtn = document.getElementById("step-submit");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    dropLabel.textContent = file ? file.name : "Choose a JPEG photo of your ID";
    submitBtn.disabled = !file;
  });

  submitBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    renderLoading("Verifying your identity…");
    try {
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("file", file);
      const res = await fetch("/api/upload_id", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload failed");
      routeStep(await res.json());
    } catch (err) {
      renderError();
    }
  });
}

function renderResultStep(outcome, reply) {
  setActiveDot("result");
  const isSuccess = outcome === "self_serve" || outcome === "verified_and_updated";
  let userMessage = reply;
  let internalSummary = null;
  const marker = "Internal summary:";
  if (reply.includes(marker)) {
    const parts = reply.split(marker);
    userMessage = parts[0].trim();
    internalSummary = parts[1].trim();
  }

  body.innerHTML = `
    <div class="result-card ${isSuccess ? "result-success" : "result-warning"}">
      <div class="result-icon">${isSuccess ? "✓" : "!"}</div>
      <div class="result-title">${isSuccess ? "You're all set" : "We've looped in a teammate"}</div>
      <p class="result-message">${userMessage}</p>
      ${internalSummary ? `
        <details class="result-details">
          <summary>See what we shared with our support team</summary>
          <pre class="result-summary">${internalSummary}</pre>
        </details>` : ""}
      <button class="btn btn-primary" id="result-close">Done</button>
    </div>`;
  document.getElementById("result-close").addEventListener("click", closeModal);
}

async function handleReply(message, loadingLabel) {
  renderLoading(loadingLabel || "One sec…");
  try {
    const data = await send(message);
    routeStep(data);
  } catch (err) {
    renderError();
  }
}

function routeStep(data) {
  const { state, outcome, reply } = data;
  if (state === "ASK_ACCESS") {
    renderAccessStep(reply);
  } else if (state === "COLLECT_PHONE") {
    const isRetryError = reply.startsWith("That doesn't look like");
    renderPhoneStep(isRetryError ? "What's the new phone number you'd like on your account?" : reply,
      isRetryError ? reply : null);
  } else if (state === "COLLECT_ID" || state === "RETRY_ID") {
    const isError = reply.startsWith("I still need");
    let question = "Upload a JPEG photo of a government-issued ID.";
    if (!isError && state === "RETRY_ID") question = reply; // backend's retry context (e.g. why it failed)
    renderIdUploadStep(question, isError ? reply : null);
  } else if (state === "DONE" || state === "ESCALATED") {
    renderResultStep(outcome, reply);
  } else {
    renderError();
  }
}

function openModal() {
  overlay.hidden = false;
  sessionId = crypto.randomUUID();
  handleReply("I need to change the phone number on my account", "Getting started…");
}

function closeModal() {
  overlay.hidden = true;
}

openBtn.addEventListener("click", openModal);
closeBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
