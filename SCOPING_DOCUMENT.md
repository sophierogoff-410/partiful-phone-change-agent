# Scoping Document: Agentic Change-Phone-Number Workflow

**Author:** Business Operations Associate take-home submission
**Status:** MVP built and tested (see `test_cases.json` / `test_run_results.json`)

---

## Design Principles

- **Reduce support work, don't just automate it.** Success is measured in tickets that never reach a human, not in how fast a human can process one.
- **Collect all required information upfront** to eliminate unnecessary back-and-forth email threads.
- **Keep humans involved only where judgment is required** — fraud signals, low-confidence verification, and repeated failures.
- **Optimize for a simple MVP that could realistically ship quickly** and improve incrementally, rather than trying to solve every edge case on day one.

---

## 1. Problem Statement

Today, changing a phone number when a user has lost access to their old one requires multiple manual back-and-forth emails with support *before* identity verification even begins: a human asks whether the user has their old phone, waits for a reply, then manually requests ID verification. This causes:

- Slow resolution times (multi-day email threads)
- High support workload for a repetitive, low-judgment task
- Inconsistent handling across agents
- Poor customer experience for a routine account-recovery request

## 2. Goal

Build an AI-powered workflow that:

- Resolves simple requests automatically (users who still have their old phone)
- Collects all required verification information upfront, in one conversation
- Escalates to a human only when automated verification can't confidently resolve the request
- Reduces support workload while maintaining account security

## 3. Current Workflow

```
User emails hello@partiful.com
        ↓
Support agent manually asks: "Do you have your old phone?"
        ↓ (wait for reply — hours/days)
   YES → agent sends self-serve instructions link
   NO  → agent manually requests ID upload
        ↓ (wait for reply)
        agent manually reviews ID, verifies identity
        ↓
        agent manually updates phone number
```

Every arrow above is a separate email round-trip handled by a human.

## 4. Proposed Workflow (as built)

```
User visits Partiful Help Center article
        ↓
Has old phone? → self-serve link (no agent needed)
        ↓ No
User emails hello@partiful.com
        ↓
Automatic reply with a link to the AI support agent
        ↓
Agent asks qualifying question (redundant safety check)
        ↓
Agent collects: new phone number + ID description/upload
        ↓
Agent validates fields are present and well-formed
        ↓
Mock identity verification API called
        ↓
   PASS (high confidence)  → ACTION: update_phone_number(...) printed + user notified → DONE
   PASS (low confidence)   → escalate to human with summary → DONE
   FAIL (retryable)        → ask user to resubmit (max 1 retry) → loop
   FAIL (not retryable /   → escalate to human with summary,
   fraud signal / retries    including verification result + reason → DONE
   exhausted)
```

A human only gets involved when the agent cannot confidently complete the request on its own.

**Why the qualifying question stays even though it looks redundant.** By the time a user reaches
the agent — via the email auto-reply, or via the "Verify my identity" button on the embedded
variant — the entry point has already implied they don't have their old number. It would be easy
to skip straight to collecting a new number and an ID. We kept the explicit re-ask on purpose:
entry-point context is a weak signal (a user could click the wrong link, land here from a shared
link, or actually still have their old phone and just be confused), and a single yes/no question
is a near-zero-cost way to avoid sending someone through a full identity-verification flow they
didn't need. We treat this the same way we treat every other judgment call in this document:
optimize for correctness over assumed context when the cost of asking is negligible.

## 5. Rollout Options

We built two front-door variants so the team can choose based on how fast this needs to ship:

| | **Option A: Email-triggered link** | **Option B: Embedded FAQ widget** |
|---|---|---|
| Entry point | User emails hello@partiful.com, gets an auto-reply with a link to the agent | User clicks "I don't have access to my old number" directly on the existing FAQ page |
| Changes required | None to Partiful's actual website/app — just an email-automation rule (e.g. a Zendesk/Front trigger) and a hosted agent page | Requires shipping a UI change: embedding the chat widget into the real help center article |
| Time to ship | Fastest — no frontend deploy, no design review | Slower — needs a frontend change and likely a design/eng review cycle |
| User experience | One extra round-trip (email → click a link) before the conversation starts | No email step at all — the fix happens inline, in context, right where the user already is |
| Demo | `/` → `/email` → `/chat` | `/embedded` |

**Recommendation:** ship Option A first — it delivers the full cost/time savings described in this document with zero changes to Partiful's live product surface, so it can go out as soon as the agent logic is validated. Follow up with Option B as a fast-follow UI investment once the workflow has proven itself in production; it's a strictly better experience but isn't the blocker for realizing the automation savings.

## 6. MVP Scope

**Automated:**
- ✅ Ask the qualifying question (old phone access)
- ✅ Redirect self-serve-eligible users instantly
- ✅ Collect new phone number and ID description in one conversation
- ✅ Validate required fields are present before calling verification
- ✅ Call identity verification (mocked; see Assumptions)
- ✅ Print the internal phone-update action (mocked; see Assumptions)
- ✅ Notify the user of the outcome
- ✅ Generate a structured handoff summary when escalating

**Escalated to a human:**
- Failed verification (expired ID, non-retryable)
- Fraud signals (e.g. name mismatch between ID and account)
- Low-confidence "pass" results
- Retries exhausted after an unclear/blurry ID resubmission
- Anything outside the phone-number-change scope (routed back to hello@partiful.com)

## 7. Assumptions

- An internal API exists to update a user's phone number; for this MVP it is mocked and the intended action is printed to the console instead of executed (`agent.py::mock_update_phone_number`).
- An identity verification vendor exists (e.g. Persona, Onfido, Stripe Identity) that returns a pass/fail result with a confidence score; this MVP mocks that vendor deterministically (`agent.py::mock_identity_verification`) so behavior is reproducible for testing.
- In production, the "auto-reply with agent link" step would be a Zendesk/Front-style trigger on new `hello@partiful.com` tickets matching phone-change intent, sending a secure, session-linked URL. This is simulated in the demo with static pages (`/` → `/email` → `/chat`).
- The agent can securely receive attachments. The embedded widget (Option B) accepts a real JPEG upload; the chat flow (Option A) accepts a typed description instead. Neither path runs real OCR/image-quality analysis — the mocked verification vendor (`agent.py::mock_identity_verification`) derives its pass/fail/retry result from keywords in the uploaded filename or typed text (e.g. a file named `blurry_id.jpg` exercises the same retry path as typing "blurry photo"). Sample files for each verification outcome are in `sample_ids/`. A production version would send the actual image bytes to a real verification vendor.
- Support tooling (e.g. Zendesk) allows a ticket to be created/updated programmatically with a summary, so the "escalate" action in production would open or update a ticket rather than just printing a summary.
- Session state is in-memory for this demo; a production version would persist conversation state (e.g. Redis or a database) so it survives server restarts.

## 8. What We Intentionally Did NOT Automate

**Human fraud review.** Any signal suggesting the ID doesn't match the account (name mismatch) is escalated rather than adjudicated by the agent. Account-recovery fraud has asymmetric downside — a wrongly-approved takeover is far worse than a delayed legitimate request.

**The identity verification provider.** Building or evaluating a real verification vendor is out of scope for this MVP; an existing vendor is assumed and mocked.

**Policy decisions.** The agent never overrides a verification failure or invents its own confidence threshold — it follows fixed rules (see `agent.py::_handle_verification_result`). This is a deliberate constraint: the AI's job is orchestration and communication, not setting security policy.

**Real file/image uploads and analysis.** The demo simulates ID uploads as text descriptions rather than integrating real file upload + OCR/image quality analysis.

## 9. Tradeoffs

We optimized for **simplicity and reliability** over **full automation**. Specifically:

- The state machine (not the LLM) owns every routing decision — pass/fail thresholds, retry limits, escalation triggers. Claude is used only for the two things it's genuinely good at: understanding free-text input and validating/summarizing it. This keeps the agent's behavior deterministic and testable rather than "hoping the model does the right thing."
- We accepted a single hard-coded retry limit (1) rather than building adaptive retry logic, to keep the MVP shippable quickly.
- We chose a fast, inexpensive model (Claude Haiku 4.5) over a larger model, since the tasks involved (classification, field extraction, short summaries) don't require deep reasoning — this keeps unit economics compelling (see Cost Assumptions) without sacrificing reliability, which we validated against a 12-case test suite.

While additional fraud detection, risk-based verification, and OCR prefill could reduce manual reviews further, we excluded these from the MVP to keep implementation straightforward and allow faster deployment.

## 10. Cost Assumptions

**Model:** Claude Haiku 4.5 ($1 / $5 per million input/output tokens). Chosen because the workflow is a bounded state machine — Claude's job is narrow (classify intent, validate/extract fields, summarize for handoff), not open-ended reasoning.

| | Estimate |
|---|---|
| Input tokens per conversation | ~1,500–2,500 |
| Output tokens per conversation | ~600–900 |
| **Cost per conversation** | **~$0.005–$0.01** |

**At scale:** ~500 phone-change requests/month → **~$3–5/month** in LLM cost.

**ROI framing:** each ticket today costs ~15–20 minutes of a support agent's time across email back-and-forth (~$5–8 in labor at a ~$20–25/hr loaded rate). The LLM cost per automated resolution is roughly **500–1,000x cheaper** than the labor it replaces — the kind of number worth surfacing to leadership when justifying the build.

**Not included above:** the identity verification vendor's per-check fee (typically $0.50–$1.50/verification, market rate for providers like Persona/Onfido) — this is the larger per-ticket cost, not the LLM call, and is assumed to be an existing vendor relationship rather than new spend.

## 11. Test Cases

12 scripted end-to-end test cases, run automatically via `run_tests.py` against the live agent (`agent.py`). All 12 currently pass.

| ID | Scenario | Expected Outcome |
|---|---|---|
| TC01 | Has old phone | Redirect to self-serve |
| TC02 | Lost phone, clean ID | Verified & phone updated |
| TC03 | Blurry ID, then clear resubmission | Retry succeeds → updated |
| TC04 | Blurry ID twice | Retries exhausted → escalate |
| TC05 | Expired ID | Escalate (non-retryable) |
| TC06 | Name mismatch on ID | Escalate (fraud signal) |
| TC07 | Verification passes but low confidence | Escalate for human double-check |
| TC08 | Invalid/missing phone number first | Agent re-asks, then succeeds |
| TC09 | Gibberish instead of ID description | Agent re-asks, then succeeds |
| TC10 | Off-topic / spam message | Closed, redirected to human inbox |
| TC11 | Ambiguous phrasing, still in scope | Correctly classified, proceeds |
| TC12 | Message sent after session resolved | Session-closed reply, no restart |

Full transcripts of the most recent run are written to `test_run_transcripts.json` after each `run_tests.py` execution.

## 12. Future Improvements

**Backup recovery email.** Let users register a recovery email at onboarding, reducing reliance on government ID for identity recovery. *Not in MVP* because it requires an onboarding/product change beyond this workflow's scope.

**Risk-based verification.** Only require full government ID for higher-risk requests (e.g. based on account age, recent activity anomalies), using lighter verification otherwise. *Not in MVP* because it requires a risk-scoring model we don't have data to build yet.

**OCR prefill.** Auto-populate name/DOB fields from the uploaded ID to speed up the flow. *Not in MVP* because it requires real file upload + OCR integration, and the current text-description flow was sufficient to validate the core workflow.

**Fraud scoring.** Use historical account behavior (device, location, request patterns) to flag high-risk requests before they reach verification. *Not in MVP* — requires access to historical account/security data not available for this exercise.

**Analytics dashboard.** Track time-to-resolution, escalation rate, verification success rate, and support hours saved. *Not in MVP* because it's an observability layer best built once the agent has real production volume to measure — building it against synthetic data now would produce a dashboard nobody trusts.

**Conversational course-correction.** The current MVP is a strict linear state machine — a user can't say "actually, never mind, I found my phone" mid-flow and have the agent gracefully redirect. *Not in MVP* to keep the state machine simple and testable; flagged here as a known limitation rather than silently handled.

**Real OCR/image-quality analysis + persistent sessions.** The embedded widget accepts a real JPEG upload, but verification is still mocked off the filename rather than the actual image content — a production version would send image bytes to a real verification vendor and move session state from in-memory to persistent storage (e.g. Redis). *Not in MVP* because the assignment scope allows mocking the verification vendor itself, and building real OCR wouldn't demonstrate additional agent-design judgment.
