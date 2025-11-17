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

    Your task is to analyze a raw transcript of a doctor’s voice recording or medical dictation, and convert it into a structured JSON report that mirrors the clarity and structure of a professional hospital report.

    ---

    ### Core Objective:
    Produce a structured JSON that captures every single relevant medical detail — including symptoms, timing, tone, body part, progression, cause, related systems, and physician reasoning.  
    Do not summarize or simplify — the report will be read by medical professionals.

    ---

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

    Transcript:
    {conversation_text}

    Now, analyze it thoroughly and output only the structured JSON report following the schema above.
    No explanations, no formatting, no comments — only valid JSON.
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
        pdf_path = make_pdf_from_case(diagnostic_report,)
        diagnostic_report["_pdf_path"] = pdf_path
    except Exception as e:
        print("⚠️ PDF generation failed:", e)
        pdf_path = None

    # save to memory
    memory.setdefault("cases", []).append(diagnostic_report)
    _save_memory()
    print(f"Memory file updated with Case ID: {case_id}")

    return diagnostic_report, pdf_path
