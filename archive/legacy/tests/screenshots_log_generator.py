import time
from viocetoreportapp.transcription import process_full_medical_report

# ===============================
# 1) End-to-End Timing Log
# ===============================
print("\n" + "="*60)
print(" FIGURE 6.3.1 — End-to-End Response Time Log")
print("="*60)

start = time.time()
result = process_full_medical_report(
    audio_file_path="testing/audio_files/MSK0005.mp3",
    phase="intake"
)
end = time.time()

print(f"\nTOTAL PIPELINE TIME: {end - start:.3f} seconds")
print("="*60 + "\n")


# ===============================
# 2) PDF Generation Timing
# ===============================
print("\n" + "="*60)
print(" FIGURE 6.3.4 — PDF Generation Timing")
print("="*60)

# لازم يكون عندك JSON report جاهز من قبل (أي واحد)
dummy_report = {
    "report_id": "demo_pdf",
    "phase": "final_assessment",
    "patient_name": "Test Patient",
    "age": "30",
    "sex": "Male",
    "dob": "N/A",
    "referring_doctor": "N/A",
    "exam_date": "2025-01-01",
    "exam_type": "General",
    "clinical_history": "Test",
    "detailed_findings": [],
    "impression_summary": "Test",
    "recommendations": [],
    "urgency_level": "low"
}

from viocetoreportapp.json_to_pdf import make_pdf_from_case

pdf_start = time.time()
make_pdf_from_case(dummy_report, "reports/test_pdf.pdf")
pdf_end = time.time()

print(f"PDF GENERATED IN: {pdf_end - pdf_start:.3f} seconds")
print("="*60 + "\n")


# ===============================
# 3) Long-Run Stability Log
# ===============================
print("\n" + "="*60)
print(" FIGURE 6.3.5 — Long-Run Stability (20 Runs)")
print("="*60)

for i in range(1, 21):
    print(f"\n---- RUN #{i} ----")
    loop_start = time.time()
    try:
        process_full_medical_report(
            audio_file_path="testing/audio_files/MSK0005.mp3",
            phase="intake"
        )
        print("Status: OK")
    except Exception as e:
        print("Status: ERROR →", e)

    loop_end = time.time()
    print(f"Run Time: {loop_end - loop_start:.3f} seconds")

print("\n" + "="*60)
print(" END OF STRESS TEST LOG")
print("="*60)
