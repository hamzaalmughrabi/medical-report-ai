class TemplateSuggester:
    def __init__(self, lkl_data: dict):
        self.lkl = lkl_data

    def suggest_templates(self, category: str):
        if category not in self.lkl.get("categories", {}):
            return {}

        cat = self.lkl["categories"][category]
        exam_templates = cat.get("knowledge", {}).get("exam_templates", {})

        return {
            "findings_templates": exam_templates.get("findings_templates", []),
            "impression_templates": exam_templates.get("impression_templates", []),
        }
