"""
Runs every scripted test case in test_cases.json against the real agent logic
(agent.py), records the full transcript, and reports pass/fail against each
case's expected outcome. This is the automated companion to the manual demo
recording -- run it before recording to confirm the agent still behaves as
expected end to end.

Usage:
    python run_tests.py
"""
import json
import uuid

from dotenv import load_dotenv

load_dotenv()

from agent import get_session, handle_message


def run() -> None:
    with open("test_cases.json", encoding="utf-8") as f:
        cases = json.load(f)

    results = []
    transcripts = {}

    for case in cases:
        session_id = f"test-{uuid.uuid4()}"
        sess = get_session(session_id)
        transcript = []
        for msg in case["messages"]:
            reply = handle_message(sess, msg)
            transcript.append({"user": msg, "agent": reply})

        passed = sess.outcome == case["expected_outcome"]
        results.append({
            "id": case["id"],
            "description": case["description"],
            "expected": case["expected_outcome"],
            "actual": sess.outcome,
            "passed": passed,
        })
        transcripts[case["id"]] = transcript
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {case['id']}: expected={case['expected_outcome']!r} actual={sess.outcome!r}")

    n_pass = sum(1 for r in results if r["passed"])
    print(f"\n{n_pass}/{len(results)} test cases passed")

    with open("test_run_transcripts.json", "w", encoding="utf-8") as f:
        json.dump(transcripts, f, indent=2)
    with open("test_run_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    if n_pass != len(results):
        raise SystemExit(1)


if __name__ == "__main__":
    run()
