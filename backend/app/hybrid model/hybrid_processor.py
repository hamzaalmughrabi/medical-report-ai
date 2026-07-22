import whisperx
from openai_analyzer import analyze_text
import json
import os

def process_audio_locally(audio_path, output_dir="outputs"):
    os.makedirs(output_dir, exist_ok=True)


    # NOTE: Device must be "cuda" for GPU usage
    device = "cuda"  # or "cpu"
    model = whisperx.load_model("large-v3", device)
    print("✅ Success! faster-whisper can see the GPU.", audio_path)

    # Transcription step
    # If the cublas error persists, it will fail here.
    segments, info = model.transcribe(audio_path)
    text = " ".join([seg.text for seg in segments])
    print("✅ Local transcription done!")

    # Analyze text via LLM (Mocked in openai_analyzer.py for now)
    print("🧠 Sending text to LLM for analysis...")
    json_data = analyze_text(text)
    print("✅ Analysis received!")

    json_path = os.path.join(output_dir, "report.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)

    print(f"📄 JSON saved to {json_path}")
    return json_data, json_path
