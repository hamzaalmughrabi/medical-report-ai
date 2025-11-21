class TemplateSuggester:
    def __init__(self, lkl_data: dict):
        self.lkl = lkl_data

    def suggest_templates(self, category: str):
        if category not in self.lkl.get("categories", {}):
            return {}

        cat = self.lkl["categories"][category]
        patterns = cat.get("patterns", {})

        return {
            "findings_templates": patterns.get("findings_templates", []),
            "impression_templates": patterns.get("impression_templates", []),
        }
