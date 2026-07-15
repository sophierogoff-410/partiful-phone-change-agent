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

## Design Process

Before landing on the recommendation in this document, we worked through a few real tradeoffs — worth documenting here because the reasoning matters as much as the conclusion.

**We started by prototyping two front doors: an email-triggered link, and an embedded widget on the Help Center page itself.** The first instinct was to treat this as a speed-to-ship question — email requires zero changes to Partiful's live product, while the widget needs a small UI change — and lead with whichever ships faster.

**That framing turned out to be incomplete.** The deciding factor isn't build time, it's a problem that only the email option creates: something has to look at *every* email landing in hello@partiful.com and decide whether it's a phone-change request before automatically responding with the agent link. Get that judgment call wrong in either direction and you either miss automating a real request, or send someone with an unrelated question into a bot that can't help them. The widget doesn't have this problem — the button the user clicks already tells us their intent, for free.

**That raised a related question: would automating the email channel itself — an AI just replying back and forth over email — get us to real automation?** No. Email is still an asynchronous medium: the user is checking their inbox and waiting between every step, typing free-form answers instead of tapping a button, and there's no clean way to hand over something like a photo ID. It would look automated on our end without actually being faster for the person on the other end, and speed is the entire point of this project. Any real fix needs a guided, in-the-moment experience — which meant the interactive layer, not the entry point, was the part that actually had to be good.

**With that settled, we considered going a level broader: building one general AI support agent that handles all of hello@partiful.com, not just phone changes, and routes each inquiry to the right internal flow itself.** We set this aside for the MVP. It's a much bigger scope than a 48-hour build for one workflow, it adds more surface area for something to go wrong on a task that ends in a security-sensitive account change, and — most importantly — it would be solving the same intent-routing problem the widget already avoids by construction. Better to ship one thing well than a general system half-validated.

**Finally, we thought about what happens after this workflow ships — how do we add the next one without starting over?** The temptation is to build a reusable "platform" now, in anticipation. We decided against that too: designing a generic system from a single example is mostly guessing, and it would slow down this MVP for a payoff we can't verify yet. Instead, we kept this build's boundaries clean — what's specific to phone-number-change is separated from what's generic to any guided verification flow — so that when a second workflow is actually needed, it's a fast reuse of this one rather than a rewrite. See §12 for what that looks like concretely.

**Where we landed:** lead with the embedded widget as the sole recommended build, cut the email-flow prototype from this submission once the widget confirmed out as the right call, and treat "cheap to extend later" as a property of how this was built rather than a separate project to fund now.

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
Clicks "Verify my identity" inline (primary path: embedded widget, §5)
        ↓  [fallback: user emails hello@partiful.com directly →
        ↓   auto-reply links to the same agent conversation]
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

## 5. Rollout Approach: Embedded Widget

We're recommending the agent live directly on the existing Help Center article as a guided popup ("Verify my identity"), not behind an email round-trip. A user who doesn't have their old phone clicks one button, right where they already are, and finishes the whole process — questions, phone number, ID — in one sitting, without ever leaving the page or waiting on an inbox.

This does mean a small UI change to the live Help Center article (versus zero product changes for an email-only approach), but that's a worthwhile tradeoff: it's the difference between a user finishing in one minute versus a user finishing in one minute *plus* however long it takes them to notice a new email and click into it. It also means we don't have to guess, for every single email that lands in hello@partiful.com, whether it's actually a phone-number request before deciding to respond with this flow — the button the user clicks already tells us that.

### Alternatives we considered and set aside for MVP

**A fully email-based experience.** Early on we considered handling the whole thing inside the email thread — the user emails support, an AI reads the reply and asks its questions over email, back and forth, no separate page or tool at all. We ruled this out because it doesn't actually deliver the automation we're after: the user is still checking their inbox and waiting between every step, typing free-form answers instead of tapping a button, and there's no clean way to collect something like a photo ID over email. It would look automated on our side, but it wouldn't feel any faster to the person on the other end — and speed is the entire point of this project. Any real fix needs a guided, in-the-moment experience, not just a faster-typing version of the same slow back-and-forth.

**Email as just the entry point (link out to a chat page).** A middle option is to keep the email round-trip only as the *doorway* — the user emails support, gets an auto-reply with a link, and clicking that link drops them into the same guided experience the widget offers. This removes the "waiting on free-form email replies" problem, but keeps the one you can't design away: something still has to look at every inbound email and decide whether it's a phone-number request before sending that link — and getting that judgment call wrong either quietly skips someone who should have been automated, or sends someone with an unrelated question into a tool that can only tell them to email support again. The widget's button is that same judgment call, made for free, by the user, at the moment they click it. We prototyped a working version of this email-entry variant early in development for side-by-side comparison, then removed it from this submission once the widget confirmed out as the right lead — it isn't the one we're recommending Partiful ship.

## 6. MVP Scope

**Automated:**
- ✅ Ask the qualifying question (old phone access)
- ✅ Redirect self-serve-eligible users instantly
- ✅ Collect new phone number and ID description in one conversation
- ✅ Validate required fields are present before calling verification
- ✅ Extract identity fields from uploaded ID using Anthropic vision API (mocked; see Assumptions)
- ✅ Look up Partiful account by extracted name + DOB (mocked; see Assumptions)
- ✅ Print the internal phone-update action (mocked; see Assumptions)
- ✅ Notify the user of the outcome
- ✅ Generate a structured handoff summary when escalating

**Escalated to a human:**
- No Partiful account found matching the name + DOB on the uploaded ID
- Failed ID extraction (e.g. image too poor to read after retry)
- Fraud signals (e.g. name mismatch between ID and account)
- Low-confidence extraction results
- Retries exhausted after an unclear/blurry ID resubmission
- Anything outside the phone-number-change scope (routed back to hello@partiful.com)

## 7. Assumptions

- An internal API exists to update a user's phone number; for this MVP it is mocked and the intended action is printed to the console instead of executed (`agent.py::mock_update_phone_number`). This is assumed to be an elevated, support-only variant of the same profile-update capability self-serve uses — not the consumer-facing endpoint itself — since it has to bypass the old-number verification step self-serve normally requires (the entire reason this workflow exists is that the old number isn't available). This isn't a new capability we're inventing: today's manual process already does this same bypass by hand (a human support agent updates the field directly once they're satisfied with an ID check), so the assumption is only that it's callable programmatically rather than only reachable through an internal admin UI — a safe bet, since most internal admin tools are themselves thin frontends over an API. The one real caveat: because this path is the bypass for an account-recovery security control, it's a natural target for social engineering (a convincing fake ID is now the attack surface instead of stealing a phone), so a production version of this endpoint would likely warrant its own safeguards beyond what a standard internal API needs — audit logging, rate limiting, and possibly periodic human sampling of auto-approved cases even at high verification confidence.
- **ID extraction uses the Anthropic vision API, not a separate vendor.** When the user uploads an ID photo, the image is sent to Claude (claude-opus-4-8) with a prompt asking it to extract structured fields: name, DOB, document type. No additional vendor (Stripe Identity, Persona, Onfido) is required — we already have the Anthropic API key. The tradeoff vs. a specialized vendor is that Claude can extract data from a document but cannot verify the document's authenticity (detect forgeries, check chip data, etc.). For this use case that's an acceptable starting point: the real security check is the Partiful account lookup in the next step, not the document itself. A production version could add an authenticity layer on top for higher-risk accounts.
- **The Partiful internal API supports account lookup by name + DOB.** This is the core assumption that makes the flow work: once Claude extracts `{first_name, last_name, dob}` from the uploaded ID, those fields are passed to `partiful_api.lookup_account()` to find the matching account. The account match is what confirms identity — if the name and DOB on the uploaded ID don't match any Partiful account, the request is escalated rather than completed. If Partiful's API doesn't expose this lookup today, building it (or a support-only variant of it) would be a prerequisite for this workflow.
- **Expired IDs are accepted.** The purpose of the ID upload is to extract name and date of birth to look up the account — not to verify the document's legal validity for travel or driving. An expired license or passport still contains accurate identity fields. Rejecting expired documents would add friction without improving security, so expiry is not checked.
- The agent can securely receive attachments. The widget accepts a real file upload (JPEG/PNG/HEIC/PDF, via drag-and-drop, file picker, or direct camera capture on mobile). This MVP mocks the extraction step (`agent.py::mock_identity_verification`) so behavior is reproducible for testing — pass/fail/retry is derived from keywords in the uploaded filename (e.g. `blurry_id_photo.jpg` triggers the retry path, `id_name_mismatch.jpg` triggers escalation). Sample files for each scenario are in `sample_ids/`.
- Escalation sends an email to hello@partiful.com containing a plain-English summary of the conversation and verification result. The agent logs this as `send_email(to='hello@partiful.com', subject='Phone number change escalation — ref: <session_id>', body=<summary>)` (`agent.py::mock_send_escalation_email`). The email fires automatically when the agent cannot resolve the request. On the same escalation screen, the user also sees a pre-filled "Email our support team" mailto link (subject and body pre-populated with the same session reference and summary), so they can follow up directly without starting a disconnected second thread — a common failure mode in support escalations where the original context gets lost.
- Session state is in-memory for this demo; a production version would persist conversation state (e.g. Redis or a database) so it survives server restarts.

## 8. What We Intentionally Did NOT Automate

**Human fraud review.** Any signal suggesting the ID doesn't match the account (name mismatch) is escalated rather than adjudicated by the agent. Account-recovery fraud has asymmetric downside — a wrongly-approved takeover is far worse than a delayed legitimate request.

**Name/ID edge cases.** The account lookup assumes the name on the user's government ID matches the name on their Partiful account. This will fail for users whose account uses a nickname, a maiden name, or contains a typo from signup. Those cases escalate to human review, which is the right outcome — but a production version might offer a secondary lookup path (e.g. by email + DOB) to reduce unnecessary escalations.

**ID privacy and retention.** The uploaded ID photo is sent to the Anthropic API for field extraction. In production, the image should not be stored server-side after extraction completes, and the API call should use a data-processing agreement appropriate for government ID data. This is out of scope for the MVP but would need to be addressed before launch.

**Policy decisions.** The agent never overrides a verification failure or invents its own confidence threshold — it follows fixed rules (see `agent.py::_handle_verification_result`). This is a deliberate constraint: the AI's job is orchestration and communication, not setting security policy.

**Real file/image uploads and analysis.** The demo simulates ID uploads as text descriptions rather than integrating real file upload + OCR/image quality analysis.

## 9. Tradeoffs

We optimized for **simplicity and reliability** over **full automation**. Specifically:

- The state machine (not the LLM) owns every routing decision — pass/fail thresholds, retry limits, escalation triggers. Claude is used only for the two things it's genuinely good at: understanding free-text input and validating/summarizing it. This keeps the agent's behavior deterministic and testable rather than "hoping the model does the right thing."
- We accepted a single hard-coded retry limit (1) rather than building adaptive retry logic, to keep the MVP shippable quickly.
- We chose a fast, inexpensive model (Claude Haiku 4.5) over a larger model, since the tasks involved (classification, field extraction, short summaries) don't require deep reasoning — this keeps unit economics compelling (see Cost Assumptions) without sacrificing reliability, which we validated against a 12-case test suite.

While additional fraud detection, risk-based verification, and OCR prefill could reduce manual reviews further, we excluded these from the MVP to keep implementation straightforward and allow faster deployment.

**Why not a general-purpose AI support chat agent.** An obvious alternative design is a single AI agent that sits in front of all of hello@partiful.com and handles every inquiry type (phone changes, billing, event questions, bug reports), routing to the right internal flow itself. We deliberately did not build that here, for a few reasons:

- **Scope explosion.** Answering "everyone's questions" requires a taxonomy of every support category Partiful handles, a tested response/tool for each, and a much larger eval set — that's a multi-week platform project, not a 48-hour MVP for one workflow.
- **Bigger blast radius on a security-sensitive flow.** This workflow ends in an identity-verification decision tied to account takeover risk. A general agent that also fields casual questions has more surface area for misclassification to leak an unrelated request into (or out of) a flow that changes account security state. Keeping the agent narrowly scoped to one task makes its behavior easier to fully test (see the 12-case suite) and easier to reason about for a security review.
- **The widget already solves the routing problem for free.** As discussed in §5, a general agent's main advantage — inferring intent from an unstructured request — is exactly what the embedded widget doesn't need, because the entry point already encodes intent. Building a general classifier here would be solving a problem the UI choice already avoids.

This is a "not yet," not a "never" — see §12 for how this could evolve into one skill inside a broader support agent once there's a reason to build that taxonomy.

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

13 scripted end-to-end test cases, run automatically via `run_tests.py` against the live agent (`agent.py`). All 13 currently pass.

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
| TC13 | Valid ID but no matching Partiful account | Escalate (account not found) |

Full transcripts of the most recent run are written to `test_run_transcripts.json` after each `run_tests.py` execution.

## 12. Future Improvements

**Backup recovery email.** Let users register a recovery email at onboarding, reducing reliance on government ID for identity recovery. *Not in MVP* because it requires an onboarding/product change beyond this workflow's scope.

**Risk-based verification.** Only require full government ID for higher-risk requests (e.g. based on account age, recent activity anomalies), using lighter verification otherwise. *Not in MVP* because it requires a risk-scoring model we don't have data to build yet.

**OCR prefill.** Auto-populate name/DOB fields from the uploaded ID to speed up the flow. *Not in MVP* because it requires real file upload + OCR integration, and the current text-description flow was sufficient to validate the core workflow.

**Fraud scoring.** Use historical account behavior (device, location, request patterns) to flag high-risk requests before they reach verification. *Not in MVP* — requires access to historical account/security data not available for this exercise.

**Analytics dashboard.** Track time-to-resolution, escalation rate, verification success rate, and support hours saved. *Not in MVP* because it's an observability layer best built once the agent has real production volume to measure — building it against synthetic data now would produce a dashboard nobody trusts.

**Conversational course-correction.** The current MVP is a strict linear state machine — a user can't say "actually, never mind, I found my phone" mid-flow and have the agent gracefully redirect. *Not in MVP* to keep the state machine simple and testable; flagged here as a known limitation rather than silently handled.

**Reusing this build for a second workflow (e.g. "Update Email Address").** This build already separates what's specific to phone-number-change (the questions asked, the pass/fail rules, and which internal system gets called at the end) from what's generic to any guided verification flow (the popup itself, the step-by-step interface, the "upload a file, take a photo, or describe it instead" pattern, and the way we write a plain-English handoff summary for a human). A second self-serve workflow mostly reuses the second category and only has to build the first — new questions, new business rules, a new internal endpoint to call at the end, but not a new interface, a new popup, or a new way of writing to a support ticket. We're not pre-building that reusable layer now, on purpose (see Design Process above) — we'd rather this first workflow prove the pattern is real, then let the second workflow be the actual test of what's reusable, at a fraction of the time this one took.

**Folding this into a general support chatbot.** As the widget scales, a natural question is whether it should stay a single-purpose flow forever, or eventually become one "skill" inside a broader Partiful support chat agent that also handles other inquiry types (event questions, billing, account issues) from the same entry point. Whether that's *necessary* depends on a question this MVP can't answer on its own: how much of hello@partiful.com's volume is phone-change requests versus everything else? If phone changes are a large, distinct slice, this workflow can keep scaling as a standalone, purpose-built widget indefinitely — there's no inherent ceiling that forces consolidation. If Partiful independently decides to build a general support agent for other inquiry types, this workflow is a natural candidate to become one scoped tool/flow inside it rather than a rewrite, since the state machine and mocked-integration boundaries here would map cleanly onto a "tool call" in a larger agent. *Not in MVP* because building or evaluating a general support agent is a separate, much larger initiative whose necessity depends on support-volume data across categories we don't have visibility into for this exercise — see §9 for why we scoped narrow instead of building toward that now.

**Real OCR/image-quality analysis + persistent sessions.** The embedded widget accepts a real JPEG upload, but verification is still mocked off the filename rather than the actual image content — a production version would send image bytes to a real verification vendor and move session state from in-memory to persistent storage (e.g. Redis). *Not in MVP* because the assignment scope allows mocking the verification vendor itself, and building real OCR wouldn't demonstrate additional agent-design judgment.
