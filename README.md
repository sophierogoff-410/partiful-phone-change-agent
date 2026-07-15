# Partiful Change-Phone-Number Agent

An MVP agentic workflow that resolves most "I lost access to my old phone" support
requests without a human, escalating only when verification fails or confidence is
low. See [`SCOPING_DOCUMENT.md`](SCOPING_DOCUMENT.md) for the full write-up
(problem, design principles, assumptions, tradeoffs, cost estimate, future work).

## What's in this repo

| File | Purpose |
|---|---|
| `agent.py` | Core state machine + Claude calls + mocked verification/update APIs |
| `app.py` | Flask app wiring the state machine to the widget UI |
| `templates/help_embedded.html` | Help Center article with the guided popup verification widget |
| `static/embedded.js` | Widget logic: steps, file upload/camera capture, drag-and-drop |
| `sample_ids/` | Placeholder JPEGs for the widget's file-upload step, named to exercise each verification outcome (clear/blurry/expired/mismatch) |
| `test_cases.json` | 12 scripted end-to-end test scenarios |
| `run_tests.py` | Runs every test case against the live agent, reports pass/fail |
| `SCOPING_DOCUMENT.md` | Full written scoping document |

## Setup

1. **Python 3.10+** required.
2. Create a virtual environment and install dependencies:
   ```
   python3 -m venv .venv
   source .venv/bin/activate    (macOS/Linux)
   .venv\Scripts\activate       (Windows)
   pip install -r requirements.txt
   ```
3. Add your Anthropic API key to `.env` in this folder:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   (Needs a small amount of credit — this whole project costs well under $1 to build, test, and demo.)

## Running the app

```
.venv/bin/python app.py       (macOS/Linux)
.venv\Scripts\python.exe app.py   (Windows)
```

Open **http://127.0.0.1:5000** in a browser. It's the real Help Center article for
"Can I change my phone number?" — clicking **"Verify my identity"** opens a guided
popup widget right there: one question at a time, ending in a file upload (or a typed
description, or a direct camera capture) for the ID step. No email step at all. Use the
files in `sample_ids/` when the widget asks for an ID photo — each filename is mapped to
a different verification outcome (see the table below).

(`SCOPING_DOCUMENT.md` §5 also discusses two alternatives we prototyped and set aside in
favor of this widget — a fully email-based conversation, and an email-triggered link to
a chat page — and why neither makes the cut for how we'd want this to scale.)

## Running the automated tests

```
.venv/bin/python run_tests.py     (macOS/Linux)
.venv\Scripts\python.exe run_tests.py   (Windows)
```

Runs all 12 cases in `test_cases.json` against the real agent logic (real Claude API
calls, ~$0.10 total), prints a pass/fail table, and writes full transcripts to
`test_run_transcripts.json` for review.

## Recording the demo

Suggested walkthrough to cover in the recording (~5–8 minutes):

1. **Show the scoping doc** briefly — design principles, MVP scope, and why we led with
   the embedded widget over an email-based flow.
2. **Start at the Help Center page** (`/`) — show the real self-serve instructions, then
   click **"Verify my identity"** to open the widget.
3. **Happy path:** say you lost your phone, provide a phone number, describe or upload a
   clear ID → show the agent verifying and printing the `ACTION: update_phone_number(...)`
   in the terminal, and confirming to the user in the popup.
4. **Retry path:** start a new session, describe a blurry ID, then resubmit a clear one
   → show the agent asking for a resubmission and then succeeding.
5. **Escalation path:** start a new session, describe an ID with a name mismatch (or
   "expired") → show the agent escalating with a generated handoff summary instead of
   guessing.
6. **Run `run_tests.py`** on screen to show all 12 test cases passing in one shot.
7. **Close on the scoping doc's Future Improvements section** — frame it as "here's what
   we deliberately left out, and why."

Each browser session's widget conversation lives only in memory for that page load —
refresh the page or open a new tab to start a fresh conversation for each demo path.

### Sample ID files (`sample_ids/`)

The widget's ID step is a real file picker (JPEG/PNG/HEIC/PDF), plus a "Take a photo"
camera-capture button and a "describe it instead" text fallback. Verification is mocked
off the uploaded *filename*, not real image content (see `SCOPING_DOCUMENT.md` §7
Assumptions) — pick the file matching the outcome you want to demo:

| File | Outcome |
|---|---|
| `clear_drivers_license.jpg` | Verified, phone number updated |
| `blurry_id_photo.jpg` | Retryable failure — asks for a clearer photo |
| `expired_id.jpg` | Escalated (non-retryable) |
| `id_name_mismatch.jpg` | Escalated (fraud signal) |

Regenerate them anytime with `python scripts/generate_sample_ids.py` (requires
`pip install pillow` — a dev-only tool, not part of the app's runtime dependencies).
