import os
from viocetoreportapp.transcription import (
    process_full_medical_report,
    _get_intake_case,
    memory
)

def test_full_pipeline_intake():
    # 1) Path to test audio file
    audio_path = "testing/audio_files/Recording (3).m4a"
    assert os.path.exists(audio_path), "Test audio file missing!"

    # 2) Run Phase 1 intake pipeline
    result = process_full_medical_report(
        audio_file_path=audio_path,
        phase="intake"
    )

    print("\nPipeline Output:", result)

    # 3) Validate basic structure
    assert isinstance(result, dict)
    assert "report_id" in result
    assert "clinical_history" in result
    assert "detailed_findings" in result
    assert "impression_summary" in result

    # 4) Validate it was saved to memory
    saved = _get_intake_case(result["report_id"])
    assert saved is not None, "Intake report not saved in memory!"
    assert saved["report_id"] == result["report_id"]

    print("\nRetrieved from Memory:", saved)

    # 5) Ensure no empty or missing important fields
    assert saved["clinical_history"] != ""
    assert isinstance(saved["detailed_findings"], list)
