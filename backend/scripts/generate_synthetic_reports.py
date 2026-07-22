import json
import os
import random
from datetime import datetime, timedelta

OUTPUT_DIR = "synthetic_reports"
NUM_REPORTS = 300  # انت اخترت 300

os.makedirs(OUTPUT_DIR, exist_ok=True)

random.seed(42)

sex_options = ["Male", "Female"]
exam_types = ["Consultation", "Follow-up", "Emergency Visit", "Telemedicine"]

# شوية سيناريوهات طبية مختلفة
SCENARIOS = [
    {
        "id": "chest_pain",
        "clinical_history": (
            "The patient reports intermittent central chest pain for the past 3 days, "
            "worsening with exertion and improving with rest. No recent trauma. "
            "Mild shortness of breath is noted on exertion, but no syncope."
        ),
        "findings": [
            ("Exertional chest pain", "Suggestive of possible angina, warrants further cardiac evaluation."),
            ("Mild dyspnea on exertion", "May indicate reduced cardiac reserve or deconditioning."),
            ("No history of trauma", "Reduces likelihood of musculoskeletal chest wall injury."),
        ],
        "impression": (
            "Intermittent exertional chest pain concerning for possible stable angina; "
            "further cardiac workup is indicated."
        ),
        "recommendations": [
            "Order ECG and cardiac enzymes.",
            "Schedule an exercise stress test or cardiology referral.",
            "Advise the patient to avoid strenuous activity until evaluation."
        ],
        "urgency": "high",
    },
    {
        "id": "headache_migraine",
        "clinical_history": (
            "The patient presents with recurrent unilateral throbbing headaches associated "
            "with photophobia and nausea, lasting several hours and occurring 2–3 times per month."
        ),
        "findings": [
            ("Recurrent unilateral throbbing headache", "Typical pattern consistent with migraine."),
            ("Associated photophobia and nausea", "Common migraine-associated symptoms."),
            ("No focal neurological deficits reported", "Reduces suspicion for acute intracranial events."),
        ],
        "impression": "Clinical features are consistent with migraine-type headaches.",
        "recommendations": [
            "Recommend keeping a headache diary to identify triggers.",
            "Consider trial of triptan therapy during acute attacks.",
            "Discuss preventive therapy if frequency increases or affects daily function."
        ],
        "urgency": "moderate",
    },
    {
        "id": "upper_respiratory_infection",
        "clinical_history": (
            "The patient reports sore throat, nasal congestion, mild cough, and low-grade fever "
            "for the past 4 days. No shortness of breath or chest pain."
        ),
        "findings": [
            ("Sore throat and nasal congestion", "Typical features of upper respiratory tract infection."),
            ("Mild, non-productive cough", "Likely related to upper airway irritation."),
            ("Low-grade fever", "Consistent with viral etiology; no signs of sepsis reported."),
        ],
        "impression": "Likely viral upper respiratory tract infection.",
        "recommendations": [
            "Advise rest, adequate hydration, and symptomatic relief with antipyretics as needed.",
            "Educate patient on warning signs such as worsening dyspnea or high fever.",
            "Consider testing for influenza or COVID-19 if clinically indicated."
        ],
        "urgency": "low",
    },
    {
        "id": "abdominal_pain",
        "clinical_history": (
            "The patient reports crampy periumbilical abdominal pain that shifted to the right lower quadrant "
            "over 24 hours, associated with nausea and reduced appetite."
        ),
        "findings": [
            ("Migratory abdominal pain", "Classical pattern concerning for acute appendicitis."),
            ("Nausea and anorexia", "Common associated features in acute appendicitis."),
            ("No mention of diarrhea or vomiting", "Does not exclude appendicitis but may guide differential."),
        ],
        "impression": "Abdominal pain highly suspicious for acute appendicitis.",
        "recommendations": [
            "Urgent surgical consultation.",
            "Order complete blood count and abdominal imaging (ultrasound or CT).",
            "Keep patient nil per os (NPO) pending surgical evaluation."
        ],
        "urgency": "high",
    },
    {
        "id": "diabetes_follow_up",
        "clinical_history": (
            "The patient with known type 2 diabetes presents for routine follow-up. Reports occasional "
            "polyuria and increased thirst but no chest pain or visual changes."
        ),
        "findings": [
            ("Known type 2 diabetes", "Chronic metabolic condition requiring ongoing monitoring."),
            ("Polyuria and polydipsia", "May indicate suboptimal glycemic control."),
            ("No acute symptoms such as chest pain or vision loss", "No current evidence of acute complications."),
        ],
        "impression": "Type 2 diabetes with possible suboptimal glycemic control.",
        "recommendations": [
            "Order HbA1c and basic metabolic panel.",
            "Review and adjust diabetes medications as needed.",
            "Reinforce dietary counseling and physical activity."
        ],
        "urgency": "moderate",
    },
    {
        "id": "hypertension_follow_up",
        "clinical_history": (
            "The patient presents for hypertension follow-up. Home blood pressure readings are frequently "
            "around 150/95 mmHg despite current medication."
        ),
        "findings": [
            ("Elevated home blood pressure readings", "Indicates suboptimal blood pressure control."),
            ("No reported chest pain, dyspnea, or neurologic deficits", "No acute hypertensive emergency features."),
        ],
        "impression": "Poorly controlled hypertension requiring medication adjustment.",
        "recommendations": [
            "Adjust antihypertensive regimen or add a second agent.",
            "Encourage lifestyle modifications including salt restriction and weight management.",
            "Schedule follow-up blood pressure check in 2–4 weeks."
        ],
        "urgency": "moderate",
    },
    {
        "id": "low_back_pain",
        "clinical_history": (
            "The patient complains of lower back pain for two weeks, worsened by prolonged sitting and improved "
            "with gentle movement. No radiation to the legs or red flag symptoms reported."
        ),
        "findings": [
            ("Mechanical pattern of low back pain", "Suggestive of musculoskeletal origin."),
            ("No leg weakness, numbness, or bladder/bowel dysfunction", "Reduces suspicion for cauda equina syndrome."),
        ],
        "impression": "Likely mechanical low back pain without red flag features.",
        "recommendations": [
            "Recommend gentle physical activity and core-strengthening exercises.",
            "Short-term use of analgesics as needed.",
            "Advise to seek urgent care if red flag symptoms develop."
        ],
        "urgency": "low",
    },
]

def random_age():
    return str(random.randint(18, 85))

def random_timestamp():
    # وزع التواريخ خلال آخر شهر تقريباً
    days_ago = random.randint(0, 30)
    dt = datetime.now() - timedelta(days=days_ago, hours=random.randint(0, 23), minutes=random.randint(0, 59))
    return dt.isoformat()

for i in range(1, NUM_REPORTS + 1):
    scenario = random.choice(SCENARIOS)
    age = random_age()
    sex = random.choice(sex_options)
    exam_type = random.choice(exam_types)

    report_id = f"synthetic_{i:04d}"

    obj = {
        "report_id": report_id,
        "patient_name": "N/A",
        "age": age,
        "sex": sex,
        "dob": "N/A",
        "referring_doctor": "N/A",
        "exam_date": "N/A",
        "exam_type": exam_type,
        "clinical_history": scenario["clinical_history"],
        "detailed_findings": [
            {
                "finding": f[0],
                "explanation": f[1],
            }
            for f in scenario["findings"]
        ],
        "impression_summary": scenario["impression"],
        "recommendations": scenario["recommendations"],
        "urgency_level": scenario["urgency"],
        "timestamp": random_timestamp(),
        "source_file": f"{report_id}.m4a",
    }

    out_path = os.path.join(OUTPUT_DIR, f"{report_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

print(f"Generated {NUM_REPORTS} synthetic reports in folder: {OUTPUT_DIR}")
