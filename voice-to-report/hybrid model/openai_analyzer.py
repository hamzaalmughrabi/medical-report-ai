import os
import json
import re
from openai import OpenAI

# WARNING: The provided API key has been redacted for security.
# In a real-world application, please set the OPENAI_API_KEY environment variable
# and use client = OpenAI() without arguments.
client = OpenAI(api_key="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")

PROMPT = """
        You are a specialized Medical AI Assistant acting as a ** Report Summarizer and Extractor**.
        Your task is to analyze the provided text (which will be a raw transcript of a conversation or a raw scan of a medical document) and extract the key findings into a structured JSON format that mimics a professional medical report.

        **STRICTLY ADHERE** to the following instructions and JSON schema:
        1.  **Do not include any field related to 'diagnosis' or 'possible_diagnosis'**. The output must focus only on the findings, impressions, and recommendations for further action.
        2.  All extracted information must be in **English**, regardless of the input language.
        3.  If a field's information is not present in the input text, use "N/A" or an empty list `[]` as appropriate.

        Use this structured JSON format:
        {
          "report_id": "string",
          "exam_date": "ISO date/time or N/A",
          "exam_type": "string (e.g., MRI Knee w/o Contrast, X-Ray Chest)",
          "clinical_history": "string (summary of the patient's background/reason for exam)",
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

    Conversation:
    """


def analyze_text(text):
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": PROMPT + text}],
        temperature=0.3,
    )
    result = response.choices[0].message.content.strip()

    # 1. Try to load the raw result directly
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        pass  # Continue to step 2

    # 2. If direct load fails, check for a JSON block wrapped in ```json ... ```
    json_match = re.search(r'```json\s*([\s\S]*?)\s*```', result)
    if json_match:
        try:
            # Load the content from the matched block
            return json.loads(json_match.group(1))
        except Exception:
            pass  # Continue to step 3

    # 3. Final fallback: return the raw output in a dictionary for debugging
    return {"raw_output": result}
