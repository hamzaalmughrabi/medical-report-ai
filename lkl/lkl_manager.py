import json
import os
from typing import Any, Dict, List


def _append_unique(collection: List[Any], value: Any, max_items: int = 50):
    if value in collection or value in (None, "", []):
        return

    collection.append(value)
    # prevent unbounded growth
    if len(collection) > max_items:
        del collection[0 : len(collection) - max_items]


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

        # Normalize category structure for richer schema
        for cat_name in list(self.data.get("categories", {}).keys()):
            self._ensure_category_structure(cat_name)

    # ============================================================
    # CATEGORY DETECTION
    # ============================================================
    def detect_category(self, transcript: str):
        transcript_lower = (transcript or "").lower()

        best_category = None
        best_score = 0

        for category, info in self.data.get("categories", {}).items():
            score = 0
            keywords = info.get("metadata", {}).get("keywords", [])
            for kw in keywords:
                if kw.lower() in transcript_lower:
                    score += 1

            if score > best_score:
                best_score = score
                best_category = category

        return best_category

    # ============================================================
    # KNOWLEDGE RETRIEVAL (richer schema)
    # ============================================================
    def get_category_knowledge(self, category: str) -> Dict[str, Any]:
        cat = self.data.get("categories", {}).get(category)
        if not cat:
            return {}

        knowledge = cat.get("knowledge", {})
        exam_templates = knowledge.get("exam_templates", {})

        return {
            "metadata": cat.get("metadata", {}),
            "keywords": cat.get("metadata", {}).get("keywords", []),
            "symptom_patterns": knowledge.get("symptom_patterns", []),
            "osce": knowledge.get("osce", {}),
            "ros_checklist": knowledge.get("ros_checklist", {}),
            "investigations": knowledge.get("investigations", {}),
            "differential_diagnoses": knowledge.get("differential_diagnoses", {}),
            "diagnostic_links": knowledge.get("diagnostic_links", {}),
            "exam_templates": {
                "findings_templates": exam_templates.get("findings_templates", []),
                "impression_templates": exam_templates.get("impression_templates", []),
            },
            "recommendation_templates": knowledge.get("recommendation_templates", []),
            "missing_info_requirements": knowledge.get(
                "missing_info_requirements", []
            ),
            "learned": cat.get("learned", {}),
        }

    # ============================================================
    # MISSING INFO DETECTION
    # ============================================================
    def detect_missing_info(self, category: str, transcript: str):
        if not category:
            return []

        cat = self.data.get("categories", {}).get(category)
        if not cat:
            return []

        transcript_lower = (transcript or "").lower()
        knowledge = cat.get("knowledge", {})
        required = knowledge.get("missing_info_requirements", [])
        ros_sections = knowledge.get("ros_checklist", {})

        missing = []
        for req in required:
            if req and req.lower() not in transcript_lower:
                missing.append(req)

        for section, prompts in ros_sections.items():
            prompts = prompts or []
            if prompts and not any(p.lower() in transcript_lower for p in prompts):
                missing.append(f"ROS: {section}")

        return missing

    # ============================================================
    # TEMPLATE SUGGESTION
    # ============================================================
    def suggest_templates(self, category: str):
        if not category:
            return {}

        cat = self.data.get("categories", {}).get(category, {})
        exam_templates = cat.get("knowledge", {}).get("exam_templates", {})

        return {
            "findings_templates": exam_templates.get("findings_templates", []),
            "impression_templates": exam_templates.get("impression_templates", []),
        }

    # ============================================================
    # AUTO LEARNING (PHASE 1 + PHASE 2)
    # ============================================================
    def auto_learn_from_report(self, category: str, diagnostic_report: Dict[str, Any]):
        cat_data = self._ensure_category_structure(category)
        if not cat_data:
            return

        knowledge = cat_data["knowledge"]
        exam_templates = knowledge["exam_templates"]
        learned = cat_data["learned"]

        # Persist report metadata for traceability
        _append_unique(
            learned["reports"],
            {
                "report_id": diagnostic_report.get("report_id"),
                "phase": diagnostic_report.get("phase", "unknown"),
                "timestamp": diagnostic_report.get("timestamp"),
            },
        )

        history_text = (diagnostic_report.get("clinical_history") or "").strip()
        if history_text:
            _append_unique(learned["intake_histories"], history_text)
            for phrase in [p.strip() for p in history_text.split(".") if p.strip()]:
                _append_unique(knowledge["symptom_patterns"], phrase)

        missing_info = diagnostic_report.get("_missing_info") or []
        for item in missing_info:
            _append_unique(knowledge["missing_info_requirements"], item)
            _append_unique(learned["missing_info_samples"], item)

        for finding in diagnostic_report.get("detailed_findings", []) or []:
            finding_text = (finding.get("finding") or "").strip()
            explanation_text = (finding.get("explanation") or "").strip()
            if finding_text:
                _append_unique(exam_templates["findings_templates"], finding_text)
                _append_unique(learned["findings"], finding_text)
            if explanation_text:
                _append_unique(learned["findings"], explanation_text)

        impression = (diagnostic_report.get("impression_summary") or "").strip()
        if impression:
            _append_unique(exam_templates["impression_templates"], impression)
            _append_unique(learned["impressions"], impression)

        for rec in diagnostic_report.get("recommendations", []) or []:
            rec_text = (rec or "").strip()
            if rec_text:
                _append_unique(knowledge["recommendation_templates"], rec_text)
                _append_unique(learned["recommendations"], rec_text)

        self._save()

    # ============================================================
    # INTERNAL SAVE / NORMALIZATION
    # ============================================================
    def _ensure_category_structure(self, category: str) -> Dict[str, Any] | None:
        if not category:
            return None

        categories = self.data.setdefault("categories", {})
        cat = categories.setdefault(category, {})

        cat.setdefault("metadata", {}).setdefault("keywords", [])

        knowledge = cat.setdefault("knowledge", {})
        knowledge.setdefault("symptom_patterns", [])
        knowledge.setdefault("osce", {})
        knowledge.setdefault("ros_checklist", {})
        knowledge.setdefault("investigations", {})
        knowledge.setdefault("differential_diagnoses", {})
        knowledge.setdefault("diagnostic_links", {})
        knowledge.setdefault(
            "exam_templates", {"findings_templates": [], "impression_templates": []}
        )
        knowledge.setdefault("recommendation_templates", [])
        knowledge.setdefault("missing_info_requirements", [])

        learned = cat.setdefault(
            "learned",
            {
                "reports": [],
                "intake_histories": [],
                "findings": [],
                "impressions": [],
                "recommendations": [],
                "missing_info_samples": [],
            },
        )

        # Ensure required sub-keys exist if learned was present but partial
        learned.setdefault("reports", [])
        learned.setdefault("intake_histories", [])
        learned.setdefault("findings", [])
        learned.setdefault("impressions", [])
        learned.setdefault("recommendations", [])
        learned.setdefault("missing_info_samples", [])

        cat.setdefault("cases", [])

        return cat

    def _save(self):
        with open(self.lkl_path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        print("💾 LKL updated.")
