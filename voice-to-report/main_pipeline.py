# main_pipeline.py
import os
import uuid
from transcription import process_audio_to_json   # handles Whisper + LLM
from json_to_pdf import make_pdf_from_case     # generates the PDF


def process_audio(audio_path: str):
    """
    Full pipeline:
    1. Process audio (Whisper + LLM)
    2. Generate PDF report
    """
    print(f"🎙️ Processing: {audio_path}")
    json_data, _ = process_audio_to_json(audio_path)

    # Add file info
    json_data["case_id"] = json_data.get("report_id", str(uuid.uuid4()))
    json_data["source_file"] = os.path.basename(audio_path)

    # Build output path
    output_dir = "reports"
    os.makedirs(output_dir, exist_ok=True)
    pdf_path = os.path.join(output_dir, f"{json_data['case_id']}_intake.pdf")

    print("📄 Generating PDF...")
    make_pdf_from_case(json_data, pdf_path)

    print(f"✅ Done! PDF saved at: {pdf_path}")
    return pdf_path
