class MissingInfoDetector:
    def __init__(self, lkl_data: dict):
        self.lkl = lkl_data

    def detect_missing(self, category: str, transcript: str):
        if category not in self.lkl.get("categories", {}):
            return []

        cat_data = self.lkl["categories"][category]
        expected_questions = cat_data.get("patterns", {}).get("history_questions", [])
        required_fields = cat_data.get("missing_info", {}).get("required_fields", [])

        transcript_lower = (transcript or "").lower()

        missing = []
        for q in expected_questions + required_fields:
            if not q:
                continue
            tokens = [t for t in q.lower().replace("?", "").split() if t]
            if not any(word in transcript_lower for word in tokens):
                missing.append(q)

        return missing
