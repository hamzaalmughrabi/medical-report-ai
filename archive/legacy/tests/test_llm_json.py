import os
import json
from openai import OpenAI
from dotenv import load_dotenv
import jsonschema
import pytest

intake_schema = {
    "type": "object",
    "properties": {
        "chief_complaint": {"type": "string"},
        "symptoms": {"type": "array"},
        "detailed_findings": {"type": "array"},
        "impression_summary": {"type": "string"}
    },
    "required": ["chief_complaint", "symptoms", "detailed_findings"]
}

def test_llm_json_validation():

    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    assert api_key is not None, "API key not found in .env"

    client = OpenAI(api_key=api_key)

    transcript = (
        "Patient reports chest pain for two days, radiating to the left arm, "
        "associated with shortness of breath and dizziness."
    )

    response = client.responses.create(
        model="gpt-4o-mini",
        input=f"""
        You MUST return ONLY valid JSON with the following structure:

        {{
          "chief_complaint": "string",
          "symptoms": ["list of symptoms"],
          "detailed_findings": ["list of findings"],
          "impression_summary": "string"
        }}

        Rules:
        - Do NOT wrap the JSON in markdown or code blocks.
        - Do NOT add any extra text outside the JSON.
        - Do NOT change field names.
        - If the transcript does not explicitly state some fields, infer them clinically.

        Transcript:
        {transcript}
        """
    )

    raw_text = response.output_text

    # ---------------------------
    # Remove Markdown-like fences
    # ---------------------------
    raw_text = raw_text.strip()

    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        raw_text = raw_text.replace("json", "", 1).strip()

    # Now safely parse JSON
    data = json.loads(raw_text)

    jsonschema.validate(instance=data, schema=intake_schema)

    assert "chief_complaint" in data
    assert "symptoms" in data
    assert "detailed_findings" in data

    print("\nValidated JSON:", json.dumps(data, indent=2))
