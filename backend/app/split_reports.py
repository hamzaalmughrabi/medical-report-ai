import json
import os

INPUT_FILE = "memory.json"   # غيّر الاسم حسب ملفك
OUTPUT_DIR = "split_reports"

# Create output folder
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load entire JSON file
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

# Validate structure
if "cases" not in data or not isinstance(data["cases"], list):
    raise ValueError("❌ JSON must contain a 'cases' array!")

cases = data["cases"]

# Split each case into a separate .json file
for idx, case in enumerate(cases):
    # Use report_id if available, otherwise enumerated number
    report_id = case.get("report_id", f"case_{idx+1}")
    safe_id = str(report_id).replace(" ", "_")

    filename = f"{OUTPUT_DIR}/{safe_id}.json"

    with open(filename, "w", encoding="utf-8") as out:
        json.dump(case, out, ensure_ascii=False, indent=2)

print(f"✅ Done! Split {len(cases)} reports into {OUTPUT_DIR}/")
