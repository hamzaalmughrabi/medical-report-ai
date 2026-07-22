import json
import re

class CategoryMatcher:
    def __init__(self, lkl_data: dict):
        self.categories = lkl_data.get("categories", {})

    def match_category(self, text: str):
        text = text.lower()

        best_category = None
        best_score = 0

        for cat_name, cat_data in self.categories.items():
            score = 0
            for kw in cat_data["metadata"]["keywords"]:
                if kw.lower() in text:
                    score += 1

            if score > best_score:
                best_score = score
                best_category = cat_name

        return best_category if best_score > 0 else None
