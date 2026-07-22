class TemplateSuggester:
    def __init__(self, lkl_data: dict):
        self.lkl = lkl_data

    def suggest_templates(self, category: str):
        if category not in self.lkl["categories"]:
            return {}

        cat = self.lkl["categories"][category]

        return {
            "findings_templates": cat.get("findings_templates", []),
            "impression_templates": cat.get("impression_templates", [])
        }
