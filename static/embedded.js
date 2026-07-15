const openBtn = document.getElementById("open-wizard-btn");
const overlay = document.getElementById("modal-overlay");
const closeBtn = document.getElementById("modal-close");
const body = document.getElementById("modal-body");
const dots = Array.from(document.querySelectorAll("#step-dots .dot"));

const STEP_ORDER = ["access", "id", "phone", "result"];
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

// Common country calling codes, US/Canada first since that's the majority of the base today.
const COUNTRY_CODES = [
  { code: "+1", label: "US/Canada (+1)" },
  { code: "+44", label: "UK (+44)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+52", label: "Mexico (+52)" },
  { code: "+353", label: "Ireland (+353)" },
  { code: "+91", label: "India (+91)" },
  { code: "+81", label: "Japan (+81)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+33", label: "France (+33)" },
  { code: "+34", label: "Spain (+34)" },
  { code: "+55", label: "Brazil (+55)" },
];

const MIN_PHONE_DIGITS = 7; // shortest valid national number across supported countries
const MAX_PHONE_DIGITS = 12; // longest valid national number across supported countries

function renderPhoneStep(question, errorText) {
  setActiveDot("phone");
  const options = COUNTRY_CODES.map(
    (c) => `<option value="${c.code}">${c.label}</option>`
  ).join("");
  body.innerHTML = `
    ${errorText ? `<p class="step-error">${errorText}</p>` : ""}
    <p class="step-question">${question}</p>
    <div class="phone-row">
      <select class="country-select" id="country-select">${options}</select>
      <input class="step-input phone-number-input" id="step-input" type="tel" inputmode="numeric"
             placeholder="555 123 4567" autocomplete="tel-national" />
    </div>
    <p class="step-hint" id="phone-hint">We'll text a confirmation to this number once it's updated.</p>
    <div class="step-actions">
      <button class="btn btn-primary" id="step-submit" disabled>Continue</button>
    </div>`;

  const countrySelect = document.getElementById("country-select");
  const input = document.getElementById("step-input");
  const submitBtn = document.getElementById("step-submit");

  const validate = () => {
    // Strip anything that isn't a digit or basic phone-number punctuation, and
    // hard-cap the digit count so the field physically can't hold more than a
    // real phone number -- not just disable Continue past that point.
    let sanitized = "";
    let digitCount = 0;
    for (const ch of input.value) {
      if (/\d/.test(ch)) {
        if (digitCount >= MAX_PHONE_DIGITS) continue;
        digitCount++;
        sanitized += ch;
      } else if (/[\s().-]/.test(ch)) {
        sanitized += ch;
      }
    }
    if (sanitized !== input.value) input.value = sanitized;
    const complete = digitCount >= MIN_PHONE_DIGITS && digitCount <= MAX_PHONE_DIGITS;
    submitBtn.disabled = !complete;
    return complete;
  };

  input.addEventListener("input", validate);

  const submit = () => {
    if (!validate()) return;
    const fullNumber = `${countrySelect.value} ${input.value.trim()}`;
    handleReply(fullNumber, "One sec…");
  };
  submitBtn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !submitBtn.disabled) submit();
  });
  input.focus();
}

const ID_FILE_ACCEPT = "image/jpeg,image/png,image/heic,image/webp,application/pdf";

async function submitIdFile(file) {
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
}

function renderIdUploadStep(question, errorText) {
  setActiveDot("id");
  body.innerHTML = `
    ${errorText ? `<p class="step-error">${errorText}</p>` : ""}
    <p class="step-question">${question}</p>
    <label class="file-drop" id="file-drop">
      <input type="file" id="id-file-input" accept="${ID_FILE_ACCEPT}" hidden />
      <span id="file-drop-label">Drag a photo here, or click to browse<br />(JPEG, PNG, HEIC, or PDF)</span>
    </label>
    <div class="step-actions">
      <button class="btn btn-outline" id="camera-btn" type="button">Take a photo</button>
      <button class="btn btn-primary" id="step-submit" disabled>Submit for verification</button>
    </div>`;

  const fileInput = document.getElementById("id-file-input");
  const dropZone = document.getElementById("file-drop");
  const dropLabel = document.getElementById("file-drop-label");
  const submitBtn = document.getElementById("step-submit");
  const cameraBtn = document.getElementById("camera-btn");

  // Hidden input dedicated to camera capture -- on mobile, `capture` opens the
  // camera directly instead of the general file/photo picker.
  const cameraInput = document.createElement("input");
  cameraInput.type = "file";
  cameraInput.accept = "image/*";
  cameraInput.capture = "environment";
  cameraInput.hidden = true;
  body.appendChild(cameraInput);

  const setSelectedFile = (file) => {
    if (!file) return;
    fileInput.files = (() => {
      const dt = new DataTransfer();
      dt.items.add(file);
      return dt.files;
    })();
    dropLabel.textContent = file.name;
    submitBtn.disabled = false;
  };

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) {
      dropLabel.textContent = file.name;
      submitBtn.disabled = false;
    }
  });

  cameraBtn.addEventListener("click", () => cameraInput.click());
  cameraInput.addEventListener("change", () => setSelectedFile(cameraInput.files[0]));

  ["dragenter", "dragover"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("file-drop-active");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("file-drop-active");
    })
  );
  dropZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });

  submitBtn.addEventListener("click", () => {
    const file = fileInput.files[0];
    if (!file) return;
    submitIdFile(file);
  });

}

function renderResultStep(outcome, reply, backendActions) {
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

  const mailtoSubject = encodeURIComponent("Phone Number Change Request");
  const whatHappened = internalSummary || "• My request could not be completed automatically.";
  const mailtoBody = encodeURIComponent(
    `Hi Partiful Support,\n\n` +
    `I need help updating the phone number associated with my Partiful account because I no longer have access to my previous phone number.\n\n` +
    `I completed the phone recovery flow, but my request couldn't be completed automatically.\n\n` +
    `Reference ID: ${sessionId}\n` +
    `New phone number: (insert here)\n\n` +
    `What happened\n\n${whatHappened}\n\n` +
    `Please let me know if you need any additional information to help complete my phone number update.\n\n` +
    `Thanks!`
  );

  body.innerHTML = `
    <div class="result-card ${isSuccess ? "result-success" : "result-warning"}">
      <div class="result-icon">${isSuccess ? "✓" : "!"}</div>
      <div class="result-title">${isSuccess ? "You're all set" : "We weren't able to verify your identity automatically"}</div>
      <p class="result-message">${isSuccess ? userMessage : "We recommend emailing our support team. Click the link below for a pre-filled email — just insert your new phone number and attach a photo of your ID before sending."}</p>
      ${backendActions && backendActions.length ? `
        <details class="result-details">
          <summary>See what happened on the backend</summary>
          <pre class="result-summary">${backendActions.join("\n\n")}</pre>
        </details>` : ""}
      ${!isSuccess ? `
        <a class="btn btn-outline result-mailto" href="mailto:hello@partiful.com?subject=${mailtoSubject}&body=${mailtoBody}">
          Email our support team
        </a>
        <p class="result-contact" style="margin-top:10px;">Before sending, fill in your new number and attach a photo of your ID.</p>` : ""}
      <button class="btn btn-primary" id="result-close">Done</button>
      <p class="result-contact">
        Have further questions? Reach out to <a href="mailto:hello@partiful.com">hello@partiful.com</a>.
      </p>
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
  const { state, outcome, reply, backend_actions: backendActions } = data;
  if (state === "ASK_ACCESS") {
    renderAccessStep(reply);
  } else if (state === "COLLECT_ID" || state === "RETRY_ID") {
    const isError = reply.startsWith("I still need");
    let question = "Upload a photo of a government-issued ID (driver's license or passport).";
    if (!isError && state === "RETRY_ID") question = reply;
    renderIdUploadStep(question, isError ? reply : null);
  } else if (state === "COLLECT_PHONE") {
    const isRetryError = reply.startsWith("That doesn't look like");
    renderPhoneStep(
      isRetryError ? "What's the new phone number you'd like on your account?" : reply,
      isRetryError ? reply : null
    );
  } else if (state === "DONE" || state === "ESCALATED") {
    renderResultStep(outcome, reply, backendActions);
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
