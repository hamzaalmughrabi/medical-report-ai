# main_pipeline.py
import os
import uuid
from transcription import process_full_medical_report  # handles Whisper + LLM
from json_to_pdf import make_pdf_from_case  # generates the PDF


def process_audio(audio_path: str):
    """
    Full pipeline:
    1. Process audio (Whisper + LLM)
    2. Generate PDF report
    """
    print(f"🎙️ Processing: {audio_path}")
    report = process_full_medical_report(audio_path, phase="intake")

    # Add file info
    report["case_id"] = report.get("report_id", str(uuid.uuid4()))
    report["source_file"] = os.path.basename(audio_path)

    print("📄 Generating PDF...")
    pdf_path = make_pdf_from_case(report, f"reports/{report['case_id']}_final.pdf")

    print(f"✅ Done! PDF saved at: {pdf_path}")
    return pdf_path
