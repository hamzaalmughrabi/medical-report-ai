"""
Hospital-style medical report PDF generator with Type Machine font.
Keeps the tight spacing, slightly wide text, and clean layout.
"""

import os
import json
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# --- Font setup ---
FONT_PATH = "Type Machine.ttf"  # your Type Machine font
if os.path.exists(FONT_PATH):
    pdfmetrics.registerFont(TTFont("TypeMachine", FONT_PATH))
    BASE_FONT = "TypeMachine"


OUTPUT_DIR = "reports"

# --- Styles ---
styles = getSampleStyleSheet()

def make_style(name, size, leading, align=0, bold=False, caps=False, spacing=0.5):
    """Helper to create consistent text styles"""
    return ParagraphStyle(
        name,
        fontName=BASE_FONT,
        fontSize=size,
        leading=leading,
        alignment=align,  # 0=left,1=center,2=right,4=justify
        spaceBefore=0,
        spaceAfter=2,
        wordWrap="LTR",
        tracking=spacing,  # slight widen effect
        textTransform="uppercase" if caps else None,
        textColor=colors.black,
    )

title_style = make_style("Title", 16, 18, align=1, caps=True)
header_small = make_style("HeaderSmall", 9, 10.5)
value_style = make_style("Value", 10.3, 12, align=4)
section_title = make_style("SectionTitle", 11, 13, caps=True)
finding_style = make_style("Finding", 10.3, 12.5, align=4)

# --- Helpers ---
def ensure_output_dir(path):
    os.makedirs(path, exist_ok=True)

def pretty(s):
    if s is None:
        return "N/A"
    if isinstance(s, list):
        return "<br/>• " + "<br/>• ".join([pretty(i) for i in s])
    return str(s).strip() or "N/A"

def build_patient_table(data):
    rows = [
        ["Patient Name:", pretty(data.get("patient_name")), "Referring Dr.:", pretty(data.get("referring_doctor"))],
        ["Age:", pretty(data.get("age")), "Modality:", pretty(data.get("modality"))],
        ["Sex:", pretty(data.get("sex")), "Exam:", pretty(data.get("region_examined"))],
        ["DOB:", pretty(data.get("dob")), "Source File:", pretty(data.get("source_file"))],
    ]
    tbl = Table(rows, colWidths=[35*mm, 60*mm, 35*mm, 55*mm])
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-1), BASE_FONT),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ]))
    return tbl

# --- Core PDF Generator ---
def make_pdf_from_case(case, output_dir=OUTPUT_DIR):
    ensure_output_dir(output_dir)
    cid = case.get("report_id") or f"case_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    path = os.path.join(output_dir, f"report_{cid}.pdf")

    doc = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=17*mm,
        rightMargin=17*mm,
        topMargin=16*mm,
        bottomMargin=16*mm,
    )

    story = []

    # Header
    story.append(Paragraph("MEDICAL REPORT", title_style))
    story.append(Spacer(1, 4))

    story.append(Paragraph(f"Report ID: {pretty(case.get('report_id'))}", header_small))
    story.append(Paragraph(f"Date: {pretty(case.get('timestamp') or case.get('exam_date'))}", header_small))
    story.append(Spacer(1, 6))

    # Patient Info
    patient_info = case.get("patient_info", {})
    story.append(build_patient_table({
        "patient_name": patient_info.get("name"),
        "age": patient_info.get("age"),
        "sex": patient_info.get("sex"),
        "dob": patient_info.get("dob"),
        "referring_doctor": case.get("referring_doctor"),
        "modality": case.get("exam_type") or "MRI",
        "region_examined": case.get("region_examined"),
        "source_file": case.get("source_file"),
    }))
    story.append(Spacer(1, 8))

    # Clinical History
    if case.get("clinical_history"):
        story.append(Paragraph("CLINICAL HISTORY:", section_title))
        story.append(Paragraph(pretty(case.get("clinical_history")), value_style))
        story.append(Spacer(1, 6))

    # Findings
    findings = (
        case.get("detailed_findings")
        or case.get("findings")
        or case.get("report")
        or case.get("body")
    )
    story.append(Paragraph("FINDINGS:", section_title))
    if not findings:
        story.append(Paragraph("N/A", value_style))
    else:
        for idx, f in enumerate(findings, start=1):
            story.append(
                Paragraph(
                    f"<b>{idx}. {pretty(f.get('finding'))}</b><br/>{pretty(f.get('explanation'))}",
                    finding_style
                )
            )
    story.append(Spacer(1, 6))

    # Impression
    story.append(Paragraph("IMPRESSION / DIAGNOSIS:", section_title))
    story.append(Paragraph(pretty(case.get("impression_summary")), value_style))
    story.append(Spacer(1, 6))

    # Recommendations
    story.append(Paragraph("RECOMMENDATIONS:", section_title))
    story.append(Paragraph(pretty(case.get("recommendations")), value_style))
    story.append(Spacer(1, 10))

    # Footer
    story.append(Paragraph("***** PRELIMINARY REPORT (NOT VERIFIED) *****", header_small))

    doc.build(story)
    return path

# Example
if __name__ == "__main__":
    with open("memory.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("cases"):
        c = data["cases"][-1]
        print("✅ Generated:", make_pdf_from_case(c))
