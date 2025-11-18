import os
import json
from fastapi import FastAPI, UploadFile, File, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from transcription import (
    process_full_medical_report,
    make_pdf_from_report,
    MEMORY_FILE
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
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs("reports", exist_ok=True)


# =========================================
# PHASE 1 — Intake (doctor ↔ patient)
# =========================================
@app.post("/phase1-transcribe")
async def phase1_transcribe(file: UploadFile = File(...)):
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    report = process_full_medical_report(filepath, phase="intake")
    return JSONResponse(report)


# =========================================
# PHASE 2 — Final Assessment (doctor only)
# =========================================
@app.post("/phase2-transcribe")
async def phase2_transcribe(file: UploadFile = File(...)):
    filepath = os.path.join(UPLOAD_DIR, file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    report = process_full_medical_report(filepath, phase="final_assessment")
    return JSONResponse(report)


# =========================================
# PHASE 1 CASES TABLE
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
        result.append({
            "case_id": c.get("report_id"),
            "patient": c.get("patient_name", "Unknown"),
            "phase": c.get("phase", "intake")
        })

    return result


# =========================================
# GENERATE PDF
# =========================================
@app.post("/generate-pdf")
async def generate_pdf(report: dict = Body(...)):
    report_json = report.get("report_json")
    if not report_json:
        return JSONResponse({"error": "report_json missing"}, status_code=400)

    pdf_path = make_pdf_from_report(report_json)
    filename = os.path.basename(pdf_path)

    return FileResponse(
        pdf_path,
        filename=filename,
        media_type="application/pdf"
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
        reload=True
    )
