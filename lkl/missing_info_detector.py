class MissingInfoDetector:
    def __init__(self, lkl_data: dict):
        self.lkl = lkl_data

    def detect_missing(self, category: str, transcript: str):
        if category not in self.lkl.get("categories", {}):
            return []

        cat_data = self.lkl["categories"][category]
        knowledge = cat_data.get("knowledge", {})
        transcript_lower = (transcript or "").lower()

        missing = []

        # OSCE / history prompts
        for requirement in knowledge.get("missing_info_requirements", []):
            if requirement and requirement.lower() not in transcript_lower:
                missing.append(requirement)

        # ROS coverage
        for section, prompts in knowledge.get("ros_checklist", {}).items():
            prompts = prompts or []
            if prompts and not any(p.lower() in transcript_lower for p in prompts):
                missing.append(f"ROS: {section}")

        return missing
