/**
 * js/app.js
 * Main application entry point.
 */

import state, { setCurrentUser, setSelectedPatientId, setConfig } from "./state.js";
import { api } from "./api.js";
import { ui } from "./ui.js";
import { byId, qs, qsa, esc, formatDate, debounce, getInitials } from "./utils.js";

// Global exports for legacy HTML onclicks
window.loadPage = loadPage;
window.state = state;

const contentArea = byId("dynamic-content");
const dashboardSection = byId("content-dashboard");

// ---------------------------------------------------------
// ROUTER & NAVIGATION
// ---------------------------------------------------------
async function loadPage(pageId, query = "") {
    console.log("Loading page:", pageId, query);

    // Update URL
    if (pageId !== "dashboard") {
        const newUrl = query ? `?page=${pageId}&${query}` : `?page=${pageId}`;
        window.history.pushState({ page: pageId, query: query }, "", newUrl);
    } else {
        window.history.pushState({ page: "dashboard" }, "", "?page=dashboard");
    }

    // Nav Guard
    const navItem = qs(`.nav-item[data-page="${pageId}"]`);
    if (navItem && navItem.classList.contains("locked")) {
        console.warn(`Blocked navigation to locked page: ${pageId}`);
        return;
    }

    // Context Cleanup
    if (pageId === "patients") {
        clearPatientContext();
    }

    // Visual Transition
    if (contentArea) {
        contentArea.classList.add("page-transitioning");
    }

    // Update Header
    const pageNames = {
        "dashboard": "Dashboard Overview",
        "patients": "Patient Registry",
        "history": "Clinical History",
        "phase1": "Initial Intake Session",
        "phase2": "Final Assessment",
        "patient-profile": "Clinical Profile",
        "configuration": "System Settings"
    };
    const headerLeft = byId("header-left-content");
    if (headerLeft) {
        let title = pageNames[pageId] || "MedEcho";
        if (state.selectedPatientId) {
            // Context Fidelity: Support deep links where patients list isn't ready
            let p = state.patients.find(p => p.id === state.selectedPatientId);
            if (!p) {
                try {
                    p = await api.getPatient(state.selectedPatientId);
                    if (p) state.patients.push(p);
                } catch (e) { console.warn("Header context fail", e); }
            }
            if (p) {
                title = `<span class="text-xs font-medium text-slate-500 block mb-0.5">Patient: ${esc(p.name)}</span> ${title}`;
            }
        }
        headerLeft.innerHTML = `<h2 class="text-xl font-bold text-slate-900 dark:text-white animate-in fade-in">${title}</h2>`;
    }

    ui.setActiveLink(pageId);

    // Dashboard Special Case
    if (pageId === "dashboard") {
        setTimeout(() => {
            if (dashboardSection) dashboardSection.classList.remove("hidden");
            if (contentArea) {
                contentArea.innerHTML = "";
                contentArea.classList.remove("page-transitioning");
            }
            initDashboardPage();
        }, 300);
        return;
    }

    if (dashboardSection) dashboardSection.classList.add("hidden");

    const filePath = `pages/${pageId}.html`;

    try {
        // Fetch HTML
        const res = await fetch(filePath);
        if (!res.ok) throw new Error(`Failed to fetch ${filePath}`);
        const html = await res.text();

        // Small delay to allow transition to "breathe"
        setTimeout(() => {
            if (contentArea) {
                contentArea.innerHTML = html;
                contentArea.classList.remove("page-transitioning");
                contentArea.classList.add("animate-in", "fade-in", "slide-in-from-bottom-2");
                // Remove animation classes after they finish to avoid conflicts
                setTimeout(() => contentArea.classList.remove("animate-in", "fade-in", "slide-in-from-bottom-2"), 500);
            }

            // Init Page Logic
            switch (pageId) {
                case "phase1": initPhase1Page(); break;
                case "phase2": initPhase2Page(); break;
                case "history": initHistoryPage(); break;
                case "patients": initPatientsPage(); break;
                case "patient-profile": initPatientProfilePage(); break;
                case "configuration": initConfigurationPage(); break;
            }
        }, 150);

    } catch (err) {
        console.error(err);
        if (contentArea) {
            contentArea.classList.remove("page-transitioning");
            ui.showError(contentArea, err.message);
        }
    }
}

function clearPatientContext() {
    setSelectedPatientId(null);
    state.currentStage1Status = "not_started";
    state.currentStage2Status = "locked"; // Simplified for local usage
    ui.updateSidebar(null, "not_started", "locked");
}

// ---------------------------------------------------------
// PAGE INITS
// ---------------------------------------------------------

// --- DASHBOARD ---
async function initDashboardPage() {
    const activityBody = byId("dash-activity-body");

    // Bindings
    byId("dashboard-new-session")?.addEventListener("click", () => loadPage("patients"));
    byId("dash-open-history")?.addEventListener("click", () => loadPage("history"));

    // Load Data
    try {
        const reports = await api.listReports();

        // Cards
        const countEl = byId("dash-recent-reports");
        if (countEl) countEl.textContent = reports?.length ?? 0;

        const todayEl = byId("dash-today-sessions");
        if (todayEl) {
            const now = new Date();
            const todayCount = (reports || []).filter(r => {
                if (!r.date || r.date === "N/A") return false;
                const d = new Date(r.date);
                return d.getDate() === now.getDate() &&
                    d.getMonth() === now.getMonth() &&
                    d.getFullYear() === now.getFullYear();
            }).length;
            todayEl.textContent = todayCount;
        }

        // Activity
        const last5 = (reports || []).slice(-5).reverse();
        if (activityBody) {
            if (!last5.length) {
                activityBody.innerHTML = `<tr><td class="px-6 py-6 text-sm text-slate-500" colspan="4">No activity yet.</td></tr>`;
            } else {
                activityBody.innerHTML = last5.map(r => {
                    const t = r.date ? new Date(r.date).toLocaleString() : "—";
                    return `
                      <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                        <td class="px-6 py-4">
                          <div class="font-semibold text-slate-900 dark:text-white">${esc(r.patient || "Unknown")}</div>
                          <div class="text-xs text-slate-500">${esc(r.reportId || "—")}</div>
                        </td>
                        <td class="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">${t}</td>
                        <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs bg-slate-100">${esc(r.phase || "—")}</span></td>
                        <td class="px-6 py-4 text-right">
                            <button class="text-primary hover:underline dashboard-continue-btn" data-report="${r.reportId}">Continue</button>
                        </td>
                      </tr>
                    `;
                }).join("");
                qsa(".dashboard-continue-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const rid = btn.dataset.report;
                        const r = last5.find(item => item.reportId === rid);
                        if (r && r.patient_id) {
                            selectPatient(r.patient_id);
                        } else {
                            loadPage("history");
                        }
                    });
                });
            }
        }
    } catch (e) {
        console.error("Dash load error", e);
    }

    // ──────── Dashboard — Opportunity #4 ─────────────────────────────────────────
    const dbStartBtn = byId("dashboard-start-recording");
    if (dbStartBtn) {
        dbStartBtn.onclick = () => {
            loadPage("patients");
            ui.showToast("Select or search for a patient to start their clinical session", "info");
        };
    }
}

// --- PATIENTS ---
async function initPatientsPage() {
    const tbody = byId("patients-table-body");
    const searchEl = byId("patients-search");

    async function load() {
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center">Loading...</td></tr>`;
        try {
            const patients = await api.getPatients();
            const q = (searchEl?.value || "").trim().toLowerCase();
            const filtered = patients.filter(p => !q || (p.name || "").toLowerCase().includes(q) || (p.id || "").includes(q));

            if (!filtered.length) {
                tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No patients found.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(p => `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 group transition-colors">
                  <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            ${esc(getInitials(p.name))}
                        </div>
                        <div>
                            <div class="font-semibold text-slate-900 dark:text-white">${esc(p.name)}</div>
                            <div class="text-xs text-slate-500 font-mono">${esc(p.id)}</div>
                        </div>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                    ${esc(p.age)}
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                    ${esc(p.gender || p.sex || "-")}
                  </td>
                  <td class="px-6 py-4">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Active
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-slate-500">
                    —
                  </td>
                  <td class="px-6 py-4 text-right">
                    <button class="px-3 py-1.5 bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors view-patient-btn shadow-sm" data-id="${p.id}">
                        View
                    </button>
                  </td>
                </tr>
            `).join("");

            qsa(".view-patient-btn").forEach(btn => {
                btn.addEventListener("click", () => selectPatient(btn.dataset.id));
            });

        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Error: ${e.message}</td></tr>`;
        }
    }

    searchEl?.addEventListener("input", debounce(load, 300));
    load(); // Initial load

    // Add Patient Drawer
    // ROBUST DRAWER LOGIC
    const getDrawerElements = () => ({
        drawer: byId("add-patient-drawer"),
        panel: byId("add-patient-panel"),
        form: byId("add-patient-form")
    });

    const closeDrawer = () => {
        const { drawer, panel } = getDrawerElements();
        if (panel) panel.classList.add("translate-x-full");
        setTimeout(() => {
            if (drawer) drawer.classList.add("hidden");
        }, 300);
    };

    const openBtn = byId("open-add-patient");
    if (openBtn) {
        // Remove old listeners if possible (though difficult with anonymous funcs, creating new scope helps)
        openBtn.onclick = () => {
            console.log("Add Patient Clicked");
            const { drawer, panel } = getDrawerElements();

            if (!drawer || !panel) {
                console.error("Critical: Drawer elements not found!", { drawer, panel });
                return;
            }

            drawer.classList.remove("hidden");
            // Force reflow
            void drawer.offsetWidth;

            setTimeout(() => {
                panel.classList.remove("translate-x-full");
            }, 50); // Increased delay slightly for safety
        };
    } else {
        console.warn("Open Add Patient button not found");
    }

    byId("close-add-patient")?.addEventListener("click", closeDrawer);
    byId("cancel-add-patient")?.addEventListener("click", closeDrawer);

    const { form } = getDrawerElements();
    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            id: byId("patient-id").value.trim(),
            name: byId("patient-name").value.trim(),
            age: Number(byId("patient-age").value),
            gender: byId("patient-sex").value
        };
        try {
            const res = await api.createPatient(payload);
            const newId = res.patient?.id || payload.id;
            
            ui.showToast(`Patient "${payload.name}" registered successfully!`, "success");
            
            form.reset();
            closeDrawer();
            
            // Direct Navigation: Go to the new profile instead of staying on the list
            if (newId) {
                selectPatient(newId);
            } else {
                load();
            }
        } catch (err) {
            ui.showToast(err.message, "error");
        }
    });
}

async function selectPatient(id) {
    setSelectedPatientId(id);
    // Fetch state to update sidebar
    try {
        const data = await api.getPatient(id);
        
        // Ensure patient is in local state for header breadcrumbs
        if (!state.patients.find(p => p.id === id)) {
            state.patients.push(data);
        }
        const s1 = data.stage1Status || "not_started";
        const s2 = data.stage2Status || "locked";
        
        ui.updateSidebar(id, s1, s2);
        loadPage("patient-profile");
    } catch (e) {
        console.error("Failed to fetch patient state", e);
        loadPage("patient-profile"); // Try anyway
    }
}

// --- PATIENT PROFILE ---
async function initPatientProfilePage() {
    const pid = state.selectedPatientId;
    if (!pid) {
        contentArea.innerHTML = `<p class="text-red-600">No patient selected.</p>`;
        return;
    }

    // Breadcrumb
    qsa("[data-go='patients']").forEach(el => el.onclick = () => loadPage("patients"));
    const backBtn = byId("patient-back-btn");
    if (backBtn) backBtn.onclick = () => loadPage("patients");

    // Fetch Data
    let patient = null;
    try {
        const data = await api.getPatient(pid);
        patient = data.patient || data;
    } catch (e) {
        // Fallback or error
        patient = { id: pid, name: "Unknown" };
    }

    // Render Basic Info
    const renderStr = (id, val) => { const el = byId(id); if (el) el.textContent = val; };
    renderStr("patient-name", patient.name);
    renderStr("patient-breadcrumb-name", patient.name);
    renderStr("patient-id", `#${patient.id}`);
    renderStr("patient-summary-id", `#${patient.id}`);

    // Fix: Backend uses snake_case 'created_at'
    const createdDate = patient.created_at || patient.createdAt;
    renderStr("patient-summary-date", createdDate ? new Date(createdDate).toLocaleDateString() : "Unknown");

    renderStr("patient-meta", `Age: ${patient.age || "Unknown"} • Gender: ${patient.gender || "Unknown"}`);

    // ---- AI Diagnosis Logic ----
    const diagContainer = byId("patient-diagnosis-container");
    const diagBtn = byId("patient-generate-diag-btn");
    const diagBtnText = byId("diag-btn-text");

    const renderDiagnosis = (diagnosisArray) => {
        if (!diagContainer) return;
        if (diagnosisArray && !Array.isArray(diagnosisArray) && typeof diagnosisArray === "object" && diagnosisArray.condition) {
            diagnosisArray = [diagnosisArray]; // Coerce single object to array
        }

        if (!diagnosisArray || !diagnosisArray.length) {
            diagContainer.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400 italic">No diagnosis generated yet. Click generate to analyze patient history via Ollama.</p>`;
            return;
        }

        diagContainer.innerHTML = diagnosisArray.map(d => {
            const conf = (d.confidence || "low").toLowerCase();
            const color = conf === "high" ? "rose" : (conf === "moderate" ? "amber" : "slate");
            return `
                <div class="flex items-start justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined text-${color}-500 text-base">emergency</span>
                        <span class="font-medium text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap">${esc(d.condition || "Unknown")}</span>
                    </div>
                    <span class="text-xs px-2 py-0.5 mt-0.5 rounded border border-${color}-200 bg-${color}-50 text-${color}-600 dark:border-${color}-800 dark:bg-${color}-900/30 dark:text-${color}-400 font-semibold uppercase tracking-wider">${esc(d.confidence || "Low")}</span>
                </div>
            `;
        }).join("");
    };

    // Initial render
    renderDiagnosis(patient.ai_diagnosis);

    if (diagBtn) {
        diagBtn.disabled = false;
        diagBtn.onclick = async () => {
            diagBtn.disabled = true;
            if (diagBtnText) diagBtnText.textContent = "Analyzing...";
            const icon = diagBtn.querySelector(".material-symbols-outlined");
            if (icon) {
                icon.textContent = "sync";
                icon.classList.add("animate-spin");
            }

            try {
                const res = await api.generateAiDiagnosis(pid);
                if (res.status === "no_reports") {
                    ui.showToast("No medical reports found to analyze.", "warning");
                } else if (res.status === "success" && res.diagnosis) {
                    ui.showToast("AI Diagnosis generated locally!", "success");
                    renderDiagnosis(res.diagnosis);
                    patient.ai_diagnosis = res.diagnosis;
                }
            } catch (err) {
                ui.showToast("Failed to generate diagnosis: " + err.message, "error");
            } finally {
                diagBtn.disabled = false;
                if (diagBtnText) diagBtnText.textContent = "Generate";
                if (icon) {
                    icon.textContent = "temp_preferences_custom";
                    icon.classList.remove("animate-spin");
                }
            }
        };
    }


    // Tab Logic
    const tabs = qsa(".patient-tab");
    tabs.forEach(tab => {
        tab.onclick = () => {
            // Reset all
            tabs.forEach(t => t.className = "patient-tab text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer px-1");
            qsa('[id^="tab-"]').forEach(s => s.classList.add("hidden"));

            // Set active
            tab.className = "patient-tab font-medium text-primary border-b-2 border-primary pb-2 cursor-pointer px-1";
            const target = byId(`tab-${tab.dataset.tab}`);
            if (target) target.classList.remove("hidden");
        };
    });

    // Issue #13: Real-time patient avatar initials
    const avatar = qs(".patient-avatar-initials");
    if (avatar) avatar.textContent = getInitials(patient.name);

    // Issue #7: Notes Logic (Migrating from localStorage to Backend)
    const notesInput = byId("patient-notes-input");
    if (notesInput) {
        // Load from server data instead of localStorage
        notesInput.value = patient.notes || "";
        
        // Debounced save to backend
        let saveTimeout;
        notesInput.oninput = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                try {
                    await api.updatePatient(pid, { notes: notesInput.value });
                    console.log("Notes autosaved to backend.");
                } catch (e) {
                    console.error("Failed to save notes:", e);
                }
            }, 1000);
        };
    }

    // Logic for Hero Buttons
    const s1 = patient.stage1Status || "not_started";
    const s2 = patient.stage2Status || "locked";

    const hero = byId("patient-hero-action");
    if (hero) {
        if (s1 === "completed" && s2 !== "completed") {
            hero.innerHTML = `<button id="btn-continue" class="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold">Continue to Assessment</button>`;
            byId("btn-continue").onclick = () => openRecordingModal("final_assessment");
        } else if (s2 === "completed") {
            hero.innerHTML = `<button id="btn-new" class="px-5 py-3 rounded-xl bg-slate-200 text-slate-700 font-semibold">New Session</button>`;
            byId("btn-new").onclick = () => openRecordingModal("intake");
        } else {
            hero.innerHTML = `<button id="btn-new" class="px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold">New Clinical Session</button>`;
            byId("btn-new").onclick = () => openRecordingModal("intake");
        }
    }

    // Edit/Delete Logic (Edit drawer same pattern as Add)
    // Edit/Delete Logic
    const editBtn = byId("patient-edit-btn");
    if (editBtn) editBtn.onclick = () => {
        const d = byId("edit-patient-drawer");
        const p = byId("edit-patient-panel");
        const idInput = byId("edit-patient-id");
        const nameInput = byId("edit-patient-name");
        const ageInput = byId("edit-patient-age");
        const sexInput = byId("edit-patient-sex");

        if (idInput) idInput.value = patient.id || "";
        if (nameInput) nameInput.value = patient.name || "";
        if (ageInput) ageInput.value = patient.age || "";
        if (sexInput) sexInput.value = patient.gender || "";

        if (d) d.classList.remove("hidden");
        setTimeout(() => {
            if (p) p.classList.remove("translate-x-full");
            if (nameInput) nameInput.focus();
        }, 50);
    };

    const closeEdit = () => {
        const p = byId("edit-patient-panel");
        const d = byId("edit-patient-drawer");
        if (p) p.classList.add("translate-x-full");
        setTimeout(() => { if (d) d.classList.add("hidden"); }, 300);
    };

    const closeEditBtn = byId("close-edit-patient");
    if (closeEditBtn) closeEditBtn.onclick = closeEdit;

    const cancelEditBtn = byId("cancel-edit-patient");
    if (cancelEditBtn) cancelEditBtn.onclick = closeEdit;

    const editForm = byId("edit-patient-form");
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const payload = {
                name: byId("edit-patient-name").value.trim(),
                age: Number(byId("edit-patient-age").value),
                gender: byId("edit-patient-sex").value
            };

            const submitBtn = editForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = "<span>Saving...</span>";
            }

            try {
                await api.updatePatient(pid, payload);
                const feedback = byId("edit-patient-feedback");
                if (feedback) feedback.classList.remove("hidden");

                setTimeout(() => {
                    closeEdit();
                    initPatientProfilePage(); // Reload visual data
                }, 800);
            } catch (err) {
                alert(`Failed to update: ${err.message}`);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = "<span>Save Changes</span>";
                }
            }
        };
    }

    byId("patient-delete-btn")?.addEventListener("click", async () => {
        if (confirm("Delete patient?")) {
            try {
                await api.deletePatient(pid);
                loadPage("patients");
            } catch (e) { ui.showToast("Deletion failed: " + e.message, "error"); }
        }
    });

    // Reports & Sessions List & Documents
    const reportsBody = byId("patient-reports-body");
    const sessionsBody = byId("patient-sessions-body");
    const sessionsCount = byId("patient-sessions-count");
    const docsList = byId("patient-docs-list");

    // Upload Logic
    const uploadBtn = byId("patient-upload-btn");
    const uploadInput = byId("patient-upload-input");

    if (uploadBtn && uploadInput) {
        // Remove old listeners (clone node trick or just reassign onclick)
        uploadBtn.onclick = () => uploadInput.click();

        uploadInput.onchange = async () => {
            if (!uploadInput.files.length) return;
            const file = uploadInput.files[0];
            const fd = new FormData();
            fd.append("file", file);

            // Show loading state in docs list
            if (docsList) docsList.innerHTML = `<p class="text-sm text-slate-500 animate-pulse">Uploading...</p>`;

            try {
                await api.uploadDocument(pid, fd);
                uploadInput.value = ""; // Reset
                initPatientProfilePage(); // Reload to refresh list
                ui.showToast("Document uploaded successfully", "success");
            } catch (e) {
                console.error(e);
                ui.showToast("Upload failed: " + e.message, "error");
                initPatientProfilePage(); // Reload to restore list
            }
        };
    }

    if (reportsBody || sessionsBody || docsList) {
        try {
            const [reports, documents] = await Promise.all([
                api.listReports(pid).catch(() => []),
                api.getPatientDocuments(pid).catch(() => [])
            ]);

            if (sessionsCount) sessionsCount.textContent = `(${reports.length})`;

            // 1. Reports Tab
            if (reportsBody) {
                if (!reports.length) reportsBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No reports found.</td></tr>`;
                else {
                    reportsBody.innerHTML = reports.map(r => `
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 text-sm">
                            <td class="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">${esc(r.reportId)}</td>
                            <td class="px-4 py-3 capitalize">${esc(r.phase)}</td>
                            <td class="px-4 py-3">${new Date(r.date).toLocaleDateString()}</td>
                            <td class="px-4 py-3 text-right">
                                 ${r.downloadUrl ? `<a href="${r.downloadUrl}" target="_blank" class="text-primary hover:underline">PDF</a>` : `<span class="text-xs text-slate-400">Processing</span>`}
                            </td>
                        </tr>
                    `).join("");
                }
            }

            // 2. Sessions Tab
            if (sessionsBody) {
                if (!reports.length) sessionsBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No sessions recorded.</td></tr>`;
                else {
                    sessionsBody.innerHTML = reports.map(r => `
                        <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 text-sm">
                            <td class="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">${esc(r.reportId)}</td>
                            <td class="px-4 py-3 capitalize">${esc(r.phase)}</td>
                             <td class="px-4 py-3">
                                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  Completed
                                </span>
                            </td>
                            <td class="px-4 py-3 text-right">
                                <button class="text-slate-400 hover:text-primary transition-colors" onclick="openEditorWithJson(${JSON.stringify(r).replace(/"/g, '&quot;')})">
                                    <span class="material-symbols-outlined text-lg">edit_document</span>
                                </button>
                            </td>
                        </tr>
                    `).join("");
                }
            }

            // 3. Documents (Right Sidebar) - MERGED
            if (docsList) {
                // Normalize Reports to Doc format
                const reportDocs = reports.map(r => ({
                    type: "report",
                    name: r.phase === "intake" ? "Intake Report" : "Medical Assessment",
                    date: r.date,
                    url: r.downloadUrl || "#",
                    meta: r.phase,
                    icon: r.downloadUrl ? "picture_as_pdf" : "description",
                    color: r.downloadUrl ? "red" : "amber",
                    report: r // Keep ref
                }));

                // Normalize Uploaded Docs
                const uploadedDocs = documents.map(d => ({
                    type: "upload",
                    name: d.name,
                    date: d.created_at,
                    url: d.url,
                    meta: "Uploaded",
                    icon: "upload_file",
                    color: "blue"
                }));

                const allDocs = [...reportDocs, ...uploadedDocs].sort((a, b) => new Date(b.date) - new Date(a.date));

                if (!allDocs.length) {
                    docsList.innerHTML = `<p class="text-sm text-slate-500">No documents yet.</p>`;
                } else {
                    docsList.innerHTML = allDocs.map(d => `
                        <a href="${d.url}" ${d.url !== "#" ? 'target="_blank"' : ''} 
                           class="doc-item-link block p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group cursor-pointer"
                           data-type="${d.type}"
                        >
                           <div class="flex items-center gap-3">
                             <div class="p-2 rounded-lg bg-${d.color}-100 text-${d.color}-600 dark:bg-${d.color}-900/20 dark:text-${d.color}-400">
                               <span class="material-symbols-outlined text-xl">${d.icon}</span>
                             </div>
                             <div class="min-w-0">
                               <p class="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-primary transition-colors truncate">${esc(d.name)}</p>
                               <p class="text-xs text-slate-500">${new Date(d.date).toLocaleDateString()} • ${esc(d.meta)}</p>
                             </div>
                           </div>
                        </a>
                    `).join("");

                    // Bind click for non-PDF reports
                    const links = docsList.querySelectorAll(".doc-item-link");
                    links.forEach((el, idx) => {
                        const doc = allDocs[idx];
                        if (doc.type === "report" && doc.url === "#") {
                            el.addEventListener("click", async (e) => {
                                e.preventDefault();
                                if (doc.report && doc.report.reportId) {
                                    ui.showToast("Loading report details...", "info");
                                    try {
                                        const fullReport = await api.getReportDetails(doc.report.reportId);
                                        openEditorWithJson(fullReport);
                                    } catch (err) {
                                        console.error("Failed to load report details", err);
                                        ui.showToast("Failed to load report: " + err.message, "error");
                                        // Fallback to what we have?
                                        // openEditorWithJson(doc.report); 
                                    }
                                }
                            });
                        }
                    });
                }
            }

        } catch (e) { console.error(e); }
    }
}

// --- RECORDING MODAL LOGIC ---
let mediaRecorder = null;
let recordingTimer = null;
let recordingSeconds = 0;
let recordedChunks = [];
let finalAudioBlob = null;
let currentPhase = "intake";

function openRecordingModal(phase = 'intake') {
    // Issue #10: Guard — never allow recording if no patient is context-selected
    if (!state.selectedPatientId) {
        ui.showToast("No patient selected. Please select a patient first.", "warning");
        loadPage("patients");
        return;
    }

    currentPhase = phase;
    const modal = byId("recording-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    ui.setRecordingState("IDLE");

    // Initialize Audio Context for Visualizer (Issue #20)
    if (!state.audioContext) {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Bind buttons
    byId("start-record-btn").onclick = startRecording;
    byId("stop-record-btn").onclick = stopRecording;
    byId("close-recording-modal").onclick = closeRecordingModal;
    byId("upload-btn").onclick = uploadRecording;

    // New bindings for missing actions
    const pauseBtn = byId("pause-record-btn");
    const resumeBtn = byId("resume-record-btn");
    const retakeBtn = byId("retake-btn");
    if (pauseBtn) pauseBtn.onclick = pauseRecording;
    if (resumeBtn) resumeBtn.onclick = resumeRecording;
    if (retakeBtn) retakeBtn.onclick = retakeRecording;
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        recordingSeconds = 0;

        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.start();

        ui.setRecordingState("RECORDING");
        
        // Issue #20: Real-time Audio Visualizer Implementation
        if (state.audioContext.state === 'suspended') {
            await state.audioContext.resume();
        }
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 256;
        const source = state.audioContext.createMediaStreamSource(stream);
        source.connect(state.analyser);
        
        renderVisualizer(); // Start the loop

        recordingTimer = setInterval(() => {
            recordingSeconds++;
            if (byId("recording-timer")) byId("recording-timer").textContent = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`;
        }, 1000);

    } catch (e) {
        ui.showToast("Mic Error: " + e.message, "error");
        console.error(e);
    }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.onstop = () => {
            finalAudioBlob = new Blob(recordedChunks, { type: "audio/webm" });
            if (recordingTimer) clearInterval(recordingTimer);

            // Preview
            const url = URL.createObjectURL(finalAudioBlob);
            const player = byId("audio-preview-player");
            if (player) player.src = url;

            ui.setRecordingState("REVIEW");
            // Stop tracks
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
        };
    }
}

function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.pause();
        ui.setRecordingState("PAUSED");
        if (recordingTimer) clearInterval(recordingTimer);
    }
}

function resumeRecording() {
    if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
        ui.setRecordingState("RECORDING");
        // Resume timer
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            if (byId("recording-timer")) byId("recording-timer").textContent = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`;
        }, 1000);
    }
}

function renderVisualizer() {
    if (!state.analyser || ui.getRecordingState() !== "RECORDING") return;

    const bufferLength = state.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    state.analyser.getByteFrequencyData(dataArray);

    const bars = qsa(".viz-bar");
    if (bars.length > 0) {
        // We have 6 bars. Pick some frequencies to show.
        const indices = [5, 15, 25, 35, 45, 55];
        bars.forEach((bar, i) => {
            const val = dataArray[indices[i]] || 0;
            const h = Math.max(4, (val / 255) * 44); // Max 40px height approx
            bar.style.height = `${h}px`;
            bar.style.opacity = 0.3 + (val / 255) * 0.7;
        });
    }

    requestAnimationFrame(renderVisualizer);
}

function retakeRecording() {
    finalAudioBlob = null;
    recordedChunks = [];
    recordingSeconds = 0;
    const player = byId("audio-preview-player");
    if (player) player.src = "";
    ui.setRecordingState("IDLE");
}

async function uploadRecording() {
    if (!finalAudioBlob) return;
    ui.setRecordingState("UPLOADING");

    const fd = new FormData();
    fd.append("file", finalAudioBlob, "rec.webm");
    fd.append("patient_id", state.selectedPatientId);
    
    // Explicitly pass the selected Phase 1 case ID so backend doesn't have to guess
    if (currentPhase === "final_assessment" && state.selectedCaseIdForPhase2) {
        fd.append("intake_id", state.selectedCaseIdForPhase2);
    }

    try {
        const res = await api.transcribe(fd, currentPhase, (percent) => {
            ui.updateUploadProgress(percent);
        });
        
        const reportJson = res.report ?? res;
        
        // Issue #6 Enhancement: Ensure context-selected case survives navigation
        if (currentPhase === "intake" && reportJson.report_id) {
            state.selectedCaseIdForPhase2 = reportJson.report_id;
        }

        // Handover Transition: Coordinate the modal swap
        ui.handoverToEditor(() => {
            openEditorWithJson(reportJson);
        });

        if (state.selectedPatientId) selectPatient(state.selectedPatientId);

    } catch (e) {
        ui.showToast("Transcription Failed: " + e.message, "error");
        ui.setRecordingState("REVIEW");
    }
}

function closeRecordingModal() {
    const modal = byId("recording-modal");
    if (modal) modal.classList.add("hidden");

    // Issue #25: Immediate MediaStream release
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    
    // Explicitly kill all mic tracks immediately
    if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => {
            t.stop();
        });
    }

    if (recordingTimer) clearInterval(recordingTimer);
    retakeRecording();
}


// --- OTHER PAGES (Stubs for brevity, logic similar) ---
// --- PHASE 1 ---
async function initPhase1Page() {
    // Record Button Logic
    const recordBtn = qs("#dynamic-content #start-phase1-record") || qs("#record-session-btn");
    if (recordBtn) {
        recordBtn.onclick = () => openRecordingModal("intake");
    }

    // Upload Logic
    const uploadBtn = byId("upload-btn");
    const audioInput = byId("audioInput");
    const outputEl = byId("phase1-output");

    if (uploadBtn && audioInput && outputEl) {
        uploadBtn.onclick = async () => {
            if (!audioInput.files.length) {
                outputEl.innerHTML = `<p class="text-red-600">Select file first!</p>`;
                return;
            }
            const fd = new FormData();
            fd.append("file", audioInput.files[0]);
            fd.append("patient_id", state.selectedPatientId);

            try {
                outputEl.innerHTML = "Uploading... 0%";
                await api.transcribe(fd, "intake", (pct) => {
                    outputEl.innerHTML = `Uploading... ${Math.round(pct)}%`;
                });
                outputEl.innerHTML = "<span class='text-green-600'>Success</span>";
                loadPage("patient-profile");
            } catch (e) {
                outputEl.innerHTML = `<span class='text-red-600'>${e.message}</span>`;
            }
        };
    }

    // Table Logic
    const tbody = qs("#phase1-table tbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="3" class="p-2 text-center">Loading cases...</td></tr>`;

    try {
        const cases = await api.getPhase1Cases(state.selectedPatientId);

        if (!cases || !cases.length) {
            tbody.innerHTML = `<tr><td colspan="3" class="p-2 text-center text-slate-500">No intake reports found.</td></tr>`;
            return;
        }

        tbody.innerHTML = cases.map(row => `
            <tr>
                <td class="p-2 border-b font-mono text-xs">${row.case_id}</td>
                <td class="p-2 border-b">${row.patient || "N/A"}</td>
                <td class="p-2 border-b">
                    <button class="open-phase2-btn inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all" data-case="${row.case_id}" data-patient="${row.patient_id}">
                        Start Assessment
                    </button>
                </td>
            </tr>
        `).join("");

        qsa(".open-phase2-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const pid = btn.dataset.patient;

                // 1. Ensure context
                if (pid && pid !== state.selectedPatientId) {
                    setSelectedPatientId(pid);
                }

                // 2. Set Case
                state.selectedCaseIdForPhase2 = btn.dataset.case;

                // 3. Optimistic Unlock
                // We manually force the UI to unlock Phase 2 to avoid race conditions with async fetches
                ui.updateSidebar(state.selectedPatientId, "completed", "available");

                // Double check: Force remove locked class directly to ensure navigation works
                const nav = qs('.nav-item[data-page="phase2"]');
                if (nav) nav.classList.remove("locked");

                // 4. Navigate
                loadPage("phase2");
            });
        });

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-2 text-center text-red-500">Error: ${e.message}</td></tr>`;
    }
}

// --- PHASE 2 ---
function initPhase2Page() {
    const info = byId("phase2-case-info");
    if (!state.selectedCaseIdForPhase2) {
        if (info) info.textContent = "No intake case selected. Go to Phase 1.";
        return;
    }
    if (info) info.textContent = `Case: ${state.selectedCaseIdForPhase2}`;

    const btn = byId("start-phase2-record");
    if (btn) btn.onclick = () => openRecordingModal("final_assessment");
}

// --- HISTORY ---
function initHistoryPage() {
    const tbody = byId("history-table-body");
    const searchEl = byId("history-search"); // Assuming this might exist or we can add it
    if (!tbody) return;

    tbody.innerHTML = `<tr><td class="px-6 py-4">Loading clinical history...</td></tr>`;

    // Issue #14: Fetch ALL reports by default instead of filtering by current patient
    api.listReports(null).then(reports => {
        let filtered = reports;
        const render = (data) => {
            if (!data.length) {
                tbody.innerHTML = `<tr><td class="px-6 py-4 text-gray-500">No matching reports found.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.map(r => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-6 py-4">
                        <div class="font-medium text-slate-900">${esc(r.patient)}</div>
                        <div class="text-xs text-slate-500 font-mono">${esc(r.patient_id)}</div>
                    </td>
                    <td class="px-6 py-4 text-slate-600 font-mono text-xs">${esc(r.reportId)}</td>
                    <td class="px-6 py-4 text-sm">${formatDate(r.date)}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-bold uppercase tracking-wider">${esc(r.phase)}</span></td>
                    <td class="px-6 py-4 text-right">
                        ${r.downloadUrl ? `<a href="${r.downloadUrl}" target="_blank" class="text-primary hover:underline font-medium">Download PDF</a>` : `<span class="italic text-gray-400">Draft</span>`}
                    </td>
                </tr>
            `).join("");
        };

        render(filtered);

        // Sidebar style filter logic if needed, or simple search
        if (searchEl) {
            searchEl.oninput = () => {
                const q = searchEl.value.toLowerCase();
                const matched = reports.filter(r => 
                    r.patient.toLowerCase().includes(q) || 
                    r.reportId.toLowerCase().includes(q)
                );
                render(matched);
            };
        }
    }).catch(e => {
        tbody.innerHTML = `<tr><td class="px-6 py-4 text-red-600">Error: ${e.message}</td></tr>`;
    });
}

// --- ANALYSIS DASHBOARD ---
function updateAnalysisDashboard(usageLogs) {
    if (!usageLogs || !usageLogs.length) return;

    // 1. Total Tokens
    const totalTokens = usageLogs.reduce((acc, log) => acc + (log.tokens_total || 0), 0);
    const totEl = document.getElementById("stats-total-tokens");
    if (totEl) totEl.textContent = totalTokens.toLocaleString();

    // 2. Est Cost - Issue #17: Model-specific pricing
    const getPricePerMillion = (model) => {
        const m = (model || "").toLowerCase();
        if (m.includes("gpt-4o-mini")) return 0.15;
        if (m.includes("gpt-4o")) return 2.50; // blended approx
        if (m.includes("gpt-4-turbo")) return 10.0;
        if (m.includes("gemini-1.5-flash")) return 0.10;
        if (m.includes("gemini-1.5-pro")) return 3.50;
        if (m.includes("ollama")) return 0.0;
        return 5.0; // generic fallback
    };
    
    const totalCost = usageLogs.reduce((acc, log) => {
        const rate = getPricePerMillion(log.model);
        return acc + (log.tokens_total / 1_000_000) * rate;
    }, 0);

    const estEl = document.getElementById("stats-est-cost");
    if (estEl) estEl.textContent = `$${totalCost.toFixed(4)}`;

    // 3. Avg Speed
    const totalTime = usageLogs.reduce((acc, log) => acc + (log.duration_total_ms || 0), 0);
    const avgTime = usageLogs.length ? (totalTime / usageLogs.length / 1000).toFixed(1) : "0";
    const avgEl = document.getElementById("stats-avg-speed");
    if (avgEl) avgEl.textContent = `${avgTime}s`;

    // 4. Chart (Timeline breakdown)
    const chartContainer = document.getElementById("speed-breakdown-chart");
    if (!chartContainer) return;
    chartContainer.innerHTML = "";

    // Take last 5 logs
    const recent = usageLogs.slice(-5).reverse();

    recent.forEach(log => {
        const transTime = (log.duration_transcription_ms || 0) / 1000;
        const llmTime = (log.duration_llm_ms || 0) / 1000;
        const total = (log.duration_total_ms || 0) / 1000;

        // Calculate percentages for bar width
        const pTrans = total > 0 ? (transTime / total) * 100 : 0;
        const pLLM = total > 0 ? (llmTime / total) * 100 : 0;

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

// --- CONFIGURATION ---
async function initConfigurationPage() {
    const apiUrlInput = byId("config-api-url");
    const openaiKeyInput = byId("config-openai-key");
    const googleKeyInput = byId("config-google-key");
    const transProviderSelect = byId("config-transcription-provider");
    const llmProviderSelect = byId("config-llm-provider");
    const llmModelSelect = byId("config-llm-model");
    const maxTokensInput = byId("config-max-tokens");
    const temperatureInput = byId("config-temperature");
    const ollamaUrlInput = byId("config-ollama-url");

    let currentConfig = {};

    // Load Config
    let usageLogs = [];
    try {
        const [conf, usage] = await Promise.all([
            api.getConfig(),
            api.getUsageStats().catch(() => [])
        ]);
        currentConfig = conf;
        usageLogs = usage || [];
        state.config = currentConfig;

        // ── API key fields: never show raw key, show visual indicator instead ───────────
        // The backend returns '__MASKED__' if a key is configured.
        // We display a placeholder and track whether the user edits the field.
        const KEY_CONFIGURED_PLACEHOLDER = "Key configured ✔";
        const MASKED_SENTINEL = "__MASKED__";

        function applyKeyFieldState(inputEl, serverValue) {
            if (!inputEl) return;
            if (serverValue === MASKED_SENTINEL) {
                inputEl.value = "";
                inputEl.placeholder = KEY_CONFIGURED_PLACEHOLDER;
                inputEl.dataset.wasConfigured = "true";
            } else {
                inputEl.value = serverValue || "";
                inputEl.placeholder = "Paste your API key here...";
                inputEl.dataset.wasConfigured = "false";
            }
        }

        applyKeyFieldState(openaiKeyInput, currentConfig.openai_api_key);
        applyKeyFieldState(googleKeyInput, currentConfig.google_api_key);
        if (ollamaUrlInput) ollamaUrlInput.value = currentConfig.ollama_url || "http://localhost:11434";
        if (transProviderSelect) transProviderSelect.value = currentConfig.transcription_provider || "openai";
        if (llmProviderSelect) llmProviderSelect.value = currentConfig.llm_provider || "openai";

        // Params
        if (maxTokensInput) {
            maxTokensInput.value = currentConfig.max_output_tokens || 4000;
            const disp = byId("display-max-tokens");
            if (disp) disp.textContent = maxTokensInput.value;
            maxTokensInput.oninput = () => { if (disp) disp.textContent = maxTokensInput.value; };
        }
        if (temperatureInput) {
            temperatureInput.value = currentConfig.temperature || 0.2;
            const disp = byId("display-temperature");
            if (disp) disp.textContent = temperatureInput.value;
            temperatureInput.oninput = () => { if (disp) disp.textContent = temperatureInput.value; };
        }

        // Model Dropdown Logic
        const populateModels = () => {
            if (!llmProviderSelect || !llmModelSelect) return;
            const provider = llmProviderSelect.value;
            let models = [];
            // Issue #24: Removing hallucinated model names (gpt-5.2, etc)
            if (provider === "openai") models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview", "o1-mini"];
            else if (provider === "google") models = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"];
            else if (provider === "ollama") models = ["llama3.1", "mistral", "phi3", "qwen2", "gemma2"];

            llmModelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join("");

            // Set selected model
            const savedModel = provider === "openai" ? currentConfig.openai_model :
                (provider === "google" ? currentConfig.gemini_model : currentConfig.ollama_model);

            // Default to first if saved not in list or empty
            if (savedModel && !models.includes(savedModel)) {
                llmModelSelect.innerHTML += `<option value="${savedModel}">${savedModel}</option>`;
                models.push(savedModel);
            }
            if (models.includes(savedModel)) llmModelSelect.value = savedModel;
        };

        if (llmProviderSelect) {
            llmProviderSelect.addEventListener("change", populateModels);
            populateModels(); // Init
        }

        updateAnalysisDashboard(usageLogs);
    } catch (e) {
        console.error("Config load failed", e);
        ui.showToast("Failed to load configuration: " + e.message, "error");
    }

    // Save Logic
    const saveBtn = byId("save-config-btn");
    if (saveBtn) {
        saveBtn.onclick = async () => {
            // ── API key field logic ─────────────────────────────────────────────────────
            // If the user typed a new value, send it.
            // If the field is empty AND was previously configured, send '__MASKED__'
            // so the backend preserves the existing key rather than deleting it.
            // Only an explicit non-empty input counts as a key change.
            const resolveKeyValue = (inputEl) => {
                if (!inputEl) return undefined;
                const typed = inputEl.value.trim();
                if (typed) return typed;                              // new key entered
                if (inputEl.dataset.wasConfigured === "true") return "__MASKED__"; // unchanged
                return "";                                           // user cleared it
            };

            const newConfig = {
                openai_api_key: resolveKeyValue(openaiKeyInput),
                google_api_key: resolveKeyValue(googleKeyInput),
                ollama_url: ollamaUrlInput?.value,
                transcription_provider: transProviderSelect?.value,
                llm_provider: llmProviderSelect?.value,
                llm_model: llmModelSelect?.value,
                // Map model back to specific keys
                openai_model: llmProviderSelect?.value === "openai" ? llmModelSelect?.value : (currentConfig.openai_model || "gpt-4o"),
                gemini_model: llmProviderSelect?.value === "google" ? llmModelSelect?.value : (currentConfig.gemini_model || "gemini-1.5-pro"),
                ollama_model: llmProviderSelect?.value === "ollama" ? llmModelSelect?.value : (currentConfig.ollama_model || "gemma3:1b"),
                max_output_tokens: Number(maxTokensInput?.value || 4000),
                temperature: Number(temperatureInput?.value || 0.2)
            };

            try {
                await api.saveConfig(newConfig);
                // Re-apply key field states after save (server echoes masked values)
                if (openaiKeyInput) openaiKeyInput.dataset.wasConfigured =
                    (newConfig.openai_api_key && newConfig.openai_api_key !== "") ? "true" : "false";
                if (googleKeyInput) googleKeyInput.dataset.wasConfigured =
                    (newConfig.google_api_key && newConfig.google_api_key !== "") ? "true" : "false";
                // Strip sensitive data from local state — never hold raw keys in memory
                const safeConfig = { ...newConfig };
                delete safeConfig.openai_api_key;
                delete safeConfig.google_api_key;
                state.config = { ...state.config, ...safeConfig };
                currentConfig = state.config;
                ui.showToast("Configuration saved!");
            } catch (e) {
                ui.showToast("Failed to save: " + e.message);
            }
        };
    }

    // Tab Logic (Exposed to window for onclicks in HTML)
    window.switchConfigTab = (tabId) => {
        ['general', 'ai', 'tokens'].forEach(t => {
            const content = byId(`tab-content-${t}`);
            if (content) content.classList.toggle("hidden", t !== tabId);

            const btn = byId(`tab-btn-${t}`);
            if (btn) {
                if (t === tabId) {
                    btn.classList.add("bg-white", "dark:bg-slate-700", "text-slate-900", "dark:text-white", "shadow");
                    btn.classList.remove("text-slate-500", "hover:text-slate-900");
                } else {
                    btn.classList.remove("bg-white", "dark:bg-slate-700", "text-slate-900", "dark:text-white", "shadow");
                    btn.classList.add("text-slate-500", "hover:text-slate-900");
                }
            }
        });
    };

    // Init Tabs
    window.switchConfigTab('general');

    // Theme Toggles
    window.setTheme = (mode) => {
        if (mode === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', mode);

        // Update Active Button State
        const btnLight = byId("theme-btn-light");
        const btnDark = byId("theme-btn-dark");
        if (mode === 'light') {
            btnLight?.classList.add("bg-white", "shadow", "text-primary");
            btnDark?.classList.remove("bg-white", "shadow", "text-primary");
        } else {
            btnDark?.classList.add("bg-slate-700", "shadow", "text-white");
            btnLight?.classList.remove("bg-slate-700", "shadow", "text-white");
        }
    };

    // Initialize Theme UI based on current
    const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    window.setTheme(currentTheme);

    // Password toggles
    window.togglePassword = (id) => {
        const el = byId(id);
        if (el) el.type = el.type === "password" ? "text" : "password";
    };
}


// --- INIT ---
document.addEventListener("DOMContentLoaded", async () => {
    // Issue #8: Backend Sync Check
    const checkBackend = async () => {
        const overlay = byId("health-check-overlay");
        try {
            await api.checkHealth();
            console.log("Backend healthy. Proceeding.");
            if (overlay) overlay.style.opacity = "0";
            setTimeout(() => overlay?.classList.add("hidden"), 500);

            // Fetch initial configuration (critical for System Ready state)
            try {
                const config = await api.getConfig();
                setConfig(config);
                const statusEl = byId("user-id-display");
                if (statusEl) statusEl.textContent = "System Ready ✔";
            } catch (e) { console.warn("Config load failed", e); }
        } catch (e) {
            console.warn("Backend not ready, retrying...");
            setTimeout(checkBackend, 1000);
        }
    };
    checkBackend();

    // Nav Click Handlers
    qsa(".nav-item").forEach(el => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            const p = el.dataset.page;
            if (p) loadPage(p);
        });
    });

    // Initial Load Logic - Ensure only one loadPage call
    const params = new URLSearchParams(window.location.search);
    const urlPage = params.get("page");
    const q = params.get("query") || "";

    if (state.selectedPatientId) {
        // This will trigger loadPage("patient-profile") internally
        selectPatient(state.selectedPatientId);
    } else {
        const pageToLoad = urlPage || "dashboard";
        loadPage(pageToLoad, q);
    }
});

// ---------------------------------------------------------
// TINYMCE EDITOR LOGIC
// ---------------------------------------------------------
let tinyEditorInitialized = false;

function buildHtmlFromJson(report) {
    if (!report || typeof report !== "object") return "<p>No report data.</p>";

    // Fallback to state patient data if report is missing specifics
    let patient = null;
    if (state.selectedPatientId) {
        patient = state.patients.find(p => p.id === state.selectedPatientId);
    }

    const safe = (k, fallback = "") => (report && report[k]) || fallback;
    // Prefer report data, then patient state data, then N/A
    const pName = safe("patient_name") || (patient ? patient.name : "N/A");
    const pAge = safe("age") || (patient ? patient.age : "N/A");
    const pSex = safe("sex") || (patient ? (patient.gender || patient.sex) : "N/A");

    let findingsHtml = "";
    if (Array.isArray(report.detailed_findings) && report.detailed_findings.length > 0) {
        findingsHtml = `
        <h2>Findings</h2>
            <ul>
                ${report.detailed_findings.map(f => `<li><strong>${f.finding || ""}</strong>: ${f.explanation || ""}</li>`).join("")}
            </ul>`;
    }

    let recHtml = "";
    if (Array.isArray(report.recommendations) && report.recommendations.length > 0) {
        recHtml = `
                <h2>Recommendations</h2>
                    <ul>
                        ${report.recommendations.map(r => `<li>${r}</li>`).join("")}
                    </ul>`;
    }

    return `
                        <h1>Medical Report (${(safe("phase", "") || "").toUpperCase()})</h1>
        <p><strong>Patient:</strong> ${pName}</p>
        <p><strong>Age:</strong> ${pAge} | <strong>Sex:</strong> ${pSex}</p>
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
        alert("Text editor not loaded. Please refresh.");
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
    const modal = byId("edit-report-modal");
    if (!modal) return;

    // Bind close logic
    const closeX = byId("cancel-edit-modal");
    if (closeX) closeX.onclick = () => modal.classList.add("hidden");

    const cancelBtn = byId("cancel-edit-modal-btn");
    if (cancelBtn) cancelBtn.onclick = () => modal.classList.add("hidden");

    const html = buildHtmlFromJson(reportJson);
    ensureTinyMCEInitialized((editor) => {
        editor.setContent(html);
        modal.classList.remove("hidden");
    });

    // Issue #11 - Wiring the Save Final PDF button
    const form = byId("edit-report-form");
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const editedHtml = tinymce.get("html-editor").getContent();
            const saveBtn = form.querySelector('button[type="submit"]');
            const originalText = saveBtn.innerHTML;

            try {
                saveBtn.innerHTML = "<span>Generating PDF...</span>";
                saveBtn.disabled = true;

                // Sync the HTML back to our report object
                const reportToGen = { ...reportJson, html_content: editedHtml };
                
                const blob = await api.generatePdf(reportToGen);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.style.display = "none";
                a.href = url;
                a.download = `Report_${reportJson.report_id || "final"}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                
                ui.showToast("PDF generated successfully!", "success");
                modal.classList.add("hidden");
            } catch (err) {
                console.error("PDF Gen Error:", err);
                ui.showToast("Failed to generate PDF: " + err.message, "error");
            } finally {
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
            }
        };
    }
}

// ---------------------------------------------------------
// MOBILE INITIALIZATION
// ---------------------------------------------------------
function initMobileFeatures() {
    console.log("Initializing MedEcho Mobile Features...");

    // 1. Mobile Nav Clicks
    qsa(".mobile-nav-item").forEach(item => {
        item.addEventListener("click", () => {
            const page = item.dataset.page;
            if (page) loadPage(page);
        });
    });

    // 2. Mobile FAB Recording
    const mobileFab = byId("mobile-record-fab");
    if (mobileFab) {
        mobileFab.addEventListener("click", () => {
            if (state.selectedPatientId) {
                // If on profile page, we might know the phase, otherwise default to intake
                const phase = state.currentStage1Status === "completed" ? "final_assessment" : "intake";
                openRecordingModal(phase);
            } else {
                ui.showToast("Please select a patient first", "info");
                loadPage("patients");
            }
        });
    }

    // 3. Auto-close sidebar on mobile after clicking a link
    qsa(".nav-item").forEach(item => {
        item.addEventListener("click", () => {
            if (window.innerWidth < 1024) {
               const sidebar = byId("sidebar");
               const overlay = byId("sidebar-overlay");
               sidebar?.classList.add("-translate-x-full");
               overlay?.classList.add("hidden");
            }
        });
    });
}

// Global App Initialization
document.addEventListener("DOMContentLoaded", () => {
    initMobileFeatures();
});
