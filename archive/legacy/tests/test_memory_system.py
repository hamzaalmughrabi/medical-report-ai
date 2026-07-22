import os
import json
from viocetoreportapp.transcription import _get_intake_case, _save_memory, memory


def test_memory_system_save_and_retrieve():
    # 1) Clear memory for test isolation
    memory["cases"] = []

    # 2) Fake Phase 1 report
    fake_report = {
        "report_id": "mem_test_001",
        "phase": "intake",
        "patient_name": "Test Patient",
        "clinical_history": "Sample history",
        "detailed_findings": [],
        "impression_summary": "Test impression",
    }

    # 3) Save into memory
    memory["cases"].append(fake_report)
    _save_memory()

    # 4) Reload memory.json to ensure persistence works
    with open("memory.json", "r", encoding="utf-8") as f:
        loaded = json.load(f)

    assert "cases" in loaded, "memory.json missing 'cases' key"
    assert len(loaded["cases"]) > 0, "No cases saved"

    # 5) Test retrieval via helper method
    result = _get_intake_case("mem_test_001")

    print("\nRetrieved Case:", result)

    # 6) Ensure it’s the correct entry
    assert result is not None
    assert isinstance(result, dict)
    assert result["report_id"] == "mem_test_001"
    assert result["clinical_history"] == "Sample history"
