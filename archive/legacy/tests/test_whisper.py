import os
from openai import OpenAI
from dotenv import load_dotenv

def test_real_whisper_transcription():

    # Load .env file
    load_dotenv()

    # Read the key from .env
    api_key = os.getenv("OPENAI_API_KEY")
    assert api_key is not None, "API key not found in .env"

    client = OpenAI(api_key=api_key)

    audio_path = "testing/audio_files/test2.mp3"
    assert os.path.exists(audio_path), "Audio file missing!"

    with open(audio_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
        )

    text = transcription.text.strip()

    print("\nTranscription result:", text)

    # اختبارات بسيطة
    assert len(text) > 0
    assert isinstance(text, str)
