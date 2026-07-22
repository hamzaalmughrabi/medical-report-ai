import sys
from unittest.mock import MagicMock, patch
from viocetoreportapp.transcription import process_full_medical_report


# Helper: allow open() normally EXCEPT for missing audio file
def fake_open(path, *args, **kwargs):
    if "not_found.mp3" in path:
        raise FileNotFoundError
    return open_original(path, *args, **kwargs)


# Backup the real open before patching
open_original = open


def test_error_missing_audio_file():

    fake_audio = "testing/audio_files/not_found.mp3"

    with patch("builtins.open", side_effect=fake_open):
        result = process_full_medical_report(
            audio_file_path=fake_audio,
            phase="intake"
        )

    assert "error" in result
    print("Result:", result)
