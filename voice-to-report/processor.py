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
          "report_id": "string",
          "exam_date": "ISO date/time or N/A",
          "exam_type": "string (e.g., MRI Knee w/o Contrast, X-Ray Chest)",
          "clinical_history": "string (patient's background/reason for exam, all the history of the patient ,medcal history and explain every thing tin history )",
          "detailed_findings": [
            {
              "finding": "string (a specific observation from the report)",
              "explanation": "string (brief clinical context or severity)"
            }
          ],
          "impression_summary": "string (the overall conclusion or primary finding)",
          "recommendations": ["list and explain any follow-up recommendations, tests, or plans"],
          "urgency_level": "low | moderate | high | N/A"
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
            response_format="text"
        )
    conversation_text = transcription.strip()
    print("✅ Transcription complete.")

    print(f"Creating new report for Case ID: {case_id}")
    # --- Prompt for CREATING a new case ---
    prompt = f"""
        You are a specialized Medical AI Assistant acting as a ** Report Summarizer and Extractor**.
        Your task is to analyze the provided text (which will be a raw transcript of a conversation or a raw scan of a medical document) and extract the key findings into a structured JSON format that mimics a professional medical report.

        **STRICTLY ADHERE** to the following instructions and JSON schema:
        1.  **Do not include any field related to 'diagnosis' or 'possible_diagnosis'**. The output must focus only on the findings, impressions, and recommendations for further action.
        2.  All extracted information must be in **English**, regardless of the input language.
        3.  If a field's information is not present in the input text, use "N/A" or an empty list `[]` as appropriate.

        Use this structured JSON format:
        {TARGET_SCHEMA_JSON}

        Conversation:
        {conversation_text}
    """

    #  Analyze and build diagnostic report
    print("Sending text to LLM for analysis...")
    response = client.chat.completions.create(
        model="gpt-4o-mini",
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
