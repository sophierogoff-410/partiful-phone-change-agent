"""
Core agent logic for the Partiful "Change Phone Number" self-service agent.

Design: a deterministic state machine handles all routing and business-rule
decisions (what counts as pass/fail, when to escalate). Claude is used only
for the two things an LLM is actually good at here: understanding free-text
user input, and validating/summarizing it. This keeps the agent reliable
and auditable while still being genuinely agentic at the edges.
"""
import os
from dataclasses import dataclass, field
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel

MODEL = "claude-haiku-4-5"
MAX_RETRIES = 1  # number of times the user may resubmit ID after a retryable failure
LOW_CONFIDENCE_THRESHOLD = 0.7

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment


# --------------------------------------------------------------------------
# Structured outputs Claude must produce
# --------------------------------------------------------------------------
class IntakeClassification(BaseModel):
    is_phone_change_request: bool
    is_spam_or_unrelated: bool


class FieldValidation(BaseModel):
    new_phone_number_valid: bool
    extracted_phone_number: Optional[str]
    id_description_present: bool
    id_description_looks_complete: bool
    missing_items: list[str]


# --------------------------------------------------------------------------
# Session state
# --------------------------------------------------------------------------
@dataclass
class Session:
    id: str
    state: str = "INTAKE"
    retry_count: int = 0
    new_phone_number: Optional[str] = None
    id_description: Optional[str] = None
    history: list = field(default_factory=list)
    outcome: Optional[str] = None


SESSIONS: dict[str, Session] = {}


def get_session(session_id: str) -> Session:
    if session_id not in SESSIONS:
        SESSIONS[session_id] = Session(id=session_id)
    return SESSIONS[session_id]


def reset_sessions() -> None:
    SESSIONS.clear()


# --------------------------------------------------------------------------
# Mocked external systems (per assignment: print the action instead of
# calling a real internal API; identity verification is assumed to be an
# existing third-party vendor integration, mocked here deterministically).
# --------------------------------------------------------------------------
def mock_identity_verification(id_description: str) -> dict:
    text = (id_description or "").lower()
    if "expired" in text:
        return {"result": "fail", "confidence": 0.9, "reason": "expired_id", "retryable": False}
    if "mismatch" in text or "different name" in text:
        return {
            "result": "fail",
            "confidence": 0.85,
            "reason": "name_mismatch",
            "retryable": False,
            "fraud_signal": True,
        }
    if "blurry" in text or "unclear" in text or "dark" in text:
        return {"result": "fail", "confidence": 0.4, "reason": "low_image_quality", "retryable": True}
    if "low confidence" in text or "uncertain" in text:
        return {"result": "pass", "confidence": 0.55, "reason": "low_confidence_pass", "retryable": False}
    return {"result": "pass", "confidence": 0.97, "reason": "verified", "retryable": False}


def mock_update_phone_number(account_id: str, new_number: str) -> dict:
    action = f"ACTION: update_phone_number(account_id={account_id!r}, new_number={new_number!r})"
    print(action)
    return {"status": "success", "action_logged": action}


# --------------------------------------------------------------------------
# Claude calls
# --------------------------------------------------------------------------
def classify_intake(user_message: str) -> IntakeClassification:
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=500,
        system=(
            "You classify incoming messages to Partiful's support inbox for a self-service "
            "phone-number-change agent. This agent ONLY handles requests to change the phone "
            "number on a Partiful account. Anything else (event questions, billing, bugs, "
            "spam, small talk) is out of scope and should be flagged as spam_or_unrelated."
        ),
        messages=[{"role": "user", "content": user_message}],
        output_format=IntakeClassification,
    )
    return resp.parsed_output


def validate_fields(phone_text: str, id_text: str) -> FieldValidation:
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=500,
        system=(
            "You validate whether a user has provided a usable new phone number and a "
            "description of an uploaded government ID for identity verification. "
            "A valid phone number has at least 10 digits (formatting can vary). "
            "The ID description is 'complete' if it is non-empty, coherent, and describes an "
            "attempted photo of an identity document. Mark it complete EVEN IF the user says "
            "it's blurry, dark, unclear, a retry, or apologizes for image quality — those are "
            "quality issues judged by a separate verification step, not by you. Only mark it "
            "incomplete if the message is empty, gibberish, or clearly not about an ID at all "
            "(e.g. off-topic chit-chat)."
        ),
        messages=[{
            "role": "user",
            "content": f"New phone number provided: {phone_text!r}\nID description provided: {id_text!r}",
        }],
        output_format=FieldValidation,
    )
    return resp.parsed_output


def generate_escalation_summary(session: "Session", reason: str) -> str:
    convo = "\n".join(f"{h['role']}: {h['text']}" for h in session.history)
    resp = client.messages.create(
        model=MODEL,
        max_tokens=300,
        system=(
            "Write a concise internal handoff summary for a human support agent picking up "
            "this escalated phone-number-change request. 3-5 bullet points: what the user "
            "wants, what was collected, the verification result, and why it was escalated."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Conversation so far:\n{convo}\n\n"
                f"New phone number requested: {session.new_phone_number}\n"
                f"ID description provided: {session.id_description}\n"
                f"Escalation reason: {reason}"
            ),
        }],
    )
    return next((b.text for b in resp.content if b.type == "text"), "").strip()


# --------------------------------------------------------------------------
# Core state machine
# --------------------------------------------------------------------------
SELF_SERVE_MSG = (
    "Great — since you still have access to your old phone number, you can change it "
    "yourself in a couple of taps. Instructions: "
    "https://help.partiful.com/hc/en-us/articles/26025082969243-Can-I-change-my-phone-number"
)

CLOSED_OUT_OF_SCOPE_MSG = (
    "Thanks for reaching out! This assistant can only help with changing the phone number on "
    "your account. For anything else, please email hello@partiful.com and a team member will help."
)

SESSION_CLOSED_MSG = "This conversation has been closed. Please start a new request if you need further help."


def handle_message(session: Session, user_message: str) -> str:
    session.history.append({"role": "user", "text": user_message})
    reply = _route(session, user_message)
    session.history.append({"role": "agent", "text": reply})
    return reply


def _route(session: Session, user_message: str) -> str:
    if session.state == "INTAKE":
        c = classify_intake(user_message)
        if c.is_spam_or_unrelated or not c.is_phone_change_request:
            session.state = "CLOSED"
            session.outcome = "closed_out_of_scope"
            return CLOSED_OUT_OF_SCOPE_MSG
        session.state = "ASK_ACCESS"
        return "Do you still have access to your old phone number?"

    if session.state == "ASK_ACCESS":
        text = user_message.strip().lower()
        if text.startswith("y") or "yes" in text:
            session.state = "DONE"
            session.outcome = "self_serve"
            return SELF_SERVE_MSG
        session.state = "COLLECT_PHONE"
        return (
            "Sorry to hear that! I can verify your identity so we can update your number. "
            "First, what's the new phone number you'd like on your account?"
        )

    if session.state == "COLLECT_PHONE":
        session.new_phone_number = user_message.strip()
        v = validate_fields(session.new_phone_number, "placeholder")
        if not v.new_phone_number_valid:
            session.new_phone_number = None
            return "That doesn't look like a valid phone number — could you send it again (e.g. 555-123-4567)?"
        session.state = "COLLECT_ID"
        return (
            "Thanks! Now I'll need a government-issued photo ID — please upload a photo, "
            "or describe it here if that's easier (e.g. 'clear photo of my driver's license')."
        )

    if session.state in ("COLLECT_ID", "RETRY_ID"):
        session.id_description = user_message.strip()
        v = validate_fields(session.new_phone_number or "", session.id_description)
        if not v.id_description_present or not v.id_description_looks_complete:
            return "I still need a valid ID description to continue — could you provide that?"
        result = mock_identity_verification(session.id_description)
        return _handle_verification_result(session, result)

    if session.state in ("DONE", "CLOSED", "ESCALATED"):
        return SESSION_CLOSED_MSG

    session.state = "ESCALATED"
    session.outcome = "escalated_unknown_state"
    return "Something went wrong on my end — I've flagged this for a teammate to follow up."


def _handle_verification_result(session: Session, result: dict) -> str:
    if result["result"] == "pass" and result["confidence"] >= LOW_CONFIDENCE_THRESHOLD:
        mock_update_phone_number(account_id=session.id, new_number=session.new_phone_number)
        session.state = "DONE"
        session.outcome = "verified_and_updated"
        return (
            f"You're verified! I've updated your phone number to {session.new_phone_number}. "
            "You'll get a confirmation text shortly."
        )

    if result["result"] == "pass" and result["confidence"] < LOW_CONFIDENCE_THRESHOLD:
        session.state = "ESCALATED"
        session.outcome = "escalated_low_confidence"
        summary = generate_escalation_summary(session, "low_confidence_verification")
        return (
            "Thanks for your patience — I'd like a teammate to double-check this one before "
            "we make the change. I've escalated your request. Internal summary:\n\n" + summary
        )

    if result.get("retryable") and session.retry_count < MAX_RETRIES:
        session.retry_count += 1
        session.state = "RETRY_ID"
        return (
            f"That ID didn't come through clearly enough to verify (reason: {result['reason']}). "
            "Could you try uploading a clearer photo?"
        )

    session.state = "ESCALATED"
    session.outcome = "escalated_verification_failed"
    summary = generate_escalation_summary(session, result["reason"])
    return (
        "I wasn't able to verify your identity automatically, so I've escalated this to our "
        "support team — they'll follow up soon. Internal summary:\n\n" + summary
    )
