# json_to_pdf.py
import json
import os
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List

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
    if report.get("raw_output") and not any(
        report.get(field) for field in ["patient_name", "clinical_history", "impression_summary"]
    ):
        raise ValueError("Report data missing required fields; received raw LLM output only.")


def make_pdf_from_case(data: Any, output_path: str):
    """
    Converts the diagnostic JSON report into a styled PDF.
    Accepts dicts, JSON strings, or file paths and validates content
    so that PDFs are not filled with placeholder "N/A" values.
    """
    try:
        report = _coerce_report_dict(data)
        _ensure_meaningful_content(report)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        doc = SimpleDocTemplate(output_path, pagesize=A4)
        styles = getSampleStyleSheet()
        story: List[Any] = []

        # Title
        story.append(Paragraph("<b>Medical Report</b>", styles["Title"]))
        story.append(Spacer(1, 0.25 * inch))

        # Patient Info Section
        info_lines = [
            f"<b>Report ID:</b> {report.get('report_id', 'N/A')}",
            f"<b>Patient Name:</b> {report.get('patient_name', 'N/A')}",
            f"<b>Age:</b> {report.get('age', 'N/A')}",
            f"<b>Sex:</b> {report.get('sex', 'N/A')}",
            f"<b>Exam Type:</b> {report.get('exam_type', 'N/A')}",
            f"<b>Date:</b> {report.get('exam_date', 'N/A')}",
        ]
        for line in info_lines:
            story.append(Paragraph(line, styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Clinical History
        story.append(Paragraph("<b>Clinical History</b>", styles["Heading2"]))
        story.append(Paragraph(report.get("clinical_history", "N/A"), styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Findings
        story.append(Paragraph("<b>Detailed Findings</b>", styles["Heading2"]))
        findings = _normalize_findings(report.get("detailed_findings", []))
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
        story.append(Paragraph(report.get("impression_summary", "N/A"), styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Recommendations
        story.append(Paragraph("<b>Recommendations</b>", styles["Heading2"]))
        recs = _normalize_iterable(report.get("recommendations", []))
        if recs:
            for r in recs:
                story.append(Paragraph(f"• {r}", styles["Normal"]))
        else:
            story.append(Paragraph("N/A", styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Urgency
        story.append(
            Paragraph("<b>Urgency Level:</b> " + report.get("urgency_level", "N/A"), styles["Normal"])
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
