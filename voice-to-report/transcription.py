import os
import json
from datetime import datetime
from openai import OpenAI

from lkl.lkl_manager import LKLManager
from json_to_pdf import make_pdf_from_case

# Init OpenAI client
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY is missing.")
client = OpenAI(api_key=api_key)

MEMORY_FILE = "memory.json"

TARGET_SCHEMA_JSON = """{
  "report_id": "string",
  "phase": "intake | final_assessment",
  "patient_name": "string",
  "age": "string",
  "sex": "string",
  "dob": "string",
  "referring_doctor": "string",
  "exam_date": "string",
  "exam_type": "string",
  "clinical_history": "string",
  "detailed_findings": [{"finding":"string","explanation":"string"}],
  "impression_summary": "string",
  "recommendations": ["string"],
  "urgency_level": "low | moderate | high | N/A"
}"""

# Load memory
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": []}


def _save_memory():
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)


def _safe_parse_llm_response(resp):
    try:
        content = resp.choices[0].message.content
    except Exception:
        return {"error": "LLM returned no content"}

    if isinstance(content, dict):
        return content

    try:
        return json.loads(content)
    except Exception:
        return {"raw_output": str(content)}


# =====================================================================
# FULL PIPELINE: Used for PHASE 1 + PHASE 2
# =====================================================================
def process_full_medical_report(audio_file_path: str, phase: str):
    """
    PHASE:
      - "intake"            → doctor ↔ patient
      - "final_assessment"  → doctor only
    """

    lkl = LKLManager()
    filename = os.path.basename(audio_file_path)
    case_id = filename.split(".")[0]

    print(f"\n🎙️ Processing PHASE={phase} → file={filename}")

    # STEP 1 — Whisper
    with open(audio_file_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )

    conversation_text = getattr(transcription, "text", "").strip()
    print("✅ Whisper transcription complete.")

    # STEP 2 — LKL
    category = lkl.detect_category(conversation_text)
    missing_info = lkl.detect_missing_info(category, conversation_text) if category else []
    templates = lkl.suggest_templates(category) if category else []
    knowledge = lkl.get_category_knowledge(category)

    # STEP 3 — GPT
    prompt = f"""
You are a highly specialized Medical Report Generator.

PHASE: {phase}

CATEGORY: {category}

Use ONLY the LKL knowledge below:
{json.dumps(knowledge, indent=2)}

FULL TRANSCRIPT:
{conversation_text}

Generate a JSON MEDICAL REPORT using this schema:
{TARGET_SCHEMA_JSON}

RULES:
- Fill ALL fields using the transcript.
- detailed_findings MUST include every finding + explanation.
- impression_summary must be doctor-style.
- recommendations must be a list.
- DO NOT hallucinate.
- Output ONLY JSON.
"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=4000,
    )

    report = _safe_parse_llm_response(response)

    # STEP 4 — Metadata
    report["report_id"] = case_id
    report["phase"] = phase
    report["timestamp"] = datetime.now().isoformat()
    report["_category"] = category
    report["_missing_info"] = missing_info

    # Save only Phase 1 for the Phase 2 list
    if phase == "intake":
        memory["cases"].append(report)
        _save_memory()

    print(f"💾 Saved {phase} report: {case_id}")

    return report


# =====================================================================
# FIXED PDF GENERATOR — RETURNS PATH (IMPORTANT!!)
# =====================================================================
def make_pdf_from_report(report_json):
    """
    Converts JSON → PDF and RETURNS the path.
    """

    os.makedirs("reports", exist_ok=True)

    report_id = report_json.get("report_id", f"report_{int(datetime.now().timestamp())}")
    output_path = os.path.join("reports", f"{report_id}_final.pdf")

    try:
        # Generate PDF
        make_pdf_from_case(report_json, output_path)

        if not os.path.isfile(output_path):
            raise RuntimeError("PDF was not created.")

        print(f"✅ PDF successfully created at {output_path}")

        # 🔥 CRITICAL FIX — return the path
        return output_path

    except Exception as e:
        print(f"❌ Failed generating PDF: {e}")
        return None
