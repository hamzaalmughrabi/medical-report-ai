import os
import json
from lkl.lkl_manager import LKLManager

from datetime import datetime
from openai import OpenAI
OUTPUT_DIR = "outputs"
# ensure this import matches your project file
from json_to_pdf import make_pdf_from_case

# --- SECURITY WARNING ---
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise ValueError("The OPENAI_API_KEY environment variable is not set. Please set it to proceed.")
client = OpenAI(api_key=api_key)

AUDIO_FOLDER = "audio_files"
MEMORY_FILE = "memory.json"

TARGET_SCHEMA_JSON = """{
  "report_id": "string (unique identifier, e.g., file name or auto-generated ID)",
  "patient_name": "string or N/A",
  "age": "string or N/A",
  "sex": "string or N/A",
  "dob": "string or N/A",
  "referring_doctor": "string or N/A",
  "exam_date": "ISO date/time or N/A",
  "exam_type": "string (e.g., MRI Knee w/o Contrast, Chest X-ray, CT Brain)",
  "clinical_history": "string — full description ...",
  "detailed_findings": [{"finding":"string","explanation":"string"}],
  "impression_summary": "string",
  "recommendations": ["string"],
  "urgency_level": "low | moderate | high | N/A"
}"""

# load memory
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": []}


def _save_memory():
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)


def _safe_parse_llm_response(resp):
    """
    Accepts the raw response from the OpenAI client and returns a dict.
    Handles cases where `response.choices[0].message.content` might already be a dict
    or a JSON string. Returns an empty dict on parse failure.
    """
    try:
        content = resp.choices[0].message.content
    except Exception:
        # older/newer client shapes - guard
        try:
            content = resp["choices"][0]["message"]["content"]
        except Exception:
            content = None

    if content is None:
        return {}

    if isinstance(content, dict):
        return content
    # if it's already JSON string
    try:
        return json.loads(content)
    except Exception:
        # sometimes the model returns single quotes or trailing text; attempt to extract JSON with regex
        import re
        m = re.search(r"\{.*\}", content, flags=re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    # fallback: return as plain text in a field so nothing is lost
    return {"raw_output": str(content)}

# 1) LKL Category Matching
category = lkl.match_category(conversation_text)

# 2) Retrieve Knowledge Package
knowledge = lkl.get_category_knowledge(category) if category else None

def process_audio_to_json(audio_file_path: str):
    """
    Process audio -> transcription -> LKL -> LLM -> JSON report -> PDF.
    """

    # Initialize LKL
    lkl = LKLManager()

    filename = os.path.basename(audio_file_path)
    case_id = filename.split(".")[0]

    print(f"\n🎙️ Processing file: {filename}")

    # STEP 1 — TRANSCRIBE
    with open(audio_file_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )

    conversation_text = ""
    if isinstance(transcription, dict) and transcription.get("text"):
        conversation_text = transcription.get("text", "").strip()
    else:
        conversation_text = getattr(transcription, "text", "") or ""
        conversation_text = str(conversation_text).strip()

    print("✅ Transcription complete.")

    # STEP 2 — LKL CATEGORY MATCHING
    category = lkl.detect_category(conversation_text)
    print(f"📌 Detected Category: {category}")

    # STEP 3 — DETECT MISSING INFO
    missing_info = []
    if category:
        missing_info = lkl.detect_missing_info(category, conversation_text)
    print(f"❓ Missing Info Questions: {missing_info}")

    # STEP 4 — TEMPLATE SUGGESTION
    templates = {}
    if category:
        templates = lkl.suggest_templates(category)
    print("📄 Suggested Templates Loaded.")

    # STEP 5 — BUILD GPT PROMPT WITH LKL CONTEXT
    lkl_context = f"""
    ### LKL Context (Local Knowledge Layer)
    Detected Category: {category}

    Missing Clinical Questions:
    {missing_info}

    Suggested Findings Templates:
    {templates.get("findings_templates", [])}

    Suggested Impression Templates:
    {templates.get("impression_templates", [])}
    """

    prompt = f"""
You are a highly specialized Medical AI Assistant acting as a Doctor-Level Report Generator.

Your job: Convert the transcript into a structured JSON using strict medical reporting rules.

Use the Local Knowledge Layer information below to enhance accuracy and deepen the analysis.

{lkl_context}

The JSON schema you MUST follow:
{TARGET_SCHEMA_JSON}

Transcript:
{conversation_text}

Output ONLY valid JSON. No prose. No markdown.
"""

    # STEP 6 — CALL GPT
    print("🚀 Sending enhanced prompt to GPT...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=3500
    )

    diagnostic_report = _safe_parse_llm_response(response)

    # STEP 7 — ENRICH REPORT WITH METADATA
    diagnostic_report["report_id"] = case_id
    diagnostic_report["timestamp"] = datetime.now().isoformat()
    diagnostic_report["source_file"] = filename
    diagnostic_report["_category"] = category
    diagnostic_report["_missing_info"] = missing_info

    # STEP 8 — GENERATE PDF
    try:
        pdf_path = make_pdf_from_case(diagnostic_report)
        diagnostic_report["_pdf_path"] = pdf_path
    except Exception as e:
        print("⚠️ PDF generation failed:", e)
        pdf_path = None

    # STEP 9 — SAVE CASE
    memory.setdefault("cases", []).append(diagnostic_report)
    _save_memory()
    print(f"💾 Case saved: {case_id}")

    return diagnostic_report, pdf_path

