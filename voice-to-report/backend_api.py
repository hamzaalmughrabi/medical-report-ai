import json
import os
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from transcription import (
    process_full_medical_report,
    make_pdf_from_report,
    MEMORY_FILE,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "audio_files"
REPORTS_DIR = "reports"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)


# =========================================
# PHASE 1 — Intake
# =========================================
@app.post("/phase1-transcribe")
async def phase1_transcribe(file: UploadFile = File(...)):
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    report = process_full_medical_report(filepath, phase="intake")
    return JSONResponse(report)


# =========================================
# PHASE 2 — Final Assessment
# =========================================
@app.post("/phase2-transcribe")
async def phase2_transcribe(
    file: UploadFile = File(...),
    intake_id: str | None = None,
):
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    report = process_full_medical_report(
        filepath,
        phase="final_assessment",
        intake_case_id=intake_id,
    )
    return JSONResponse(report)


# =========================================
# PHASE 1 CASE LIST FOR PHASE 2 TABLE
# =========================================
@app.get("/phase1-cases")
async def phase1_cases():
    if not os.path.exists(MEMORY_FILE):
        return []

    with open(MEMORY_FILE, "r", encoding="utf-8") as f:
        memory = json.load(f)

    cases = memory.get("cases", [])
    result = []

    for c in cases:
        result.append(
            {
                "case_id": c.get("report_id"),
                "patient": c.get("patient_name", "Unknown"),
                "phase": c.get("phase", "intake"),
            }
        )

    return result


# =========================================
# GENERATE FINAL PDF
# =========================================
@app.post("/generate-pdf")
async def generate_pdf(report: dict = Body(...)):
    report_json = report.get("report_json")

    if not report_json:
        return JSONResponse({"error": "report_json missing"}, status_code=400)

    pdf_path = make_pdf_from_report(report_json)
    if not pdf_path or not os.path.exists(pdf_path):
        raise HTTPException(status_code=500, detail="Failed to generate PDF from report_json")

    filename = os.path.basename(pdf_path)

    return FileResponse(
        pdf_path,
        filename=filename,
        media_type="application/pdf",
    )


# =========================================
# HISTORY PAGE — LIST ALL PDF REPORTS
# =========================================
@app.get("/list-reports")
def list_reports():
    """
    Returns ALL final PDF reports with metadata from memory.json
    """
    try:
        report_list = []

        # 1) Load memory.json
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            memory_data = json.load(f)

        final_reports = memory_data.get("final_reports", [])

        for r in final_reports:
            report_id = r.get("report_id")
            pdf_name = f"{report_id}_final.pdf"
            pdf_path = os.path.join(REPORTS_DIR, pdf_name)

            if os.path.exists(pdf_path):
                report_list.append(
                    {
                        "reportId": report_id,
                        "patient": r.get("patient_name", "Unknown"),
                        "phase": r.get("phase", "N/A"),
                        "date": r.get("timestamp", "N/A"),
                        "downloadUrl": f"http://localhost:8001/reports/{pdf_name}",
                    }
                )

        return JSONResponse(report_list)

    except Exception as e:
        print("❌ ERROR listing reports:", e)
        raise HTTPException(status_code=500, detail="Failed to read report history.")


# =========================================
# DOWNLOAD REPORT
# =========================================
@app.get("/reports/{filename}")
def download_report(filename: str):
    file_path = os.path.join(REPORTS_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report not found")

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=filename,
    )


# =========================================
# RUN SERVER
# =========================================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend_api:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
