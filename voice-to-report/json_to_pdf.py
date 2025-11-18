# json_to_pdf.py
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from datetime import datetime



def make_pdf_from_case(data: dict, output_path: str):
    """
    Converts the diagnostic JSON report into a styled PDF.
    Ensures the file is actually written before returning.
    """
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Initialize document with built-in fonts
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.units import inch

        doc = SimpleDocTemplate(output_path, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []

        # Title
        story.append(Paragraph(f"<b>Medical Report</b>", styles["Title"]))
        story.append(Spacer(1, 0.25 * inch))

        # Patient Info Section
        info_lines = [
            f"<b>Report ID:</b> {data.get('report_id', 'N/A')}",
            f"<b>Patient Name:</b> {data.get('patient_name', 'N/A')}",
            f"<b>Age:</b> {data.get('age', 'N/A')}",
            f"<b>Sex:</b> {data.get('sex', 'N/A')}",
            f"<b>Exam Type:</b> {data.get('exam_type', 'N/A')}",
            f"<b>Date:</b> {data.get('exam_date', 'N/A')}"
        ]
        for line in info_lines:
            story.append(Paragraph(line, styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Clinical History
        story.append(Paragraph("<b>Clinical History</b>", styles["Heading2"]))
        story.append(Paragraph(data.get("clinical_history", "N/A"), styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Findings
        story.append(Paragraph("<b>Detailed Findings</b>", styles["Heading2"]))
        findings = data.get("detailed_findings", [])
        if findings:
            for f in findings:
                story.append(Paragraph(f"• {f.get('finding', 'N/A')} — {f.get('explanation', 'N/A')}", styles["Normal"]))
        else:
            story.append(Paragraph("N/A", styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Impression
        story.append(Paragraph("<b>Impression Summary</b>", styles["Heading2"]))
        story.append(Paragraph(data.get("impression_summary", "N/A"), styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Recommendations
        story.append(Paragraph("<b>Recommendations</b>", styles["Heading2"]))
        recs = data.get("recommendations", [])
        if recs:
            for r in recs:
                story.append(Paragraph(f"• {r}", styles["Normal"]))
        else:
            story.append(Paragraph("N/A", styles["Normal"]))
        story.append(Spacer(1, 0.25 * inch))

        # Urgency
        story.append(Paragraph("<b>Urgency Level:</b> " + data.get("urgency_level", "N/A"), styles["Normal"]))

        # Build the PDF
        doc.build(story)

        # ✅ Verify the file is written
        if not os.path.isfile(output_path):
            raise RuntimeError(f"PDF was not created: {output_path}")

        print(f"✅ PDF successfully created at {output_path}")

    except Exception as e:
        print(f"❌ PDF generation failed: {e}")
        raise
def make_pdf_from_report(report_json):
    """
    Wrapper used by backend_api.py
    Automatically generates PDF path and calls make_pdf_from_case()
    """

    try:
        # Create reports directory
        output_dir = "reports"
        os.makedirs(output_dir, exist_ok=True)

        # Build filename
        report_id = report_json.get("report_id", f"report_{int(datetime.now().timestamp())}")
        output_path = os.path.join(output_dir, f"{report_id}_final.pdf")

        # Call the real PDF generator
        make_pdf_from_case(report_json, output_path)

        return output_path

    except Exception as e:
        print("❌ make_pdf_from_report failed:", e)
        return None
