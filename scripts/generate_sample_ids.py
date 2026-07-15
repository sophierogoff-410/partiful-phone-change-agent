"""
One-off dev script: generates small placeholder JPEGs for demo purposes.

These are NOT real IDs -- just colored placeholder images so there's something
to actually pick in the file dialog when recording the demo. Filenames matter:
the app derives its mocked verification result from the uploaded filename (see
app.py::api_upload_id and agent.py::mock_identity_verification), so each name
below is chosen to exercise a specific test path.

Requires Pillow (`pip install pillow`) -- not a runtime dependency of the app,
only needed to run this script.

Usage: python scripts/generate_sample_ids.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent.parent / "sample_ids"

SAMPLES = {
    "clear_drivers_license.jpg": ((80, 200, 120), "CLEAR"),      # verifies successfully
    "blurry_id_photo.jpg": ((200, 200, 200), "BLURRY"),          # retryable failure
    "expired_id.jpg": ((200, 120, 80), "EXPIRED"),               # non-retryable failure
    "id_name_mismatch.jpg": ((200, 80, 80), "MISMATCH"),         # fraud signal, escalate
}


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    for filename, (color, label) in SAMPLES.items():
        img = Image.new("RGB", (400, 250), color=color)
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, 390, 240], outline=(255, 255, 255), width=3)
        draw.text((20, 20), "SAMPLE ID (demo placeholder)", fill=(255, 255, 255))
        draw.text((20, 110), label, fill=(255, 255, 255))
        path = OUT_DIR / filename
        img.save(path, "JPEG")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
