import json
import os
from copy import deepcopy
from typing import Any, Dict, List, Optional


class LKLManager:
    def __init__(self, lkl_path: Optional[str] = None):
        if lkl_path is None:
            base = os.path.dirname(os.path.abspath(__file__))
            lkl_path = os.path.join(base, "lkl.json")

        self.lkl_path = lkl_path
        self.data: Dict[str, Any] = {}

        if not os.path.exists(lkl_path):
            raise FileNotFoundError(f"LKL file not found: {lkl_path}")

        try:
            with open(lkl_path, "r", encoding="utf-8") as f:
                self.data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse LKL JSON: {e}") from e

    # ============================================================
    # CATEGORY DETECTION
    # ============================================================
    def detect_category(self, transcript: str) -> Optional[str]:
        transcript_lower = (transcript or "").lower()

        best_category: Optional[str] = None
        best_score = 0

        for category, info in self.data.get("categories", {}).items():
            score = 0
            for kw in info.get("metadata", {}).get("keywords", []):
                if kw.lower() in transcript_lower:
                    score += 1

            if score > best_score:
                best_score = score
                best_category = category

        return best_category

    # ============================================================
    # KNOWLEDGE RETRIEVAL (richer OSCE-aware payload)
    # ============================================================
    def get_category_knowledge(self, category: str) -> Dict[str, Any]:
        cat = self.data.get("categories", {}).get(category)
        if not cat:
            return {}

        patterns = cat.get("patterns", {})
        osce = cat.get("osce_history", {})
        learning = cat.get("learning", {})

        return {
            "keywords": cat.get("metadata", {}).get("keywords", []),
            "red_flags": cat.get("metadata", {}).get("red_flags", []),
            "common_causes": cat.get("metadata", {}).get("common_causes", []),
            "symptoms": patterns.get("symptoms", []),
            "history_questions": patterns.get("history_questions", []),
            "findings_templates": patterns.get("findings_templates", []),
            "impression_templates": patterns.get("impression_templates", []),
            "ros_clues": patterns.get("ros_clues", []),
            "risk_factors": patterns.get("risk_factors", []),
            "supporting_tests": patterns.get("supporting_tests", []),
            "investigations": cat.get("investigations", {}),
            "anatomical_location": cat.get("anatomical_location", {}),
            "differentials": cat.get("differential_diagnoses", {}),
            "severity_scales": cat.get("severity_scales", {}),
            "osce_history": osce,
            "learning_samples": {
                "intake": learning.get("intake_reports", []),
                "final": learning.get("final_reports", []),
            },
            "missing_info_prompts": cat.get("missing_info", {}),
        }

    # ============================================================
    # MISSING INFO DETECTION
    # ============================================================
    def detect_missing_info(self, category: str, transcript: str) -> List[str]:
        if not category:
            return []

        transcript_lower = (transcript or "").lower()
        cat_data = self.data.get("categories", {}).get(category, {})
        patterns = cat_data.get("patterns", {})
        missing_fields: List[str] = []

        for prompt in cat_data.get("missing_info", {}).get("required_fields", []):
            tokens = [t for t in prompt.lower().replace("?", "").split() if t]
            if tokens and not any(tok in transcript_lower for tok in tokens):
                missing_fields.append(prompt)

        for q in patterns.get("history_questions", []):
            tokens = [t for t in q.lower().replace("?", "").split() if t]
            if tokens and not any(tok in transcript_lower for tok in tokens):
                missing_fields.append(q)

        return missing_fields

    # ============================================================
    # TEMPLATE SUGGESTION
    # ============================================================
    def suggest_templates(self, category: str) -> Dict[str, List[str]]:
        if not category:
            return {}

        cat = self.data.get("categories", {}).get(category, {})
        patterns = cat.get("patterns", {})

        return {
            "findings_templates": patterns.get("findings_templates", []),
            "impression_templates": patterns.get("impression_templates", []),
        }

    # ============================================================
    # AUTO LEARNING (PHASE 1 + PHASE 2)
    # ============================================================
    def auto_learn_from_report(self, category: str, diagnostic_report: Dict[str, Any]):
        cat_data = self.data.get("categories", {}).get(category)
        if not cat_data:
            return

        def _add_unique(seq: List[str], item: str):
            if not item:
                return
            if item not in seq:
                seq.append(item)

        patterns = cat_data.setdefault("patterns", {})
        learning = cat_data.setdefault("learning", {"intake_reports": [], "final_reports": []})

        # Learn from detailed findings
        for finding in diagnostic_report.get("detailed_findings", []) or []:
            finding_text = (finding or {}).get("finding", "").strip()
            explanation_text = (finding or {}).get("explanation", "").strip()
            _add_unique(patterns.setdefault("findings_templates", []), finding_text)
            _add_unique(patterns.setdefault("supporting_tests", []), explanation_text)

        # Learn impressions
        impression = (diagnostic_report.get("impression_summary") or "").strip()
        _add_unique(patterns.setdefault("impression_templates", []), impression)

        # Learn symptoms / history cues from clinical_history
        history_text = (diagnostic_report.get("clinical_history") or "").lower()
        for snippet in [p.strip() for p in history_text.replace(";", ",").split(",") if p.strip()]:
            _add_unique(patterns.setdefault("symptoms", []), snippet)

        # Persist missing info signals
        for missing in diagnostic_report.get("_missing_info", []) or []:
            _add_unique(cat_data.setdefault("missing_info", {}).setdefault("observed_gaps", []), missing)

        # Track learning samples
        phase = diagnostic_report.get("phase")
        sample = {
            "report_id": diagnostic_report.get("report_id"),
            "clinical_history": diagnostic_report.get("clinical_history", ""),
            "impression_summary": diagnostic_report.get("impression_summary", ""),
        }

        if phase == "intake":
            learning.setdefault("intake_reports", []).append(deepcopy(sample))
        elif phase == "final_assessment":
            learning.setdefault("final_reports", []).append(deepcopy(sample))

        self._save()

    # ============================================================
    # INTERNAL SAVE
    # ============================================================
    def _save(self):
        try:
            with open(self.lkl_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
            print("💾 LKL updated.")
        except Exception as e:
            print(f"❌ Failed to save LKL: {e}")
