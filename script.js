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

// phase: "intake" | "final_assessment"
let currentRecordingPhase = "intake";
let currentRecordingOutputId = null;

// Last JSON report from backend (Phase1 or Phase2)
let lastReportJson = null;

// TinyMCE
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
// RECORDING MODAL UI
// ---------------------------------------------------------
function resetRecordingUI() {
    const status = document.getElementById("recording-status");
    const timerEl = document.getElementById("recording-timer");
    const startBtn = document.getElementById("start-record-btn");
    const stopBtn = document.getElementById("stop-record-btn");
    const feedback = document.getElementById("modal-feedback");

    if (!status || !timerEl || !startBtn || !stopBtn) return;

    status.textContent = "Ready to Record";
    timerEl.classList.add("hidden");
    timerEl.textContent = "00:00";

    startBtn.classList.remove("hidden");
    stopBtn.classList.add("hidden");
    stopBtn.disabled = true;

    if (feedback) {
        feedback.classList.add("hidden");
        feedback.textContent = "";
    }

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
        console.error("recording-modal not found");
        return;
    }
    resetRecordingUI();
    modal.classList.remove("hidden");
}

function closeRecordingModal() {
    const modal = document.getElementById("recording-modal");
    if (modal) modal.classList.add("hidden");
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

    if (!status || !timerEl || !startBtn || !stopBtn) return;

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

            document.dispatchEvent(new CustomEvent("recording-complete", {
                detail: blob
            }));
        };

        mediaRecorder.start();

    } catch (err) {
        console.error("Error starting recording:", err);
        if (feedback) {
            feedback.textContent = `Error: ${err.message}`;
            feedback.classList.remove("hidden");
        }
    }
}

function stopRecording() {
    const status = document.getElementById("recording-status");
    const stopBtn = document.getElementById("stop-record-btn");

    if (!mediaRecorder || mediaRecorder.state !== "recording") {
        if (status) status.textContent = "Not recording.";
        return;
    }

    if (stopBtn) stopBtn.disabled = true;
    if (status) status.textContent = "Stopping…";
    mediaRecorder.stop();
}


// ---------------------------------------------------------
// WHEN RECORDING FINISHES
// ---------------------------------------------------------
document.addEventListener("recording-complete", (e) => {
    console.log("[script.js] recording-complete received");

    const audioBlob = e.detail;
    let outputEl = null;

    if (currentRecordingOutputId) {
        outputEl = document.getElementById(currentRecordingOutputId);
    }

    if (!outputEl) {
        // Fallback hidden div (for dashboard recording)
        outputEl = document.createElement("div");
        outputEl.style.display = "none";
        document.body.appendChild(outputEl);
    }

    uploadRecordedAudioForPhase(currentRecordingPhase, audioBlob, outputEl);
});


// ---------------------------------------------------------
// UPLOAD AUDIO → BACKEND
// ---------------------------------------------------------
async function uploadRecordedAudioForPhase(phase, audioBlob, outputEl) {
    const kb = (audioBlob.size / 1024).toFixed(1);
    outputEl.innerHTML = `<p class="text-primary">Uploading ${kb} KB for phase: ${phase}…</p>`;

    const fd = new FormData();
    fd.append("file", audioBlob, `recording_${Date.now()}.webm`);

    const endpoint = phase === "final_assessment"
        ? `${API_URL}/phase2-transcribe`
        : `${API_URL}/phase1-transcribe`;

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            body: fd
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`API Error: ${errTxt}`);
        }

        const json = await res.json();
        lastReportJson = json;

        outputEl.innerHTML = `
            <pre class="text-xs bg-gray-900 text-green-200 p-3 rounded overflow-auto max-h-80">
${JSON.stringify(json, null, 2)}
            </pre>
        `;

        closeRecordingModal();
        openEditorWithJson(json);

    } catch (err) {
        console.error("Upload failed:", err);
        outputEl.innerHTML = `<p class="text-red-600">Upload failed: ${err.message}</p>`;
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
async function loadPage(pageId) {
    console.log("Loading page:", pageId);

    if (pageId === "dashboard") {
        dashboardSection.classList.remove("hidden");
        contentArea.innerHTML = "";
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


// ---------------------------------------------------------
// PHASE 1 INIT
// ---------------------------------------------------------
async function initPhase1Page() {
    console.log("Phase 1 ready");

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


// ---------------------------------------------------------
// LOAD PHASE 1 TABLE
// ---------------------------------------------------------
// ---------------------------------------------------------
// LOAD PHASE 1 TABLE
// ---------------------------------------------------------
let selectedCaseIdForPhase2 = null;   // ✅ global to share with phase2

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
        const res = await fetch(`${API_URL}/phase1-cases`);
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
                        data-case="${row.case_id}">
                        Intake ready
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 🔗 أربط كل زر “Intake ready”
        document.querySelectorAll(".open-phase2-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const caseId = btn.dataset.case;
                console.log("Opening Phase 2 for case:", caseId);

                // خزّن الـ case_id في global
                selectedCaseIdForPhase2 = caseId;

                // انتقل لصفحة Phase 2
                loadPage("phase2");
                setActiveLink("phase2");
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



// ---------------------------------------------------------
// PHASE 2 INIT
// ---------------------------------------------------------
// ---------------------------------------------------------
// PHASE 2 INITIALIZER
// ---------------------------------------------------------
function initPhase2Page() {
    console.log("Phase 2 ready");

    const infoBanner = document.getElementById("phase2-case-info");

    // لو ما تم اختيار Case من المرحلة الأولى
    if (!selectedCaseIdForPhase2) {
        if (infoBanner) {
            infoBanner.textContent =
                "No intake case selected. Please go to Phase 1 and click 'Intake ready' for a case.";
        }
        return;
    }

    // عرض رقم الحالة في البانر
    if (infoBanner) {
        infoBanner.textContent =
            `Loaded intake case: ${selectedCaseIdForPhase2}. ` +
            `Now record the final assessment (doctor-only).`;
    }

    // لو حاب، تقدر تضيف هنا call للباك إند تجيب فيه تفاصيل الـ intake
    // ثم تعرضها في Phase 2 (اختياري حالياً)
}


// ---------------------------------------------------------
// HISTORY PAGE
// ---------------------------------------------------------
async function initHistoryPage() {
    console.log("History ready.");
    const list = document.getElementById("history-list");
    if (!list) return;

    list.innerHTML = `<p class="p-2">Loading history...</p>`;

    try {
        const res = await fetch(`${API_URL}/reports`);
        const data = await res.json();

        if (!data.reports || data.reports.length === 0) {
            list.innerHTML = `<p class="p-2">No reports found.</p>`;
            return;
        }

        list.innerHTML = data.reports.map(r => `
            <li class="p-2 border-b">
                <a href="${API_URL}/reports/${r}" target="_blank" class="text-blue-600 underline">
                    ${r}
                </a>
            </li>
        `).join("");
    } catch (err) {
        list.innerHTML = `<p class="p-2 text-red-600">Failed to load history: ${err.message}</p>`;
    }
}


// ---------------------------------------------------------
// MAIN INIT
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    // Nav
    allNavElements.forEach(el =>
        el.addEventListener("click", handleNavigationClick)
    );

    // Dashboard record button
    const dashboardRecord = document.getElementById("record-session-btn");
    if (dashboardRecord) {
        dashboardRecord.onclick = () => {
            openRecordingModal("intake", null);
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

    // Default page
    loadPage("dashboard");
    setActiveLink("dashboard");
});
