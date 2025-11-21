from lkl.lkl_manager import LKLManager

lkl = LKLManager("lkl.json")

# Fake doctor transcript (instead of real audio)
text = """
The patient has severe knee pain especially during movement.
There is swelling and the knee sometimes locks.
Positive McMurray test was noted.
Pain is mostly medial and worsens at night.
"""

print("\n=== TEST 1: Category Matching ===")
category = lkl.detect_category(text)
print("Detected Category:", category)

print("\n=== TEST 2: Missing Info Detection ===")
missing = lkl.detect_missing_info(category, text)
print("Missing Info:", missing)

print("\n=== TEST 3: Knowledge Snapshot ===")
knowledge = lkl.get_category_knowledge(category)
print("Keywords:", knowledge.get("keywords"))
print("Symptom patterns (truncated):", knowledge.get("symptom_patterns", [])[:3])

print("\n=== TEST 4: Template Suggestion ===")
templates = lkl.suggest_templates(category)
print("Templates:", templates)

print("\n=== TEST 5: Auto Learning ===")
fake_report = {
    "phase": "intake",
    "report_id": "demo-001",
    "detailed_findings": [
        {"finding": "valgus stress pain positive", "explanation": "indicates possible MCL injury"},
        {"finding": "mild lateral tracking abnormality", "explanation": "possible patellar instability"}
    ],
    "impression_summary": "Findings suggest MCL strain with patellofemoral dysfunction.",
    "recommendations": ["Physiotherapy and MRI"],
    "clinical_history": "knee pain, swelling, instability",
}

lkl.auto_learn_from_report(category, fake_report)

print("\nGo open lkl.json — the new findings should be saved there.")
print("🔥 Test completed.")
