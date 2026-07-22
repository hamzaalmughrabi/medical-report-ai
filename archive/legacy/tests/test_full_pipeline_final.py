import os
from unittest.mock import patch, MagicMock, mock_open
from viocetoreportapp.transcription import process_full_medical_report, memory


def test_full_pipeline_final_assessment():

    # -------------------------------------------------------
    # 1) Ensure Phase 1 exists
    # -------------------------------------------------------
    intake_case = None
    for c in memory.get("cases", []):
        if c.get("report_id") == "Recording (3)":
            intake_case = c
            break

    assert intake_case is not None, "Phase 1 intake report not found. Run intake test first."

    # -------------------------------------------------------
    # 2) Fake FINAL dictation transcript
    # -------------------------------------------------------
    fake_transcript = """
    Final clinical dictation: Patient shows significant improvement
    in chest discomfort, normal breathing effort, and stable vitals.
    Plan includes follow-up examination in 2 weeks.
    """

    mock_whisper = MagicMock()
    mock_whisper.text = fake_transcript

    # -------------------------------------------------------
    # 3) FIX: Capture REAL open BEFORE patching
    # -------------------------------------------------------
    real_open = open

    def fake_open(path, mode="r", *args, **kwargs):
        # patch ONLY the audio file
        if "does_not_matter.m4a" in path:
            return mock_open(read_data=b"FAKE AUDIO DATA").return_value

        # otherwise use REAL open
        return real_open(path, mode, *args, **kwargs)

    # -------------------------------------------------------
    # 4) Patch open() + Whisper
    # -------------------------------------------------------
    with patch("builtins.open", side_effect=fake_open), \
         patch("viocetoreportapp.transcription.client.audio.transcriptions.create",
               return_value=mock_whisper):

        result = process_full_medical_report(
            audio_file_path="does_not_matter.m4a",
            phase="final_assessment",
            intake_case_id="Recording (3)"
        )

    # -------------------------------------------------------
    # 5) Assertions
    # -------------------------------------------------------
    assert isinstance(result, dict)
    assert result.get("phase") == "final_assessment"
    assert "clinical_history" in result
    assert "detailed_findings" in result
    assert "impression_summary" in result
    assert "recommendations" in result

    print("\nFinal Phase 2 JSON:\n", result)
