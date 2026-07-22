# json_to_pdf.py
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics



def make_pdf_from_case(data: dict, output_path: str):
    """
    Converts the diagnostic JSON report into a styled PDF.
    Ensures the file is actually written before returning.
    """
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Initialize document with built-in fonts
        doc = SimpleDocTemplate(output_path, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []

        # Content Fidelity: If doctor provided edited HTML, use it as the source of truth
        html_content = data.get("html_content")
        if html_content:
            import re
            # Normalize for ReportLab
            html_content = html_content.replace("<strong>", "<b>").replace("</strong>", "</b>")
            html_content = html_content.replace("<em>", "<i>").replace("</em>", "</i>")
            html_content = html_content.replace("&nbsp;", " ")
            
            # Extract blocks: h1-h4, p, li, div
            # Improved regex to capture a wider range of block elements
            blocks = re.findall(r'<(h1|h2|h3|h4|p|li|div)[^>]*>(.*?)</\1>', html_content, re.DOTALL | re.IGNORECASE)
            
            if not blocks:
                # Fallback: If no tags found, treat the whole thing as one paragraph
                clean_txt = re.sub(r'<[^>]+>', '', html_content).strip()
                if clean_txt: story.append(Paragraph(clean_txt, styles["Normal"]))
            else:
                for tag, content in blocks:
                    # Clean up nested tags that ReportLab doesn't support, but keep b, i, u, br, span
                    clean_content = re.sub(r'<(?!/?(b|i|u|br|span)[ >/])[^>]+>', '', content).strip()
                    
                    if not clean_content and tag.lower() != "li":
                        continue

                    style = styles["Normal"]
                    tag_lower = tag.lower()
                    if tag_lower == "h1": style = styles["Title"]
                    elif tag_lower == "h2": style = styles["Heading2"]
                    elif tag_lower == "h3": style = styles["Heading3"]
                    elif tag_lower == "h4": style = styles["Heading3"] # Fallback for h4
                    
                    # Handle list items
                    if tag_lower == "li":
                        clean_content = f"&bull; {clean_content}"

                    try:
                        # Paragraph handles basic HTML tags (b, i, u, br) natively
                        story.append(Paragraph(clean_content, style))
                        story.append(Spacer(1, 0.12 * inch))
                    except Exception as e:
                        # Total fallback: strip all tags if rendering fails
                        text_only = re.sub(r'<[^>]+>', '', clean_content)
                        story.append(Paragraph(text_only, style))
        else:
            # Fallback: Build from JSON keys (Original behavior)
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
# make_pdf_from_report() was intentionally removed from this module.
# The canonical implementation lives in transcription.py, where it uses an
# absolute path (BASE_DIR / "storage" / "reports") guaranteed to be correct
# regardless of the process working directory.
# backend_api.py imports make_pdf_from_report from transcription — do NOT add
# a second definition here.
