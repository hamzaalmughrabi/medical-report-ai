import os
import json
from datetime import datetime
from openai import OpenAI
import re

# --- SECURITY WARNING ---
# API key should be loaded securely from environment variables.
api_key = os.environ.get("OPENAI_API_KEY")

if not api_key:
    raise ValueError(
        "The OPENAI_API_KEY environment variable is not set. Please set it to proceed."
    )

client = OpenAI(api_key=api_key)

AUDIO_FOLDER = "audio_files"
MEMORY_FILE = "memory.json"

# Define the target schema only once for clarity and use in the prompt
TARGET_SCHEMA_JSON = """
{
  "report_id": "string (unique identifier, e.g., file name or auto-generated ID)",
  "patient_name": "string or N/A",
  "age": "string or N/A",
  "sex": "string or N/A",
  "dob": "string or N/A",
  "referring_doctor": "string or N/A",
  "exam_date": "ISO date/time or N/A",
  "exam_type": "string (e.g., MRI Knee w/o Contrast, Chest X-ray, CT Brain)",

  "clinical_history": "string — full description of the patient’s condition, symptoms, and relevant medical background as mentioned by the doctor. Include all time references, symptom evolution, prior treatments, and contextual information.",

  "detailed_findings": [
    {
      "finding": "string — a single precise observation, symptom, or imaging/physical finding.",
      "explanation": "string — short clinical explanation: why it’s relevant, its severity, or the possible physiological or anatomical implication."
    }
  ],

  "impression_summary": "string — the overall synthesis of the findings, highlighting the likely underlying issue or the most significant clinical impression (not a diagnosis).",

  "recommendations": [
    "string — each item must represent a specific recommended next step, test, or management action, with a short reasoning when possible (e.g., 'Order lumbar MRI to evaluate possible nerve compression')."
  ],

  "urgency_level": "string — one of: 'low', 'moderate', 'high', or 'N/A'. Determined by symptom severity and progression."
}
"""

# Load or create memory
if os.path.exists(MEMORY_FILE):
    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)
else:
    memory = {"cases": []}


def process_audio_to_json(audio_file_path: str) -> dict:
    """
    Takes an audio file path, transcribes it, analyzes the conversation,
    and returns a structured diagnostic JSON. If a report for the given
    case_id already exists in memory, it returns the existing report.
    """

    filename = os.path.basename(audio_file_path)
    case_id = filename.split(".")[0]

    # 2️⃣ Check for existing case in memory
    # Use .get("report_id") to safely  cases in memory.json that might be missing the key
    existing_case = next(
        (c for c in memory["cases"] if c.get("report_id") == case_id),
        None
    )

    # --- NEW LOGIC: RETURN EXISTING REPORT IMMEDIATELY IF FOUND ---
    if existing_case:
        print(f"♻️ Report found in memory for Case ID: {case_id}. Skipping transcription and analysis.")
        return existing_case
    # -------------------------------------------------------------

    # If no existing case, proceed with transcription, analysis, and saving.

    # 1️⃣ Transcribe audio using the OpenAI Whisper API
    print(f"\n🎙️ Processing file: {filename}")
    with open(audio_file_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )
    conversation_text = transcription.text.strip()
    print("✅ Transcription complete.")

    print(f"Creating new report for Case ID: {case_id}")
    # --- Prompt for CREATING a new case ---
    prompt = f"""
    You are a highly specialized **Medical AI Assistant** acting as a **Doctor-Level Report Extractor and Formatter**.

    Your task is to analyze a raw transcript of a **doctor’s voice recording** or **medical dictation**, and convert it into a **structured JSON report** that mirrors the clarity and structure of a professional hospital report.

    ---

    ### ⚕️ Core Objective:
    Produce a structured JSON that captures **every single relevant medical detail** — including symptoms, timing, tone, body part, progression, cause, related systems, and physician reasoning.  
    Do not summarize or simplify — the report will be read by **medical professionals**.

    ---

    ### ⚙️ Strict Rules:
    1. **Do not fabricate or omit** any detail.  
       Reword only for clarity, but every medical element in the transcript must appear in the report.

    2. **Follow this exact JSON schema:**
    {TARGET_SCHEMA_JSON}

    3. If any field is missing or not mentioned, use `"N/A"` or an empty list `[]`.

    4. The report must be in **English**.

    5. Keep the writing **professional, precise, and clinical**.  
       No speculation, no conversational tone.

    6. In `"clinical_history"`, include **everything the doctor mentioned** about:
       - patient’s history  
       - symptoms  
       - previous conditions  
       - current complaint evolution  
       - relevant observations or context  
       Write it in a **continuous clinical paragraph**.

    7. In `"detailed_findings"`, make each `"finding"` short and medical,  
       with an `"explanation"` that shows why it matters (e.g., possible cause, mechanism, severity).

    8. `"impression_summary"` should summarize the **main takeaway** as a doctor would write it.

    9. `"recommendations"` should list **specific next steps**, including tests, referrals, or management advice — explained briefly.

    10. `"urgency_level"` must reflect the seriousness based on described symptoms:  
       - “low” for mild or routine findings  
       - “moderate” for concerning but stable conditions  
       - “high” for severe, acute, or urgent cases

    ---

    ### 🩺 Style Guide:
    - Use **formal medical report style** (e.g., “Examination revealed...”, “Patient reports...”).
    - Keep sentences **clear, concise, and objective**.
    - Avoid layman explanations.
    - Each section should read like a **real internal hospital report**.
    - No bullet points or markdown — output pure JSON.

    ---

    ### 🧩 Input Transcript:
    The following text is a **raw transcript** from a doctor’s spoken notes.  
    It may include pauses, repetition, or filler words — interpret them correctly and extract **all possible clinical information**.

    Transcript:
    {conversation_text}

    Now, analyze it thoroughly and output **only** the structured JSON report following the schema above.
    No explanations, no formatting, no comments — only valid JSON.
    """

    #  Analyze and build diagnostic report
    print("Sending text to LLM for analysis...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    print("✅ Analysis received.")

    diagnostic_report = json.loads(response.choices[0].message.content)

    #  Add/Update Metadata (Ensures report_id is set correctly for memory)
    diagnostic_report["report_id"] = case_id
    diagnostic_report["timestamp"] = datetime.now().isoformat()
    diagnostic_report["source_file"] = filename

    # Update memory (only adds the new report here)
    memory["cases"].append(diagnostic_report)

    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    print(f"Memory file updated with Case ID: {case_id}")

    return diagnostic_report
