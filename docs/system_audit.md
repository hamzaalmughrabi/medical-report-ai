# 🏥 MedEcho — Full System Audit Report
**Auditor:** Senior Software Architect / UX Expert / QA Lead  
**Date:** 2026-04-08  
**Scope:** Full codebase — Electron frontend, FastAPI backend, AI pipeline, data layer, UX flows

---

## Executive Summary

MedEcho is a clinical AI assistant that records doctor dictation, transcribes audio via Whisper/Gemini, generates structured JSON medical reports using GPT/Gemini/Ollama, and produces PDFs. The architecture is Electron + FastAPI (local subprocess) with flat-file JSON storage.

**The app has a working skeleton, but has multiple Critical and High issues that would cause data loss, security exposure, or silent failures in real clinical usage.** These must be fixed before any patient-facing deployment.

---

## ISSUES

---

### Issue #1: `loadPage()` Called Twice on Startup — Double Initialization Bug (fixed)

- **Location:** `src/renderer/js/app.js`, lines 1235–1236
- **Problem:** `loadPage(page, q)` is called twice in succession on `DOMContentLoaded`.
- **Why it's wrong:** Every page init (API calls, event listener bindings, TinyMCE init) runs twice. This causes doubled network requests, duplicate event handlers stacking on each other (e.g., "Add Patient" button triggers twice per click after reload), and TinyMCE conflicts.
- **Expected behavior:** `loadPage()` called exactly once.
- **Recommended fix:** Remove the duplicate line 1236 immediately.
- **Severity:** 🔴 **Critical**

---

### Issue #2: PDF Generation Saves to Wrong, Non-Persistent Path (fixed)

- **Location:** `backend/app/json_to_pdf.py`, `make_pdf_from_report()`, line 101–106
- **Problem:** The `make_pdf_from_report()` wrapper function saves PDFs to a **relative** `"reports/"` path — which resolves to the process's current working directory, NOT the canonical `storage/reports/` directory. The `make_pdf_from_case()` function is called correctly from `transcription.py`, but `backend_api.py` imports and calls `make_pdf_from_report` from `transcription.py`, which internally calls the correct path. However, `json_to_pdf.py` also has its own `make_pdf_from_report()` with the broken relative path. If any code path hits that version, the PDF is written to an unknown location and the download URL returns 404.
- **Why it's wrong:** Clinical staff click "Download PDF," get a 404, and believe the report was lost. Data integrity failure.
- **Expected behavior:** All PDF generation must resolve to `BASE_DIR / storage / reports /`.
- **Recommended fix:** Delete `make_pdf_from_report()` from `json_to_pdf.py` entirely (it's a duplicate). Make `transcription.py`'s version the single source of truth using the absolute `storage/reports/` path.
- **Severity:** 🔴 **Critical**

---

### Issue #3: Audio Files Stored Permanently — No Cleanup, No Size Limits (fixed)

- **Location:** `backend/app/backend_api.py`, `/phase1-transcribe` and `/phase2-transcribe`
- **Problem:** Every audio recording is saved to `storage/audio/` and never deleted. There is no file size validation, no cleanup job, and no maximum upload size set on FastAPI.
- **Why it's wrong:** 
  1. Medical audio recordings are large (10–60MB each). After 100 sessions, this folder will contain gigabytes of data.
  2. No `max_upload_size` on FastAPI means a malicious or accidental 10GB file can be uploaded, crashing the server.
  3. HIPAA/GDPR: audio files containing patient voices are PHI and must be deleted after processing.
- **Expected behavior:** Audio files should be deleted after successful transcription. If retention is required, they must be encrypted and access-logged.
- **Recommended fix:** (1) Add `app.add_middleware(...)` with a max body size limit. (2) Delete audio file after successful `transcribe_audio()` call. (3) Add a configurable retention policy.
- **Severity:** 🔴 **Critical**

---

### Issue #4: API Keys Stored in Plaintext JSON — Security Vulnerability (fixed)  

- **Location:** `backend/app/backend_api.py`, `/config` POST endpoint; `storage/data/config.json`
- **Problem:** OpenAI and Google API keys are written directly to `config.json` in plaintext. The `/config` GET endpoint returns these keys to the frontend renderer process.
- **Why it's wrong:** 
  1. Anyone with filesystem access sees the keys.
  2. The Electron renderer (which loads web content) receives the raw key string — this is exposed in DevTools `Network` tab.
  3. On Render deployment, these keys would be committed to the filesystem alongside patient data.
- **Expected behavior:** API keys should be read from environment variables only, never stored in data files, never transmitted to the frontend.
- **Recommended fix:** Store keys in OS keychain (e.g., `keytar` for Electron) or environment variables. The frontend should only be able to test connectivity (ping), never retrieve the raw key. Mask the key value in GET responses.
- **Severity:** 🔴 **Critical**

---

### Issue #5: `global.sharedReportId` Race Condition in Phase 2 Navigation (fixed)

- **Location:** `src/main/main.js`, `registerAppHandlers()`, `ipcMain.on("open-phase2")` — and `window.selectedCaseIdForPhase2` in `app.js`
- **Problem:** The app uses TWO separate global state mechanisms for passing the intake case ID from Phase 1 to Phase 2:
  1. `global.sharedReportId` in the main process (set via IPC `open-phase2`)
  2. `window.selectedCaseIdForPhase2` in the renderer (set directly before `loadPage("phase2")`)
  The renderer path actually works but the main process IPC path is never consumed by `initPhase2Page()`, which only reads `window.selectedCaseIdForPhase2`. If the user navigates to Phase 2 via a different code path that uses IPC, `window.selectedCaseIdForPhase2` will be undefined, and Phase 2 shows "No intake case selected."
- **Expected behavior:** Single source of truth for the selected case ID.
- **Recommended fix:** Remove `global.sharedReportId` from the main process and the `open-phase2` IPC handler entirely. Use only `window.selectedCaseIdForPhase2` in the renderer, or better yet, pass it through `state.selectedCaseId`.
- **Severity:** 🔴 **Critical**

---

### Issue #6: `report_id` Collision — Phase 2 Overwrites Phase 1 Report Data

- **Location:** `backend/app/transcription.py`, line 737
- **Problem:** 
  ```python
  report_id = intake_case_id if phase == "final_assessment" and intake_case_id else _new_report_id()
  ```
  The final assessment report is assigned the **same `report_id`** as the intake report. When saved:
  ```
  {report_id}_final.json  → final assessment
  {report_id}_intake.json → intake
  ```
  The filenames differ, but `sessions.json` uses `report_id` as the lookup key. `_find_session_by_report_id()` returns the first match, which is always the intake session. The final assessment session is effectively orphaned from the lookup chain.
- **Why it's wrong:** The History page, report detail fetch, and PDF download all use `report_id` as the key. The final assessment report becomes unreachable via the normal API path.
- **Expected behavior:** Final assessment should have its own unique `report_id`, with a separate `intake_report_id` field tracking the link.
- **Recommended fix:** Always generate a new `report_id` for Phase 2. Store the intake link as `intake_report_id`. Update `_find_session_by_report_id` to search both fields.
- **Severity:** 🔴 **Critical**

---

### Issue #7: Patient Notes Stored in `localStorage` — Will Be Lost

- **Location:** `src/renderer/js/app.js`, lines 462–464, `initPatientProfilePage()`
- **Problem:** Patient notes are saved to and read from `localStorage` with key `notes_{pid}`. The backend has a full `/system/checklist` API and a `CHECKLIST_FILE` on disk, but patient-level notes bypass it entirely.
- **Why it's wrong:** 
  1. In Electron, `localStorage` is isolated per session path. If the app is reinstalled, moved, or the Electron cache is cleared, all notes vanish.
  2. Notes written offline are never synced to the backend.
  3. Medical notes are clinical data — they must be persisted to disk and backed up.
- **Expected behavior:** Patient notes should POST to `/patients/{id}` (update patient record) or a dedicated `/patients/{id}/notes` endpoint.
- **Recommended fix:** Add a `notes` field to the patient JSON file. Auto-save notes (debounced) to `PUT /patients/{pid}` with the notes field.
- **Severity:** 🔴 **Critical**

---

### Issue #8: No Error Handling if Backend Is Not Running

- **Location:** `src/renderer/js/api.js`, `src/renderer/js/app.js`
- **Problem:** The `API_URL` is hardcoded to `http://localhost:8001`. If the backend is not running, every API call silently fails with a network error, which is caught by `console.error` only. The user sees loading states that never resolve (e.g., patients table shows "Loading..." forever) or cryptic error messages.
- **Why it's wrong:** The backend (`run_backend.bat`) must be started separately. There is no auto-start logic in Electron's `main.js`, no backend health check, and no user-facing "Backend offline" warning screen.
- **Expected behavior:** On startup, `main.js` should spawn the backend as a child process using `spawn()`. The app should poll `/health` and show a connecting/error state until the backend responds.
- **Recommended fix:** (1) Add backend auto-start in `main.js` using `spawn('python', [...])`. (2) Add a `/health` endpoint to FastAPI. (3) Add a frontend connectivity check on load with a clear "Backend starting..." overlay.
- **Severity:** 🟠 **High**

---

### Issue #9: Duplicate `/config` Route — Last One Silently Wins

- **Location:** `backend/app/backend_api.py`, lines 145–162 (first definition) and lines 825–846 (second definition)
- **Problem:** The `GET /config` and `POST /config` endpoints are defined **twice**. FastAPI uses the last registered route. The second definitions (lines 825+) use a `ConfigModel` Pydantic schema, which is correct — but the first definitions use raw `dict = Body(...)` without validation. The first GET also returns hardcoded defaults that differ from the second GET (which reads env vars for API keys).
- **Why it's wrong:** Silent shadowing. If the order changes during refactoring, entirely different behavior takes effect with no error. The hardcoded defaults in the first GET (line 147–156) include `"openai_api_key": ""` — so the key _display_ path differs from the env-var-aware path in the second GET.
- **Expected behavior:** One route definition per endpoint.
- **Recommended fix:** Delete lines 145–162 entirely. Keep only the Pydantic-validated versions at lines 825+.
- **Severity:** 🟠 **High**

---

### Issue #10: `upload_recording()` — No Patient Selected Guard

- **Location:** `src/renderer/js/app.js`, `uploadRecording()`, line 831
- **Problem:** `fd.append("patient_id", state.selectedPatientId)` — if `state.selectedPatientId` is `null` (user somehow opens the recording modal without selecting a patient), the string `"null"` is sent to the backend.
- **Why it's wrong:** The backend's `phase1_transcribe` calls `_get_patient("null")`, which will 404. The user gets a confusing "Upload Failed: API Error 404" alert with no explanation. In the dashboard, the "Start New Session" button (`#dashboard-start-recording`) is present but has no `onclick` handler defined — it's dead UI.
- **Expected behavior:** Recording modal should only be openable when a patient is selected. Guard check before upload, with user-facing toast.
- **Recommended fix:** (1) In `openRecordingModal()`, check `if (!state.selectedPatientId) { ui.showToast("Select a patient first", "warning"); return; }`. (2) Wire up `#dashboard-start-recording` to `loadPage("patients")` in `initDashboardPage()`.
- **Severity:** 🟠 **High**

---

### Issue #11: Report Editor "Save Final PDF" Does Nothing

- **Location:** `src/renderer/index.html`, lines 759–774; `src/renderer/js/app.js`
- **Problem:** The "Save Final PDF" button in the Edit Report modal is inside a `<form id="edit-report-form">`. There is no `onsubmit` handler registered for this form anywhere in `app.js`. Clicking "Save Final PDF" causes a page reload (default form submit behavior) in a browser, or does nothing in Electron (since there's no navigation target).
- **Why it's wrong:** The primary CTA of the entire report review workflow is broken. Doctors review the AI-generated report, make edits, then click "Save Final PDF" — which does nothing. The `/generate-pdf` API endpoint exists but is never called from the frontend.
- **Expected behavior:** Clicking "Save Final PDF" should: (1) Get the edited HTML from TinyMCE, (2) POST it to `/generate-pdf` with the report JSON, (3) Trigger a download of the resulting PDF.
- **Recommended fix:** Add a form submit handler: get `tinymce.get("html-editor").getContent()`, reconstruct or pass the report JSON, call `api.generatePdf(reportJson)`, then trigger a file download from the response.
- **Severity:** 🟠 **High**

---

### Issue #12: `selectPatient()` Reading Wrong Properties from API Response

- **Location:** `src/renderer/js/app.js`, `selectPatient()`, lines 330–332
- **Problem:** 
  ```javascript
  const p = data.patient || data;
  const s1 = p.stage1Status || "not_started";
  const s2 = p.stage2Status || "locked";
  ```
  The backend `GET /patients/{id}` returns `{ patient: {...}, sessions: [...], stage1Status: "...", stage2Status: "..." }`. The stage statuses are at the **top level** of `data`, not inside `data.patient`. The code reads them from `p` (which is `data.patient`), where they don't exist — so both always fall back to the defaults `"not_started"` and `"locked"`.
- **Why it's wrong:** The Phase 2 sidebar nav item is always locked, regardless of whether the patient has a completed intake. Users cannot navigate to Phase 2 via the sidebar, only via the Phase 1 table workaround.
- **Expected behavior:** `s1 = data.stage1Status || "not_started"`.
- **Recommended fix:** Fix the property access:
  ```javascript
  const s1 = data.stage1Status || "not_started";
  const s2 = data.stage2Status || "locked";
  ```
- **Severity:** 🟠 **High**

---

### Issue #13: Patient Avatar Hardcoded to "HW" — Never Reflects Actual Patient

- **Location:** `src/renderer/pages/patient-profile.html`, line 25
- **Problem:** The avatar initials are hardcoded to `HW` in the HTML template. The JS `initPatientProfilePage()` never updates this element.
- **Why it's wrong:** Every patient profile shows the initials "HW." This is confusing and unprofessional in a clinical setting.
- **Expected behavior:** Avatar should show the first letter of the patient's name (e.g., `p.name.charAt(0).toUpperCase()`).
- **Recommended fix:** In `initPatientProfilePage()`, after fetching patient data: `const avatarEl = qs(".patient-avatar-initials"); if (avatarEl) avatarEl.textContent = (patient.name || "?").charAt(0).toUpperCase();` — and add the class to the avatar div.
- **Severity:** 🟡 **Medium**

---

### Issue #14: History Page Filters by `state.selectedPatientId` — Unexpected Behavior

- **Location:** `src/renderer/js/app.js`, `initHistoryPage()`, line 971
- **Problem:** `api.listReports(state.selectedPatientId)` — if a patient is currently selected, the History page silently shows only that patient's reports. The user navigates to "History" expecting to see all reports, but sees a filtered view with no indication that filtering is active.
- **Why it's wrong:** The page heading says "History" with no filter indicator. If the user selected a patient in the morning, comes back in the afternoon, navigates to History expecting a full log, and sees only one patient's data, they may miss critical events.
- **Expected behavior:** History should default to showing ALL reports (`null` patient ID) with an optional filter control.
- **Recommended fix:** Change to `api.listReports(null)` and add an optional patient filter dropdown.
- **Severity:** 🟡 **Medium**

---

### Issue #15: `CREATE /patients` Does Not Validate Patient ID Uniqueness

- **Location:** `backend/app/backend_api.py`, `create_patient()`, line 205
- **Problem:** The patient ID is auto-generated as `f"P{int(datetime.utcnow().timestamp())}"` — a Unix timestamp. If two patients are created within the same second (likely in a busy clinic), they get the same ID. The second patient overwrites the first in the filesystem, and both appear in `patients_index.json` with the same ID.
- **Why it's wrong:** Patient data mixing is a critical medical safety issue. Records from two different patients would be merged under one ID.
- **Expected behavior:** Patient IDs must be globally unique (UUID).
- **Recommended fix:** Use `import uuid; pid = f"P{uuid.uuid4().hex[:8]}"` or full UUID. Add a uniqueness check before writing.
- **Severity:** 🟡 **Medium**

---

### Issue #16: `sessions.json` Is an Append-Only Flat File — Scalability Cliff

- **Location:** `backend/app/backend_api.py`, `_add_session()`, and all session readers
- **Problem:** Every session is appended to a single `sessions.json` file. Every read operation (`get_patient_sessions`, `list_reports`, `phase1_cases`, `update_patient`) reads, parses, and filters this entire file. The file has no indexing.
- **Why it's wrong:** After 1,000 sessions, this file will be several MB. After 10,000 (a modest yearly load for a clinic), loading the Patients page triggers a full parse of a 50MB JSON file on every navigation.
- **Expected behavior:** Sessions should be stored per-patient (already partially done with `patient_reports_dir`) and the global `sessions.json` should be used only as a lightweight index.
- **Recommended fix:** Store sessions inside each patient's directory (`patients/{id}/sessions.json`). Maintain a lightweight global index with only IDs and timestamps for cross-patient queries.
- **Severity:** 🟡 **Medium**

---

### Issue #17: Token Cost Calculation Is Based on a Fixed Wrong Price

- **Location:** `src/renderer/js/app.js`, `updateAnalysisDashboard()`, line 1002
- **Problem:** 
  ```javascript
  const cost = (totalTokens / 1_000_000) * 5.0;
  ```
  This hardcodes $5.00 per million tokens, which is roughly GPT-4o's output price. The app supports multiple providers (GPT-4o-mini at $0.15/M, Gemini Flash at ~$0.075/M, Ollama at $0). All provider/model combinations use the same price.
- **Why it's wrong:** The cost display in the Configuration "Usage Stats" section will be wildly inaccurate when using cheaper models. Users may think Ollama is costing them $5/M tokens.
- **Recommended fix:** Store the model/provider with each usage log (already done). Build a price map per model and apply the correct rate.
- **Severity:** 🟡 **Medium**

---

### Issue #18: `CORS allow_origins=["*"]` with `allow_credentials=True` — Security Misconfiguration

- **Location:** `backend/app/backend_api.py`, lines 66–72
- **Problem:** 
  ```python
  allow_origins=["*"],
  allow_credentials=True,
  ```
  `allow_origins=["*"]` combined with `allow_credentials=True` is rejected by browsers per the CORS spec (and FastAPI/Starlette will actually raise a warning/error at runtime). More critically, even if accepted, it means any webpage navigated to within the Electron WebView can make authenticated requests to the local backend.
- **Why it's wrong:** If the Electron renderer navigates to any external URL (via a link in a report, for example), that page could make API calls to `localhost:8001` and exfiltrate patient data.
- **Recommended fix:** Set `allow_origins=["http://localhost", "app://.", "file://"]` to restrict to local Electron origin only.
- **Severity:** 🟡 **Medium**

---

### Issue #19: `preload.js` Exposes Only Notes API — Other IPC Calls Made Directly from Renderer

- **Location:** `src/main/preload.js`; `src/renderer/js/app.js`
- **Problem:** The preload correctly bridges the `notesAPI` via `contextBridge`. However, `run-python`, `open-phase1`, `open-phase2`, and `get-shared-id` IPC channels are used via `ipcRenderer.send/invoke` calls that would need to be whitelisted. The renderer uses `fetch()` for all backend API calls (not IPC), which works, but any future direct IPC use would fail because the preload doesn't expose `ipcRenderer` at all.
- **Why it's wrong:** The current architecture doesn't expose unneeded attack surface (good), but the `run-python` IPC channel in `main.js` that spawns arbitrary python scripts with passed arguments is dangerous if ever exposed to the renderer, as it would allow arbitrary code execution.
- **Recommended fix:** Document explicitly that `run-python` IPC must NEVER be exposed via `contextBridge`. Remove the `run-python` handler from `main.js` entirely if it's not actively used — it currently isn't called from anywhere in the new architecture.
- **Severity:** 🟡 **Medium**

---

### Issue #20: Audio Visualizer Is Fake — No Real Signal

- **Location:** `src/renderer/index.html`, lines 637–644
- **Problem:** The audio visualizer is 6 static CSS-animated divs with hardcoded bounce animations. It plays the same animation regardless of whether audio is actually being captured or if the microphone is silent.
- **Why it's wrong:** In a clinical setting, doctors need confidence that the microphone is actually capturing audio. A fake visualizer provides false reassurance. If the microphone permission is granted but the device is muted at the OS level, the doctor records 10 minutes of silence with no warning.
- **Expected behavior:** Real `AnalyserNode` from the Web Audio API, visualizing actual microphone amplitude.
- **Recommended fix:** In `startRecording()`, after getting the stream: create an `AudioContext`, connect the stream to an `AnalyserNode`, and use `requestAnimationFrame` to draw real amplitude bars.
- **Severity:** 🟡 **Medium**

---

### Issue #21: `run_backend.bat` Uses `venv` — But App Also Has `.venv`

- **Location:** `run_backend.bat`, line 3; root directory structure
- **Problem:** The project has BOTH a `venv/` and a `.venv/` directory. `run_backend.bat` activates `venv\Scripts\activate.bat` but the project's `.gitignore` and PyCharm configuration likely point to `.venv`. If different packages are installed in different envs, the backend may start but fail on import.
- **Why it's wrong:** Non-reproducible development environment. "Works on my machine" is a critical risk when another developer or deployment target activates the wrong venv.
- **Recommended fix:** Consolidate to a single virtual environment. Delete the unused one. Document clearly in README which venv to use.
- **Severity:** 🟡 **Medium**

---

### Issue #22: `patients.json` Still Exists in `backend/app/` — Legacy Data Hazard

- **Location:** `c:\...\backend\app\patients.json` (289 bytes)
- **Problem:** There is a `patients.json` in the old `backend/app/` directory. The new architecture stores patients in `storage/data/patients/`. If any old code path reads this stale file, it will serve phantom patients.
- **Why it's wrong:** Silent data confusion. The app may display old test patients from development.
- **Recommended fix:** Delete `backend/app/patients.json`. Move all legacy data files to `storage/` and update any remaining references.
- **Severity:** 🟡 **Medium**

---

### Issue #23: `memory.json` Grows Unboundedly — 120KB Already

- **Location:** `backend/app/memory.json` (120,962 bytes); `transcription.py`, `_save_memory()`
- **Problem:** `memory.json` is a legacy store that is still being written to on every report generation (`_save_memory()`). It now has 120KB of data. There is no size cap, rotation, or archiving.
- **Why it's wrong:** This file will grow indefinitely. At 1000 reports, it will be several MB and slow down every server start (it's read into the `memory` global at module load time).
- **Recommended fix:** Remove all writes to `memory.json` from `process_full_medical_report()`. It is already superseded by the patient-directory-based storage. Keep only the fallback read for legacy migration, and add a one-time migration script.
- **Severity:** 🟡 **Medium**

---

### Issue #24: Model List in UI Contains Hallucinated/Unverified Model Names

- **Location:** `src/renderer/js/app.js`, `populateModels()`, line 1099
- **Problem:** The OpenAI model list includes `"gpt-5.2-pro"`, `"gpt-5.2"`, `"gpt-5"`, `"gpt-5-mini"`, `"gpt-5-nano"`, `"gpt-oss-120b"`, `"gpt-oss-20b"` — none of which are real OpenAI model IDs as of 2026-04. Selecting these will cause the API call to fail with `model not found`.
- **Why it's wrong:** Users may select a model from the dropdown thinking it's available, configure their clinic around it, and then face silent failures during patient sessions.
- **Recommended fix:** Fetch available models dynamically from the OpenAI `/v1/models` endpoint, or constrain the list to verified model IDs. Mark unverified models clearly.
- **Severity:** 🟡 **Medium**

---

### Issue #25: `closeRecordingModal()` Does Not Release MediaStream If Recording Is Active

- **Location:** `src/renderer/js/app.js`, `closeRecordingModal()`, lines 851–854
- **Problem:**
  ```javascript
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  ```
  `mediaRecorder.stop()` is async — the `onstop` event fires after the function returns. The microphone indicator in the OS taskbar will keep showing as "in use" until the async callback fires, and the audio tracks may not be properly released. The `mediaRecorder.stream.getTracks().forEach(t => t.stop())` line that releases tracks is only inside `stopRecording()` → `onstop`, not in `closeRecordingModal()`.
- **Expected behavior:** Modal close should immediately invoke `stream.getTracks().forEach(t => t.stop())`.
- **Recommended fix:** Store the stream reference at module level. In `closeRecordingModal()`, explicitly call `currentStream?.getTracks().forEach(t => t.stop())`.
- **Severity:** 🟡 **Medium**

---

## 🔍 Missed Opportunities

1. **No patient search in History page.** The History table can have hundreds of rows but has no search/filter. The Patients page has search — History doesn't.

2. **Patient profile avatar never uses real initials.** A trivial `charAt(0)` was never added, leaving "HW" for all patients.

3. **No recording time limit or warning.** A doctor could record for 3 hours before the Whisper API rejects the file (max 25MB). No warning is shown when recording duration approaches limits.

4. **Dashboard "Start New Session" button is dead.** The hero CTA on the dashboard has `id="dashboard-start-recording"` with no event listener anywhere — completely non-functional.

5. **Dashboard "Smart Suggestions" widget always shows "Fetching insights…"** — it's never populated. The `dashboard-suggestions` and `dashboard-timeline` containers are never filled by JS.

6. **No pagination anywhere.** Patients, reports, and sessions are all rendered as unbounded lists. With 500+ patients, the DOM will be massive.

7. **No confirmation before `reopen-stage1`.** This action archives completed intake sessions. There is no warning that Phase 2 will be locked again.

8. **Notes in the sticky widget use a separate Electron IPC storage path** via `notesAPI` (the preload bridge), while patient notes use `localStorage`. These are two completely different storage mechanisms for what feels like the same feature.

9. **TinyMCE API key is public/hardcoded in index.html.** The key `bt5i6vumk847ktblo6p9tikafnn5krvisamy3rdmcr5kqvna` is exposed in the Git repo. TinyMCE community edition can be self-hosted.

10. **Phase 2 requires returning to Phase 1 table to start** — the patient profile hero action (`btn-continue`) opens the recording modal correctly, but pressing it from the Phase 2 page itself requires the case ID to already be in memory. If the user reloads after Phase 1, they cannot find the Phase 2 entry point without going through Phase 1 table again.

---

## ⚠️ Risk Analysis

| Risk | Likelihood | Impact | Trigger |
|------|-----------|--------|---------|
| Patient data mixing via timestamp-collision IDs | Medium | Critical | Two patients registered in the same second |
| `sessions.json` read timeouts after 10K sessions | High (100% at scale) | High | Normal production usage over months |
| PDF always saves to wrong path (relative `reports/`) | Medium | High | Code path hits `json_to_pdf.make_pdf_from_report` instead of transcription module's version |
| API keys leaked via DevTools or log file | High | Critical | Developer opens DevTools, or log file is shared |
| Audio disk exhaustion after a month of clinical use | High | High | 50 sessions/day × 20MB = 1GB/day |
| Recording modal "Save PDF" doing nothing | Certain (already broken) | High | User clicks the button |
| Backend not auto-started, app silently dead | Certain | High | User launches app without manually running bat file |
| LLM timeout at 300 seconds causing HTTP 504 | Medium | Medium | Slow Ollama model or large audio file |
| `loadPage` double-call causing doubled API requests | Certain | Medium | App startup every time |

---

## 💡 Pro-Level Suggestions

1. **Add a `/health` endpoint and backend auto-start in `main.js`.** Use `spawn()` to launch the Python backend as a child process. Show a "Backend starting…" screen with a spinner until `GET /health` returns 200. Kill the backend process when the Electron window closes.

2. **Replace flat JSON storage with SQLite.** The current file-per-patient + flat sessions.json architecture will not scale. SQLite is zero-config, embedded, and perfect for this use case. Use `aiosqlite` for async FastAPI integration.

3. **Implement end-to-end encryption for patient data at rest.** As a medical application, all patient JSON files and audio must be encrypted. Use `cryptography.fernet` with a machine-derived key.

4. **Add a real-time audio level meter** using the Web Audio API `AnalyserNode`. Display actual dB level and warn if signal is below threshold (mic muted).

5. **Implement audit logging.** Every patient record access, modification, and report generation should be logged with timestamp, action, and operator context. This is non-negotiable for HIPAA.

6. **Add report versioning.** Currently, editing a report in TinyMCE (once the save button is fixed) would overwrite the original. Store a version history so the original AI output is always recoverable.

7. **Keyboard accessibility.** The recording modal, patient drawers, and action buttons have no keyboard trap management (`focus-trap`). Screen readers cannot navigate the app. Important for clinical accessibility compliance.

8. **Bundle-size and offline capability.** The app loads Tailwind CSS from CDN, Google Fonts from CDN, Material Symbols from CDN, and TinyMCE from CDN. In a hospital with a restricted network, these requests will fail silently and the UI will be broken.

9. **Replace `alert()` calls with proper UI toasts.** There are 8+ `alert()` and `confirm()` calls throughout `app.js`. These freeze the Electron window and look unprofessional in a medical context.

10. **Add a test suite.** There are no tests. The `pytest.cache` directory exists but no test files. Given the medical context, at minimum: test the `process_full_medical_report` pipeline mock, test the patient CRUD API endpoints, and test the report ID generation for uniqueness.
