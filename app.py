import os
import uuid

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify, render_template, request

from agent import get_session, handle_message

app = Flask(__name__)


@app.route("/")
def help_center():
    return render_template("help_embedded.html")


@app.route("/api/message", methods=["POST"])
def api_message():
    data = request.get_json(force=True)
    session_id = data.get("session_id") or str(uuid.uuid4())
    user_message = (data.get("message") or "").strip()

    sess = get_session(session_id)
    if not user_message:
        return jsonify({"error": "message is required"}), 400

    reply = handle_message(sess, user_message)
    return jsonify({
        "session_id": session_id,
        "reply": reply,
        "state": sess.state,
        "outcome": sess.outcome,
        "backend_actions": sess.backend_actions,
    })


@app.route("/api/upload_id", methods=["POST"])
def api_upload_id():
    """
    Accepts a JPEG photo of an ID. This demo doesn't run real OCR/image-quality
    analysis (see SCOPING_DOCUMENT.md Assumptions) -- it derives a description
    from the filename and feeds it through the same mocked verification path
    a typed description would use, so a demo file named e.g. "blurry_id.jpg"
    exercises the retry path just like typing "blurry photo of my ID" would.
    """
    session_id = request.form.get("session_id") or str(uuid.uuid4())
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400

    sess = get_session(session_id)
    description = f"Uploaded government ID photo (filename: {file.filename})"
    reply = handle_message(sess, description)
    return jsonify({
        "session_id": session_id,
        "reply": reply,
        "state": sess.state,
        "outcome": sess.outcome,
        "backend_actions": sess.backend_actions,
    })


if __name__ == "__main__":
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY is not set. Add it to .env before running.")
    app.run(debug=True, port=5000)
