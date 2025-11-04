import os
import json
import gradio as gr
from datetime import datetime
from openai import OpenAI
import threading

# 🔑 initialize OpenAI client
client = OpenAI(api_key="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")

# 📂 paths
AUDIO_FOLDER = "audio_files"
MEMORY_FILE = "memory.json"
stop_flag = False

# 🧠 load existing memory
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": []}

# 🔍 helper function to find existing case
def find_case(filename):
    for case in memory["cases"]:
        if case["case_id"] == filename.split(".")[0]:
            return case
    return None

# 🧩 main function
def process_audio_files():
    global stop_flag
    results = []
    audio_files = [f for f in os.listdir(AUDIO_FOLDER) if f.lower().endswith((".mp3", ".wav", ".m4a"))]

    if not audio_files:
        return "⚠️ No audio files found in 'audio_files' folder.", None

    for filename in audio_files:
        if stop_flag:
            break

        filepath = os.path.join(AUDIO_FOLDER, filename)
        print(f"\n🎙️ Processing file: {filename}")

        with open(filepath, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="text"
            )

        conversation_text = transcription.strip()
        existing_case = find_case(filename)

        if existing_case:
            prompt = f"""
You are a professional English-speaking medical AI assistant.

You have the previous diagnostic report for this patient:
{json.dumps(existing_case, ensure_ascii=False, indent=2)}

Now you received a new audio transcription (Arabic + English):
{conversation_text}

Update the existing report if there are new findings.
- Preserve existing info unless contradicted.
- Add any new symptoms, diagnoses, recommendations, or patient's age if mentioned.
- Always keep the report in English JSON format.
"""
        else:
            prompt = f"""
You are a professional English-speaking medical AI assistant.

Create a clear, structured diagnostic report in English for the following conversation (Arabic + English mixed):
{conversation_text}

Use this JSON structure:
{{
  "case_id": "unique string",
  "timestamp": "ISO 8601 date/time",
  "source_file": "original filename",
  "patient_info": {{
    "age": "patient age if mentioned, else 'unknown'",
    "symptoms": ["list of symptoms in English"],
    "duration": "how long symptoms lasted (if mentioned)",
    "other_notes": "contextual details"
  }},
  "possible_diagnosis": ["probable medical conditions (in English)"],
  "recommendations": ["next steps, treatments, or tests"],
  "urgency_level": "low | moderate | high"
}}
"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )

        diagnostic_report = json.loads(response.choices[0].message.content)
        diagnostic_report["case_id"] = filename.split(".")[0]
        diagnostic_report["timestamp"] = datetime.now().isoformat()
        diagnostic_report["source_file"] = filename

        if existing_case:
            memory["cases"].remove(existing_case)
        memory["cases"].append(diagnostic_report)

        results.append(f"✅ Processed: {filename}")

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    return "\n".join(results), json.dumps(memory, indent=2, ensure_ascii=False)

# 🚨 stop function
def stop_processing():
    global stop_flag
    stop_flag = True
    return "🛑 Processing stopped by user."

# 🖥️ Gradio UI
def start_processing():
    global stop_flag
    stop_flag = False
    thread = threading.Thread(target=process_audio_files)
    thread.start()
    return "▶️ Processing started..."

with gr.Blocks(title="AI Medical Transcriber") as demo:
    gr.Markdown("# 🩺 AI Medical Audio Transcriber & Report Generator")
    with gr.Row():
        start_btn = gr.Button("▶️ Start Transcription")
        stop_btn = gr.Button("🛑 Stop")
    output_text = gr.Textbox(label="System Log", lines=10)
    json_view = gr.JSON(label="📋 Memory File (Updated Reports)")

    start_btn.click(fn=process_audio_files, outputs=[output_text, json_view])
    stop_btn.click(fn=stop_processing, outputs=[output_text])

demo.launch()
