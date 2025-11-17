import re

class CategoryMatcher:
    def __init__(self, lkl):
        self.lkl = lkl

    def match(self, text):
        text = text.lower()

        best_category = None
        best_score = 0

        for category, content in self.lkl["categories"].items():
            keywords = content["metadata"].get("keywords", [])
            score = 0

            for kw in keywords:
                pattern = r"\b" + re.escape(kw.lower()) + r"\b"
                if re.search(pattern, text):
                    score += 1

            if score > best_score:
                best_score = score
                best_category = category

        return best_category
