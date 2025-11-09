import os
import traceback
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from transcription import process_audio_to_json
from json_to_pdf import make_pdf_from_case  # Converts JSON → PDF

# --- Initialize FastAPI App ---
app = FastAPI(title="Medical Voice-to-Report API", version="2.0")

# --- Enable CORS (required for frontend JS calls) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Directories ---
UPLOAD_DIR = "audio_files"
REPORTS_DIR = "reports"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)


# --- API Health Check ---
@app.get("/")
def root():
    return {"status": "ok", "message": "Backend API running successfully."}


# --- Generate Report Endpoint ---
@app.post("/generate-report")
async def generate_report(file: UploadFile = File(...)):
    """
    Receives an audio file, runs the full pipeline:
    1. Transcribe with Whisper
    2. Analyze with GPT
    3. Generate structured JSON
    4. Convert to PDF
    5. Return the final PDF to frontend
    """
    try:
        # --- Save the uploaded file ---
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        print(f"📥 Received file: {file.filename} ({os.path.getsize(file_path)} bytes)")

        # --- Run Processing Pipeline ---

        # FIX: Unpack the tuple returned by your function
        # We assume the dictionary is the first item (index 0)
        processing_result = process_audio_to_json(file_path)
        diagnostic_json = processing_result[0]  # <--- THIS IS THE FIX

        # This line (old line 54) will now work
        print(f"✅ JSON report generated for: {diagnostic_json.get('report_id', 'unknown')}")

        # --- Generate PDF Report ---
        pdf_filename = f"{diagnostic_json['report_id']}.pdf"
        pdf_path = os.path.join(REPORTS_DIR, pdf_filename)
        make_pdf_from_case(diagnostic_json, pdf_path)  # This uses the JSON
        print(f"📄 PDF saved at: {pdf_path}")

        # --- Return the PDF to frontend ---
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=pdf_filename,
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"❌ ERROR processing report: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# --- Optional: Get a list of generated reports ---
@app.get("/reports")
def list_reports():
    """Return a list of all generated PDF reports."""
    try:
        files = [
            f for f in os.listdir(REPORTS_DIR)
            if f.endswith(".pdf")
        ]
        return {"count": len(files), "reports": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# Make sure this is running on localhost to match script.js
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="localhost", port=8000)