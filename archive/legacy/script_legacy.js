// ---------------------------------------------------------
// GLOBAL CONFIG
// ---------------------------------------------------------
const API_URL = "http://localhost:8001";

const contentArea = document.getElementById("dynamic-content");
const dashboardSection = document.getElementById("content-dashboard");
const navItems = document.querySelectorAll(".nav-item");
const tabItems = document.querySelectorAll(".tab-item");
const allNavElements = [...navItems, ...tabItems];

// Recording state
let mediaRecorder = null;
let recordingStream = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

// "intake" | "final_assessment"
let currentRecordingPhase = "intake";
let currentRecordingOutputId = null;

// Last JSON report returned from backend (used in editor/PDF)
let lastReportJson = null;

// TinyMCE state
let tinyEditorInitialized = false;

// Selected case for Phase 2
let selectedCaseIdForPhase2 = null;
let selectedPatientId = null;     // patient profile page context
let selectedIntakeIdForFinal = null; // لاختيار intake قبل phase2


// ---------------------------------------------------------
// UTILS
// ---------------------------------------------------------
function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
// ---------------------------------------------------------
// WORKFLOW / STATE MANAGEMENT
// ---------------------------------------------------------
function updateSidebarState() {
  const allNavs = document.querySelectorAll(".nav-item");

  if (!selectedPatientId) {
    // No active patient: Lock everything except Dashboard, Patients & Configuration
    allNavs.forEach(el => {
      const p = el.dataset.page;
      // Allow dashboard, patients, and configuration
      if (["history", "phase1", "phase2", "patient-profile"].includes(p)) {
        el.classList.add("locked");
        // Remove existing badges if any
        const badge = el.querySelector(".status-badge");
        if (badge) badge.remove();
      } else {
        el.classList.remove("locked");
      }
    });
    return;
  }

  // Patient Active: Apply Backend States
  allNavs.forEach(el => {
    const p = el.dataset.page;

    // History: Always unlocked if patient selected
    if (p === "history") {
      el.classList.remove("locked");
    }

    // Stage 1 (Intake)
    if (p === "phase1") {
      el.classList.remove("locked");
      updateBadge(el, currentStage1Status);
    }

    // Stage 2 (Assessment)
    if (p === "phase2") {
      if (currentStage2Status === "locked") {
        el.classList.add("locked");
        // Remove badge if locked
        const badge = el.querySelector(".status-badge");
        if (badge) badge.remove();
      } else {
        el.classList.remove("locked");
        updateBadge(el, currentStage2Status);
      }
    }
  });
}

// Helper to render status badges
function updateBadge(navItem, status) {
  let badge = navItem.querySelector(".status-badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "status-badge ml-auto text-xs px-2 py-0.5 rounded-full font-medium hidden md:inline-block";
    navItem.appendChild(badge);
  }

  if (status === "completed") {
    badge.textContent = "Done";
    badge.className = "status-badge ml-auto text-xs px-2 py-0.5 rounded-full font-medium hidden md:inline-block bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  } else if (status === "not_started" || status === "available") {
    // Option: Show nothing, or "Todo"
    badge.remove();
  } else {
    badge.remove();
  }
}

// State Variables for Stages - Default to safest state
let currentStage1Status = "not_started";
let currentStage2Status = "locked";

async function checkStage1Completion(patientId) {
  try {
    const res = await fetch(`${API_URL}/list-reports`);
    if (!res.ok) return false;
    const reports = await res.json();
    // Check for any report for this patient that is from phase1
    // Note: Backend might return 'patient' name, not ID. We need to be careful.
    // Assuming list-reports returns basic info.
    return reports.some(r => (r.patient_id === patientId || r.patient === patientId) && (r.phase === "phase1" || r.phase === "intake"));
  } catch (e) { return false; }
}



async function selectPatient(id, loadProfile = true) {
  selectedPatientId = id;
  localStorage.setItem("active_patient_id", id);
  console.log("Patient Selected:", id);

  try {
    // 1. Fetch Patient State from Backend
    const res = await fetch(`${API_URL}/patients/${id}`);
    if (res.ok) {
      const data = await res.json();
      currentStage1Status = data.stage1Status || "not_started";
      currentStage2Status = data.stage2Status || "locked";
    } else {
      console.warn("Failed to fetch strict state, falling back to locked.");
      currentStage1Status = "not_started";
      currentStage2Status = "locked";
    }
  } catch (e) {
    console.error("State Fetch Error:", e);
    // Fallback
    currentStage1Status = "not_started";
    currentStage2Status = "locked";
  }

  // 2. Update UI
  updateSidebarState();

  if (loadProfile) {
    loadPage("patient-profile", `id=${id}`);
  }
}

async function confirmReopenStage1(patientId) {
  if (!confirm("⚠️ Re-opening Stage 1 (Intake) will RESET Stage 2 progress.\n\nAre you sure you want to revert to Draft mode?")) {
    return;
  }

  try {
    const res = await fetch(`${API_URL}/patients/${patientId}/reopen-stage1`, { method: "POST" });
    if (res.ok) {
      // Refresh State
      await selectPatient(patientId);
      alert("Stage 1 re-opened. Stage 2 is now locked.");
    } else {
      alert("Failed to re-open stage.");
    }
  } catch (e) { console.error(e); alert("Error connecting to server."); }
}

function clearPatientContext() {
  selectedPatientId = null;
  localStorage.removeItem("active_patient_id");
  currentStage1Status = "not_started";
  currentStage2Status = "locked";
  console.log("Patient Context Cleared");
  updateSidebarState();
}

// ---------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------
function initDashboardPage_Legacy() {
  const newSessionBtn = document.getElementById("dashboard-new-session");
  const openHistoryBtn = document.getElementById("dash-open-history");
  const searchEl = document.getElementById("dashboard-search");
  const activityBody = document.getElementById("dash-activity-body");

  // Navigation helpers موجودة عندك: loadPage + setActiveLink
  const go = (pageId) => {
    loadPage(pageId);
    setActiveLink(pageId);
  };

  newSessionBtn?.addEventListener("click", () => {
    // أفضل UX: يوديه على Patients يختار/يضيف مريض ثم يبدأ تسجيل
    go("patients");
  });

  openHistoryBtn?.addEventListener("click", () => go("history"));

  // Search (مبدئياً: إذا كتب Report ID -> history, إذا اسم -> patients)
  searchEl?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = (searchEl.value || "").trim();
    if (!q) return;

    // heuristic بسيطة
    const looksLikeReport = /report|R\d+|_final/i.test(q);
    if (looksLikeReport) go("history");
    else go("patients");
  });

  // Populate cards + recent activity من API المتوفر عندك حالياً
  // - /list-reports موجود
  // - sessions لسا ما عندكم، فبنستعمل reports كـactivity مؤقتاً
  async function loadDashboardData() {
    try {
      const res = await fetch(`${API_URL}/list-reports`);
      const reports = await res.json();

      // Cards (Corrected)
      document.getElementById("dash-recent-reports").textContent = reports?.length ?? 0;
      document.getElementById("dash-pending-review").textContent = 0; // Placeholder

      // Calculate Today's Sessions
      const now = new Date();
      // Safe check for date
      const todayCount = (reports || []).filter(r => {
        if (!r.date || r.date === "N/A") return false;
        const d = new Date(r.date);
        return d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear();
      }).length;
      document.getElementById("dash-today-sessions").textContent = todayCount;

      // Recent Activity (آخر 5)
      const last5 = (reports || []).slice(-5).reverse();
      if (!last5.length) {
        activityBody.innerHTML = `
          <tr>
            <td class="px-6 py-6 text-sm text-slate-500 dark:text-slate-400" colspan="4">
              No activity yet.
            </td>
          </tr>`;
        return;
      }

      activityBody.innerHTML = last5.map(r => {
        const t = r.date ? new Date(r.date).toLocaleString() : "—";
        const patient = r.patient || "Unknown";
        const status = r.phase || "—";
        const reportId = r.reportId || "—";

        return `
          <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20">
            <td class="px-6 py-4">
              <div class="font-semibold text-slate-900 dark:text-white">${patient}</div>
              <div class="text-xs text-slate-500">${reportId}</div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">${t}</td>
            <td class="px-6 py-4">
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                ${status}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <button class="text-primary font-semibold hover:underline" data-action="continue" data-report="${reportId}">
                Continue
              </button>
            </td>
          </tr>
        `;
      }).join("");

      // Continue buttons (مبدئياً توديه history)
      activityBody.querySelectorAll("button[data-action='continue']").forEach(btn => {
        btn.addEventListener("click", () => go("history"));
      });

    } catch (e) {
      console.error("Dashboard load error:", e);
      if (activityBody) {
        activityBody.innerHTML = `
          <tr>
            <td class="px-6 py-6 text-sm text-rose-600" colspan="4">
              Failed to load dashboard data.
            </td>
          </tr>`;
      }
    }
  }

  loadDashboardData();
}

// ---------------------------------------------------------
// RECORDING MODAL UI
// ---------------------------------------------------------
// ---------------------------------------------------------
// RECORDING MODAL UI & LOGIC ("Pro" Enhanced)
// ---------------------------------------------------------
let finalAudioBlob = null;
let recordingState = "IDLE"; // IDLE, RECORDING, PAUSED, REVIEW, UPLOADING

function setRecordingUI(state) {
  recordingState = state;
  const els = {
    startBtn: document.getElementById("start-record-btn"),
    activeControls: document.getElementById("active-controls"),
    pauseBtn: document.getElementById("pause-record-btn"),
    resumeBtn: document.getElementById("resume-record-btn"),
    stopBtn: document.getElementById("stop-record-btn"),
    previewContainer: document.getElementById("audio-preview-container"),
    progressContainer: document.getElementById("upload-progress-container"),
    timer: document.getElementById("recording-timer"),
    status: document.getElementById("recording-status"),
    visualizer: document.getElementById("audio-visualizer"),
    pulse: document.getElementById("recording-pulse"),
    pausedOverlay: document.getElementById("paused-overlay"),
    micWrapper: document.getElementById("mic-icon-wrapper")
  };

  // Reset defaults
  els.startBtn.classList.add("hidden");
  els.activeControls.classList.add("hidden");
  els.previewContainer.classList.add("hidden");
  els.progressContainer.classList.add("hidden");
  els.timer.classList.add("hidden");
  els.visualizer.classList.add("hidden");
  els.pulse.classList.add("hidden");
  els.pausedOverlay.classList.add("hidden");
  els.micWrapper.classList.remove("scale-110", "border-4", "border-red-500");

  switch (state) {
    case "IDLE":
      els.startBtn.classList.remove("hidden");
      els.status.textContent = "Ready to begin";
      els.status.className = "text-slate-600 dark:text-slate-400 font-medium";
      els.timer.textContent = "00:00";
      break;

    case "RECORDING":
      els.activeControls.classList.remove("hidden");
      els.pauseBtn.classList.remove("hidden");
      els.resumeBtn.classList.add("hidden");
      els.timer.classList.remove("hidden");
      els.visualizer.classList.remove("hidden");
      els.pulse.classList.remove("hidden");
      els.status.textContent = "Recording in progress...";
      els.status.className = "text-red-600 font-bold animate-pulse";
      els.micWrapper.classList.add("scale-110", "border-4", "border-red-500");
      break;

    case "PAUSED":
      els.activeControls.classList.remove("hidden");
      els.pauseBtn.classList.add("hidden");
      els.resumeBtn.classList.remove("hidden");
      els.timer.classList.remove("hidden");
      els.pausedOverlay.classList.remove("hidden");
      els.status.textContent = "Session Paused";
      els.status.className = "text-amber-600 font-bold";
      break;

    case "REVIEW":
      els.previewContainer.classList.remove("hidden");
      els.status.textContent = "Review Audio";
      els.status.className = "text-slate-900 dark:text-white font-bold";
      break;

    case "UPLOADING":
      els.progressContainer.classList.remove("hidden");
      els.status.textContent = "Processing Report...";
      els.status.className = "text-primary font-bold";
      break;
  }
}

function resetRecordingUI() {
  setRecordingUI("IDLE");
  finalAudioBlob = null;
  recordingSeconds = 0;
  recordedChunks = [];
  if (recordingTimer) clearInterval(recordingTimer);
  recordingTimer = null;
}

function openRecordingModal(phase = "intake", outputId = null) {
  currentRecordingPhase = phase;
  currentRecordingOutputId = outputId;
  const modal = document.getElementById("recording-modal");
  if (!modal) return;

  resetRecordingUI();
  modal.classList.remove("hidden");

  // Attach Listeners (Once)
  document.getElementById("start-record-btn").onclick = startRecording;
  document.getElementById("pause-record-btn").onclick = pauseRecording;
  document.getElementById("resume-record-btn").onclick = resumeRecording;
  document.getElementById("stop-record-btn").onclick = stopRecording;
  document.getElementById("retake-btn").onclick = resetRecordingUI;
  document.getElementById("upload-btn").onclick = confirmUpload;
  document.getElementById("close-recording-modal").onclick = closeRecordingModal;
}

function closeRecordingModal() {
  const modal = document.getElementById("recording-modal");
  if (modal) modal.classList.add("hidden");

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (recordingStream) {
    recordingStream.getTracks().forEach(t => t.stop());
  }
}

// ---------------------------------------------------------
// RECORDING LOGIC
// ---------------------------------------------------------

async function startRecording() {
  if (!selectedPatientId && !localStorage.getItem("active_patient_id")) {
    alert("Please select a patient first.");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recordingStream);
    recordedChunks = [];
    recordingSeconds = 0;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.start();
    setRecordingUI("RECORDING");

    // Timer Logic
    recordingTimer = setInterval(() => {
      if (recordingState === "RECORDING") {
        recordingSeconds++;
        document.getElementById("recording-timer").textContent = formatTime(recordingSeconds);
      }
    }, 1000);

  } catch (err) {
    console.error("Mic Error:", err);
    alert("Microphone access denied or error occurred.");
  }
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    setRecordingUI("PAUSED");
  }
}

function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    setRecordingUI("RECORDING");
  }
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    mediaRecorder.onstop = () => {
      finalAudioBlob = new Blob(recordedChunks, { type: "audio/webm" });

      // Setup Preview
      const audioUrl = URL.createObjectURL(finalAudioBlob);
      const player = document.getElementById("audio-preview-player");
      player.src = audioUrl;
      document.getElementById("audio-duration-display").textContent = formatTime(recordingSeconds);

      // Stop Stream
      recordingStream.getTracks().forEach(t => t.stop());

      if (recordingTimer) clearInterval(recordingTimer);

      setRecordingUI("REVIEW");
    };
  }
}

// ---------------------------------------------------------
// UPLOAD LOGIC (With Progress)
// ---------------------------------------------------------
async function confirmUpload() {
  if (!finalAudioBlob) return;

  setRecordingUI("UPLOADING");
  const outputEl = currentRecordingOutputId ? document.getElementById(currentRecordingOutputId) : null;
  const patientId = selectedPatientId || localStorage.getItem("active_patient_id");

  // Simulate Progress Bar
  const progressBar = document.getElementById("progress-bar-fill");
  const progressText = document.getElementById("progress-percent");
  const stepText = document.getElementById("progress-step-text");

  let p = 0;
  const fakeProgress = setInterval(() => {
    if (p < 90) {
      p += Math.floor(Math.random() * 5) + 1;
      progressBar.style.width = `${p}%`;
      progressText.textContent = `${p}%`;

      if (p > 30) stepText.textContent = "Transcribing Audio...";
      if (p > 60) stepText.textContent = "Analyzing Medical Context...";
      if (p > 80) stepText.textContent = "Drafting Final Report...";
    }
  }, 200);

  // Real Upload
  const fd = new FormData();
  fd.append("file", finalAudioBlob, `recording_${Date.now()}.webm`);
  fd.append("patient_id", patientId);

  if (currentRecordingPhase === "final_assessment" && window.selectedCaseIdForPhase2) {
    fd.append("intake_id", window.selectedCaseIdForPhase2);
  }

  const endpoint = currentRecordingPhase === "final_assessment"
    ? `${API_URL}/phase2-transcribe`
    : `${API_URL}/phase1-transcribe`;

  try {
    const res = await fetch(endpoint, { method: "POST", body: fd });
    clearInterval(fakeProgress);

    // 100%
    progressBar.style.width = "100%";
    progressText.textContent = "100%";
    stepText.textContent = "Complete!";

    if (!res.ok) throw new Error(await res.text());

    const json = await res.json();
    const reportJson = json.report ?? json;
    lastReportJson = reportJson;

    // Output to hidden div if needed
    if (outputEl) {
      outputEl.innerHTML = `<span class="text-green-500">Upload Success</span>`;
    }

    // Auto-checklist logic
    if (window.checklistAPI && window.checklistAPI.autoComplete) {
      await window.checklistAPI.autoComplete().catch(console.error);
    }

    setTimeout(() => {
      closeRecordingModal();
      selectPatient(patientId, false);
      openEditorWithJson(reportJson);
    }, 800);

  } catch (err) {
    clearInterval(fakeProgress);
    console.error(err);
    stepText.textContent = "Error Failed";
    stepText.className = "text-red-500";
    alert(`Upload Failed: ${err.message}`);
    setRecordingUI("REVIEW"); // Let them try again
  }
}

// ---------------------------------------------------------
// TINYMCE EDITOR
// ---------------------------------------------------------
function buildHtmlFromJson(report) {
  if (!report || typeof report !== "object") {
    return "<p>No report data.</p>";
  }

  const safe = (k, fallback = "") => (report && report[k]) || fallback;

  let findingsHtml = "";
  if (Array.isArray(report.detailed_findings) && report.detailed_findings.length > 0) {
    findingsHtml = `
            <h2>Findings</h2>
            <ul>
                ${report.detailed_findings.map(f => `
                    <li><strong>${f.finding || ""}</strong>: ${f.explanation || ""}</li>
                `).join("")}
            </ul>
        `;
  }

  let recHtml = "";
  if (Array.isArray(report.recommendations) && report.recommendations.length > 0) {
    recHtml = `
            <h2>Recommendations</h2>
            <ul>
                ${report.recommendations.map(r => `<li>${r}</li>`).join("")}
            </ul>
        `;
  }

  return `
        <h1>Medical Report (${(safe("phase", "") || "").toUpperCase()})</h1>
        <p><strong>Patient:</strong> ${safe("patient_name", "N/A")}</p>
        <p><strong>Age:</strong> ${safe("age", "N/A")} | <strong>Sex:</strong> ${safe("sex", "N/A")}</p>
        <p><strong>Exam Type:</strong> ${safe("exam_type", "N/A")}</p>
        <p><strong>Exam Date:</strong> ${safe("exam_date", "N/A")}</p>

        <h2>Clinical History</h2>
        <p>${(safe("clinical_history", "") || "").replace(/\n/g, "<br>")}</p>

        ${findingsHtml}

        <h2>Impression</h2>
        <p>${(safe("impression_summary", "") || "").replace(/\n/g, "<br>")}</p>

        ${recHtml}
    `;
}

function ensureTinyMCEInitialized(callback) {
  if (tinyEditorInitialized && window.tinymce && tinymce.get("html-editor")) {
    callback(tinymce.get("html-editor"));
    return;
  }

  if (!window.tinymce) {
    console.error("TinyMCE not loaded.");
    return;
  }

  tinymce.init({
    selector: "#html-editor",
    menubar: false,
    height: 500,
    plugins: "lists link",
    toolbar: "undo redo | bold italic underline | bullist numlist | link",
    setup: (editor) => {
      editor.on("init", () => {
        tinyEditorInitialized = true;
        callback(editor);
      });
    }
  });
}

function openEditorWithJson(reportJson) {
  const modal = document.getElementById("edit-report-modal");
  const feedback = document.getElementById("edit-feedback");
  if (!modal) {
    console.error("edit-report-modal not found");
    return;
  }

  if (feedback) {
    feedback.classList.add("hidden");
    feedback.textContent = "";
  }

  const html = buildHtmlFromJson(reportJson);

  ensureTinyMCEInitialized((editor) => {
    editor.setContent(html);
    modal.classList.remove("hidden");
  });
}


// ---------------------------------------------------------
// PAGE LOADER & NAV
// ---------------------------------------------------------
// ---------------------------------------------------------
// PAGE LOADER & NAV
// ---------------------------------------------------------
async function loadPage(pageId, query = "") {
  console.log("Loading page:", pageId, query);

  // Update URL for SPA navigation
  if (pageId !== "dashboard") {
    const newUrl = query ? `?page=${pageId}&${query}` : `?page=${pageId}`;
    window.history.pushState({ page: pageId, query: query }, "", newUrl);
  } else {
    window.history.pushState({ page: "dashboard" }, "", "?page=dashboard");
  }

  // 1. Navigation Guard: Check if locked
  const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navItem && navItem.classList.contains("locked")) {
    console.warn(`Blocked navigation to locked page: ${pageId}`);
    // Optional: Shake animation or visual feedback
    if (navItem) {
      navItem.classList.add("animate-pulse");
      setTimeout(() => navItem.classList.remove("animate-pulse"), 500);
    }
    return;
  }

  // 2. Clear Context if returning to Patients list
  if (pageId === "patients") {
    clearPatientContext();
  }

  // Visual Transition Start
  contentArea.classList.remove("animate-in", "fade-in", "zoom-in-95");
  contentArea.style.opacity = "0.5";
  contentArea.style.transition = "opacity 0.2s ease";

  // Breadcrumb Update
  const pageNames = {
    "dashboard": "Dashboard",
    "patients": "Patients",
    "history": "History",
    "phase1": "Intake",
    "phase2": "Assessment",
    "patient-profile": "Patient Profile",
    "configuration": "Configuration"
  };

  // Update header content if exists
  const headerLeft = document.getElementById("header-left-content");
  if (headerLeft) {
    headerLeft.innerHTML = `
        <h2 class="text-xl font-bold text-slate-900 dark:text-white">${pageNames[pageId] || "MedEcho"}</h2>
      `;
  }


  if (pageId === "dashboard") {
    setTimeout(() => {
      dashboardSection.classList.remove("hidden");
      contentArea.innerHTML = "";
      contentArea.style.opacity = "1";
      // Add animation to dashboard appearing
      dashboardSection.classList.add("animate-in", "fade-in", "slide-in-from-bottom-2", "duration-500");

      // Initialize Dashboard Components
      if (typeof initDashboardPage === "function") initDashboardPage();

    }, 150);
    return;
  }

  dashboardSection.classList.add("hidden");

  const filePath = `${pageId}.html`;

  try {
    // Show Loading Spinner
    contentArea.innerHTML = `
      <div class="flex flex-col items-center justify-center h-96 space-y-4">
        <div class="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p class="text-slate-400 text-sm font-medium animate-pulse">Loading ${pageNames[pageId] || "content"}...</p>
      </div>
    `;

    // Artificial delay for smoother feel (optional, but helps avoid 'flash')
    // await new Promise(r => setTimeout(r, 100));

    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`Failed to fetch ${filePath}`);
    const html = await res.text();

    contentArea.innerHTML = html;

    // Animate In
    contentArea.style.opacity = "1";
    contentArea.classList.add("animate-in", "fade-in", "zoom-in-95", "duration-300");

    setTimeout(() => {
      if (pageId === "phase1") initPhase1Page();
      if (pageId === "phase2") initPhase2Page();
      if (pageId === "history") initHistoryPage();
      if (pageId === "patients") initPatientsPage();
      if (pageId === "patient-profile") initPatientprofilePage();
      if (pageId === "configuration") initConfigurationPage();
    }, 50);

  } catch (err) {
    contentArea.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 text-red-500">
        <span class="material-symbols-outlined text-4xl mb-2">error</span>
        <p>Failed to load content.</p>
        <p class="text-xs text-slate-400 mt-1">${err.message}</p>
        <button onclick="loadPage('${pageId}')" class="mt-4 px-4 py-2 bg-slate-100 rounded-lg text-sm hover:bg-slate-200">Retry</button>
      </div>
    `;
    console.error(err);
  }
}

function setActiveLink(pageId) {
  allNavElements.forEach(el => {
    const parentLi = el.closest("li");
    el.classList.remove("text-primary", "font-semibold");
    if (parentLi) parentLi.classList.remove("bg-primary/10");

    if (el.tagName === "A" && !parentLi) {
      el.classList.remove("border-primary");
      el.classList.add("border-transparent", "text-gray-500");
    }
  });

  allNavElements
    .filter(el => el.dataset.page === pageId)
    .forEach(el => {
      el.classList.add("text-primary", "font-semibold");
      const parentLi = el.closest("li");
      if (parentLi) parentLi.classList.add("bg-primary/10");

      if (el.tagName === "A" && !parentLi) {
        el.classList.add("border-primary");
        el.classList.remove("border-transparent", "text-gray-500");
      }
    });
}

function handleNavigationClick(e) {
  e.preventDefault();
  const pageId = e.currentTarget.dataset.page;
  loadPage(pageId);
  setActiveLink(pageId);
}

// ===============================
// PATIENTS PAGE (works with your backend)
// GET /patients returns: [{id,name,age,gender}, ...]
// ===============================

function initPatientsPage() {
  console.log("Patients page loaded.");

  const tbody = document.getElementById("patients-table-body");
  const loadingEl = document.getElementById("patients-loading");
  const emptyEl = document.getElementById("patients-empty-state");
  const errorEl = document.getElementById("patients-error");

  const searchEl = document.getElementById("patients-search");
  const statusEl = document.getElementById("patients-filter-status");      // optional (can ignore)
  const tagEl = document.getElementById("patients-filter-tag");            // optional (can ignore)
  const clinicianEl = document.getElementById("patients-filter-clinician");// optional (can ignore)

  const retryBtn = document.getElementById("patients-retry");

  if (!tbody || !loadingEl || !emptyEl || !errorEl) {
    console.warn("Patients page elements missing. Check IDs in patients.html");
    return;
  }

  const show = ({ loading = false, empty = false, error = false }) => {
    loadingEl.classList.toggle("hidden", !loading);
    emptyEl.classList.toggle("hidden", !empty);
    errorEl.classList.toggle("hidden", !error);
    if (loading || empty || error) tbody.innerHTML = "";
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function renderRows(items) {
    tbody.innerHTML = items.map((p) => {
      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20">
          <td class="px-6 py-4">
            <div class="font-semibold text-slate-900 dark:text-white">${escapeHtml(p.name || "-")}</div>
            <div class="text-xs text-slate-500">${escapeHtml(p.id || "")}</div>
          </td>
          <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">${escapeHtml(p.age ?? "-")}</td>
          <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">${escapeHtml(p.gender ?? "-")}</td>
          <td class="px-6 py-4 text-right">
            <button class="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600
                           text-slate-900 dark:text-white text-sm font-medium"
                    data-action="view" data-id="${escapeHtml(p.id)}">
              View
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("button[data-action='view']").forEach(btn => {
      btn.addEventListener("click", () => {
        selectPatient(btn.dataset.id);
        // loadPage("patient-profile"); // selectPatient does this
        // setActiveLink("patients");   // selectPatient does this
      });
    });

  }

  async function loadPatients() {
    show({ loading: true });

    try {
      const res = await fetch(`${API_URL}/patients`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const patients = await res.json(); // <-- array

      // simple client-side search
      const q = (searchEl?.value || "").trim().toLowerCase();
      const filtered = (patients || []).filter(p =>
        !q ||
        (p.name || "").toLowerCase().includes(q) ||
        (p.id || "").toLowerCase().includes(q)
      );

      if (!filtered.length) {
        show({ loading: false, empty: true });
        return;
      }

      show({ loading: false });
      renderRows(filtered);

    } catch (e) {
      console.error("Patients load error:", e);
      show({ loading: false, error: true });
    }
  }

  // debounce search
  const debounce = (fn, ms = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const refresh = debounce(loadPatients, 300);

  searchEl?.addEventListener("input", refresh);

  // (filters are optional; backend doesn't support them now, but keep UI responsive)
  statusEl?.addEventListener("change", refresh);
  tagEl?.addEventListener("input", refresh);
  clinicianEl?.addEventListener("input", refresh);

  retryBtn?.addEventListener("click", loadPatients);
  // ===== Add Patient Drawer bindings =====
  const drawer = document.getElementById("add-patient-drawer");
  const panel = document.getElementById("add-patient-panel");
  const overlay = document.getElementById("add-patient-overlay");

  const openBtn = document.getElementById("open-add-patient"); // زر اللي فوق
  const closeBtn = document.getElementById("close-add-patient");
  const cancelBtn = document.getElementById("cancel-add-patient");

  const form = document.getElementById("add-patient-form");
  const fb = document.getElementById("add-patient-feedback");

  function openDrawer() {
    if (!drawer || !panel) return;
    drawer.classList.remove("hidden");
    requestAnimationFrame(() => panel.classList.remove("translate-x-full"));
  }
  function closeDrawer() {
    if (!drawer || !panel) return;
    panel.classList.add("translate-x-full");
    setTimeout(() => drawer.classList.add("hidden"), 250);
  }

  openBtn?.addEventListener("click", openDrawer);
  closeBtn?.addEventListener("click", closeDrawer);
  cancelBtn?.addEventListener("click", closeDrawer);
  overlay?.addEventListener("click", closeDrawer);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    fb?.classList.add("hidden");

    const payload = {
      id: document.getElementById("patient-id").value.trim(),
      name: document.getElementById("patient-name").value.trim(),
      age: Number(document.getElementById("patient-age").value),
      gender: document.getElementById("patient-sex").value
    };

    try {
      const res = await fetch(`${API_URL}/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add patient");

      fb?.classList.remove("hidden");
      form.reset();

      await loadPatients();   // ✅ نفس الدالة داخل initPatientsPage
      closeDrawer();

    } catch (err) {
      alert("❌ " + err.message);
    }
  });

  loadPatients();
}


// ---------------------------------------------------------
// PHASE 1 INIT
// ---------------------------------------------------------
async function initPhase1Page() {
  console.log("Phase 1 ready");

  // نحاول نلاقي زر التسجيل داخل الـ dynamic-content فقط
  const recordBtn =
    document.querySelector("#dynamic-content #start-phase1-record") ||
    document.querySelector("#dynamic-content #record-session-btn-phase1") ||
    document.querySelector("#dynamic-content #record-session-btn");

  const uploadBtn = document.getElementById("upload-btn");
  const audioInput = document.getElementById("audioInput");
  const outputEl = document.getElementById("phase1-output");

  if (recordBtn) {
    recordBtn.onclick = () => {
      openRecordingModal("intake", "phase1-output");
    };
  }

  if (uploadBtn && audioInput && outputEl) {
    uploadBtn.onclick = async () => {
      if (!audioInput.files.length) {
        outputEl.innerHTML = `<p class="text-red-600">Select an audio file first!</p>`;
        return;
      }
      const audioFile = audioInput.files[0];
      uploadRecordedAudioForPhase("intake", audioFile, outputEl);
    };
  }

  await loadPhase1Table();
}


// ---------------------------------------------------------
// LOAD PHASE 1 TABLE
// ---------------------------------------------------------
async function loadPhase1Table() {
  const tbody = document.querySelector("#phase1-table tbody");
  if (!tbody) return;

  tbody.innerHTML = `
        <tr>
            <td colspan="3" class="p-2 text-center">
                Loading cases...
            </td>
        </tr>
    `;

  try {
    let url = `${API_URL}/phase1-cases`;
    // Filter by patient if selected
    if (selectedPatientId) {
      url += `?patient_id=${selectedPatientId}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!data || data.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="p-2 text-center">
                        No cases found.
                    </td>
                </tr>
            `;
      return;
    }

    tbody.innerHTML = ""; // clear loading

    data.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td class="p-2 border-b">${row.case_id}</td>
                <td class="p-2 border-b">${row.patient || "N/A"}</td>
                <td class="p-2 border-b">
                    <button
                        class="text-blue-600 underline open-phase2-btn"
                        data-case="${row.case_id}"
                        data-patient="${row.patient_id}">
                        Intake ready
                    </button>
                </td>
            `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll(".open-phase2-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const caseId = btn.dataset.case;
        const linkedPatientId = btn.dataset.patient;

        console.log(`Opening Phase 2 for case: ${caseId} (Patient: ${linkedPatientId})`);

        if (linkedPatientId) {
          // Need to switch context to this patient to unlock Phase 2
          // Pass false to skip loading profile page
          await selectPatient(linkedPatientId, false);
        }

        selectedCaseIdForPhase2 = caseId;

        // --- OPTIMISTIC UNLOCK ---
        // We know this case is ready (it's in the list), so force-unlock immediately
        // to bypass any race conditions or strict server checks that might lag.
        currentStage2Status = "available";
        const p2Nav = document.querySelector(`.nav-item[data-page="phase2"]`);
        if (p2Nav) {
          p2Nav.classList.remove("locked");
          // Add badge if missing
          if (!p2Nav.querySelector(".status-badge")) {
            updateBadge(p2Nav, "available");
          }
        }
        // -------------------------

        // Force update UI just in case logic in selectPatient missed a beat or race
        updateSidebarState();

        // Small delay to ensure DOM updates and localStorage persist
        setTimeout(() => {
          loadPage("phase2");
          setActiveLink("phase2");
        }, 50);
      });
    });

  } catch (err) {
    console.error("Failed to load cases:", err);
    tbody.innerHTML = `
            <tr>
                <td colspan="3" class="p-2 text-center text-red-600">
                    Failed to load cases: ${err.message}
                </td>
            </tr>
        `;
  }
}

// =====================================================
// INIT PHASE 2 PAGE (Dynamic)
// =====================================================
function initPhase2Page() {
  console.log("Phase 2 ready");

  const infoBanner = document.getElementById("phase2-case-info");

  // Check case from Phase 1
  if (!selectedCaseIdForPhase2) {
    infoBanner.textContent =
      "No intake case selected. Please go to Phase 1 and click 'Intake ready' for a case.";
    return;
  }

  infoBanner.textContent =
    `Loaded intake case: ${selectedCaseIdForPhase2}. Now record the final doctor assessment.`;

  // Bind the record button AFTER the HTML is loaded
  attachPhase2RecordButton();
}

// =====================================================
// PHASE 2 RECORD BUTTON BINDER
// =====================================================
function attachPhase2RecordButton() {
  const btn = document.getElementById("start-phase2-record");

  if (!btn) {
    console.error("❌ Phase 2 record button NOT FOUND! (HTML didn't load)");
    return;
  }

  btn.addEventListener("click", () => {
    console.log("🎤 Phase 2 recording started");
    openRecordingModal("final_assessment", "phase2-output");
  });

  console.log("✅ Phase 2 record button attached.");
}


// ---------------------------------------------------------
// HISTORY PAGE
// ---------------------------------------------------------
async function initHistoryPage() {
  console.log("History page loaded.");

  const tableBody = document.getElementById("history-table-body");
  if (!tableBody) {
    console.error("History table body not found!");
    return;
  }

  tableBody.innerHTML = `
        <tr><td class="px-6 py-4">Loading...</td></tr>
    `;

  try {
    let url = `${API_URL}/list-reports`;
    // Filter by patient if selected
    if (selectedPatientId) {
      url += `?patient_id=${selectedPatientId}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    tableBody.innerHTML = "";

    if (!data.length) {
      tableBody.innerHTML = `
                <tr><td class="px-6 py-4 text-gray-500">No reports found.</td></tr>
            `;
      return;
    }

    data.forEach(item => {
      const actionHtml = item.downloadUrl
        ? `<a href="${item.downloadUrl}" class="text-primary hover:underline font-medium" target="_blank">Download PDF</a>`
        : `<span class="text-slate-400 text-xs italic">Processing / Draft</span>`;

      const row = `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td class="px-6 py-4 font-medium text-slate-900 dark:text-white">${item.patient}</td>
                    <td class="px-6 py-4 text-slate-600 dark:text-slate-300">${item.reportId}</td>
                    <td class="px-6 py-4 text-slate-500 dark:text-slate-400 text-sm">${new Date(item.date).toLocaleString()}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded text-xs font-semibold">${item.phase}</span></td>
                    <td class="px-6 py-4 text-right">
                        ${actionHtml}
                    </td>
                </tr>
            `;
      tableBody.insertAdjacentHTML("beforeend", row);
    });

  } catch (err) {
    tableBody.innerHTML = `
            <tr><td class="px-6 py-4 text-red-600">
                Failed to load history: ${err.message}
            </td></tr>
        `;
  }
}
async function initPatientprofilePage() {
  const pid = selectedPatientId;
  if (!pid) {
    contentArea.innerHTML = `<p class="text-red-600">No patient selected.</p>`;
    return;
  }

  const byId = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  // Defensive: If page changed during interaction/wait
  if (!byId("patient-name")) {
    console.warn("initPatientprofilePage aborted: Elements missing");
    return;
  }

  // Breadcrumb click: Patients
  document.querySelectorAll("[data-go='patients']").forEach(el => {
    el.addEventListener("click", () => { loadPage("patients"); setActiveLink("patients"); });
  });

  // (Hero Logic moved below fetch)

  byId("patient-open-history")?.addEventListener("click", () => {
    loadPage("history"); setActiveLink("history");
  });


  byId("patient-start-final")?.addEventListener("click", () => {
    if (!selectedIntakeIdForFinal) {
      alert("Please select an Intake session first from the list below.");
      document.getElementById("tab-sessions").scrollIntoView({ behavior: "smooth" });
      return;
    }
    // خزّنها ليستخدمها uploadRecordedAudioForPhase
    selectedCaseIdForPhase2 = selectedIntakeIdForFinal;
    openRecordingModal("final_assessment", null);
  });

  // Tabs
  const tabs = document.querySelectorAll(".patient-tab");
  const showTab = (name) => {
    tabs.forEach(t => {
      const active = t.dataset.tab === name;
      t.classList.toggle("text-primary", active);
      t.classList.toggle("border-primary", active);
      t.classList.toggle("text-slate-500", !active);
      t.classList.toggle("border-transparent", !active);
    });
    byId("tab-overview").classList.toggle("hidden", name !== "overview");
    byId("tab-reports").classList.toggle("hidden", name !== "reports");
    byId("tab-sessions").classList.toggle("hidden", name !== "sessions");
  };
  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  showTab("overview");

  // -------- Load patient data (backend endpoints preferred) --------
  // إذا ما عندك endpoints، بنعمل fallback من /patients + /list-reports
  let patient = null;
  try {
    const res = await fetch(`${API_URL}/patients/${pid}`);
    if (res.ok) {
      const data = await res.json();
      // The endpoint returns { patient: {...}, sessions: [...] }
      // We need to extract the patient object
      patient = data.patient || data;
    }
  } catch { }

  if (!patient) {
    // fallback: from index list
    try {
      const res = await fetch(`${API_URL}/patients`);
      const list = res.ok ? await res.json() : [];
      patient = (list || []).find(x => x.id === pid) || { id: pid, name: "Unknown", age: "—", gender: "—" };
    } catch {
      patient = { id: pid, name: "Unknown", age: "—", gender: "—" };
    }
  }

  byId("patient-name").textContent = patient.name || "—";
  byId("patient-breadcrumb-name").textContent = patient.name || pid;
  byId("patient-id").textContent = patient.id || pid;
  byId("patient-meta").textContent = `Age: ${patient.age ?? "—"} • Gender: ${patient.gender ?? "—"}`;

  // Define Statuses from API (defaults if missing)
  const currentStage1Status = patient.stage1Status || "not_started";
  const currentStage2Status = patient.stage2Status || "locked"; // defaulting to locked if unknown

  // Buttons & Hero Action (Moved here)
  const heroContainer = document.getElementById("patient-hero-action");

  if (heroContainer) {
    if (currentStage1Status === "completed" && currentStage2Status !== "completed") {
      // STATE: Intake Done -> Prompt Assessment
      heroContainer.innerHTML = `
            <button id="patient-continue-assessment"
              class="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600
                     text-white font-bold shadow-lg shadow-orange-500/30 flex items-center gap-2 animate-pulse transition-all">
              <span class="material-symbols-outlined">play_arrow</span>
              <span>Continue to Assessment</span>
            </button>
        `;
      document.getElementById("patient-continue-assessment").onclick = () => {
        openRecordingModal("final_assessment", null);
      };

    } else if (currentStage2Status === "completed") {
      // STATE: All Done -> New Session
      heroContainer.innerHTML = `
            <div class="flex gap-2">
                <button id="patient-start-intake"
                  class="px-5 py-3 rounded-xl bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300 transition-all">
                  New Session
                </button>
            </div>
        `;
      document.getElementById("patient-start-intake").onclick = () => openRecordingModal("intake", null);
    } else {
      // STATE: Fresh Start
      heroContainer.innerHTML = `
            <button id="patient-start-intake"
              class="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent
                     hover:opacity-90 text-white font-semibold shadow-lg hover:shadow-xl flex items-center gap-2 transition-all">
              <span class="material-symbols-outlined">mic</span>
              <span>New Clinical Session</span>
            </button>
        `;
      document.getElementById("patient-start-intake").onclick = () => openRecordingModal("intake", null);
    }
  }


  // Update Summary Card
  const summaryId = byId("patient-summary-id");
  const summaryDate = byId("patient-summary-date");
  if (summaryId) summaryId.textContent = patient.id || pid;
  if (summaryDate) summaryDate.textContent = patient.created_at ? new Date(patient.created_at).toLocaleDateString() : "—";


  if (summaryId) summaryId.textContent = patient.id || pid;
  if (summaryDate) summaryDate.textContent = patient.created_at ? new Date(patient.created_at).toLocaleDateString() : "—";

  // Back Button
  const backBtn = byId("patient-back-btn");
  if (backBtn) {
    backBtn.onclick = () => loadPage("patients");
  }
  const editBtn = byId("patient-edit-btn");
  const deleteBtn = byId("patient-delete-btn");

  // EDIT DRAWER
  const editDrawer = byId("edit-patient-drawer");
  const editPanel = byId("edit-patient-panel");
  const editOverlay = byId("edit-patient-overlay");
  const closeEditBtn = byId("close-edit-patient");
  const cancelEditBtn = byId("cancel-edit-patient");
  const editForm = byId("edit-patient-form");

  function openEditDrawer() {
    if (!editDrawer) return;
    // Populate
    byId("edit-patient-id").value = patient.id || "";
    byId("edit-patient-name").value = patient.name || "";
    byId("edit-patient-age").value = patient.age || "";
    byId("edit-patient-sex").value = patient.gender || ""; // backend sends "gender" often

    editDrawer.classList.remove("hidden");
    requestAnimationFrame(() => editPanel.classList.remove("translate-x-full"));
  }

  function closeEditDrawer() {
    if (!editDrawer) return;
    editPanel.classList.add("translate-x-full");
    // clear feedback
    byId("edit-patient-feedback")?.classList.add("hidden");
    setTimeout(() => editDrawer.classList.add("hidden"), 250);
  }

  if (editBtn) editBtn.onclick = openEditDrawer;
  if (closeEditBtn) closeEditBtn.onclick = closeEditDrawer;
  if (cancelEditBtn) cancelEditBtn.onclick = closeEditDrawer;
  if (editOverlay) editOverlay.onclick = closeEditDrawer;

  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        name: byId("edit-patient-name").value.trim(),
        age: Number(byId("edit-patient-age").value),
        gender: byId("edit-patient-sex").value
      };

      try {
        const res = await fetch(`${API_URL}/patients/${pid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Failed to update");

        // UI Feedback
        byId("edit-patient-feedback")?.classList.remove("hidden");

        // Update Local State & UI
        patient.name = payload.name;
        patient.age = payload.age;
        patient.gender = payload.gender;

        byId("patient-name").textContent = patient.name;
        byId("patient-breadcrumb-name").textContent = patient.name;
        byId("patient-meta").textContent = `Age: ${patient.age} • Gender: ${patient.gender}`;

        setTimeout(() => closeEditDrawer(), 1000);

      } catch (err) {
        alert("Update failed: " + err.message);
      }
    };
  }

  // DELETE LOGIC
  if (deleteBtn) {
    deleteBtn.onclick = async () => {
      if (!confirm(`Are you sure you want to delete patient ${patient.name}? This cannot be undone.`)) {
        return;
      }

      const originalText = deleteBtn.innerHTML;
      deleteBtn.innerHTML = "Deleting...";
      deleteBtn.disabled = true;

      try {
        const res = await fetch(`${API_URL}/patients/${pid}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");

        // Redirect
        alert("Patient deleted successfully.");
        loadPage("patients");
        setActiveLink("patients");

      } catch (err) {
        alert(err.message);
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
      }
    };
  }

  // -------- Reports list (use /list-reports filter by patient_id) --------
  const reportsBody = byId("patient-reports-body");
  const docsList = byId("patient-docs-list");

  try {
    // Use server-side filtering
    const rres = await fetch(`${API_URL}/list-reports?patient_id=${pid}`);
    const mine = rres.ok ? await rres.json() : [];

    if (!mine.length) {
      if (reportsBody) reportsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-5 text-sm text-slate-500 text-center">No reports found for this patient.</td></tr>`;
      if (docsList) docsList.innerHTML = `<p class="text-sm text-slate-500">No documents yet.</p>`;
    } else {
      if (reportsBody) {
        reportsBody.innerHTML = mine.map(r => {
          const dt = r.date ? new Date(r.date).toLocaleString() : "—";

          let actionHtml = "";
          if (r.downloadUrl) {
            actionHtml = `<a href="${r.downloadUrl}" class="text-primary hover:underline font-medium flex items-center justify-end gap-1" target="_blank">
              <span class="material-symbols-outlined text-sm">download</span> Download PDF
            </a>`;
          } else if (r.phase === "intake" && r.status === "completed") {
            actionHtml = `<span class="text-slate-500 text-xs font-medium flex items-center justify-end gap-1">
              <span class="material-symbols-outlined text-sm">check_circle</span> Intake Record
            </span>`;
          } else {
            // Draft / Final Assessment processing
            actionHtml = `<span class="text-slate-400 text-xs italic flex items-center justify-end gap-1">
               <span class="material-symbols-outlined text-sm">hourglass_empty</span> Processing / Draft
            </span>`;
          }

          return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
              <td class="px-4 py-4 font-semibold text-slate-900 dark:text-white text-sm">${esc(r.reportId || r.report_id || "—")}</td>
              <td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300"><span class="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-xs font-medium uppercase tracking-wider">${esc(r.phase || "—")}</span></td>
              <td class="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">${esc(dt)}</td>
              <td class="px-4 py-4 text-right text-sm">${actionHtml}</td>
            </tr>`;
        }).join("");
      }

      // Documents panel
      if (docsList) {
        docsList.innerHTML = mine.map(r => {
          const id = esc(r.reportId || r.report_id || "—");
          const link = r.downloadUrl ? r.downloadUrl : "#";
          return `<a class="block px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all group"
                      href="${link}" target="_blank">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600">
                    <span class="material-symbols-outlined text-lg">picture_as_pdf</span>
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-primary transition-colors">Medical Report ${id}</div>
                    <div class="text-xs text-slate-500">${esc(r.phase || "")}</div>
                  </div>
                </div>
                <div class="text-xs font-medium text-slate-400 group-hover:text-primary transition-colors">PDF</div>
              </div>
            </a>`;
        }).join("");
      }
    }
  } catch (e) {
    if (reportsBody) reportsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-5 text-sm text-rose-600 text-center">Failed to load reports.</td></tr>`;
    console.error(e);
  }

  // -------- Notes (LocalStorage) --------
  const notesInput = byId("patient-notes-input");
  if (notesInput) {
    const storageKey = `patient_notes_${pid}`;
    notesInput.value = localStorage.getItem(storageKey) || "";

    notesInput.oninput = () => {
      localStorage.setItem(storageKey, notesInput.value);
      // Optional: Show "Saved" status briefly
    };
  }

  // -------- Sessions --------
  const sessionsBody = byId("patient-sessions-body");
  if (sessionsBody) {
    try {
      const sres = await fetch(`${API_URL}/patients/${pid}/sessions`); // Check if backend supports this, otherwise fallback logic
      let sessions = [];
      if (sres.ok) {
        const data = await sres.json();
        sessions = data.sessions || data; // Handle {sessions: []} or []
      }

      const countEl = byId("patient-sessions-count");
      if (countEl) countEl.textContent = `(${sessions.length})`;

      // If empty or failed, clear
      if (!sessions || !sessions.length) {
        sessionsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-5 text-sm text-slate-500 text-center">No sessions found.</td></tr>`;
      } else {
        sessionsBody.innerHTML = sessions.map(s => {
          const sid = esc(s.session_id || "—");
          const phase = esc(s.phase || "—");
          const rid = esc(s.report_id || "—");
          const canUse = (s.phase === "intake" && s.status === "completed");

          return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
              <td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300 font-medium">${sid}</td>
              <td class="px-4 py-4 text-sm text-slate-700 dark:text-slate-300 capitalize">${phase}</td>
              <td class="px-4 py-4 text-sm font-semibold text-slate-900 dark:text-white">${rid}</td>
              <td class="px-4 py-4 text-right">
                ${canUse ?
              `<button class="px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-all" data-use-intake="${rid}">Select for Assessment</button>`
              : `<span class="text-xs text-slate-400">—</span>`}
              </td>
            </tr>`;
        }).join("");

        sessionsBody.querySelectorAll("button[data-use-intake]").forEach(btn => {
          btn.addEventListener("click", () => {
            selectedIntakeIdForFinal = btn.dataset.useIntake;
            alert(`Session ${selectedIntakeIdForFinal} selected for Final Assessment.`);
            // Optional: Highlight the "Continue" button
            if (byId("patient-continue-assessment")) byId("patient-continue-assessment").classList.add("ring-4", "ring-orange-300");
            showTab("overview");
          });
        });
      }
    } catch (e) {
      sessionsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-5 text-sm text-slate-500 text-center">No sessions data available.</td></tr>`;
    }
  }
}


// ---------------------------------------------------------
// NEW DASHBOARD LOGIC
// ---------------------------------------------------------
function initDashboardPage() {
  console.log("Initializing Dashboard (New Logic)");
  const startSessionBtn = document.getElementById("dashboard-start-recording");
  const openPatientsBtn = document.getElementById("dashboard-open-patients");
  const openHistoryBtn = document.getElementById("dashboard-open-history");
  const resumeBtn = document.getElementById("dashboard-resume");

  const go = (pageId) => {
    loadPage(pageId);
    setActiveLink(pageId);
  };

  startSessionBtn ? (startSessionBtn.onclick = () => go("patients")) : null;
  openPatientsBtn ? (openPatientsBtn.onclick = () => go("patients")) : null;
  openHistoryBtn ? (openHistoryBtn.onclick = () => go("history")) : null;
  resumeBtn ? (resumeBtn.onclick = () => go("history")) : null;

  // Expose for refresh button
  window.loadDashboardData = loadDashboardData;
  loadDashboardData();
}

async function loadDashboardData() {
  const suggestionsEl = document.getElementById("dashboard-suggestions");
  const heroStatsEl = document.getElementById("dash-hero-stats");
  const todaySessionsEl = document.getElementById("dash-today-sessions");
  const totalReportsEl = document.getElementById("dash-recent-reports");
  const activePatientsEl = document.getElementById("stat-active");
  const timelineEl = document.getElementById("dashboard-timeline");

  try {
    const res = await fetch(`${API_URL}/list-reports`);
    const reports = res.ok ? await res.json() : [];

    let patientCount = 0;
    try {
      const pres = await fetch(`${API_URL}/patients`);
      const patients = pres.ok ? await pres.json() : [];
      patientCount = patients.length;
    } catch { /* ignore */ }

    const now = new Date();
    const todayCount = (reports || []).filter(r => {
      if (!r.date || r.date === "N/A") return false;
      const d = new Date(r.date);
      return d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    }).length;

    if (todaySessionsEl) todaySessionsEl.textContent = todayCount;
    if (totalReportsEl) totalReportsEl.textContent = reports.length;
    if (activePatientsEl) activePatientsEl.textContent = `${patientCount} Total`;

    // Nice hero message
    const pendingReview = reports.filter(r => r.phase === "intake" && r.status === "completed").length;
    if (heroStatsEl) heroStatsEl.textContent = `${pendingReview} pending reports`;

    if (timelineEl) {
      const last3 = (reports || []).slice(-3).reverse();
      if (last3.length === 0) {
        timelineEl.innerHTML = '<p class="text-sm text-slate-400 italic">No recent activity.</p>';
      } else {
        timelineEl.innerHTML = last3.map(r => {
          const time = r.date ? new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
          return `
            <div class="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-700/50">
                <div class="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0"></div>
                <div>
                    <p class="text-sm font-semibold text-slate-900 dark:text-white">Report Created</p>
                    <p class="text-xs text-slate-500">Patient #${r.patient_id || r.patientId || "?"} • ${time}</p>
                </div>
            </div>`;
        }).join("");
      }
    }

    // Suggestions
    const suggestions = [];
    // 1. Pending chunks
    const intakes = reports.filter(r => r.phase === "intake" && r.status === "completed");
    if (intakes.length > 0) {
      suggestions.push({
        icon: "assignment",
        color: "text-amber-500",
        bg: "bg-amber-100 dark:bg-amber-900/30",
        title: "Pending Assessment",
        desc: `You have ${intakes.length} intake sessions ready.`,
        action: "Go to History",
        link: "history"
      });
    }

    // 2. Start day
    if (todayCount === 0) {
      suggestions.push({
        icon: "event_note",
        color: "text-blue-500",
        bg: "bg-blue-100 dark:bg-blue-900/30",
        title: "Start Your Day",
        desc: "Ready to see your first patient?",
        action: "New Session",
        link: "patients"
      });
    } else {
      suggestions.push({
        icon: "celebration",
        color: "text-emerald-500",
        bg: "bg-emerald-100 dark:bg-emerald-900/30",
        title: "Great Progress",
        desc: `You've completed ${todayCount} sessions today.`,
        action: null,
        link: null
      });
    }

    if (suggestionsEl) {
      if (suggestions.length === 0) {
        suggestionsEl.innerHTML = `<div class="p-4 rounded-2xl bg-slate-50 text-slate-500 text-sm">No suggestions.</div>`;
      } else {
        suggestionsEl.innerHTML = suggestions.map(s => `
                <div class="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm">
                    <div class="w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center ${s.color} shrink-0">
                        <span class="material-symbols-outlined">${s.icon}</span>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-slate-800 dark:text-gray-100 text-sm">${s.title}</h4>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${s.desc}</p>
                    </div>
                    ${s.action ? `
                    <button onclick="navigateFromSuggestion('${s.link}')" class="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-primary transition-colors whitespace-nowrap">
                        ${s.action}
                    </button>` : ''}
                </div>
             `).join("");
      }
    }

  } catch (e) {
    console.error("Dashboard Load Error:", e);
  }
}

window.navigateFromSuggestion = (pageId) => {
  loadPage(pageId);
  setActiveLink(pageId);
};

// ---------------------------------------------------------
// MAIN INIT
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Nav
  allNavElements.forEach(el =>
    el.addEventListener("click", handleNavigationClick)
  );

  // Dashboard record button (الكرت الأزرق في الـ Dashboard)
  const dashboardRecord = document.getElementById("record-session-btn");
  if (dashboardRecord) {
    dashboardRecord.onclick = () => {
      openRecordingModal("intake", null); // no direct output element
    };
  }

  // Recording modal buttons
  const startBtn = document.getElementById("start-record-btn");
  const stopBtn = document.getElementById("stop-record-btn");
  const closeModalBtn = document.getElementById("close-recording-modal");

  if (startBtn) startBtn.onclick = startRecording;
  if (stopBtn) stopBtn.onclick = stopRecording;
  if (closeModalBtn) closeModalBtn.onclick = closeRecordingModal;

  // Editor modal buttons / form
  const editForm = document.getElementById("edit-report-form");
  const cancelEdit = document.getElementById("cancel-edit-modal");
  const editModal = document.getElementById("edit-report-modal");
  const editFeedback = document.getElementById("edit-feedback");

  if (cancelEdit && editModal) {
    cancelEdit.onclick = () => {
      editModal.classList.add("hidden");
    };
  }

  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();

      if (!lastReportJson) {
        if (editFeedback) {
          editFeedback.textContent = "No report data to save.";
          editFeedback.classList.remove("hidden");
        }
        return;
      }

      let htmlContent = "";
      if (window.tinymce && tinymce.get("html-editor")) {
        htmlContent = tinymce.get("html-editor").getContent();
      }

      try {
        const res = await fetch(`${API_URL}/generate-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_json: lastReportJson,
            edited_html: htmlContent
          })
        });

        if (!res.ok) {
          const errTxt = await res.text();
          throw new Error(errTxt);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fileName = (lastReportJson.report_id || "report") + "_final.pdf";
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);

        if (editFeedback) {
          editFeedback.textContent = "✅ PDF generated and downloaded.";
          editFeedback.classList.remove("hidden");
        }

      } catch (err) {
        console.error("PDF generation error:", err);
        if (editFeedback) {
          editFeedback.textContent = `Error: ${err.message}`;
          editFeedback.classList.remove("hidden");
        }
      }
    };
  }
  // ===== Dashboard bindings =====
  const dashStart = document.getElementById("dashboard-start-recording");
  dashStart?.addEventListener("click", () => openRecordingModal("intake", null));

  // Hotkey: press R to start recording (avoid typing inside inputs)
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "r") return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
    openRecordingModal("intake", null);
  });

  // Open patients/history from dashboard tiles
  document.getElementById("dashboard-open-patients")?.addEventListener("click", () => {
    loadPage("patients");
    setActiveLink("patients");
  });
  document.getElementById("dashboard-open-history")?.addEventListener("click", () => {
    loadPage("history");
    setActiveLink("history");
  });

  // Load dashboard data (counts + last session)
  async function initDashboardFancy() {
    try {
      // patients count
      const pres = await fetch(`${API_URL}/patients`);
      const patients = pres.ok ? await pres.json() : [];
      const activeCount = Array.isArray(patients) ? patients.length : 0;

      // reports count + last session
      const rres = await fetch(`${API_URL}/list-reports`);
      const reports = rres.ok ? await rres.json() : [];
      const completedCount = Array.isArray(reports) ? reports.length : 0;

      // pending: your backend doesn't have "pending" yet, so placeholder (0)
      const pendingCount = 0;
      setText("stat-active", activeCount);
      setText("stat-completed", completedCount);
      setText("stat-pending", pendingCount);

      setText("tile-active", activeCount);
      setText("tile-completed", completedCount);

      setText("last-patient", last?.patient || "—");
      setText("last-phase", last?.phase || "—");
      setText("last-time", last?.date ? new Date(last.date).toLocaleString() : "—");

      setText("dashboard-context", context);

      setHTML("dashboard-timeline", timelineHTML);

      // context bar
      const context = last
        ? `Patient: ${last.patient} | Phase: ${last.phase} | Status: Completed`
        : `Patient: — | Phase: — | Status: —`;
      document.getElementById("dashboard-context").textContent = context;

      // timeline strip (make it look fancy)
      const timeline = document.getElementById("dashboard-timeline");
      if (timeline) {
        if (!reports?.length) {
          timeline.innerHTML = `<div class="text-sm text-slate-500 dark:text-slate-400">No activity yet.</div>`;
        } else {
          const top = reports.slice(0, 6);
          timeline.innerHTML = top.map(r => {
            const t = r.date ? new Date(r.date).toLocaleString() : "—";
            return `
            <div class="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">${r.patient || "Unknown"} — ${r.phase || "report"}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${r.reportId || ""}</p>
              </div>
              <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">${t}</div>
            </div>
          `;
          }).join("");
        }
      }

      // resume button: go to history for now
      document.getElementById("dashboard-resume")?.addEventListener("click", () => {
        loadPage("history");
        setActiveLink("history");
      });

    } catch (e) {
      console.error("Dashboard init failed:", e);
    }
  }
  function $(id) { return document.getElementById(id); }

  function setText(id, value) {
    const el = $(id);
    if (!el) { console.warn(`[dashboard] missing #${id}`); return false; }
    el.textContent = value ?? "—";
    return true;
  }

  function setHTML(id, html) {
    const el = $(id);
    if (!el) { console.warn(`[dashboard] missing #${id}`); return false; }
    el.innerHTML = html ?? "";
    return true;
  }

  // initDashboardFancy(); // Legacy removed

  // ==========================================
  // CONFIGURATION PAGE LOGIC
  // ==========================================

  let configData = {};
  let usageLogs = [];

  async function initConfigurationPage() {
    console.log("Init Config Page");

    // Load Data
    try {
      const [cRes, uRes] = await Promise.all([
        fetch(`${API_URL}/config`),
        fetch(`${API_URL}/usage-stats`)
      ]);

      configData = await cRes.json();
      usageLogs = await uRes.json();

      populateConfigUI();
      updateAnalysisDashboard();

    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }

  function populateConfigUI() {
    // General
    document.getElementById("config-api-url").value = API_URL; // Using global constant for display primarily

    // AI Models
    const llmProvider = document.getElementById("config-llm-provider");
    const transProvider = document.getElementById("config-transcription-provider");
    const micPlacement = document.getElementById("config-mic-placement");
    if (llmProvider) llmProvider.value = (configData.llm_provider || "openai").toLowerCase();
    if (transProvider) transProvider.value = (configData.transcription_provider || "openai").toLowerCase();
    if (micPlacement) micPlacement.value = (configData.mic_placement || "doctor").toLowerCase();

    updateModelDropdown(); // Populate models based on provider
    const llmModel = document.getElementById("config-llm-model");
    if (llmModel && configData.llm_model) llmModel.value = configData.llm_model;

    // Tokens
    const openaiKey = document.getElementById("config-openai-key");
    const googleKey = document.getElementById("config-google-key");
    if (openaiKey) openaiKey.value = configData.openai_api_key || "";
    if (googleKey) googleKey.value = configData.google_api_key || "";

    const maxTokens = document.getElementById("config-max-tokens");
    const temp = document.getElementById("config-temperature");

    if (maxTokens) {
      maxTokens.value = configData.max_tokens || 4000;
      document.getElementById("display-max-tokens").textContent = maxTokens.value;
      maxTokens.oninput = (e) => document.getElementById("display-max-tokens").textContent = e.target.value;
    }

    if (temp) {
      temp.value = configData.temperature || 0.0;
      document.getElementById("display-temperature").textContent = temp.value;
      temp.oninput = (e) => document.getElementById("display-temperature").textContent = e.target.value;
    }
  }

  function updateModelDropdown() {
    const providerEl = document.getElementById("config-llm-provider");
    const modelSelect = document.getElementById("config-llm-model");

    if (!providerEl || !modelSelect) {
      console.warn("Missing elements for model dropdown");
      return;
    }

    const provider = providerEl.value;
    console.log("Updating models for provider:", provider);

    modelSelect.innerHTML = "";
    let options = [];

    // Explicit check
    if (provider === "openai") {
      options = [
        { val: "gpt-4o", text: "GPT-4o (Best Accuracy) ~10s" },
        { val: "gpt-4o-mini", text: "GPT-4o Mini (Fastest) ~3s" }
      ];
    } else {
      // Default to Google if not openai (or if "google")
      options = [
        { val: "gemini-2.0-flash", text: "Gemini 2.0 Flash (Fastest) ~2s" },
        { val: "gemini-2.5-pro", text: "Gemini 2.5 Pro (Most Capable) ~8s" }
      ];
    }

    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.val;
      o.textContent = opt.text;
      modelSelect.appendChild(o);
    });
  }

  function togglePassword(id) {
    const el = document.getElementById(id);
    if (el) el.type = el.type === "password" ? "text" : "password";
  }

  function switchConfigTab(tabName) {
    // Reset buttons
    ["general", "ai", "tokens"].forEach(t => {
      const btn = document.getElementById(`tab-btn-${t}`);
      const content = document.getElementById(`tab-content-${t}`);

      if (t === tabName) {
        btn.classList.remove("text-slate-500", "hover:text-slate-900", "bg-transparent");
        btn.classList.add("bg-white", "dark:bg-slate-700", "text-slate-900", "dark:text-white", "shadow");
        content.classList.remove("hidden");
      } else {
        btn.classList.add("text-slate-500", "hover:text-slate-900", "bg-transparent");
        btn.classList.remove("bg-white", "dark:bg-slate-700", "text-slate-900", "dark:text-white", "shadow");
        content.classList.add("hidden");
      }
    });
  }

  async function saveConfiguration() {
    const btn = document.getElementById("save-config-btn");
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Saving...`;

    const newConfig = {
      llm_provider: document.getElementById("config-llm-provider").value,
      llm_model: document.getElementById("config-llm-model").value,
      transcription_provider: document.getElementById("config-transcription-provider").value,
      mic_placement: document.getElementById("config-mic-placement").value,
      openai_api_key: document.getElementById("config-openai-key").value,
      google_api_key: document.getElementById("config-google-key").value,
      max_tokens: parseInt(document.getElementById("config-max-tokens").value),
      temperature: parseFloat(document.getElementById("config-temperature").value),
    };

    try {
      const res = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
      });

      if (res.ok) {
        btn.innerHTML = `<span class="material-symbols-outlined">check</span> Saved`;
        btn.classList.add("bg-green-600");
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove("bg-green-600");
        }, 2000);
        configData = newConfig; // update local
      } else {
        throw new Error("Save failed");
      }
    } catch (e) {
      alert("Failed to save settings: " + e.message);
      btn.innerHTML = originalText;
    }
  }

  function updateAnalysisDashboard() {
    if (!usageLogs || !usageLogs.length) return;

    // 1. Total Tokens
    const totalTokens = usageLogs.reduce((acc, log) => acc + (log.tokens_total || 0), 0);
    document.getElementById("stats-total-tokens").textContent = totalTokens.toLocaleString();

    // 2. Est Cost (Rough approx based on blend)
    // GPT-4o input: $5/1M, out: $15/1M.  Gemini Flash: Free tier. 
    // Simplified: $10/1M avg
    const cost = (totalTokens / 1_000_000) * 5.0;
    document.getElementById("stats-est-cost").textContent = `$${cost.toFixed(4)}`;

    // 3. Avg Speed
    const totalTime = usageLogs.reduce((acc, log) => acc + (log.duration_total_ms || 0), 0);
    const avgTime = usageLogs.length ? (totalTime / usageLogs.length / 1000).toFixed(1) : "0";
    document.getElementById("stats-avg-speed").textContent = `${avgTime}s`;

    // 4. Chart (Timeline breakdown)
    const chartContainer = document.getElementById("speed-breakdown-chart");
    chartContainer.innerHTML = "";

    // Take last 5 logs
    const recent = usageLogs.slice(-5).reverse();

    recent.forEach(log => {
      const transTime = (log.duration_transcription_ms || 0) / 1000;
      const llmTime = (log.duration_llm_ms || 0) / 1000;
      const total = (log.duration_total_ms || 0) / 1000;

      // Calculate percentages for bar width
      const pTrans = (transTime / total) * 100;
      const pLLM = (llmTime / total) * 100;

      const row = document.createElement("div");
      row.className = "mb-4";
      row.innerHTML = `
            <div class="flex justify-between text-xs mb-1">
               <span class="font-bold text-slate-700 dark:text-slate-300">${log.model || "Unknown"}</span>
               <span class="text-slate-500">${new Date(log.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="w-full h-4 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                <div style="width: ${pTrans}%" class="h-full bg-emerald-400" title="Transcription: ${transTime.toFixed(1)}s"></div>
                <div style="width: ${pLLM}%" class="h-full bg-blue-500" title="Generation: ${llmTime.toFixed(1)}s"></div>
            </div>
            <div class="flex justify-between text-[10px] text-slate-400 mt-1">
               <span>Transcribe: ${transTime.toFixed(1)}s</span>
               <span>Total: ${total.toFixed(1)}s</span>
            </div>
        `;
      chartContainer.appendChild(row);
    });
  }

  function setTheme(mode) {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  // On Startup
  (function () {
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    loadPage("patients");
    setActiveLink("patients");
  })();

  // Expose functions to window for HTML onclick
  window.saveConfiguration = saveConfiguration;
  window.switchConfigTab = switchConfigTab;
  window.setTheme = setTheme;
  window.togglePassword = togglePassword;
  window.updateModelDropdown = updateModelDropdown;

});

