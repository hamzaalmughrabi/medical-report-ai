
def get_category_knowledge(self, category: str):
    """
    Returns all knowledge related to this category
    so it can be injected into the GPT prompt.
    """

    cat = self.data["categories"].get(category)
    if not cat:
        return None

    return {
        "keywords": cat["metadata"]["keywords"],
        "symptoms": cat["patterns"]["symptoms"],
        "history_questions": cat["patterns"]["history_questions"],
        "finding_templates": cat["patterns"]["findings_templates"],
        "impression_templates": cat["patterns"]["impression_templates"],
        "investigations": cat["investigations"],
        "differentials": cat["differential_diagnoses"],
        "management": cat["management_options"],
        "previous_cases": cat["cases"],
    }
def auto_learn_from_report(self, category, diagnostic_report):
    """
    Learns new findings, symptoms, impressions, or management options
    from a finished doctor-generated report.
    """

    cat_data = self.data["categories"].get(category)
    if not cat_data:
        return

    # Extract knowledge from the report
    # 1) findings
    if "detailed_findings" in diagnostic_report:
        for f in diagnostic_report["detailed_findings"]:
            finding = f.get("finding", "").strip().lower()
            if finding and finding not in cat_data["patterns"]["findings_templates"]:
                print(f"📘 LKL Learning new finding: {finding}")
                cat_data["patterns"]["findings_templates"].append(finding)

    # 2) impression patterns
    if "impression_summary" in diagnostic_report:
        imp = diagnostic_report["impression_summary"].strip()
        if imp and imp not in cat_data["patterns"]["impression_templates"]:
            print(f"📘 LKL Learning new impression pattern.")
            cat_data["patterns"]["impression_templates"].append(imp)

    # 3) symptoms
    if "clinical_history" in diagnostic_report:
        history_text = diagnostic_report["clinical_history"].lower()

        for symptom in ["pain", "swelling", "instability", "locking", "weakness"]:
            if symptom in history_text and symptom not in cat_data["patterns"]["symptoms"]:
                print(f"📘 LKL Learning new symptom: {symptom}")
                cat_data["patterns"]["symptoms"].append(symptom)

    # save LKL after updating
    self._save()
