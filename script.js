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

// Which phase this recording is for: "intake" or "final_assessment"
let currentRecordingPhase = "intake";
let currentRecordingOutputId = null;

// Last report JSON from backend (for editor + PDF)
let lastReportJson = null;

// TinyMCE state
let tinyEditorInitialized = false;

// ---------------------------------------------------------
// UTILS
// ---------------------------------------------------------
function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
}

// ---------------------------------------------------------
// RECORDING MODAL
// ---------------------------------------------------------
function resetRecordingUI() {
    const status = document.getElementById("recording-status");
    const timerEl = document.getElementById("recording-timer");
    const startBtn = document.getElementById("start-record-btn");
    const stopBtn = document.getElementById("stop-record-btn");
    const feedback = document.getElementById("modal-feedback");

    if (!status || !timerEl || !startBtn || !stopBtn || !feedback) return;

    status.textContent = "Ready to Record";
    timerEl.classList.add("hidden");
    timerEl.textContent = "00:00";

    startBtn.classList.remove("hidden");
    stopBtn.classList.add("hidden");
    stopBtn.disabled = true;

    feedback.classList.add("hidden");
    feedback.textContent = "";

    recordedChunks = [];
    recordingSeconds = 0;

    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
}

function openRecordingModal(phase = "intake", outputId = null) {
    currentRecordingPhase = phase;
    currentRecordingOutputId = outputId;

    const modal = document.getElementById("recording-modal");
    if (!modal) {
        console.error("recording-modal not found in DOM");
        return;
    }
    resetRecordingUI();
    modal.classList.remove("hidden");
}

function closeRecordingModal() {
    const modal = document.getElementById("recording-modal");
    if (modal) {
        modal.classList.add("hidden");
    }

    // stop mic if still active
    if (recordingStream) {
        recordingStream.getTracks().forEach(t => t.stop());
        recordingStream = null;
    }
}

// ---------------------------------------------------------
// RECORDING LOGIC
// ---------------------------------------------------------
async function startRecording() {
    const status = document.getElementById("recording-status");
    const timerEl = document.getElementById("recording-timer");
    const startBtn = document.getElementById("start-record-btn");
    const stopBtn = document.getElementById("stop-record-btn");
    const feedback = document.getElementById("modal-feedback");

    if (!status || !timerEl || !startBtn || !stopBtn || !feedback) {
        console.error("Recording UI elements missing");
        return;
    }

    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(recordingStream);

        recordedChunks = [];
        recordingSeconds = 0;

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstart = () => {
            status.textContent = "Recording…";
            timerEl.classList.remove("hidden");
            timerEl.textContent = "00:00";

            startBtn.classList.add("hidden");
            stopBtn.classList.remove("hidden");
            stopBtn.disabled = false;

            recordingTimer = setInterval(() => {
                recordingSeconds += 1;
                timerEl.textContent = formatTime(recordingSeconds);
            }, 1000);
        };

        mediaRecorder.onstop = () => {
            if (recordingTimer) {
                clearInterval(recordingTimer);
                recordingTimer = null;
            }

            status.textContent = "Processing audio…";

            const blob = new Blob(recordedChunks, { type: "audio/webm" });

            if (recordingStream) {
                recordingStream.getTracks().forEach(t => t.stop());
                recordingStream = null;
            }

            document.dispatchEvent(
                new CustomEvent("recording-complete", { detail: blob })
            );
        };

        mediaRecorder.start();
    } catch (err) {
        console.error("Error starting recording:", err);
        feedback.textContent = `Error: ${err.message}`;
        feedback.classList.remove("hidden");
    }
}

function stopRecording() {
    const status = document.getElementById("recording-status");
    const stopBtn = document.getElementById("stop-record-btn");

    if (!status || !stopBtn) return;

    if (!mediaRecorder || mediaRecorder.state !== "recording") {
        status.textContent = "Not recording.";
        return;
    }

    stopBtn.disabled = true;
    status.textContent = "Stopping…";
    mediaRecorder.stop();
}

// ---------------------------------------------------------
// WHEN RECORDING FINISHES → SEND TO BACKEND
// ---------------------------------------------------------
document.addEventListener("recording-complete", (e) => {
    console.log("[script.js] recording-complete event received");
    const audioBlob = e.detail;

    let outputEl = null;
    if (currentRecordingOutputId) {
        outputEl = document.getElementById(currentRecordingOutputId);
    }

    if (!outputEl) {
        // fallback hidden element
        outputEl = document.createElement("div");
        outputEl.style.display = "none";
        document.body.appendChild(outputEl);
    }

    uploadRecordedAudioForPhase(currentRecordingPhase, audioBlob, outputEl);
});

// ---------------------------------------------------------
// UPLOAD HANDLER
// ---------------------------------------------------------
async function uploadRecordedAudioForPhase(phase, audioBlob, outputEl) {
    const kb = (audioBlob.size / 1024).toFixed(1);
    outputEl.innerHTML = `<p class="text-primary text-sm">Uploading ${kb} KB for phase: <strong>${phase}</strong>…</p>`;

    const fd = new FormData();
    fd.append("file", audioBlob, `recording_${Date.now()}.webm`);

    const endpoint =
        phase === "final_assessment"
            ? `${API_URL}/phase2-transcribe`
            : `${API_URL}/phase1-transcribe`;

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            body: fd,
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`API Error: ${errTxt}`);
        }

        const json = await res.json();
        lastReportJson = json;

        outputEl.innerHTML = `
            <p class="text-green-600 text-sm mb-1">✔️ Transcription + Report ready.</p>
            <pre class="text-xs bg-gray-900 text-green-200 p-3 rounded overflow-auto max-h-64">${JSON.stringify(
                json,
                null,
                2
            )}</pre>
        `;

        closeRecordingModal();
        openEditorWithJson(json);

        // Try refresh dashboard activity + Phase1 table
        loadDashboardActivity();
        loadPhase1Table().catch(() => {});
    } catch (err) {
        console.error("Upload failed:", err);
        outputEl.innerHTML = `<p class="text-red-600 text-sm">Upload failed: ${err.message}</p>`;
        closeRecordingModal();
    }
}

// ---------------------------------------------------------
// TINYMCE EDITOR
// ---------------------------------------------------------
function buildHtmlFromJson(report) {
    if (!report || typeof report !== "object") {
        return "<p>No report data.</p>";
    }

    const safe = (k, fallback = "") =>
        report[k] !== undefined && report[k] !== null ? report[k] : fallback;

    let findingsHtml = "";
    if (Array.isArray(report.detailed_findings) && report.detailed_findings.length) {
        findingsHtml = `
            <h2>Findings</h2>
            <ul>
                ${report.detailed_findings
                    .map(
                        (f) => `
                    <li><strong>${f.finding || ""}</strong>: ${
                            f.explanation || ""
                        }</li>
                `
                    )
                    .join("")}
            </ul>
        `;
    }

    let recHtml = "";
    if (Array.isArray(report.recommendations) && report.recommendations.length) {
        recHtml = `
            <h2>Recommendations</h2>
            <ul>
                ${report.recommendations.map((r) => `<li>${r}</li>`).join("")}
            </ul>
        `;
    }

    const clinicalHistory =
        (safe("clinical_history", "") + "").replace(/\n/g, "<br>");

    const impression =
        (safe("impression_summary", "") + "").replace(/\n/g, "<br>");

    return `
        <h1>Medical Report (${String(safe("phase", "")).toUpperCase()})</h1>
        <p><strong>Patient:</strong> ${safe("patient_name", "N/A")}</p>
        <p><strong>Age:</strong> ${safe("age", "N/A")} | <strong>Sex:</strong> ${safe(
            "sex",
            "N/A"
        )}</p>
        <p><strong>Exam Type:</strong> ${safe("exam_type", "N/A")}</p>
        <p><strong>Exam Date:</strong> ${safe("exam_date", "N/A")}</p>

        <h2>Clinical History</h2>
        <p>${clinicalHistory}</p>

        ${findingsHtml}

        <h2>Impression</h2>
        <p>${impression}</p>

        ${recHtml}
    `;
}

function ensureTinyMCEInitialized(callback) {
    if (tinyEditorInitialized && window.tinymce && tinymce.get("html-editor")) {
        callback(tinymce.get("html-editor"));
        return;
    }

    if (!window.tinymce) {
        console.error("TinyMCE not loaded. Check script tag in index.html.");
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
        },
    });
}

function openEditorWithJson(reportJson) {
    const modal = document.getElementById("edit-report-modal");
    const feedback = document.getElementById("edit-feedback");

    if (!modal) {
        console.error("edit-report-modal not found in DOM");
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
async function loadPage(pageId) {
    console.log("Loading page:", pageId);

    if (pageId === "dashboard") {
        dashboardSection.classList.remove("hidden");
        contentArea.innerHTML = "";
        loadDashboardActivity();
        return;
    }

    dashboardSection.classList.add("hidden");

    const filePath = `${pageId}.html`;

    try {
        const res = await fetch(filePath);
        if (!res.ok) throw new Error(`Failed to fetch ${filePath}`);

        contentArea.innerHTML = await res.text();

        setTimeout(() => {
            if (pageId === "phase1") initPhase1Page();
            if (pageId === "phase2") initPhase2Page();
            if (pageId === "history") initHistoryPage();
        }, 0);
    } catch (err) {
        contentArea.innerHTML = `<p class="text-red-600">Failed to load ${pageId}. ${err.message}</p>`;
        console.error(err);
    }
}

function setActiveLink(pageId) {
    allNavElements.forEach((el) => {
        const parentLi = el.closest("li");
        el.classList.remove("text-primary", "font-semibold");
        if (parentLi) parentLi.classList.remove("bg-primary/10");

        if (el.tagName === "A" && !parentLi) {
            el.classList.remove("border-primary");
            el.classList.add("border-transparent", "text-gray-500");
        }
    });

    allNavElements
        .filter((el) => el.dataset.page === pageId)
        .forEach((el) => {
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

// ---------------------------------------------------------
// PHASE 1 INIT + TABLE
// ---------------------------------------------------------
async function initPhase1Page() {
    console.log("Phase 1 page init");

    const recordBtn = document.getElementById("start-phase1-record");
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

async function loadPhase1Table() {
    const tbody = document.querySelector("#phase1-table tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="3" class="p-2 text-center text-sm">Loading cases...</td></tr>`;

    try {
        const res = await fetch(`${API_URL}/phase1-cases`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-2 text-center text-sm">No cases found.</td></tr>`;
            return;
        }

        tbody.innerHTML = "";
        data.forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="p-2 border-b">${row.case_id}</td>
                <td class="p-2 border-b">${row.patient || "Unknown"}</td>
                <td class="p-2 border-b text-sm text-gray-600">
                    Intake ready
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to load Phase1 cases:", err);
        tbody.innerHTML = `<tr><td colspan="3" class="p-2 text-center text-red-600 text-sm">Failed to load cases: ${err.message}</td></tr>`;
    }
}

// ---------------------------------------------------------
// PHASE 2 INIT
// ---------------------------------------------------------
function initPhase2Page() {
    console.log("Phase 2 page init");

    const p2RecordBtn = document.getElementById("p2-record-btn");
    const feedbackEl = document.getElementById("phase2-feedback");

    if (feedbackEl) {
        feedbackEl.classList.add("hidden");
        feedbackEl.textContent = "";
    }

    if (p2RecordBtn) {
        p2RecordBtn.onclick = () => {
            openRecordingModal("final_assessment", "phase2-feedback");
        };
    }
}

// ---------------------------------------------------------
// HISTORY PAGE INIT (optional simple list of PDFs)
// ---------------------------------------------------------
async function initHistoryPage() {
    console.log("History page init");
    // يمكنك لاحقاً إضافة استدعاء لـ /reports إن عملته في الباك إند
}

// ---------------------------------------------------------
// DASHBOARD RECENT ACTIVITY
// ---------------------------------------------------------
async function loadDashboardActivity() {
    const tbody = document.getElementById("dashboard-activity-body");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="4" class="px-6 py-4 text-center text-sm text-gray-500">
                Loading…
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`${API_URL}/phase1-cases`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        if (!data || !data.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-4 text-center text-sm text-gray-500">
                        No recent activity.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = "";
        data.slice(-5).reverse().forEach((row) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="px-6 py-3 border-b">${row.patient || "Unknown"}</td>
                <td class="px-6 py-3 border-b text-sm">${row.case_id}</td>
                <td class="px-6 py-3 border-b text-sm">Intake Completed</td>
                <td class="px-6 py-3 border-b text-sm text-right text-gray-500">Phase 1</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to load dashboard activity:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-4 text-center text-sm text-red-600">
                    Failed to load activity: ${err.message}
                </td>
            </tr>
        `;
    }
}

// ---------------------------------------------------------
// EDITOR MODAL LOGIC (Save Final PDF)
// ---------------------------------------------------------
function initEditorModalLogic() {
    const editForm = document.getElementById("edit-report-form");
    const cancelBtn = document.getElementById("cancel-edit-modal");
    const modal = document.getElementById("edit-report-modal");
    const feedback = document.getElementById("edit-feedback");

    if (editForm) {
        editForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!window.tinymce || !tinymce.get("html-editor")) {
                console.error("TinyMCE editor not found");
                return;
            }

            if (!lastReportJson) {
                console.error("No report JSON available to export");
                return;
            }

            const editor = tinymce.get("html-editor");
            const editedHtml = editor.getContent();

            if (feedback) {
                feedback.textContent = "Generating PDF…";
                feedback.classList.remove("hidden");
            }

            try {
                const res = await fetch(`${API_URL}/generate-pdf`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        report_json: lastReportJson,
                        edited_html: editedHtml,
                    }),
                });

                if (!res.ok) {
                    const errTxt = await res.text();
                    throw new Error(errTxt);
                }

                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${lastReportJson.report_id || "report"}_final.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);

                if (feedback) {
                    feedback.textContent = "✅ PDF generated and downloaded.";
                }

                setTimeout(() => {
                    if (feedback) feedback.classList.add("hidden");
                    if (modal) modal.classList.add("hidden");
                }, 1500);
            } catch (err) {
                console.error("Failed to generate PDF:", err);
                if (feedback) {
                    feedback.textContent = `Error: ${err.message}`;
                    feedback.classList.remove("hidden");
                }
            }
        });
    }

    if (cancelBtn && modal) {
        cancelBtn.addEventListener("click", () => {
            modal.classList.add("hidden");
        });
    }
}

// ---------------------------------------------------------
// MAIN INIT
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    // NAV LINKS
    allNavElements.forEach((el) =>
        el.addEventListener("click", handleNavigationClick)
    );

    // DASHBOARD RECORD CARD
    const recordCard = document.getElementById("record-session-btn");
    if (recordCard) {
        recordCard.addEventListener("click", () => {
            // Dashboard acts as Phase 1 intake recorder
            openRecordingModal("intake", null);
        });
    }

    // RECORDING MODAL BUTTONS
    const startBtn = document.getElementById("start-record-btn");
    const stopBtn = document.getElementById("stop-record-btn");
    const closeModalBtn = document.getElementById("close-recording-modal");

    if (startBtn) startBtn.addEventListener("click", startRecording);
    if (stopBtn) stopBtn.addEventListener("click", stopRecording);
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeRecordingModal);

    // EDITOR MODAL LOGIC
    initEditorModalLogic();

    // LOAD DEFAULT PAGE
    loadPage("dashboard");
    setActiveLink("dashboard");
});
