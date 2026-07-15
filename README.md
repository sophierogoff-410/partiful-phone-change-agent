# Partiful Change-Phone-Number Agent

An MVP agentic workflow that resolves most "I lost access to my old phone" support
requests without a human, escalating only when verification fails or confidence is
low. See [`SCOPING_DOCUMENT.md`](SCOPING_DOCUMENT.md) for the full write-up
(problem, design principles, assumptions, tradeoffs, cost estimate, future work).

## What's in this repo

| File | Purpose |
|---|---|
| `agent.py` | Core state machine + Claude calls + mocked verification/update APIs |
| `app.py` | Flask app wiring the state machine to a browser UI |
| `templates/help.html` | Option A: Help Center article + "email support" entry point |
| `templates/email.html` | Mock auto-reply email linking to the agent |
| `templates/index.html` | The chat agent UI (used by Option A) |
| `templates/help_embedded.html` | Option B: same Help Center article with a guided popup verification wizard (no email step) |
| `sample_ids/` | Placeholder JPEGs for the wizard's file-upload step, named to exercise each verification outcome (clear/blurry/expired/mismatch) |
| `test_cases.json` | 12 scripted end-to-end test scenarios |
| `run_tests.py` | Runs every test case against the live agent, reports pass/fail |
| `SCOPING_DOCUMENT.md` | Full written scoping document |

## Setup

1. **Python 3.10+** required.
2. Create a virtual environment and install dependencies:
   ```
   python -m venv .venv
   .venv\Scripts\activate      (Windows)
   pip install -r requirements.txt
   ```
3. Add your Anthropic API key to `.env` in this folder:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   (Needs a small amount of credit — this whole project costs well under $1 to build, test, and demo.)

## Running the app

```
.venv\Scripts\python.exe app.py
```

Open **http://127.0.0.1:5000** in a browser. Two rollout options are demoable, with a
"Demo mode" switcher in the header of each to jump between them:

- **Option A — email flow** (`/`): Help Center → "Simulate emailing hello@partiful.com"
  → auto-reply email → "Start verification chat" → live agent. Ships fastest — no
  changes to Partiful's real website, just an email-automation rule + a hosted agent page.
- **Option B — embedded widget** (`/embedded`): same Help Center article, but clicking
  "Verify my identity" opens a guided popup wizard right there — one question at a
  time, ending in a real JPEG file upload for the ID step. No email step at all.
  Better UX, but requires shipping a UI change to the real help center. Use the files
  in `sample_ids/` when the wizard asks for an ID photo — each filename is mapped to a
  different verification outcome (see the table below).

## Running the automated tests

```
.venv\Scripts\python.exe run_tests.py
```

Runs all 12 cases in `test_cases.json` against the real agent logic (real Claude API
calls, ~$0.10 total), prints a pass/fail table, and writes full transcripts to
`test_run_transcripts.json` for review.

## Recording the demo

Suggested walkthrough to cover in the recording (~5–8 minutes):

1. **Show the scoping doc** briefly — design principles, MVP scope, and the two rollout options.
2. **Start at the Help Center page** (`/`) — show the real self-serve instructions.
3. Click **"Simulate emailing hello@partiful.com"** → show the auto-reply email → click
   **"Start verification chat"**.
3a. Switch to **`/embedded`** and briefly show the alternate no-email version for
    comparison — same conversation, no page navigation.
4. **Happy path:** say you lost your phone, provide a phone number, describe a clear ID
   → show the agent verifying and printing the `ACTION: update_phone_number(...)` in
   the terminal, and confirming to the user.
5. **Retry path:** start a new session, describe a blurry ID, then resubmit a clear one
   → show the agent asking for a resubmission and then succeeding.
6. **Escalation path:** start a new session, describe an ID with a name mismatch (or
   "expired") → show the agent escalating with a generated handoff summary instead of
   guessing.
7. **Run `run_tests.py`** on screen to show all 12 test cases passing in one shot.
8. **Close on the scoping doc's Future Improvements section** — frame it as "here's what
   we deliberately left out, and why."

Each browser session keeps its own conversation via `localStorage` — refresh the page
or open a new incognito window to start a fresh conversation for each demo path.

### Sample ID files (`sample_ids/`)

The wizard's ID step (Option B) is a real JPEG file picker. Verification is mocked off
the uploaded *filename*, not real image content (see `SCOPING_DOCUMENT.md` §7
Assumptions) — pick the file matching the outcome you want to demo:

| File | Outcome |
|---|---|
| `clear_drivers_license.jpg` | Verified, phone number updated |
| `blurry_id_photo.jpg` | Retryable failure — asks for a clearer photo |
| `expired_id.jpg` | Escalated (non-retryable) |
| `id_name_mismatch.jpg` | Escalated (fraud signal) |

Regenerate them anytime with `python scripts/generate_sample_ids.py` (requires
`pip install pillow` — a dev-only tool, not part of the app's runtime dependencies).
