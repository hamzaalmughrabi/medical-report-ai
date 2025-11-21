# transcription.py
import os
import json
from datetime import datetime
from typing import Any, Dict, Tuple
from openai import OpenAI

from lkl.lkl_manager import LKLManager
from json_to_pdf import make_pdf_from_case, make_pdf_from_report as _make_pdf_from_report

# -----------------------------
# OpenAI client initialization
# -----------------------------
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY is missing. Please set it in your environment.")
client = OpenAI(api_key=api_key)

MEMORY_FILE = "memory.json"

TARGET_SCHEMA_JSON = """{
  \"report_id\": \"string\",
  \"phase\": \"intake | final_assessment\",
  \"patient_name\": \"string\",
  \"age\": \"string\",
  \"sex\": \"string\",
  \"dob\": \"string\",
  \"referring_doctor\": \"string\",
  \"exam_date\": \"string\",
  \"exam_type\": \"string\",
  \"clinical_history\": \"string\",
  \"detailed_findings\": [{\"finding\":\"string\",\"explanation\":\"string\"}],
  \"impression_summary\": \"string\",
  \"recommendations\": [\"string\"],
  \"urgency_level\": \"low | moderate | high | N/A\"
}"""

# -----------------------------
# Memory load/save
# -----------------------------
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": [], "final_reports": []}


def _save_memory():
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)


def _safe_parse_llm_response(resp: Any) -> Dict[str, Any]:
    """Return dict from OpenAI response, even if it’s a raw string."""
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


def _get_intake_case(case_id: str):
    """
    Look up an intake case by report_id from memory["cases"].
    Returns dict or {} if not found.
    """
    if not case_id:
        return {}

    for c in memory.get("cases", []):
        if c.get("report_id") == case_id:
            return c
    return {}


# =====================================================================
# FULL PIPELINE
# =====================================================================
def process_full_medical_report(
    audio_file_path: str,
    phase: str,
    intake_case_id: str | None = None,
):
    """
    Phase 1 (intake):
        audio -> Whisper -> LKL -> LLM(JSON) -> auto-learn -> save as intake case

    Phase 2 (final_assessment):
        intake JSON + doctor final audio -> LKL -> LLM(JSON) -> auto-learn -> save final report
    """

    lkl = LKLManager()  # uses lkl/lkl.json by default
    filename = os.path.basename(audio_file_path)
    case_id_from_file = filename.split(".")[0]

    print(f"\n🎙 Processing PHASE={phase} → file={filename}")

    # --------------------------------------------------------
    # STEP 1 — TRANSCRIBE AUDIO (common to both phases)
    # --------------------------------------------------------
    try:
        with open(audio_file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
            )
        transcript_text = getattr(transcription, "text", "").strip()
        print("✅ Whisper transcription complete.")
    except Exception as e:
        print(f"🛑 Transcription failed: {e}")
        return {"error": "Transcription failed."}

    # --------------------------------------------------------
    # PHASE 1: INTAKE PIPELINE
    # --------------------------------------------------------
    if phase == "intake":
        category = lkl.detect_category(transcript_text)
        missing_info = (
            lkl.detect_missing_info(category, transcript_text) if category else []
        )
        knowledge = lkl.get_category_knowledge(category) if category else {}

        prompt = f"""
You are an OSCE-style medical intake report generator (Phase 1).
You must always respond in English only.
If the transcript contains Arabic or any other language, translate the content into English.
Patient name MUST always be converted into English characters only.
No Arabic, no transliteration, no mixed language.

TRANSCRIPT (translate to English if needed):
{transcript_text}

LKL CATEGORY: {category}
LKL KNOWLEDGE:
{json.dumps(knowledge, indent=2)}

LKL MISSING INFO HINTS:
{json.dumps(missing_info, indent=2)}

TASK:
Use the embedded OSCE question set below to extract and organize history. Produce a structured JSON intake report using this schema:
{TARGET_SCHEMA_JSON}

OSCE CATEGORIES TO COVER:
1) PATIENT PROFILE: Patient name (convert to English only), Age, Sex, Marital status, Job, Address, Place of admission, Referral source & time, Source of history, Who took the history (date/time).
2) CHIEF COMPLAINT: Main problem in patient's own words, Duration, No medical jargon.
3) HISTORY OF PRESENTING ILLNESS (SOCRATES): Site, Onset (what they were doing at onset), Character, Radiation, Associated symptoms, Timing (duration, episodic/continuous), Exacerbating factors, Relieving factors, Severity (0–10), Previous similar episodes, Relevant investigations or medications already tried.
4) SYSTEMATIC REVIEW / ROS: General/Wellbeing/Appetite/Weight change/Energy/Sleep/Mood; Cardiovascular (chest pain, orthopnea, PND, palpitations, claudication, ankle swelling); Respiratory (shortness of breath, cough dry/productive, sputum, hemoptysis, wheeze); Gastrointestinal (oral ulcers, dysphagia, odynophagia, nausea/vomiting, hematemesis, indigestion, abdominal pain, bowel habit change, stool color/consistency); Urinary (dysuria, frequency/urgency, nocturia, hematuria, incontinence); Genital (menstrual history, vaginal discharge, dyspareunia, prostatic symptoms when relevant); Endocrine (heat/cold intolerance, excessive sweating, polydipsia); Musculoskeletal (joint pain, stiffness, swelling, falls); Neurological (headache, dizziness, fainting, seizures, numbness, weakness, vision/hearing changes, memory issues); Bleeding diathesis (easy bruising, rash).
5) PAST MEDICAL HISTORY: Chronic diseases, Previous hospitalizations, Previous surgeries + complications, Obstetric history (if applicable), Blood transfusion history.
6) DRUG HISTORY: Current medications (name, dose, duration, indication), OTC/herbal remedies, Compliance, Allergies (clarify severity).
7) FAMILY HISTORY: Hereditary illnesses, Illnesses in first-degree relatives, Any similar complaints, Pedigree if needed.
8) SOCIAL HISTORY: Smoking (pack years), Alcohol use, Drug use, Occupation & hazards, Travel history, Sexual history (only if relevant), Lifestyle, Home/support system, Vaccination, Insurance.

RULES:
- Focus on history, symptoms, context, and risk factors using the OSCE categories above.
- Use LKL knowledge only as medical guidance, not to invent facts.
- If something is missing, set the value to \"N/A\" without hallucinating.
- Final output must be strict valid JSON matching the schema.
"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=4000,
        )

        report = _safe_parse_llm_response(response)

        # Metadata
        report["report_id"] = case_id_from_file
        report["phase"] = "intake"
        report["timestamp"] = datetime.now().isoformat()
        report["_category"] = category
        report["_missing_info"] = missing_info

        # 🔵 LKL AUTO-LEARNING FROM INTAKE
        if category:
            print(f"📚 LKL auto-learn (Phase 1) for category: {category}")
            lkl.auto_learn_from_report(category, report)

        # Save for Phase 2
        memory.setdefault("cases", []).append(report)
        _save_memory()

        print(f"💾 Saved intake report: {case_id_from_file}")
        return report

    # --------------------------------------------------------
    # PHASE 2: FINAL ASSESSMENT PIPELINE
    # --------------------------------------------------------
    elif phase == "final_assessment":
        # 1) Load intake case
        intake_case = _get_intake_case(intake_case_id)

        if not intake_case:
            msg = f"Intake case not found for ID: {intake_case_id}"
            print(f"🛑 FATAL: {msg}")
            return {"error": msg}

        print(f"✅ Loaded intake case for Phase 2: {intake_case_id}")

        # 2) Build combined text for LKL (intake history + final transcript)
        intake_history = intake_case.get("clinical_history", "") or ""
        combined_for_category = intake_history + "\n\n" + transcript_text

        category = lkl.detect_category(combined_for_category) or intake_case.get(
            "_category"
        )
        missing_info = (
            lkl.detect_missing_info(category, combined_for_category) if category else []
        )
        knowledge = lkl.get_category_knowledge(category) if category else {}

        # 3) Prompt: synthesize intake JSON + final dictation
        prompt = f"""
You are an expert clinical report writer specializing in synthesizing complex medical data.
Your job is to generate a comprehensive, structured FINAL ASSESSMENT (Phase 2) report in English only.
Always provide English output even if the dictation includes other languages, and ensure patient names stay in English characters.

You must combine the two primary inputs:
1) The structured INTAKE report from Phase 1 (Initial History & Symptoms).
2) The FINAL DOCTOR DICTATION (Phase 2 transcript) which contains the core clinical judgment, interpretation of diagnostic results (Labs/Imaging), and the definitive plan.

CLINICAL GUIDANCE AND RULES:
- The doctor's final dictation MUST OVERRIDE or REFINE any preliminary impressions or findings from Phase 1.
- Use the LKL Knowledge to ensure clinical terminology and standard reporting structure are used, but NEVER invent facts or patient data.
- 'detailed_findings' must reflect the FINAL interpretation of diagnostic results and exam findings.
- 'impression_summary' must be the final diagnostic conclusion (or best supported differential).
- 'recommendations' must be structured and actionable (follow-up, treatment, further tests).
- If key demographic fields (Patient Name, DOB, etc.) were incomplete in Phase 1, attempt to populate them from the Phase 2 dictation if explicitly mentioned.

INTAKE REPORT (Phase 1 JSON - Structured History):
{json.dumps(intake_case, indent=2)}

DOCTOR FINAL DICTATION (Phase 2 transcript - Clinical Interpretation & Plan):
{transcript_text}

LKL CATEGORY: {category}
LKL KNOWLEDGE:
{json.dumps(knowledge, indent=2)}

LKL MISSING INFO HINTS:
{json.dumps(missing_info, indent=2)}

Generate a COMPLETE FINAL REPORT in this JSON schema:
{TARGET_SCHEMA_JSON}

RULES:
- Fill all fields as much as possible using intake + final dictation.
- Ensure all output is clinically sound and traceable to one of the two inputs.
- Output ONLY valid JSON.
- only respond in english language.
"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.0,
            max_tokens=4000,
        )

        report = _safe_parse_llm_response(response)

        # Metadata
        report["report_id"] = intake_case_id or case_id_from_file
        report["phase"] = "final_assessment"
        report["timestamp"] = datetime.now().isoformat()
        report["_category"] = category
        report["_missing_info"] = missing_info
        report["_intake_report_id"] = intake_case_id

        # 🔵 LKL AUTO-LEARNING FROM FINAL REPORT
        if category:
            print(f"📚 LKL auto-learn (Phase 2) for category: {category}")
            lkl.auto_learn_from_report(category, report)

        # Save final report
        memory.setdefault("final_reports", []).append(report)
        _save_memory()

        print(f"💾 Saved FINAL report for intake={intake_case_id}")
        return report

    else:
        raise ValueError(f"Unknown phase: {phase}")


# =====================================================================
# Legacy wrapper
# =====================================================================
def process_audio_to_json(audio_file_path: str) -> Tuple[Dict[str, Any], str]:
    """
    Legacy compatibility wrapper used by older scripts (app.py/main_pipeline.py).
    It simply runs the intake pipeline and returns the JSON report and file path.
    """
    report = process_full_medical_report(audio_file_path, phase="intake")
    return report, audio_file_path


# =====================================================================
# PDF wrapper
# =====================================================================
def make_pdf_from_report(report_json):
    """
    Wrapper used by backend_api to generate a PDF from a report JSON.
    """
    return _make_pdf_from_report(report_json)
