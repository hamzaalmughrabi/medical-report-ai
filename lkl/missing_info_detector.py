class MissingInfoDetector:
    def __init__(self, lkl_data: dict):
        self.lkl = lkl_data

    def detect_missing(self, category: str, transcript: str):
        if category not in self.lkl["categories"]:
            return []

        cat_data = self.lkl["categories"][category]
        expected_questions = cat_data["patterns"]["history_questions"]

        transcript_lower = transcript.lower()

        missing = []
        for q in expected_questions:
            # simple keyword-based detection
            if not any(word in transcript_lower for word in q.lower().split()):
                missing.append(q)

        return missing
