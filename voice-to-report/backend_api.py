import os
import traceback
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transcription import process_audio_to_json
from json_to_pdf import make_pdf_from_case
from pathlib import Path  # Import Path for security

app = FastAPI(title="Medical Voice-to-Report API", version="3.0")

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


@app.get("/")
def root():
    return {"status": "ok", "message": "Backend API running successfully."}


# --- ENDPOINT 1: Audio to JSON ---
@app.post("/transcribe-audio")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Receives an audio file, runs the transcription/AI pipeline,
    and returns the structured JSON data.
    """
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        print(f"📥 Received file: {file.filename}")

        # --- Run Processing Pipeline ---
        # We assume this returns the JSON dictionary as the first item in a tuple
        processing_result = process_audio_to_json(file_path)
        diagnostic_json = processing_result[0]

        print(f"✅ JSON report generated for: {diagnostic_json.get('report_id', 'unknown')}")

        # --- Return the JSON to the frontend for editing ---
        return diagnostic_json

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"❌ ERROR transcribing audio: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# --- ENDPOINT 2: JSON to PDF ---
@app.post("/generate-pdf")
async def generate_pdf(report_data: dict = Body(...)):
    """
    Receives final, edited JSON data from the frontend,
    generates a PDF, and returns the file.
    """
    try:
        diagnostic_json = report_data

        report_id = diagnostic_json.get('report_id', 'unknown_report_id')
        if report_id == 'unknown_report_id':
            print(f"⚠️ WARNING: 'report_id' key not found in JSON. Using default filename.")

        pdf_filename = f"{report_id}.pdf"
        pdf_path = os.path.join(REPORTS_DIR, pdf_filename)

        print(f"ℹ️ Calling make_pdf_from_case with edited data to save at: {pdf_path}")
        make_pdf_from_case(diagnostic_json, pdf_path)

        if not os.path.exists(pdf_path):
            print(f"❌ CRITICAL ERROR: make_pdf_from_case() did NOT create the file at {pdf_path}")
            raise HTTPException(status_code=500, detail="Internal error: PDF generation failed to save the file.")

        print(f"📄 PDF successfully created at: {pdf_path}")

        # --- Return the final PDF to frontend ---
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=pdf_filename,
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"❌ ERROR generating PDF: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# --- ENDPOINT 3: List Reports (NEW - Re-added for History page) ---
@app.get("/reports")
def list_reports():
    """Return a list of all generated PDF reports from the reports directory."""
    try:
        files = [
            f for f in os.listdir(REPORTS_DIR)
            if f.endswith(".pdf") and os.path.isfile(os.path.join(REPORTS_DIR, f))
        ]
        files.sort(key=lambda x: os.path.getmtime(os.path.join(REPORTS_DIR, x)), reverse=True)
        return {"count": len(files), "reports": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# --- ENDPOINT 4: Download Report (NEW - Re-added for History page) ---
@app.get("/reports/{filename}")
def get_report(filename: str):
    """Securely downloads a specific report file."""
    try:
        # --- Security Check ---
        # Resolve paths to prevent directory traversal (e.g., "../../../etc/passwd")
        reports_dir_safe = Path(REPORTS_DIR).resolve()
        file_path = (reports_dir_safe / filename).resolve()

        # Check if the resolved file path is still inside the safe reports directory
        if not str(file_path).startswith(str(reports_dir_safe)):
            raise HTTPException(status_code=403, detail="Forbidden: Invalid file path.")

        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found.")

        return FileResponse(
            file_path,
            media_type="application/pdf",
            filename=filename
        )
    except Exception as e:
        print(f"❌ ERROR fetching report: {str(e)}")
        if not isinstance(e, HTTPException):
            raise HTTPException(status_code=500, detail=str(e))
        else:
            raise e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="localhost", port=8000)