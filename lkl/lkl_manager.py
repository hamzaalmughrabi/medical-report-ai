import json

class LKLManager:
    def __init__(self, lkl_path="lkl/lkl.json"):
        self.lkl_path = lkl_path
        self.lkl = {}
        self.load_lkl()

    def load_lkl(self):
        with open(self.lkl_path, "r", encoding="utf-8") as f:
            self.lkl = json.load(f)

    def list_categories(self):
        return list(self.lkl["categories"].keys())

    def get_category(self, category_name):
        return self.lkl["categories"].get(category_name)

    def get_patterns(self, category_name):
        return self.get_category(category_name).get("patterns", {})

    def get_metadata(self, category_name):
        return self.get_category(category_name).get("metadata", {})

    def get_cases(self, category_name):
        return self.get_category(category_name).get("cases", [])

    def get_differentials(self, category_name):
        return self.get_category(category_name).get("differential_diagnoses", {})

    def get_investigations(self, category_name):
        return self.get_category(category_name).get("investigations", {})

    def get_management(self, category_name):
        return self.get_category(category_name).get("management_options", {})

    # placeholders
    def match_category(self, text):
        pass

    def extract_missing_info(self, extracted_data, category_name):
        pass

    def suggest_templates(self, category_name):
        pass
