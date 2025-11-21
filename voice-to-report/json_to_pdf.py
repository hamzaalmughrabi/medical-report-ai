# json_to_pdf.py
import json
import os
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Sequence

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def _coerce_report_dict(raw: Any) -> Dict[str, Any]:
    """Accept dict/JSON string/file path and return a normalized report dict."""
    if isinstance(raw, dict):
        return deepcopy(raw)

    if isinstance(raw, str):
        # Try to treat it as a file path first
        if os.path.isfile(raw):
            with open(raw, "r", encoding="utf-8") as f:
                return json.load(f)
        # Otherwise try to parse JSON from the string
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive
            raise ValueError("report_json is a string but not valid JSON or file path") from exc

    raise TypeError("report_json must be a dict, JSON string, or path to a JSON file")


def _normalize_iterable(value: Any) -> List[Any]:
    """Force lists for recommendations/findings regardless of incoming type."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, (tuple, set)):
        return list(value)
    return [value]


def _normalize_findings(findings: Any) -> List[Dict[str, str]]:
    normalized = []
    for item in _normalize_iterable(findings):
        if isinstance(item, dict):
            normalized.append(
                {
                    "finding": str(item.get("finding", "N/A")),
                    "explanation": str(item.get("explanation", "N/A")),
                }
            )
        else:
            normalized.append({"finding": str(item), "explanation": "N/A"})
    return normalized


def _ensure_meaningful_content(report: Dict[str, Any]):
    """Raise if we only have placeholder/raw output to avoid N/A-only PDFs."""
    display = _prepare_display_report(report)

    if report.get("raw_output") and not any(
        display.get(field)
        and display.get(field) not in ("N/A", [])
        for field in ["patient_name", "clinical_history", "impression_summary"]
    ):
        raise ValueError("Report data missing required fields; received raw LLM output only.")

    return display


def _get_value_case_insensitive(mapping: Dict[str, Any], key: str):
    """Fetch a value from a mapping, matching keys case-insensitively."""

    if key in mapping:
        return mapping[key]

    key_lower = key.lower()
    for k, v in mapping.items():
        if isinstance(k, str) and k.lower() == key_lower:
            return v
    return None


def _extract_first(report: Dict[str, Any], keys: Sequence[str], container_keys: Sequence[str] | None = None):
    """
    Pull the first non-empty value from the provided keys, checking optional nested dicts
    such as {"patient_info": {...}}. This keeps PDF rendering resilient to slightly
    different LLM outputs or upstream schema variations, including casing differences.
    """

    for key in keys:
        val = _get_value_case_insensitive(report, key)
        if val not in (None, ""):
            return val

    for container in container_keys or []:
        nested = _get_value_case_insensitive(report, container)
        if isinstance(nested, dict):
            for key in keys:
                val = _get_value_case_insensitive(nested, key)
                if val not in (None, ""):
                    return val
    return None


def _as_text(value: Any) -> str:
    """Convert dicts/lists into human-readable text for PDF paragraphs."""
    if value is None:
        return "N/A"
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        parts = [f"{k}: {v}" for k, v in value.items() if v not in (None, "")]
        return "; ".join(parts) if parts else "N/A"
    if isinstance(value, (list, tuple, set)):
        parts = [str(v) for v in value if v not in (None, "")]
        return "; ".join(parts) if parts else "N/A"
    return str(value)


def _prepare_display_report(report: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a normalized view of the report with fallback key names so the PDF always shows
    the most informative available values.
    """

    display: Dict[str, Any] = {}

    display["phase"] = _extract_first(report, ["phase"])
    display["report_id"] = _extract_first(report, ["report_id", "case_id"])
    display["patient_name"] = _extract_first(
        report,
        ["patient_name", "patient", "name"],
        container_keys=["patient_info", "demographics"],
    )
    display["age"] = _extract_first(report, ["age"], container_keys=["patient_info", "demographics"])
    display["sex"] = _extract_first(
        report,
        ["sex", "gender"],
        container_keys=["patient_info", "demographics"],
    )
    display["exam_type"] = _extract_first(report, ["exam_type", "exam", "visit_type"])
    display["exam_date"] = _extract_first(
        report,
        ["exam_date", "date", "visit_date", "report_date"],
    )

    display["clinical_history"] = _as_text(
        _extract_first(
            report,
            ["clinical_history", "history", "history_text", "chief_complaint", "presenting_history"],
            container_keys=["osce_history", "intake_history"],
        )
    )

    display["detailed_findings"] = _normalize_findings(
        _extract_first(report, ["detailed_findings", "findings", "findings_list"])
    )

    display["impression_summary"] = _as_text(
        _extract_first(report, ["impression_summary", "impression", "diagnosis", "assessment"])
    )

    display["recommendations"] = _normalize_iterable(
        _extract_first(report, ["recommendations", "plan", "plans", "action_items"])
    )

    display["urgency_level"] = _extract_first(report, ["urgency_level", "urgency", "priority"]) or "N/A"

    return display


def make_pdf_from_case(data: Any, output_path: str):
    """
    Converts the diagnostic JSON report into a styled PDF.
    Accepts dicts, JSON strings, or file paths and validates content
    so that PDFs are not filled with placeholder "N/A" values.
    """
    try:
        report = _coerce_report_dict(data)
        display = _ensure_meaningful_content(report)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        doc = SimpleDocTemplate(output_path, pagesize=A4)
        styles = getSampleStyleSheet()
        story: List[Any] = []

        # Title
        title = "Medical Report"
        if display.get("phase"):
            title = f"Medical Report ({display['phase']})"
        story.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
        story.append(Spacer(1, 0.25 * inch))

        # Patient Info Section
        info_lines = [
            f"<b>Report ID:</b> {display.get('report_id', 'N/A')}",
            f"<b>Patient Name:</b> {display.get('patient_name', 'N/A')}",
            f"<b>Age:</b> {display.get('age', 'N/A')}",
            f"<b>Sex:</b> {display.get('sex', 'N/A')}",
            f"<b>Exam Type:</b> {display.get('exam_type', 'N/A')}",
            f"<b>Date:</b> {display.get('exam_date', 'N/A')}",
        ]
        for line in info_lines:
            story.append(Paragraph(line, styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Clinical History
        story.append(Paragraph("<b>Clinical History</b>", styles["Heading2"]))
        story.append(Paragraph(display.get("clinical_history", "N/A"), styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Findings
        story.append(Paragraph("<b>Detailed Findings</b>", styles["Heading2"]))
        findings = display.get("detailed_findings", [])
        if findings:
            for f in findings:
                story.append(
                    Paragraph(
                        f"• {f.get('finding', 'N/A')} — {f.get('explanation', 'N/A')}",
                        styles["Normal"],
                    )
                )
        else:
            story.append(Paragraph("N/A", styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Impression
        story.append(Paragraph("<b>Impression Summary</b>", styles["Heading2"]))
        story.append(Paragraph(display.get("impression_summary", "N/A"), styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Recommendations
        story.append(Paragraph("<b>Recommendations</b>", styles["Heading2"]))
        recs = display.get("recommendations", [])
        if recs:
            for r in recs:
                story.append(Paragraph(f"• {r}", styles["Normal"]))
        else:
            story.append(Paragraph("N/A", styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Urgency
        story.append(
            Paragraph("<b>Urgency Level:</b> " + display.get("urgency_level", "N/A"), styles["Normal"])
        )

        # Build the PDF
        doc.build(story)

        if not os.path.isfile(output_path):
            raise RuntimeError(f"PDF was not created: {output_path}")

        print(f"✅ PDF successfully created at {output_path}")

    except Exception as e:  # pragma: no cover - runtime safety
        print(f"❌ PDF generation failed: {e}")
        raise


def make_pdf_from_report(report_json: Any):
    """
    Wrapper used by backend_api.py
    Automatically normalizes input, generates PDF path, and calls make_pdf_from_case().
    """

    try:
        report = _coerce_report_dict(report_json)
        _ensure_meaningful_content(report)

        output_dir = "reports"
        os.makedirs(output_dir, exist_ok=True)

        report_id = report.get("report_id", f"report_{int(datetime.now().timestamp())}")
        output_path = os.path.join(output_dir, f"{report_id}_final.pdf")

        make_pdf_from_case(report, output_path)

        return output_path

    except Exception as e:  # pragma: no cover - runtime safety
        print("❌ make_pdf_from_report failed:", e)
        return None
