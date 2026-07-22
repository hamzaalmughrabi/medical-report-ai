# transcription.py
import os
import json
import sys
import time
import uuid
from pathlib import Path

# Add project root and backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(BASE_DIR), str(BACKEND_DIR)])

from datetime import datetime
from typing import Optional, Dict, Any
from openai import OpenAI

# Try importing Google Generative AI
try:
    import google.generativeai as genai
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

from json_to_pdf import make_pdf_from_case
from lkl.lkl_manager import LKLManager

# -----------------------------
# Storage paths
# -----------------------------
DATA_DIR = str(BASE_DIR / "storage" / "data")
MEMORY_FILE = os.path.join(DATA_DIR, "memory.json")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")

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

# -----------------------------
# Safe JSON helpers
# -----------------------------
def _read_json(path: str, default):
    try:
        if not os.path.exists(path):
            return default
        with open(path, "r", encoding="utf-8") as f:
            txt = f.read().strip()
        if not txt:
            return default
        return json.loads(txt)
    except Exception:
        return default

def _write_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _safe_parse_llm_response(content) -> Dict[str, Any]:
    if isinstance(content, dict):
        return content
    try:
        # Clean markdown wrappers if present
        clean_content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_content)
    except Exception:
        return {"raw_output": str(content)}


# -----------------------------
# memory.json fallback init
# -----------------------------
memory = _read_json(MEMORY_FILE, {"cases": [], "final_reports": []})

def _save_memory():
    _write_json(MEMORY_FILE, memory)

# -----------------------------
# Intake Loader
# -----------------------------
def _get_intake_case(intake_id: str) -> Dict[str, Any]:
    if not intake_id:
        return {}
    
    # 1) Try sessions.json
    sessions = _read_json(SESSIONS_FILE, [])
    for s in reversed(sessions):
        if s.get("report_id") == intake_id and s.get("phase") == "intake":
            path = s.get("report_json_path")
            if path and os.path.exists(path):
                return _read_json(path, {})
    
    # 2) Fallback memory.json
    for c in memory.get("cases", []):
        if c.get("report_id") == intake_id:
            return c
    return {}

def _new_report_id(prefix: str = "R") -> str:
    # Use UUID for guaranteed uniqueness and privacy (harder to guess)
    return f"{prefix}{uuid.uuid4().hex[:12].upper()}"

# =====================================================================
# AI PROVIDER HELPERS
# =====================================================================

def transcribe_audio(file_path: str, config: dict) -> Dict[str, Any]:
    """
    Returns: {"text": str, "duration_ms": int, "provider": str}
    """
    provider = config.get("transcription_provider", "openai")
    api_key_openai = config.get("openai_api_key") or os.environ.get("OPENAI_API_KEY")
    api_key_google = config.get("google_api_key") or os.environ.get("GOOGLE_API_KEY")

    start_time = time.time()
    text = ""
    
    # --- GOOGLE GEMINI TRANSCRIPTION (via upload) ---
    if provider == "google":
        if not GOOGLE_AVAILABLE:
            return {"error": "Google Generative AI library not installed."}
        if not api_key_google:
            return {"error": "Google API Key missing."}
        
        try:
            genai.configure(api_key=api_key_google)
            # Upload file
            uploaded_file = genai.upload_file(file_path)
            # Use Flash for speed/cost
            model = genai.GenerativeModel("gemini-2.0-flash")
            result = model.generate_content([uploaded_file, "Transcribe this audio file verbatim."])
            text = result.text
        except Exception as e:
            return {"error": f"Google Transcription failed: {str(e)}"}

    # --- OPENAI WHISPER TRANSCRIPTION ---
    else:
        if not api_key_openai:
            return {"error": "OpenAI API Key missing."}
        try:
            client = OpenAI(api_key=api_key_openai)
            with open(file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="verbose_json",
                )
            text = getattr(transcription, "text", "").strip()
        except Exception as e:
            return {"error": f"OpenAI Transcription failed: {str(e)}"}

    duration_ms = int((time.time() - start_time) * 1000)
    return {"text": text, "duration_ms": duration_ms, "provider": provider}


def generate_report_llm(prompt: str, config: dict, system_prompt: str = "") -> Dict[str, Any]:
    """
    Returns: {"data": dict, "usage": dict, "duration_ms": int, "provider": str}
    """
    provider = config.get("llm_provider", "openai")
    model_name = config.get("llm_model", "gpt-4o")
    temp = float(config.get("temperature", 0.0))
    max_tokens = int(config.get("max_tokens", 4000))
    
    api_key_openai = config.get("openai_api_key") or os.environ.get("OPENAI_API_KEY")
    api_key_google = config.get("google_api_key") or os.environ.get("GOOGLE_API_KEY")

    start_time = time.time()
    result_data = {}
    usage_stats = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    # --- OLLAMA LOCAL ---
    if provider == "ollama":
        ollama_url = config.get("ollama_url", "http://localhost:11434").rstrip("/")
        ollama_model = config.get("ollama_model", "gemma3:1b")
        model_name = ollama_model # Update tracking name
        
        try:
            import requests
            payload = {
                "model": ollama_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": temp,
                    "num_predict": max_tokens
                }
            }
            
            # Use specific timeout since local models might take longer to load into memory
            response = requests.post(f"{ollama_url}/api/chat", json=payload, timeout=300)
            response.raise_for_status()
            res_json = response.json()
            
            result_data = _safe_parse_llm_response(res_json.get("message", {}).get("content", "{}"))
            
            # Extract Ollama Usage Tokens
            usage_stats["prompt_tokens"] = res_json.get("prompt_eval_count", 0)
            usage_stats["completion_tokens"] = res_json.get("eval_count", 0)
            usage_stats["total_tokens"] = usage_stats["prompt_tokens"] + usage_stats["completion_tokens"]
            
        except Exception as e:
            return {"error": f"Ollama LLM failed: {str(e)}"}

    # --- GOOGLE GEMINI ---
    elif provider == "google":
        if not GOOGLE_AVAILABLE:
            return {"error": "Google library not installed."}
        if not api_key_google:
            return {"error": "Google API Key missing."}

        try:
            genai.configure(api_key=api_key_google)
            model = genai.GenerativeModel(
                model_name=model_name,
                generation_config=genai.types.GenerationConfig(
                    candidate_count=1,
                    max_output_tokens=max_tokens,
                    temperature=temp,
                    response_mime_type="application/json"
                )
            )
            
            full_prompt = f"{system_prompt}\n\n{prompt}"
            response = model.generate_content(full_prompt)
            
            # Parse
            result_data = _safe_parse_llm_response(response.text)
            
            # Extract Usage (if available in newer SDK versions)
            if hasattr(response, "usage_metadata"):
                usage_stats["prompt_tokens"] = response.usage_metadata.prompt_token_count
                usage_stats["completion_tokens"] = response.usage_metadata.candidates_token_count
                usage_stats["total_tokens"] = response.usage_metadata.total_token_count
            
        except Exception as e:
            return {"error": f"Google LLM failed: {str(e)}"}

    # --- OPENAI GPT ---
    else:
        if not api_key_openai:
            return {"error": "OpenAI API Key missing."}
        try:
            client = OpenAI(api_key=api_key_openai)
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=temp,
                max_tokens=max_tokens,
            )
            
            result_data = _safe_parse_llm_response(response.choices[0].message.content)
            
            # Extract Usage
            if response.usage:
                usage_stats["prompt_tokens"] = response.usage.prompt_tokens
                usage_stats["completion_tokens"] = response.usage.completion_tokens
                usage_stats["total_tokens"] = response.usage.total_tokens

        except Exception as e:
            return {"error": f"OpenAI LLM failed: {str(e)}"}

    duration_ms = int((time.time() - start_time) * 1000)
    return {
        "data": result_data,
        "usage": usage_stats,
        "duration_ms": duration_ms,
        "provider": provider,
        "model": model_name
    }


# =====================================================================
# FULL PIPELINE
# =====================================================================
def process_full_medical_report(
    audio_file_path: str,
    phase: str,
    config: Optional[Dict[str, Any]] = None,
    intake_case_id: Optional[str] = None,
    patient_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:

    if config is None:
        config = {}
        
    vocal_mode = config.get("mic_placement", "dialogue")
    if vocal_mode == "doctor":
        vocal_context_instruction = """
    CRITICAL VOCAL CONTEXT: PHYSICIAN DICTATION MODE
    The transcription provided is a direct clinical dictation from the Physician. 
    Focus EXCLUSIVELY on the clinical data provided by the doctor. 
    Discard any background noise or non-clinical interference. 
    Treat the input as an authoritative monologue of clinical facts.
    """
    else:
        vocal_context_instruction = """
    CRITICAL VOCAL CONTEXT: CLINICAL DIALOGUE MODE (DEFAULT)
    The transcription is a natural conversation between a Physician and a Patient.
    You MUST analyze the interaction from both sides.
    Extract clinical facts and diagnostic intent from the Physician.
    Extract symptom descriptions, severity, and history details from the Patient's responses.
    Synthesize the final report based on the totality of this clinical conversation between them.
    """

    start_total = time.time()
    lkl = LKLManager()
    filename = os.path.basename(audio_file_path)

    print(f"\n🎙 Processing PHASE={phase} → file={filename}")

    # 1. Transcribe
    trans_res = transcribe_audio(audio_file_path, config)
    if "error" in trans_res:
        return {"error": trans_res["error"]}
    
    transcript_text = trans_res["text"]
    transcription_ms = trans_res["duration_ms"]
    print(f"✅ Transcription complete ({transcription_ms}ms) via {trans_res['provider']}")

    # 2. Prepare Context & Prompts
    prompt_text = ""
    system_role = ""
    category = None
    missing_info = []
    knowledge = []

    if phase == "intake":
        category = lkl.detect_category(transcript_text)
        if category:
            missing_info = lkl.detect_missing_info(category, transcript_text)
            knowledge = lkl.get_category_knowledge(category)
        
        # Prepare Patient Context String
        patient_context_str = ""
        if patient_info:
            p_name = patient_info.get("name", "Unknown")
            p_age = patient_info.get("age", "Unknown")
            p_sex = patient_info.get("gender") or patient_info.get("sex", "Unknown")
            p_dob = patient_info.get("dob", "Unknown")
            patient_context_str = f"""
    PATIENT CONTEXT (From EMR):
    - Name: {p_name}
    - Age: {p_age}
    - Sex: {p_sex}
    - DOB: {p_dob}
    
    IMPORTANT: Use this Patient Context to fill the demographics in the report if not explicitly stated in the audio.
    """

        system_role = "you are a highly specialized Medical AI Assistant acting as a Doctor-Level Report Extractor and Formatter for the INITIAL CLINICAL INTAKE (Phase 1)."
        prompt_text = f"""
    Your task is to analyze a raw transcript of a doctor’s voice recording or medical dictation,Regardless of the language used in TRANSCRIPT, you must interpret it accurately and produce the entire JSON report exclusively in English.
 and convert it into a structured JSON report that mirrors the clarity and structure of a professional hospital report for the INITIAL CLINICAL INTAKE.

{patient_context_str}
{vocal_context_instruction}

TRANSCRIPT:
{transcript_text}

LKL CATEGORY: {category}
LKL KNOWLEDGE:
{json.dumps(knowledge, indent=2)}

LKL MISSING INFO HINTS:
{json.dumps(missing_info, indent=2)}


    ### Core Objective:
    Produce a structured JSON that captures every single relevant medical detail — including symptoms, timing, tone, body part, progression, cause, related systems, and physician reasoning.  
    Do not summarize or simplify — the report will be read by medical professionals.

### Strict Rules:
    1. Do not fabricate or omit any detail.  
       Reword only for clarity, but every medical element in the transcript must appear in the report.

    2. Follow this exact JSON schema:
    {TARGET_SCHEMA_JSON}

    3. If any field is missing or not mentioned, use `"N/A"` or an empty list `[]`.

    4. The report must be in English.

    5. Keep the writing professional, precise, and clinical.  
       No speculation, no conversational tone.

    6. In "clinical_history", extract and structure the patient’s history following the complete clinical history framework used in hospital documentation and OSCE standards:

    The history must be comprehensive and cover the following components whenever available:

    Patient Profile: name, age, sex, occupation, marital status, and any demographic identifiers.
    
    Chief Complaint (CC): the patient’s main concern or symptom, written in their words and with duration (e.g., “low back pain for 2 months”). Avoid medical jargon if transcript uses patient phrasing.

    History of Present Illness (HPI): detailed evolution and analysis of the complaint using the SOCRATES framework (Site, Onset, Character, Radiation, Associated symptoms, Timing, Exacerbating/relieving factors, Severity).

    Systemic Enquiry / Review of Systems (ROS): capture any other symptoms mentioned that belong to cardiovascular, respiratory, gastrointestinal, genitourinary, musculoskeletal, neurological, endocrine, or general systems.

    Past Medical and Surgical History: chronic diseases, prior hospitalizations, operations, and relevant medical conditions.

    Drug History: prescribed medications, dosage, adherence, allergies, and adverse reactions.

    Family History: hereditary or familial illnesses, consanguinity, and similar conditions in relatives.   

    Social History: lifestyle, occupation, smoking/alcohol/drug use, living situation, travel, and physical activity.

    Functional/Physiotherapy Relevance: mobility limitations, daily living impact, assistive device use, or physical restriction patterns.

    7. In "detailed_findings", extract every distinct clinical observation, measurement, or physician remark mentioned in the transcript — do not limit the number of findings.

Your goal is to capture all explicit or implicit medical findings the doctor states or implies, even if they seem minor or repetitive.

Rules:

Include all findings.

Every symptom, observation, exam result, test interpretation, or relevant measurement must appear as a separate "finding".

Even subtle or secondary details (e.g., “mild wheeze,” “tenderness on palpation,” “normal reflexes,” “no cyanosis”) must be captured — normal and abnormal alike.

Do not merge or summarize.
Each statement in the audio that describes a distinct feature should produce a distinct JSON object.

Use precise medical language.
Keep all entries clinical and standardized — no conversational tone.

Use system labeling.
Assign each finding to the appropriate system (e.g., “musculoskeletal,” “respiratory,” “neurological,” “cardiovascular,” “gastrointestinal,” “endocrine,” “general”).

Explain significance.
"explanation" should state the possible cause, mechanism, or clinical relevance of the finding — as a clinician would interpret it.

Severity & timing.
Include "severity" and "temporal_relation" when available (e.g., “moderate,” “acute,” “chronic,” “progressive”). Use "N/A" if not mentioned.

Order findings logically.
Present them grouped by system, in the same sequence as the transcript whenever possible.
    8. "impression_summary" must deliver a professional-level clinical synthesis — a concise diagnostic reasoning paragraph similar to what a senior physician or physiotherapist would write in a hospital note.

It should:

Integrate key information from the "clinical_history" and "detailed_findings".

Identify the most likely diagnosis or clinical impression, supported by reasoning.

Mention relevant differential diagnoses when uncertainty exists.

Comment on disease stage, chronicity, or functional impact if described.

Use formal hospital language — e.g., “Findings are consistent with…”, “The overall picture suggests…”, “Differential considerations include…”

The tone must be concise, authoritative, and objective, written as if for inclusion in a real patient chart.

    9. `"recommendations"` should list specific next steps, including tests, referrals, or management advice — explained briefly.

    10. `"urgency_level"` must reflect the seriousness based on described symptoms:  
       - “low” for mild or routine findings  
       - “moderate” for concerning but stable conditions  
       - “high” for severe, acute, or urgent cases

    ---

    Style Guide:
    - Use formal medical report style (e.g., “Examination revealed...”, “Patient reports...”).
    - Keep sentences clear, concise, and objective.
    - Avoid layman explanations.
    - Each section should read like a real internal hospital report.
    - No bullet points or markdown — output pure JSON.
    -only use only english 

    ---

    Input Transcript:
    The following text is a raw transcript from a doctor’s spoken notes.  
    It may include pauses, repetition, or filler words — interpret them correctly and extract all possible clinical information.

    TRANSCRIPT:
{transcript_text}

    Now, analyze it thoroughly and output only the structured JSON report following the schema above.
    No explanations, no formatting, no comments — only valid JSON.
    """

    elif phase == "final_assessment":
        intake_case = _get_intake_case(intake_case_id or "")
        if not intake_case and intake_case_id:
            return {"error": f"Intake case {intake_case_id} not found."}

        intake_history = intake_case.get("clinical_history", "") or ""
        combined = intake_history + "\n\n" + transcript_text
        
        category = lkl.detect_category(combined) or intake_case.get("_category")
        if category:
            missing_info = lkl.detect_missing_info(category, combined)
            knowledge = lkl.get_category_knowledge(category)

        # Prepare Patient Context String
        patient_context_str = ""
        if patient_info:
            p_name = patient_info.get("name", "Unknown")
            p_age = patient_info.get("age", "Unknown")
            p_sex = patient_info.get("gender") or patient_info.get("sex", "Unknown")
            p_dob = patient_info.get("dob", "Unknown")
            patient_context_str = f"""
    PATIENT CONTEXT (From EMR):
    - Name: {p_name}
    - Age: {p_age}
    - Sex: {p_sex}
    - DOB: {p_dob}
    
    IMPORTANT: Use this Patient Context to fill the demographics in the report if not explicitly stated in the audio.
    """

        system_role = "You are a highly specialized Medical AI Assistant acting as a Doctor-Level Report Synthesizer and Formatter for the FINAL CLINICAL ASSESSMENT (Phase 2)."
        prompt_text = f"""
Your job is to generate a comprehensive, structured FINAL ASSESSMENT report by combining:
1) The structured INTAKE report from Phase 1 (Initial History & Symptoms).
2) The FINAL DOCTOR DICTATION (Phase 2 transcript), which contains updated findings, diagnostic interpretation, and the definitive plan.

{patient_context_str}
{vocal_context_instruction}

INTAKE REPORT (Phase 1 JSON - Structured History):
{json.dumps(intake_case, indent=2)}

DOCTOR FINAL DICTATION (Phase 2 transcript - Clinical Interpretation & Plan):
{transcript_text}

LKL CATEGORY: {category}
LKL KNOWLEDGE:
{json.dumps(knowledge, indent=2)}

LKL MISSING INFO HINTS:
{json.dumps(missing_info, indent=2)}

### Core Objective:
Produce a structured FINAL ASSESSMENT JSON that:
- Reflects the COMPLETE and FINAL clinical picture at this stage.
- Integrates the initial Phase 1 intake data with all new information from Phase 2.
- Ensures that EVERY medically relevant statement from the FINAL DOCTOR DICTATION is explicitly represented somewhere in the report (clinical_history, detailed_findings, impression_summary, or recommendations).
- Uses precise, professional, hospital-style language in English only.

### Integration Logic:
- The Phase 1 INTAKE report provides the baseline history and initial findings.
- The FINAL DOCTOR DICTATION (Phase 2) MUST OVERRIDE or REFINE any conflicting information or impressions from Phase 1.
- If Phase 2 indicates improvement, worsening, resolution, or new symptoms/findings, this evolution MUST be clearly reflected.
- You must NOT delete or ignore relevant Phase 1 information unless Phase 2 explicitly contradicts or supersedes it; in that case, the final version should reflect the most up-to-date state while acknowledging evolution where appropriate.

### Strict Rules:
1. Do not fabricate or omit any detail.
   - Every medically relevant element from the FINAL DOCTOR DICTATION MUST appear in the final report.
   - Reword only for clarity and clinical style, but do NOT drop or merge away distinct pieces of information.

2. Follow this exact JSON schema:
{TARGET_SCHEMA_JSON}

3. If any field is missing or not mentioned in both Phase 1 and Phase 2, use "N/A" or an empty list [].

4. Language:
   - The report must be in English.
   - Regardless of the language used in the INTAKE REPORT or DOCTOR FINAL DICTATION, you must interpret them accurately and produce the entire JSON report exclusively in English, without mixing languages.

5. Style:
   - Keep the writing professional, precise, and clinical.
   - No speculation beyond what is clinically reasonable and supported.
   - No conversational tone, no explanations outside of the JSON, no markdown.

### clinical_history Construction:
"clinical_history" must represent the FINAL, integrated clinical history following hospital documentation and OSCE standards, updated with Phase 2 information.

It should cover, whenever available:

- Patient Profile:
  - Name, age, sex, occupation, marital status, and any demographic identifiers.
  - If incomplete in Phase 1, attempt to complete from Phase 2 if explicitly mentioned.

- Chief Complaint / Current Main Issue:
  - The patient’s main concern at this stage, in their words if provided, with duration or evolution since initial presentation.
  - Example: "Low back pain, now improved over 6 weeks" or "New onset dyspnea for 3 days."

- History of Present Illness / Interval Course:
  - Use SOCRATES where applicable:
    Site, Onset, Character, Radiation, Associated symptoms, Timing, Exacerbating/relieving factors, Severity.
  - Clearly distinguish:
    • Symptoms that have resolved,
    • Symptoms that have improved,
    • Symptoms that are unchanged,
    • New symptoms or complications described in Phase 2.
  - Explicitly reflect temporal evolution relative to Phase 1 (e.g., "previously severe, now mild and intermittent").

- Systemic Enquiry / Review of Systems (ROS):
  - Capture all mentioned symptoms or explicit negatives in:
    cardiovascular, respiratory, gastrointestinal, genitourinary, musculoskeletal, neurological, endocrine, hematologic, psychiatric, and general systems.
  - Both positive and clearly stated negative findings must be included (e.g., “no chest pain,” “no new neurological deficits”).

- Past Medical and Surgical History:
  - Include all chronic diseases, prior hospitalizations, operations, and relevant conditions.
  - Add any NEW conditions or diagnoses mentioned in Phase 2.

- Drug History:
  - Current medications, dosing, and adherence when mentioned.
  - Changes since Phase 1: started, stopped, or adjusted treatments.
  - Allergies and adverse reactions.

- Family History:
  - Hereditary or familial illnesses, similar conditions in relatives, and consanguinity if mentioned or updated.

- Social History:
  - Lifestyle, occupation and work status (including return-to-work or restrictions).
  - Smoking, alcohol, or drug use.
  - Living situation, support systems, travel, and physical activity relevant to the condition.

- Functional / Physiotherapy Relevance:
  - Current functional status compared to baseline (better, worse, stable).
  - Limitations in activities of daily living (ADLs) and instrumental ADLs.
  - Assistive devices (cane, walker, orthosis, etc.).
  - Work capacity, sports, and physical activity limitations.
  - Any functional outcome metrics mentioned (e.g., walking distance, time standing, stair tolerance).

### detailed_findings Construction:
"detailed_findings" must list EVERY distinct clinical observation, measurement, investigation result, or physician remark from Phase 1 and Phase 2, with emphasis on the FINAL interpretation from Phase 2.

Rules:

- Include ALL findings:
  - Each symptom description, physical exam finding, lab result, imaging interpretation, functional assessment, and relevant normal/abnormal observation.
  - Every distinct statement from the FINAL DOCTOR DICTATION that carries medical information must correspond to at least one "finding" object.

- Do NOT merge or summarize:
  - Each distinct feature = one separate JSON object in "detailed_findings".
  - If the doctor mentions similar things at different times or with different severity (e.g., "was severe, now mild"), represent these temporal changes explicitly (either as separate findings or clearly captured via temporal_relation/explanation).

- Include normal and abnormal findings:
  - For example: "normal reflexes", "no cyanosis", "no new focal deficit", "normal chest X-ray", “no evidence of fracture”, etc., must all appear.

- Use precise medical language:
  - Use standardized clinical terminology (supported by LKL Knowledge) without lay phrasing.

- System labeling:
  - Assign each finding to one of the appropriate systems, such as:
    "musculoskeletal", "respiratory", "neurological", "cardiovascular",
    "gastrointestinal", "genitourinary", "endocrine", "hematologic",
    "psychiatric", "general", "investigations/labs", "imaging", "functional".
  
- Explanation:
  - "explanation" should state the possible cause, mechanism, interpretation, or clinical relevance of the finding, as a clinician would.
  - When applicable, include its relevance to diagnosis, prognosis, or treatment response.

- Severity & timing:
  - Use "severity" to indicate intensity when provided or clearly implied (e.g., "mild", "moderate", "severe").
  - Use "temporal_relation" to reflect timing and evolution (e.g., "acute", "subacute", "chronic", "improved", "worsened", "stable", "resolved", "new-onset").
  - Use "N/A" if not mentioned.

- Comparison to baseline:
  - When Phase 2 compares current status to baseline (Phase 1), represent this explicitly in "temporal_relation" and/or "explanation" (e.g., "pain intensity reduced compared to initial assessment").

- Order:
  - Group findings logically by system and, where possible, follow the sequence of the FINAL DOCTOR DICTATION.

### impression_summary Construction:
"impression_summary" must be a professional-level FINAL clinical synthesis similar to a senior physician’s final assessment or discharge note.

It should:
- Integrate key elements from "clinical_history" and "detailed_findings".
- Clearly state the primary diagnosis or diagnoses and whether they are:
  - confirmed, probable, or suspected.
- Mention relevant differential diagnoses when uncertainty exists.
- Comment on:
  - Disease stage (acute, subacute, chronic).
  - Current activity (active, stable, improving, deteriorating, in remission).
  - Response to treatment so far.
  - Functional impact and level of disability, if described.
- Use formal hospital language, such as:
  - “Findings are consistent with…”
  - “The overall picture suggests…”
  - “Differential considerations include…”
  - “There is significant clinical and functional improvement following…”

### recommendations Construction:
"recommendations" must list clear, specific, and actionable next steps based on the FINAL assessment:

- Management and treatment:
  - Ongoing medications, new prescriptions, dose changes, tapering, or discontinuation.
  - Rehabilitation or exercise plans.
  - Lifestyle or work modifications.

- Investigations:
  - Further tests or imaging if still indicated.
  - Monitoring parameters.

- Referrals:
  - To specialists, physiotherapy, occupational therapy, psychology, pain clinic, etc., as mentioned.

- Safety and red flags:
  - Any documented safety advice or red-flag symptoms that should trigger urgent review.

- Follow-up:
  - Suggested follow-up interval and purpose, if stated (e.g., “review in 6 weeks to reassess pain and function”).

Each recommendation should be explicit and justified in clinical terms when possible.

### urgency_level:
"urgency_level" must reflect the seriousness of the FINAL clinical state:

- "low" for stable, routine follow-up or chronic conditions without red flags.
- "moderate" for concerning but stable conditions that need timely, but not emergent, review.
- "high" for severe, acute, unstable situations, red-flag symptoms, or need for urgent intervention.

### Output Rules:
- Use only English language in the output.
- Output ONLY a single valid JSON object that strictly follows {TARGET_SCHEMA_JSON}.
- Do NOT include explanations, comments, or markdown outside the JSON.
- Every medically relevant piece of information present in the FINAL DOCTOR DICTATION must be represented somewhere in the JSON (history, findings, impression, or recommendations).
- If something is not mentioned in either input and cannot be safely inferred, use "N/A" or [].

Now, analyze the INTAKE REPORT and the DOCTOR FINAL DICTATION thoroughly and generate the FINAL ASSESSMENT report strictly as a single JSON object in English.
    """
    else:
        return {"error": "Invalid phase"}

    # 3. Generate Report
    llm_res = generate_report_llm(prompt_text, config, system_prompt=system_role)
    if "error" in llm_res:
        return {"error": llm_res["error"]}
    
    report = llm_res["data"]
    llm_ms = llm_res["duration_ms"]
    
    # 4. Finalize
    # Issue #6: Every report MUST have its own unique ID.
    # We store the link to the intake report separately.
    report_id = _new_report_id()
    
    report["report_id"] = report_id
    report["phase"] = phase
    report["timestamp"] = datetime.utcnow().isoformat()
    report["_category"] = category
    report["_missing_info"] = missing_info
    if phase == "final_assessment":
         report["_intake_report_id"] = intake_case_id

    # Auto-learn
    if category:
        try:
            lkl.auto_learn_from_report(category, report)
        except Exception:
            pass

    # Save to memory temporary (legacy support)
    # _save_memory() # Issue #23: Avoid writes to legacy unbounded file
    
    total_ms = int((time.time() - start_total) * 1000)
    
    # Attach stats for logging (backend will strip this before returning to user if needed, or keep it)
    report["_usage_stats"] = {
        "report_id": report_id,
        "phase": phase,
        "provider": llm_res["provider"],
        "model": llm_res["model"],
        "tokens_prompt": llm_res["usage"].get("prompt_tokens", 0),
        "tokens_completion": llm_res["usage"].get("completion_tokens", 0),
        "tokens_total": llm_res["usage"].get("total_tokens", 0),
        "duration_transcription_ms": transcription_ms,
        "duration_llm_ms": llm_ms,
        "duration_total_ms": total_ms
    }

    print(f"✅ Full Process Complete: {total_ms}ms (Transcribe: {transcription_ms}ms, LLM: {llm_ms}ms)")
    return report

def make_pdf_from_report(report_json: Dict[str, Any]) -> str:
    reports_dir = str(BASE_DIR / "storage" / "reports")
    output_path = os.path.join(reports_dir, f"{report_json['report_id']}_final.pdf")
    make_pdf_from_case(report_json, output_path)
    return output_path

