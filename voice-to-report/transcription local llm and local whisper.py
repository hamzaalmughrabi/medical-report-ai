import os
import json
import subprocess
from faster_whisper import WhisperModel
import warnings

warnings.filterwarnings("ignore")

AUDIO_DIR = "audio_files"
MEMORY_FILE = "memory.json"
LLM_MODEL = "tinyllama"  # استخدام TinyLlama فقط
USE_CPU = True            # تشغيل على CPU لتجنب مشاكل CUDA

# -----------------------------
# 🧠 وظيفة: تشغيل موديل Ollama
# -----------------------------
def run_local_llm(prompt):
    try:
        cmd = ["ollama", "run", "tinyllama", prompt]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            print(f"⚠️ tinyllama failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"⚠️ Error running tinyllama: {e}")
        return None

# -----------------------------
# 🧩 تحميل الذاكرة السابقة
# -----------------------------
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": []}

# -----------------------------
# 🎧 تحميل faster-whisper
# -----------------------------
print("Loading faster-whisper model: medium on cpu")
model = WhisperModel("small", device="cuda")

# -----------------------------
# 🎙️ معالجة الملفات الصوتية
# -----------------------------
for filename in os.listdir(AUDIO_DIR):
    if not filename.lower().endswith((".wav", ".mp3")):
        continue

    filepath = os.path.join(AUDIO_DIR, filename)
    print(f"\nProcessing file: {filename}")
    print(f"  ▶ Transcribing with faster-whisper: {filepath}")

    # 1️⃣ تحويل الصوت إلى نص
    segments, info = model.transcribe(filepath)
    transcript = " ".join([seg.text for seg in segments])
    print(f"  ✅ Transcribed ({info.language})")

    # 2️⃣ بناء البرومبت
    prompt = f"""
You are a professional English-speaking medical AI assistant.

Analyze the following doctor-patient conversation (Arabic + English mixed)
and produce a structured diagnostic report in **English JSON format only**.

Use this structure:
{{
  "patient_info": {{
    "symptoms": [],
    "duration": "",
    "other_notes": ""
  }},
  "possible_diagnosis": [],
  "recommendations": [],
  "urgency_level": ""
}}

Previous cases:
{json.dumps(memory['cases'], ensure_ascii=False, indent=2)}

Conversation:
{transcript}
"""

    # 3️⃣ تشغيل الـ LLM المحلي (TinyLlama)
    response = run_local_llm(prompt)

    if not response:
        print(f"❌ Failed to get response for {filename}\n")
        continue

    # 4️⃣ محاولة قراءة JSON الناتج
    try:
        report = json.loads(response)
    except json.JSONDecodeError:
        print("⚠️ Model response not pure JSON, trying cleanup...")
        start = response.find("{")
        end = response.rfind("}")
        if start != -1 and end != -1:
            try:
                report = json.loads(response[start:end+1])
            except Exception:
                print("⚠️ Could not parse JSON.")
                continue
        else:
            continue

    # 5️⃣ حفظ الذاكرة
    memory["cases"].append(report)
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    print(f"✅ Report saved for {filename}")

print("\n🏁 Done. All results stored in memory.json")
