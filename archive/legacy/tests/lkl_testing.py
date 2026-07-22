from viocetoreportapp.transcription import memory, process_full_medical_report
from unittest.mock import MagicMock, patch, mock_open


def test_lkl_auto_learning_phase2():

    # Ensure Phase 1 exists
    intake_case = None
    for c in memory.get("cases", []):
        if c.get("report_id") == "Recording (3)":
            intake_case = c
            break

    assert intake_case is not None, "Phase 1 intake case missing."

    fake_transcript = """
    Final dictation: patient shows improved breathing,
    stable vitals, and significant reduction in discomfort.
    """

    mock_whisper = MagicMock()
    mock_whisper.text = fake_transcript

    # Patch audio file open only
    def fake_open(path, mode="r", *args, **kwargs):
        if "mock.m4a" in path:
            return mock_open(read_data=b"FAKE AUDIO DATA").return_value
        return open_original(path, mode, *args, **kwargs)

    # Save original open
    open_original = open

    with patch("builtins.open", side_effect=fake_open), \
         patch("viocetoreportapp.transcription.client.audio.transcriptions.create",
               return_value=mock_whisper):

        result = process_full_medical_report(
            audio_file_path="mock.m4a",
            phase="final_assessment",
            intake_case_id="Recording (3)"
        )

    # Final check
    assert isinstance(result, dict)
    assert result.get("phase") == "final_assessment"
