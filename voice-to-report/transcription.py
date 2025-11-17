import os
import json
from datetime import datetime
from openai import OpenAI

# Local Knowledge Layer
from lkl.lkl_manager import LKLManager

# PDF generator
from json_to_pdf import make_pdf_from_case

OUTPUT_DIR = "outputs"
AUDIO_FOLDER = "audio_files"
MEMORY_FILE = "memory.json"

# -------------------
#   OpenAI Key
# -------------------
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise ValueError("❌ ERROR: OPENAI_API_KEY not set")

client = OpenAI(api_key=api_key)


# -------------------
# MEMORY LOADING
# -------------------
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": []}


def _save_memory():
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)


# --------------------------------------------------
# SAFELY PARSE GPT OUTPUT
# --------------------------------------------------
def _safe_parse_llm_response(resp):
    try:
        content = resp.choices[0].message.content
    except:
        content = None

    if content is None:
        return {}

    if isinstance(content, dict):
        return content

    try:
        return json.loads(content)
    except:
        import re
        m = re.search(r"\{.*\}", content, flags=re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except:
                pass

    return {"raw_output": str(content)}


# --------------------------------------------------
# MAIN PIPELINE FUNCTION
# --------------------------------------------------
def process_audio_to_json(audio_file_path: str):
    """
    Audio > Whisper > LKL > GPT > JSON > PDF
    """

    # Initialize Local Knowledge Layer
    lkl = LKLManager("lkl/lkl.json")

    filename = os.path.basename(audio_file_path)
    case_id = filename.split(".")[0]

    print(f"\n🎙️ Processing file: {filename}")

    # --------------------------------------------------
    # STEP 1 — TRANSCRIBE
    # --------------------------------------------------
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


    # --------------------------------------------------
    # STEP 2 — LKL CATEGORY MATCHING
    # --------------------------------------------------
    matched_category = lkl.match_category(conversation_text)
    print("📌 Detected Category:", matched_category)

    # Retrieve category knowledge
    lkl_knowledge = lkl.get_category_knowledge(matched_category) if matched_category else None


    # --------------------------------------------------
    # STEP 3 — DETECT MISSING INFORMATION
    # --------------------------------------------------
    missing_info = []
    if matched_category:
        missing_info = lkl.detect_missing_info(matched_category, conversation_text)
    print("❓ Missing Info:", missing_info)


    # --------------------------------------------------
    # STEP 4 — TEMPLATE SUGGESTION
    # --------------------------------------------------
    templates = {}
    if matched_category:
        templates = lkl.suggest_templates(matched_category)

    print("📄 Templates Loaded.")


    # --------------------------------------------------
    # STEP 5 — BUILD GPT PROMPT WITH LKL CONTEXT
    # --------------------------------------------------
    TARGET_SCHEMA_JSON = """{
      "report_id": "",
      "patient_name": "",
      "age": "",
      "sex": "",
      "dob": "",
      "referring_doctor": "",
      "exam_date": "",
      "exam_type": "",
      "clinical_history": "",
      "detailed_findings": [{"finding":"","explanation":""}],
      "impression_summary": "",
      "recommendations": [],
      "urgency_level": ""
    }"""

    prompt = f"""
You are a Medical Report Generator AI.  
Your PRIMARY KNOWLEDGE SOURCE = Local Knowledge Layer (LKL).  
Use LKL FIRST before model reasoning.

---

### LKL CATEGORY:
{matched_category}

### LKL KNOWLEDGE:
{json.dumps(lkl_knowledge, indent=2)}

### Missing Information (Ask Doctor These If Needed):
{missing_info}

### Template Suggestions:
{json.dumps(templates, indent=2)}

---

### TRANSCRIPT:
{conversation_text}

---

### TASK:
Generate a structured JSON following EXACTLY this schema:

{TARGET_SCHEMA_JSON}

Rules:
- Use LKL knowledge first.
- Extract ALL clinical details.
- Findings must be atomic and detailed.
- Add explanations to each finding.
- Use clinical professional language.
- OUTPUT JSON ONLY.
"""

    # --------------------------------------------------
    # STEP 6 — GPT CALL
    # --------------------------------------------------
    print("🚀 Sending prompt to GPT...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=3500
    )

    diagnostic_report = _safe_parse_llm_response(response)

    # Add metadata
    diagnostic_report["report_id"] = case_id
    diagnostic_report["timestamp"] = datetime.now().isoformat()
    diagnostic_report["_category"] = matched_category
    diagnostic_report["_missing_info"] = missing_info
    diagnostic_report["source_file"] = filename


    # --------------------------------------------------
    # STEP 7 — PDF GENERATION
    # --------------------------------------------------
    try:
        pdf_path = make_pdf_from_case(diagnostic_report)
        diagnostic_report["_pdf_path"] = pdf_path
    except Exception as e:
        print("⚠️ PDF Failed:", e)
        pdf_path = None


    # --------------------------------------------------
    # STEP 8 — SAVE REPORT TO MEMORY
    # --------------------------------------------------
    memory["cases"].append(diagnostic_report)
    _save_memory()
    print("💾 Saved Case:", case_id)

    return diagnostic_report, pdf_path
