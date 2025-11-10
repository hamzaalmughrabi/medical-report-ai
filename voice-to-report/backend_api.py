import os
import traceback
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Import your custom modules
from transcription import process_audio_to_json  # (Audio -> JSON)
# NEW Imports for HTML/PDF
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

# --- Initialize FastAPI App ---
app = FastAPI(title="Medical Voice-to-Report API", version="3.0")

# --- Enable CORS (required for frontend JS calls) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (good for local Electron dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Directories ---
UPLOAD_DIR = "audio_files"
REPORTS_DIR = "reports"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

# --- Jinja2 Template Environment ---
template_env = Environment(loader=FileSystemLoader('.'))  # Looks for templates in the root dir
TEMPLATE_FILE = "template.html"


# --- Pydantic Models for Data Validation ---
class ReportData(BaseModel):
    # This model should match the structure of your JSON
    report_id: str
    patient_name: str
    age: str
    sex: str
    dob: str
    referring_doctor: str
    exam_date: str
    exam_type: str
    clinical_history: str
    detailed_findings: list | str
    impression_summary: str
    recommendations: list | str
    urgency_level: str
    timestamp: str
    source_file: str


class HtmlContent(BaseModel):
    html_content: str
    # Use Body(..., embed=True) if html_content is the *only* item
    # Or just send { "html_content": "..." } from JS


# --- API Health Check ---
@app.get("/")
def root():
    return {"status": "ok", "message": "Backend API v3.0 (HTML Workflow) running successfully."}


# --- WORKFLOW STEP 1: Audio -> JSON ---
@app.post("/transcribe-audio")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Receives an audio file, runs the AI pipeline, and returns the
    structured JSON data.
    """
    try:
        # --- Save the uploaded file ---
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        print(f"📥 Received file: {file.filename} ({os.path.getsize(file_path)} bytes)")

        # --- Run Processing Pipeline (Audio -> JSON) ---
        # We assume this function returns a dictionary
        processing_result = process_audio_to_json(file_path)

        diagnostic_json = {}
        # Check if it accidentally returned a tuple (common error)
        if isinstance(processing_result, tuple):
            # Assuming the dict is the first element
            diagnostic_json = processing_result[0]
        elif isinstance(processing_result, dict):
            diagnostic_json = processing_result
        else:
            raise ValueError(f"AI pipeline returned an unexpected type: {type(processing_result)}")

        print(f"✅ JSON report generated for: {diagnostic_json.get('report_id', 'unknown')}")

        # --- Return the JSON to the frontend ---
        return diagnostic_json

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"❌ ERROR in /transcribe-audio: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# --- WORKFLOW STEP 2: JSON -> HTML ---
@app.post("/convert-json-to-html")
async def convert_json_to_html(report_data: ReportData):
    """
    Receives JSON data and renders it into an HTML string using a Jinja2 template.
    """
    try:
        template = template_env.get_template(TEMPLATE_FILE)
        html_content = template.render(report_data.model_dump())
        print(f"✅ HTML draft generated for: {report_data.report_id}")
        return {"html_content": html_content}

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"❌ ERROR in /convert-json-to-html: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# --- WORKFLOW STEP 3: HTML -> PDF ---
@app.post("/convert-html-to-pdf")
async def convert_html_to_pdf(data: HtmlContent):
    """
    Receives the *final, edited* HTML string from the frontend,
    converts it to a PDF using WeasyPrint, and returns the PDF file.
    """
    try:
        html_content = data.html_content

        # Try to parse a report_id from the HTML for a unique filename
        # This is a bit basic, but useful
        report_id = "report"
        try:
            # Basic parsing to find the Report ID
            id_line = [line for line in html_content.split('\n') if "Report ID:" in line][0]
            report_id = id_line.split("Report ID:")[1].split('<')[0].strip()
            if not report_id:
                report_id = f"report_{hash(html_content)}"  # Fallback
        except Exception:
            report_id = f"report_{hash(html_content)}"  # Fallback

        pdf_filename = f"{report_id}_final.pdf".replace(" ", "_")
        pdf_path = os.path.join(REPORTS_DIR, pdf_filename)

        # Generate PDF from the HTML string
        HTML(string=html_content).write_pdf(pdf_path)

        print(f"📄 Final PDF saved at: {pdf_path}")

        # --- Return the PDF to frontend ---
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=pdf_filename,
        )

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"❌ ERROR in /convert-html-to-pdf: {str(e)}\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


# --- HISTORY PAGE ENDPOINT (GET /reports) ---
@app.get("/reports")
def list_reports():
    """Return a list of all generated PDF reports."""
    try:
        files = [
            f for f in os.listdir(REPORTS_DIR)
            if f.endswith(".pdf")
        ]
        # Sort by modification time (newest first)
        files.sort(key=lambda x: os.path.getmtime(os.path.join(REPORTS_DIR, x)), reverse=True)
        return {"count": len(files), "reports": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# --- HISTORY PAGE ENDPOINT (GET /reports/{filename}) ---
@app.get("/reports/{filename}")
def get_report(filename: str):
    """Returns a specific PDF report for download."""
    try:
        file_path = os.path.join(REPORTS_DIR, filename)

        # Security check: ensure file is in the REPORTS_DIR
        if not os.path.normpath(file_path).startswith(os.path.normpath(REPORTS_DIR)):
            raise HTTPException(status_code=403, detail="Access denied")

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            file_path,
            media_type="application/pdf",
            filename=filename,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Run the server ---
if __name__ == "__main__":
    print("--- Starting MedReport AI Backend v3.0 (HTML Workflow) ---")
    uvicorn.run("backend_api:app", host="localhost", port=8001, reload=True)