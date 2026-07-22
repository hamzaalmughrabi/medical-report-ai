import os
import json
from viocetoreportapp.json_to_pdf import make_pdf_from_case


def test_pdf_generation():
    # 1) Prepare a minimal valid JSON report
    sample_report = {
        "report_id": "test_pdf_001",
        "phase": "final_assessment",
        "patient_name": "John Doe",
        "age": "45",
        "sex": "Male",
        "dob": "1979-01-01",
        "referring_doctor": "Dr. Smith",
        "exam_date": "2025-01-01",
        "exam_type": "Chest Pain Evaluation",
        "clinical_history": "Patient reports chest pain radiating to left arm.",
        "detailed_findings": [
            {"finding": "Chest pain", "explanation": "Possible cardiac origin"}
        ],
        "impression_summary": "Findings are consistent with possible angina.",
        "recommendations": ["ECG", "Cardiology follow-up"],
        "urgency_level": "moderate"
    }

    # 2) Output path (same style as your system)
    output_path = f"reports/{sample_report['report_id']}.pdf"

    # Ensure reports directory exists
    os.makedirs("reports", exist_ok=True)

    # 3) Generate the PDF
    make_pdf_from_case(sample_report, output_path)

    # 4) Validate the file exists
    assert os.path.exists(output_path), "PDF file was NOT generated!"

    # 5) Validate file is not empty
    assert os.path.getsize(output_path) > 0, "PDF file is empty!"

    print("\nPDF generated successfully at:", output_path)
