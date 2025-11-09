import os
import json
from datetime import datetime
from openai import OpenAI

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


def process_audio_to_json(audio_file_path: str):
    """
    Process audio -> transcription -> LLM -> JSON report -> PDF.
    Returns: (diagnostic_report_dict, pdf_path)
    If a case already in memory and has pdf stored, returns that immediately.
    """

    filename = os.path.basename(audio_file_path)
    case_id = filename.split(".")[0]

    # check existing case
    existing_case = next((c for c in memory.get("cases", []) if c.get("report_id") == case_id), None)

    if existing_case:
        print(f"♻️ Report found in memory for Case ID: {case_id}. Returning existing report (if PDF exists, reuse).")
        pdf_path = existing_case.get("_pdf_path")
        # if pdf exists on disk, return both
        if pdf_path and os.path.exists(pdf_path):
            return existing_case, pdf_path
        # otherwise regenerate PDF from the stored JSON
        try:
            pdf_path = make_pdf_from_case(existing_case)
            existing_case["_pdf_path"] = pdf_path
            _save_memory()
            return existing_case, pdf_path
        except Exception as e:
            # if PDF generation fails, still return the JSON and let caller decide
            print("⚠️ Failed to regenerate PDF from memory:", e)
            return existing_case, None

    # No existing case -> proceed
    print(f"\n🎙️ Processing file: {filename}")

    # 1) Transcribe using Whisper API (verbose_json gives more metadata but we just need text)
    with open(audio_file_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )
    # Different client shapes: safer access
    conversation_text = ""
    if isinstance(transcription, dict) and transcription.get("text"):
        conversation_text = transcription.get("text", "").strip()
    else:
        # try attribute
        conversation_text = getattr(transcription, "text", "") or ""
        conversation_text = str(conversation_text).strip()

    print("✅ Transcription complete.")

    # Build prompt
    prompt = f"""
You are a highly specialized Medical AI Assistant acting as a Doctor-Level Report Extractor and Formatter.

Your task is to analyze a raw transcript of a doctor's voice recording and convert it into a structured JSON report following this schema exactly:
{TARGET_SCHEMA_JSON}

If a field is missing use "N/A" or [] respectively. Output only valid JSON.

Transcript:
{conversation_text}
"""

    print("Sending text to LLM for analysis...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=3500
    )
    print("✅ Analysis received.")

    diagnostic_report = _safe_parse_llm_response(response)

    # ensure minimum structure & metadata
    diagnostic_report["report_id"] = case_id
    diagnostic_report["timestamp"] = datetime.now().isoformat()
    diagnostic_report["source_file"] = filename

    # generate PDF and attach path
    try:
        pdf_path = make_pdf_from_case(diagnostic_report)
        diagnostic_report["_pdf_path"] = pdf_path
    except Exception as e:
        print("⚠️ PDF generation failed:", e)
        pdf_path = None

    # save to memory
    memory.setdefault("cases", []).append(diagnostic_report)
    _save_memory()
    print(f"Memory file updated with Case ID: {case_id}")

    return diagnostic_report, pdf_path
