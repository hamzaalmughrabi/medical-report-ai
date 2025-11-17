import json
import os


class LKLManager:
    def __init__(self, lkl_path=None):
        if lkl_path is None:
            base = os.path.dirname(os.path.abspath(__file__))
            lkl_path = os.path.join(base, "lkl.json")

        self.lkl_path = lkl_path

        if not os.path.exists(lkl_path):
            raise FileNotFoundError(f"LKL file not found: {lkl_path}")

        with open(lkl_path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

    # ============================================================
    #  STEP 1 — CATEGORY DETECTION
    # ============================================================
    def detect_category(self, transcript: str):
        transcript_lower = transcript.lower()

        best_category = None
        best_score = 0

        for category, info in self.data["categories"].items():
            score = 0
            for kw in info["metadata"]["keywords"]:
                if kw.lower() in transcript_lower:
                    score += 1

            if score > best_score:
                best_score = score
                best_category = category

        return best_category

    # ============================================================
    #  STEP 2 — KNOWLEDGE RETRIEVAL
    # ============================================================
    def get_category_knowledge(self, category: str):
        cat = self.data["categories"].get(category)
        if not cat:
            return None

        return {
            "keywords": cat["metadata"]["keywords"],
            "symptoms": cat["patterns"]["symptoms"],
            "history_questions": cat["patterns"]["history_questions"],
            "finding_templates": cat["patterns"]["findings_templates"],
            "impression_templates": cat["patterns"]["impression_templates"],
            "investigations": cat["investigations"],
            "differentials": cat["differential_diagnoses"],
            "management": cat["management_options"],
            "previous_cases": cat["cases"],
        }

    # ============================================================
    #  STEP 3 — DETECT MISSING INFO
    # ============================================================
    def detect_missing_info(self, category: str, transcript: str):
        """Returns a list of missing clinical questions (not found in transcript)."""

        if not category:
            return []

        transcript = transcript.lower()

        questions = self.data["categories"][category]["patterns"]["history_questions"]

        missing = []
        for q in questions:
            # If key part of question is not mentioned → missing
            key_word = q.split()[0]  # simple heuristic
            if key_word.lower() not in transcript:
                missing.append(q)

        return missing

    # ============================================================
    #  STEP 4 — TEMPLATE SUGGESTION
    # ============================================================
    def suggest_templates(self, category: str):
        if not category:
            return {}

        cat = self.data["categories"][category]

        return {
            "findings_templates": cat["patterns"]["findings_templates"],
            "impression_templates": cat["patterns"]["impression_templates"],
        }

    # ============================================================
    #  STEP 5 — AUTO LEARNING FROM REPORT
    # ============================================================
    def auto_learn_from_report(self, category, diagnostic_report):
        cat_data = self.data["categories"].get(category)
        if not cat_data:
            return

        # Learn Findings
        if "detailed_findings" in diagnostic_report:
            for f in diagnostic_report["detailed_findings"]:
                finding = f.get("finding", "").strip().lower()
                if finding and finding not in cat_data["patterns"]["findings_templates"]:
                    print(f"📘 LKL Learning new finding: {finding}")
                    cat_data["patterns"]["findings_templates"].append(finding)

        # Learn Impression
        if "impression_summary" in diagnostic_report:
            imp = diagnostic_report["impression_summary"].strip()
            if imp and imp not in cat_data["patterns"]["impression_templates"]:
                print("📘 LKL Learning new impression template.")
                cat_data["patterns"]["impression_templates"].append(imp)

        # Learn Symptoms
        if "clinical_history" in diagnostic_report:
            history_text = diagnostic_report["clinical_history"].lower()
            for symptom in ["pain", "swelling", "instability", "locking", "weakness"]:
                if symptom in history_text and symptom not in cat_data["patterns"]["symptoms"]:
                    print(f"📘 LKL Learning new symptom: {symptom}")
                    cat_data["patterns"]["symptoms"].append(symptom)

        self._save()

    # ============================================================
    # INTERNAL SAVE
    # ============================================================
    def _save(self):
        with open(self.lkl_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        print("💾 LKL updated and saved.")
