import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
import os
import json
import uuid
from typing import List, Optional

import sys
from pathlib import Path

# Fix Windows Console Encoding for Emojis
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent

# Add backend directory to sys.path to allow imports like 'lkl'
sys.path.append(str(BACKEND_DIR))

from fastapi import FastAPI, UploadFile, File, Body, HTTPException, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import shutil

from transcription import (
    process_full_medical_report,
    make_pdf_from_report,
    MEMORY_FILE,  # Keep temporarily for fallback
)

# =========================================
# LOGGING SETUP
# =========================================
LOG_FILE = str(BASE_DIR / "storage" / "logs" / "app.log")
# Issue #Cloud: Ensure log directory exists before initializing handler
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

logger = logging.getLogger("MedEchoBackend")
logger.setLevel(logging.INFO)

# Formatter
formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")

# File Handler (Rotating) - Explicit UTF-8
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3, encoding="utf-8")
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Console Handler - Explicit UTF-8 stream
# On Windows, we already reconfigured sys.stdout to utf-8 above
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

logger.info("🚀 Starting MedEcho Backend Service...")

# =========================================
# APP INIT
# =========================================
app = FastAPI(title="MedEcho Backend")

# ── Upload size guard ─────────────────────────────────────────────────────────
# Reject any request body larger than MAX_UPLOAD_BYTES before a handler runs.
# Audio recordings are typically 5–60 MB; 200 MB is a generous hard ceiling that
# prevents accidental or malicious gigabyte uploads from crashing the server.
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))  # 200 MB default


class ContentSizeLimitMiddleware:
    """ASGI middleware that returns HTTP 413 when Content-Length exceeds the limit."""
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            content_length = headers.get(b"content-length")
            if content_length and int(content_length) > self.max_bytes:
                mb = self.max_bytes // (1024 * 1024)
                body = f'{{"detail": "Upload too large. Maximum allowed size is {mb} MB."}}'.encode()
                await send({"type": "http.response.start", "status": 413,
                            "headers": [(b"content-type", b"application/json"),
                                        (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ContentSizeLimitMiddleware, max_bytes=MAX_UPLOAD_BYTES)

# ── Health check (Issue #8) ──────────────────────────────────────────────────
@app.get("/health")
def health_check():
    """Used by Electron startup overlay to confirm backend is ready."""
    return {"status": "ok", "version": "1.1.0"}

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"🔥 Unhandled Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "error": str(exc)},
    )

# API Base URL for generating download links
# Render provides RENDER_EXTERNAL_URL automatically
API_BASE = os.getenv("RENDER_EXTERNAL_URL", os.getenv("API_BASE_URL", "http://localhost:8001"))

UPLOAD_DIR = str(BASE_DIR / "storage" / "audio")
REPORTS_DIR = str(BASE_DIR / "storage" / "reports")  # PDFs

DATA_DIR = str(BASE_DIR / "storage" / "data")
PATIENTS_DIR = os.path.join(DATA_DIR, "patients")
PATIENTS_INDEX = os.path.join(DATA_DIR, "patients_index.json")
SESSIONS_FILE = os.path.join(DATA_DIR, "sessions.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
USAGE_LOG_FILE = os.path.join(DATA_DIR, "usage_log.json")
CHECKLIST_FILE = os.path.join(DATA_DIR, "checklist.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PATIENTS_DIR, exist_ok=True)


# =========================================
# HELPERS
# =========================================
def _ensure_json_file(path: str, default):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(default, f, indent=2, ensure_ascii=False)


def _read_json(path: str, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            txt = f.read().strip()
            if not txt:
                return default
            return json.loads(txt)
    except Exception as e:
        logger.error(f"Failed to read JSON {path}: {e}")
        return default


def _write_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True) if os.path.dirname(path) else None
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _log_usage_stats(stats: dict):
    if not stats: return
    logs = _read_json(USAGE_LOG_FILE, [])
    stats["timestamp"] = datetime.utcnow().isoformat()
    logs.append(stats)
    # limit logs size if needed? for now keep all
    _write_json(USAGE_LOG_FILE, logs)


# =========================================
# CONFIG ENDPOINTS
# =========================================
# NOTE: The authoritative GET /config and POST /config definitions are further
# below (search for ConfigModel). They are kept together with the Pydantic model
# to avoid the duplicate-route shadowing bug documented in Issue #9.
# The usage-stats endpoint is duplicated here for convenience.

# ── Internal helper ───────────────────────────────────────────────────────────
# Returns the merged, decrypted config for use by the AI pipeline only.
# This must NEVER be sent directly in an HTTP response — it contains live keys.
def _get_effective_config() -> dict:
    """Merge disk config with environment variables. ENV vars take priority."""
    config = _read_json(CONFIG_FILE, {})
    # Environment variables always win — they represent the operator's intent
    # and are never written to disk.
    env_openai = os.environ.get("OPENAI_API_KEY")
    env_google = os.environ.get("GOOGLE_API_KEY")
    if env_openai:
        config["openai_api_key"] = env_openai
    if env_google:
        config["google_api_key"] = env_google
    return config



def _get_patient(patient_id: str) -> dict:
    patient_path = os.path.join(PATIENTS_DIR, patient_id, "patient.json")
    if not os.path.exists(patient_path):
        logger.warning(f"Patient not found: {patient_id}")
        raise HTTPException(status_code=404, detail="Patient not found")
    return _read_json(patient_path, {})


def _session_id() -> str:
    # Issue #15: Unique session IDs
    return f"S{uuid.uuid4().hex[:8].upper()}"


def _add_session(session: dict):
    # Issue #16: Per-patient session storage
    pid = session.get("patient_id")
    if pid:
        patient_sessions_file = os.path.join(PATIENTS_DIR, pid, "sessions.json")
        p_sessions = _read_json(patient_sessions_file, [])
        p_sessions.append(session)
        _write_json(patient_sessions_file, p_sessions)

    # Maintain a lightweight global index for fast lookups (Issue #16)
    idx_file = os.path.join(DATA_DIR, "sessions_index.json")
    idx = _read_json(idx_file, [])
    idx.append({
        "session_id": session.get("session_id"),
        "report_id": session.get("report_id"),
        "intake_id": session.get("intake_id"),
        "patient_id": pid,
        "created_at": session.get("created_at")
    })
    _write_json(idx_file, idx[-200:]) # Keep only last 200 for index performance

    # LEGACY: Still append to global sessions.json for now to not break older readers
    # but we will migrate readers to use index + patient folder later.
    sessions = _read_json(SESSIONS_FILE, [])
    sessions.append(session)
    _write_json(SESSIONS_FILE, sessions)
    logger.info(f"Session added: {session.get('session_id')}")


def _find_session_by_report_id(report_id: str) -> Optional[dict]:
    # Issue #6: Phase 2 reports share intake link — search both fields
    sessions = _read_json(SESSIONS_FILE, [])
    for s in reversed(sessions):
        if s.get("report_id") == report_id or s.get("intake_id") == report_id:
            return s
    return None


# =========================================
# CREATE / UPDATE PATIENT
# =========================================
@app.post("/patients")
async def create_patient(data: dict = Body(...)):
    # validation simple
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="Name is required")

    # Issue #15: UUID-based Patient IDs (Respect manual ID if provided)
    manual_id = (data.get("id") or "").strip()
    if manual_id:
        pid = manual_id
    else:
        pid = f"P{uuid.uuid4().hex[:8].upper()}"
    
    data["id"] = pid
    data["created_at"] = datetime.utcnow().isoformat()

    # save individual file
    patient_dir = os.path.join(PATIENTS_DIR, pid)
    os.makedirs(patient_dir, exist_ok=True)
    _write_json(os.path.join(patient_dir, "patient.json"), data)

    # update index
    idx = _read_json(PATIENTS_INDEX, [])
    idx.insert(0, data)
    _write_json(PATIENTS_INDEX, idx)

    # ensure subfolders
    os.makedirs(os.path.join(patient_dir, "reports"), exist_ok=True)

    logger.info(f"New patient created: {data['name']} ({pid})")
    return {"patient": data}

# =========================================
# GET ALL PATIENTS
# =========================================
@app.get("/patients")
def get_patients():
    return _read_json(PATIENTS_INDEX, [])

@app.put("/patients/{patient_id}")
def update_patient(patient_id: str, data: dict = Body(...)):
    # 1. Update individual file
    patient_path = os.path.join(PATIENTS_DIR, patient_id, "patient.json")
    if not os.path.exists(patient_path):
        raise HTTPException(status_code=404, detail="Patient not found")
    
    current = _read_json(patient_path, {})
    current.update(data)
    _write_json(patient_path, current)
    
    # 2. Update Index
    idx = _read_json(PATIENTS_INDEX, [])
    # find and update
    for i, p in enumerate(idx):
        if p.get("id") == patient_id:
            idx[i].update(data)
            break
    _write_json(PATIENTS_INDEX, idx)
    
    logger.info(f"Patient updated: {patient_id}")

    # 3. Update Sessions (Propagate name change)
    if "name" in data:
        new_name = data["name"]
        sessions = _read_json(SESSIONS_FILE, [])
        updated_sessions = False
        for s in sessions:
            if str(s.get("patient_id")) == str(patient_id):
                s["patient_name"] = new_name
                updated_sessions = True
        
        if updated_sessions:
            _write_json(SESSIONS_FILE, sessions)
            logger.info(f"Propagated name change to sessions for {patient_id}")

    return {"status": "updated", "patient": current}

@app.delete("/patients/{patient_id}")
def delete_patient(patient_id: str):
    import shutil
    patient_dir = os.path.join(PATIENTS_DIR, patient_id)
    
    if not os.path.exists(patient_dir):
        raise HTTPException(status_code=404, detail="Patient not found")
        
    try:
        shutil.rmtree(patient_dir)
    except Exception as e:
        logger.error(f"Failed to delete patient dir: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete files: {e}")

    # Remove from index
    idx = _read_json(PATIENTS_INDEX, [])
    idx = [p for p in idx if p.get("id") != patient_id]
    _write_json(PATIENTS_INDEX, idx)
    
    logger.info(f"Patient deleted: {patient_id}")
    return {"status": "deleted"}


from glob import glob

@app.get("/patients/{patient_id}")
def get_patient_by_id(patient_id: str):
    # Returns patient file data/patients/{id}.json
    patient = _get_patient(patient_id)

    # Return a quick summary from sessions
    sessions = _read_json(SESSIONS_FILE, [])
    # Robust comparison string vs string
    patient_sessions = [s for s in sessions if str(s.get("patient_id")) == str(patient_id)]
    patient_sessions = list(reversed(patient_sessions))  # Newest first

    # Calculate Stage Statuses
    # Stage 1: Intake
    has_intake = any(s.get("phase") == "intake" and s.get("status") == "completed" for s in patient_sessions)
    stage1_status = "completed" if has_intake else "not_started"

    # Stage 2: Final Assessment
    # Locked if Stage 1 not completed
    if stage1_status != "completed":
        stage2_status = "locked"
    else:
        # Available, or Completed if we have a report
        has_final = any(s.get("phase") == "final_assessment" and s.get("status") == "completed" for s in patient_sessions)
        stage2_status = "completed" if has_final else "available"

    return {
        "patient": patient,
        "sessions": patient_sessions[:30],
        "stage1Status": stage1_status,
        "stage2Status": stage2_status,
    }


@app.post("/patients/{patient_id}/reopen-stage1")
def reopen_stage1(patient_id: str):
    logger.info(f"Reopening Stage 1 for patient {patient_id}")
    sessions = _read_json(SESSIONS_FILE, [])
    updated = False
    
    # "Archive" or "Invalidate" previous completed intake sessions
    for s in sessions:
        # Robust comparison
        if str(s.get("patient_id")) == str(patient_id) and s.get("phase") == "intake" and s.get("status") == "completed":
            s["status"] = "archived_for_edit"
            updated = True
            
    if updated:
        _write_json(SESSIONS_FILE, sessions)
        
    return {"status": "reopened", "stage1Status": "not_started", "stage2Status": "locked"}


def get_patient_reports(patient_id: str):
    # Ensure patient exists
    _ = _get_patient(patient_id)

    reports_dir = os.path.join(PATIENTS_DIR, patient_id, "reports")
    if not os.path.exists(reports_dir):
        return []

    files = sorted(glob(os.path.join(reports_dir, "*.json")), reverse=True)
    out = []
    for p in files:
        try:
            data = _read_json(p, {})
            out.append({
                "report_id": data.get("report_id"),
                "phase": data.get("phase"),
                "timestamp": data.get("timestamp"),
                "path": p,
            })
        except Exception:
            pass
    return out

# =========================================
# PHASE 1 — Intake (linked to patient_id)
# =========================================
@app.post("/phase1-transcribe")
async def phase1_transcribe(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
):
    logger.info(f"Starting Phase 1 transcribe for patient {patient_id}")
    # validate patient
    patient = _get_patient(patient_id)

    # ── Save audio temporarily ────────────────────────────────────────────────
    # The file is written to disk only long enough for transcription.
    # It is deleted immediately after a successful pipeline run (see below).
    filename = f"{patient_id}_{int(datetime.utcnow().timestamp())}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    # process
    logger.info(f"Processing audio file: {filepath}")
    
    # Load Config — merges disk settings with env-var keys (never exposes keys via HTTP)
    config = _get_effective_config()
    
    report = process_full_medical_report(
        filepath, 
        phase="intake", 
        config=config,
        patient_info=patient
    )
    
    if "error" in report:
        logger.error(f"Processing failed: {report['error']}")
        # Best-effort cleanup even on pipeline failure
        try:
            os.remove(filepath)
            logger.info(f"Audio file removed after failed processing: {filepath}")
        except Exception as del_err:
            logger.warning(f"Could not delete audio file after failure: {del_err}")
        raise HTTPException(status_code=500, detail=report["error"])

    # ── Delete PHI audio immediately after successful transcription ───────────
    # Audio recordings contain patient voices and are classified as PHI.
    # Retaining them beyond transcription is a HIPAA/GDPR risk and a disk
    # exhaustion hazard (10–60 MB per session).
    try:
        os.remove(filepath)
        logger.info(f"PHI audio file deleted after transcription: {filepath}")
    except Exception as del_err:
        # Log but do NOT abort — the report was already generated successfully.
        logger.warning(f"Audio file deletion failed (non-fatal): {del_err}")

    # Log Usage Stats
    if "_usage_stats" in report:
        _log_usage_stats(report.pop("_usage_stats"))

    # enrich report
    report_id = report.get("report_id") or report.get("reportId") or f"R{int(datetime.utcnow().timestamp())}"
    report["patient_id"] = patient_id
    report["patient_name"] = patient.get("name", report.get("patient_name", "Unknown"))
    report["phase"] = "intake"
    report["timestamp"] = datetime.utcnow().isoformat()

    # store report json under patient folder
    patient_reports_dir = os.path.join(PATIENTS_DIR, patient_id, "reports")
    os.makedirs(patient_reports_dir, exist_ok=True)
    report_json_path = os.path.join(patient_reports_dir, f"{report_id}_intake.json")
    _write_json(report_json_path, report)

    # create session entry
    # audio_path is None because the file has already been deleted.
    sid = _session_id()
    session = {
        "session_id": sid,
        "patient_id": patient_id,
        "patient_name": report["patient_name"],
        "phase": "intake",
        "report_id": report_id,
        "created_at": report["timestamp"],
        "audio_path": None,  # File deleted post-transcription — do not store a stale path
        "report_json_path": report_json_path,
        "pdf_path": None,
        "status": "completed",
    }
    _add_session(session)

    logger.info(f"Phase 1 complete. Session: {sid}")
    return JSONResponse({"session": session, "report": report})


# =========================================
# PHASE 2 — Final Assessment
# - you can pass patient_id directly
# - or pass intake_id (report_id) and we infer patient_id from sessions.json
# =========================================
@app.post("/phase2-transcribe")
async def phase2_transcribe(
    file: UploadFile = File(...),
    intake_id: Optional[str] = Form(None),
    patient_id: Optional[str] = Form(None),
):
    logger.info(f"Starting Phase 2 transcribe. IntakeID: {intake_id}, PatientID: {patient_id}")
    # infer patient_id from intake session if missing
    if not patient_id and intake_id:
        s = _find_session_by_report_id(intake_id)
        if s:
            patient_id = s.get("patient_id")

    if not patient_id:
        logger.error("Missing patient_id and intake_id")
        raise HTTPException(status_code=400, detail="patient_id is required (or provide intake_id)")

    # If we have patient_id but no intake_id, try to find the latest completed intake
    if patient_id and not intake_id:
        sessions = _read_json(SESSIONS_FILE, [])
        # Filter for this patient, intake phase, completed status
        patient_intakes = [
            s for s in sessions 
            if str(s.get("patient_id")) == str(patient_id) 
            and s.get("phase") == "intake" 
            and s.get("status") == "completed"
        ]
        # Sort by created_at descending (assuming ISO format strings sort correctly, or rely on order in file if appended)
        # specialized sort to be safe
        patient_intakes.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        
        if patient_intakes:
            intake_id = patient_intakes[0].get("report_id")
            logger.info(f"Auto-detected latest intake_id: {intake_id} for patient {patient_id}")
        else:
            logger.warning(f"No completed intake found for patient {patient_id}, Phase 2 will be standalone.")

    patient = _get_patient(patient_id)

    # ── Save audio temporarily ────────────────────────────────────────────────
    filename = f"{patient_id}_{int(datetime.utcnow().timestamp())}_{file.filename}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())

    # Load Config — merges disk settings with env-var keys (never exposes keys via HTTP)
    config = _get_effective_config()

    report = process_full_medical_report(
        filepath,
        phase="final_assessment",
        intake_case_id=intake_id,
        config=config,
        patient_info=patient
    )

    # Log Usage Stats
    if "_usage_stats" in report:
        _log_usage_stats(report.pop("_usage_stats"))

    if "error" in report:
        logger.error(f"Processing Phase 2 failed: {report['error']}")
        # Best-effort cleanup even on pipeline failure
        try:
            os.remove(filepath)
            logger.info(f"Audio file removed after failed processing: {filepath}")
        except Exception as del_err:
            logger.warning(f"Could not delete audio file after failure: {del_err}")
        raise HTTPException(status_code=500, detail=report["error"])

    # ── Delete PHI audio immediately after successful transcription ───────────
    try:
        os.remove(filepath)
        logger.info(f"PHI audio file deleted after transcription: {filepath}")
    except Exception as del_err:
        logger.warning(f"Audio file deletion failed (non-fatal): {del_err}")

    report_id = report.get("report_id") or report.get("reportId") or f"R{int(datetime.utcnow().timestamp())}"
    report["patient_id"] = patient_id
    report["patient_name"] = patient.get("name", report.get("patient_name", "Unknown"))
    report["phase"] = "final_assessment"
    report["timestamp"] = datetime.utcnow().isoformat()
    if intake_id:
        report["intake_id"] = intake_id

    patient_reports_dir = os.path.join(PATIENTS_DIR, patient_id, "reports")
    os.makedirs(patient_reports_dir, exist_ok=True)
    report_json_path = os.path.join(patient_reports_dir, f"{report_id}_final.json")
    _write_json(report_json_path, report)

    sid = _session_id()
    session = {
        "session_id": sid,
        "patient_id": patient_id,
        "patient_name": report["patient_name"],
        "phase": "final_assessment",
        "report_id": report_id,
        "intake_id": intake_id,
        "created_at": report["timestamp"],
        "audio_path": None,  # File deleted post-transcription — do not store a stale path
        "report_json_path": report_json_path,
        "pdf_path": None,
        "status": "completed",
    }
    _add_session(session)

    logger.info(f"Phase 2 complete. Session: {sid}")
    return JSONResponse({"session": session, "report": report})


# =========================================
# PHASE 1 CASE LIST
# (Changed to read from sessions.json instead of memory.json)
# =========================================
@app.get("/phase1-cases")
async def phase1_cases(patient_id: Optional[str] = None):
    sessions = _read_json(SESSIONS_FILE, [])
    
    if patient_id:
         sessions = [s for s in sessions if str(s.get("patient_id")) == str(patient_id)]

    intake_sessions = [s for s in sessions if s.get("phase") == "intake" and s.get("status") == "completed"]

    result = []
    for s in reversed(intake_sessions):
        result.append(
            {
                "case_id": s.get("report_id"),
                "patient": s.get("patient_name", "Unknown"),
                "phase": s.get("phase", "intake"),
                "patient_id": s.get("patient_id"),
            }
        )
    return result


# =========================================
# GENERATE FINAL PDF
# (After creating PDF, store its path in sessions.json for the latest report_id)
# =========================================
@app.post("/generate-pdf")
async def generate_pdf(report: dict = Body(...)):
    report_json = report.get("report_json")
    if not report_json:
        raise HTTPException(status_code=400, detail="report_json missing")

    rid = report_json.get("report_id") or report_json.get("reportId")
    logger.info(f"Generating PDF for report {rid}")

    try:
        pdf_path = make_pdf_from_report(report_json)
        filename = os.path.basename(pdf_path)

        # try to attach pdf_path to latest session with this report_id
        if rid:
            sessions = _read_json(SESSIONS_FILE, [])
            for i in range(len(sessions) - 1, -1, -1):
                if sessions[i].get("report_id") == rid:
                    sessions[i]["pdf_path"] = pdf_path
                    sessions[i]["status"] = "pdf_ready"
                    break
            _write_json(SESSIONS_FILE, sessions)

        logger.info(f"PDF Generated: {pdf_path}")
        return FileResponse(pdf_path, filename=filename, media_type="application/pdf")
    except Exception as e:
        logger.error(f"Failed to generate PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =========================================
# GET PATIENT SESSIONS (FIX)
# =========================================
@app.get("/patients/{patient_id}/sessions")
def get_patient_sessions(patient_id: str):
    logger.info(f"Fetching sessions for patient {patient_id}")
    sessions = _read_json(SESSIONS_FILE, [])
    # Robust string comparison
    patient_sessions = [s for s in sessions if str(s.get("patient_id")) == str(patient_id)]
    return JSONResponse(list(reversed(patient_sessions)))

# =========================================
# AI DIFFERENTIAL DIAGNOSIS (LOCAL MODEL)
# =========================================
@app.post("/patients/{patient_id}/ai-diagnosis")
async def generate_ai_diagnosis(patient_id: str):
    logger.info(f"Generating AI Diagnosis for patient {patient_id}")
    
    patient_dir = os.path.join(PATIENTS_DIR, patient_id)
    patient_file = os.path.join(patient_dir, "patient.json")
    if not os.path.exists(patient_file):
        raise HTTPException(status_code=404, detail="Patient not found")
        
    patient_data = _read_json(patient_file, {})
    
    reports_dir = os.path.join(patient_dir, "reports")
    all_reports = []
    if os.path.exists(reports_dir):
        for f in os.listdir(reports_dir):
            if f.endswith(".json"):
                 rpt = _read_json(os.path.join(reports_dir, f), {})
                 all_reports.append(rpt)
                 
    if not all_reports:
        return JSONResponse({"status": "no_reports", "diagnosis": []})
        
    # Compile history
    history_text = ""
    for r in all_reports:
        date_str = r.get("timestamp", "Unknown Date")
        history_text += f"\n--- Report on {date_str} ---\n"
        
        # Extract History
        history = r.get('clinical_history', '')
        if isinstance(history, list):
            history_text += "Clinical History:\n" + "\n".join([f"- {i}" for i in history]) + "\n"
        else:
            history_text += f"Clinical History: {history}\n"
            
        # Extract Findings
        findings = r.get('detailed_findings', '')
        if isinstance(findings, list):
            history_text += "Detailed Findings:\n"
            for item in findings:
                if isinstance(item, dict):
                    # Handle Phase 1 finding structure
                    category = item.get("category", "Finding")
                    obs = item.get("observation", "")
                    history_text += f"- {category}: {obs}\n"
                else:
                    history_text += f"- {item}\n"
        else:
            history_text += f"Detailed Findings: {findings}\n"
    
    # Get ollama config
    config = _read_json(CONFIG_FILE, {})
    ollama_url = config.get("ollama_url", "http://localhost:11434")
    ollama_model = config.get("ollama_model", "gemma3:1b")
    
    system_prompt = "You are an expert diagnostician. Based on the following patient reports, provide a differential diagnosis. Output ONLY a valid JSON array of objects, where each object has a 'condition' (string) and 'confidence' (string: High, Moderate, or Low). Do not include markdown formatting or any other text. Keep it brief."
    
    prompt = f"Patient Reports:\n{history_text}\n\nGenerate the JSON array now."
    
    try:
        import requests
        url = f"{ollama_url.rstrip('/')}/api/chat"
        payload = {
            "model": ollama_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            "format": "json"
        }
        resp = requests.post(url, json=payload, timeout=60)
        
        if resp.status_code == 200:
            import json
            data = resp.json()
            content = data.get("message", {}).get("content", "[]")
            try:
                diagnosis_list = json.loads(content)
                if isinstance(diagnosis_list, dict):
                    diagnosis_list = [diagnosis_list]
                patient_data["ai_diagnosis"] = diagnosis_list
                _write_json(patient_file, patient_data)
                return JSONResponse({"status": "success", "diagnosis": diagnosis_list})
            except json.JSONDecodeError:
                logger.error(f"Ollama returned invalid JSON: {content}")
                return JSONResponse(status_code=500, content={"error": "Invalid output from local model"})
        else:
            return JSONResponse(status_code=500, content={"error": f"Ollama error: {resp.text}"})
    except Exception as e:
        logger.error(f"Failed to generate AI diagnosis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# =========================================
# LIST REPORTS
# Now: from sessions.json (final + pdf_ready)
# with fallback to memory.json temporarily
# =========================================
@app.get("/list-reports")
def list_reports(patient_id: Optional[str] = None):
    sessions = _read_json(SESSIONS_FILE, [])
    
    if patient_id:
        sessions = [s for s in sessions if str(s.get("patient_id")) == str(patient_id)]

    report_list = []
    for s in reversed(sessions):
        # reports with PDF or final_assessment
        pdf_path = s.get("pdf_path")
        rid = s.get("report_id")
        phase = s.get("phase", "N/A")
        
        if not rid:
            continue

        pdf_name = f"{rid}_final.pdf"
        
        # 1. Has PDF (Ready)
        if pdf_path and os.path.exists(pdf_path):
            dl = f"{API_BASE}/reports/{os.path.basename(pdf_path)}"
            report_list.append({
                "reportId": rid,
                "patient": s.get("patient_name", "Unknown"),
                "patient_id": s.get("patient_id"),
                "phase": phase,
                "date": s.get("created_at", "N/A"),
                "downloadUrl": dl,
                "status": "ready"
            })
            continue

        # 2. Legacy PDF check
        legacy_pdf = os.path.join(REPORTS_DIR, pdf_name)
        if os.path.exists(legacy_pdf):
             report_list.append({
                "reportId": rid,
                "patient": s.get("patient_name", "Unknown"),
                "patient_id": s.get("patient_id"),
                "phase": phase,
                "date": s.get("created_at", "N/A"),
                "downloadUrl": f"{API_BASE}/reports/{pdf_name}",
                "status": "ready"
            })
             continue
        
        # 3. Final Assessment (Draft/Processing - No PDF yet)
        if phase == "final_assessment":
            report_list.append({
                "reportId": rid,
                "patient": s.get("patient_name", "Unknown"),
                "patient_id": s.get("patient_id"),
                "phase": phase,
                "date": s.get("created_at", "N/A"),
                "downloadUrl": None,
                "status": "draft" 
            })
            continue
            
        # 4. Intake (Completed) - Show as report source
        if phase == "intake" and s.get("status") == "completed":
             report_list.append({
                "reportId": rid,
                "patient": s.get("patient_name", "Unknown"),
                "patient_id": s.get("patient_id"),
                "phase": phase,
                "date": s.get("created_at", "N/A"),
                "downloadUrl": None, # Intakes usually don't have PDFs unless generated
                "status": "completed" 
            })

    # fallback: if no sessions (legacy)
    if not report_list and os.path.exists(MEMORY_FILE):
        memory_data = _read_json(MEMORY_FILE, {})
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
                        "downloadUrl": f"{API_BASE}/reports/{pdf_name}",
                    }
                )

    return JSONResponse(report_list)


# =========================================
# CONFIGURATION & USAGE STATS
# =========================================
_MASKED = "__MASKED__"  # Sentinel the frontend sends back when the key was already set


class ConfigModel(BaseModel):
    llm_provider: Optional[str] = "openai"
    llm_model: Optional[str] = "gpt-4o"
    transcription_provider: Optional[str] = "openai"
    mic_placement: Optional[str] = "dialogue"  # "doctor" or "dialogue"
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    max_tokens: Optional[int] = 4000
    temperature: Optional[float] = 0.0
    ollama_model: Optional[str] = "gemma3:1b"
    ollama_url: Optional[str] = "http://localhost:11434"
    openai_model: Optional[str] = "gpt-4o"
    gemini_model: Optional[str] = "gemini-1.5-pro"
    max_output_tokens: Optional[int] = 4000


@app.get("/config")
def get_config():
    """
    Returns non-sensitive configuration to the frontend.
    API keys are NEVER returned in plaintext — the frontend receives the
    sentinel '__MASKED__' if a key is configured, or '' if it is absent.
    This means the DevTools Network tab will never show a live key.
    """
    config = _read_json(CONFIG_FILE, {})

    # Determine whether each key is *set* (from disk OR env var)
    has_openai = bool(config.get("openai_api_key")) or bool(os.environ.get("OPENAI_API_KEY"))
    has_google = bool(config.get("google_api_key")) or bool(os.environ.get("GOOGLE_API_KEY"))

    # Strip actual key values — replace with sentinel or empty string
    config["openai_api_key"] = _MASKED if has_openai else ""
    config["google_api_key"] = _MASKED if has_google else ""

    logger.info("Config fetched by renderer (keys masked)")
    return JSONResponse(config)


@app.post("/config")
def save_config(config: ConfigModel):
    """
    Saves non-sensitive settings to config.json.
    If the client submits '__MASKED__' for a key field (meaning the user did
    not change it), that field is left untouched in the stored config.
    Keys sourced from environment variables are never written to disk.
    """
    current = _read_json(CONFIG_FILE, {})
    new_data = config.dict()

    # ── API key handling ─────────────────────────────────────────────────────
    for key_field in ("openai_api_key", "google_api_key"):
        submitted_value = new_data.get(key_field)
        if submitted_value == _MASKED or submitted_value is None:
            # User did not change the key — keep whatever is already on disk
            new_data.pop(key_field, None)
        elif submitted_value == "":
            # User explicitly cleared the key — remove from config
            current.pop(key_field, None)
            new_data.pop(key_field, None)
        # else: user submitted a new real key — it will be merged below

    current.update(new_data)
    _write_json(CONFIG_FILE, current)
    logger.info("Configuration saved (API keys handled securely)")

    # Return masked config — never echo raw keys back in the response
    current["openai_api_key"] = _MASKED if current.get("openai_api_key") else ""
    current["google_api_key"] = _MASKED if current.get("google_api_key") else ""
    return JSONResponse({"status": "saved", "config": current})


@app.get("/usage-stats")
def get_usage_stats():
    return JSONResponse(_read_json(USAGE_LOG_FILE, []))


# =========================================
# DOWNLOAD REPORT
# =========================================
@app.get("/reports/{filename}")
def download_report(filename: str):
    # Try reports/ first
    file_path = os.path.join(REPORTS_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf", filename=filename)

    # Or if filename came from pdf_path basename
    # (usually same folder)
    logger.warning(f"Report download failed: {filename}")
    raise HTTPException(status_code=404, detail="Report not found")


# =========================================
# GET FULL REPORT DETAILS (JSON)
# =========================================
@app.get("/reports/{report_id}/details")
def get_report_details(report_id: str):
    logger.info(f"🔍 Fetching full details for report: {report_id}")
    session = _find_session_by_report_id(report_id)
    
    # 1. Try to find JSON from session path
    json_path = None
    if session:
        json_path = session.get("report_json_path")
        if json_path and os.path.exists(json_path):
            logger.info(f"✅ Found data via session path: {json_path}")
            return JSONResponse(_read_json(json_path, {}))

    # 2. Fallback: Search in storage folders by ID
    logger.info(f"⚠️ Session path missing or invalid. Searching storage for {report_id}...")
    
    # Check all possible patterns in reports directory
    search_patterns = [
        os.path.join(REPORTS_DIR, f"{report_id}_final.json"),
        os.path.join(REPORTS_DIR, f"{report_id}_intake.json"),
        os.path.join(REPORTS_DIR, f"{report_id}.json"),
    ]
    
    # Also check patient-specific subfolders
    for patient_dir in glob(os.path.join(PATIENTS_DIR, "*")):
        p_reports = os.path.join(patient_dir, "reports")
        if os.path.exists(p_reports):
            search_patterns.append(os.path.join(p_reports, f"{report_id}_intake.json"))
            search_patterns.append(os.path.join(p_reports, f"{report_id}_final.json"))

    for path in search_patterns:
        if os.path.exists(path):
            logger.info(f"✨ Recovered data via fallback search: {path}")
            return JSONResponse(_read_json(path, {}))

    # 3. Fallback: Check Legacy Memory
    if os.path.exists(MEMORY_FILE):
        mem = _read_json(MEMORY_FILE, {})
        for r in mem.get("final_reports", []):
            if r.get("report_id") == report_id:
                logger.info(f"💾 Recovered data from legacy memory.json")
                return JSONResponse(r)

    logger.error(f"❌ Failed to find report data for {report_id}")
    raise HTTPException(status_code=404, detail=f"Clinical data for {report_id} not found on server")


# =========================================
# PATIENT DOCUMENTS (GENERIC UPLOADS)
# =========================================
@app.post("/patients/{patient_id}/documents")
async def upload_patient_document(patient_id: str, file: UploadFile = File(...)):
    # Verify patient
    _get_patient(patient_id)

    docs_dir = os.path.join(PATIENTS_DIR, patient_id, "documents")
    os.makedirs(docs_dir, exist_ok=True)

    # Sanitize filename (basic)
    filename = os.path.basename(file.filename)
    # prepend timestamp to avoid collisions
    safe_name = f"{int(datetime.utcnow().timestamp())}_{filename}"
    file_path = os.path.join(docs_dir, safe_name)

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        logger.error(f"Failed to save document: {e}")
        raise HTTPException(status_code=500, detail="Failed to save file")
    
    return {
        "status": "success",
        "document": {
            "name": filename,  # Original name for display? Or safe_name
            "filename": safe_name,
            "url": f"{API_BASE}/patients/{patient_id}/documents/{safe_name}",
            "type": file.content_type
        }
    }

@app.get("/patients/{patient_id}/documents")
def list_patient_documents(patient_id: str):
    _get_patient(patient_id)
    docs_dir = os.path.join(PATIENTS_DIR, patient_id, "documents")
    if not os.path.exists(docs_dir):
        return []
    
    files = sorted(glob(os.path.join(docs_dir, "*")), key=os.path.getmtime, reverse=True)
    out = []
    for f in files:
        fname = os.path.basename(f)
        # Try to parse original name if patterned timestamp_name
        display_name = fname
        parts = fname.split("_", 1)
        if len(parts) == 2 and parts[0].isdigit():
            display_name = parts[1]

        out.append({
            "name": display_name,
            "filename": fname,
            "path": f,
            "url": f"{API_BASE}/patients/{patient_id}/documents/{fname}",
            "created_at": datetime.fromtimestamp(os.path.getmtime(f)).isoformat()
        })
    return out

@app.get("/patients/{patient_id}/documents/{filename}")
def download_patient_document(patient_id: str, filename: str):
    docs_dir = os.path.join(PATIENTS_DIR, patient_id, "documents")
    file_path = os.path.join(docs_dir, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document not found")
        
    return FileResponse(file_path, filename=filename)


# =========================================
# SYSTEM CHECKLIST & NOTES
# =========================================
class ChecklistData(BaseModel):
    notes: str
    checklist: list = []

@app.get("/system/checklist")
def get_system_checklist():
    if os.path.exists(CHECKLIST_FILE):
        try:
            with open(CHECKLIST_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading checklist: {e}")
            return {"notes": "", "checklist": []}
    return {"notes": "", "checklist": []}

@app.post("/system/checklist")
def save_system_checklist(data: ChecklistData):
    try:
        with open(CHECKLIST_FILE, "w", encoding="utf-8") as f:
            json.dump(data.dict(), f, indent=2)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error saving checklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to save checklist")


# =========================================
# RUN SERVER
# =========================================
if __name__ == "__main__":
    import uvicorn
    # uvicorn handling is usually safe, but let's log startup
    logger.info("Initializing Uvicorn on network interfaces...")
    # Change host to 0.0.0.0 to allow mobile app connections (Issue #AndroidFix)
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
