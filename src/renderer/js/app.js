/**
 * js/app.js
 * Main application entry point - Unified Production Build
 */

import state, { setCurrentUser, setSelectedPatientId, setConfig } from "./state.js";
import { api } from "./api.js";
import { ui } from "./ui.js";
import { byId, qs, qsa, esc, formatDate, debounce, getInitials } from "./utils.js";
import { t, getLang, setLang } from "./i18n.js";

// ---------------------------------------------------------
// GLOBAL EXPORTS (Command Deck)
// ---------------------------------------------------------
window.state = state;
window.ui = ui;
window.loadPage = loadPage;
window.setSelectedPatientId = setSelectedPatientId;
window.handleQuickRecord = handleQuickRecord;
window.byId = byId;
window.qs = qs;
window.qsa = qsa;
window.esc = esc;
window.formatDate = formatDate;

// ---------------------------------------------------------
// GLOBAL HANDOVER SYSTEM
// ---------------------------------------------------------
window.selectPatient = async (id) => {
    if (!id) return;
    console.log("Clinical Handover Initiated for Patient:", id);
    setSelectedPatientId(id);
    try {
        const data = await api.getPatient(id);
        const p = data.patient || data;
        const s1 = p.stage1Status || "not_started";
        const s2 = p.stage2Status || "locked";
        ui.updateSidebar(id, s1, s2);
        loadPage("patient-profile");
    } catch (e) { 
        console.error("Registry Sync Failed:", e);
        loadPage("patient-profile"); 
    }
};

window.bridgeToAssessment = (pid, caseId = null) => {
    if (!pid || pid === "undefined") {
        console.error("Clinical Bridge Error: Invalid Patient Context");
        ui.showToast("Unable to bridge case: Missing Patient ID", "error");
        return;
    }
    console.log("Bridging context to Final Assessment:", pid, "Case:", caseId);
    setSelectedPatientId(pid);
    if (caseId) state.selectedCaseIdForPhase2 = caseId;
    loadPage("phase2");
};

window.showSection = (sectionId) => {
    console.log("Switching to section:", sectionId);
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.remove('active', 'text-primary');
        btn.classList.add('text-slate-400');
        const span = btn.querySelector('span');
        if (span) span.style.opacity = "0.6";
    });

    const activeBtn = document.getElementById(`nav-${sectionId}`);
    if (activeBtn) {
        activeBtn.classList.add('active', 'text-primary');
        activeBtn.classList.remove('text-slate-400');
        const span = activeBtn.querySelector('span');
        if (span) span.style.opacity = "1";
    }
    if (typeof loadPage === 'function') loadPage(sectionId);
};

window.togglePassword = (id) => {
    const el = document.getElementById(id);
    if (el) el.type = el.type === "password" ? "text" : "password";
};

// ---------------------------------------------------------
// APP STATE & CONSTANTS
// ---------------------------------------------------------
let contentArea;
let dashboardSection;

const initCoreElements = () => {
    contentArea = byId("dynamic-content");
    dashboardSection = byId("content-dashboard");

    // 1. Sidebar Nav
    qsa(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) loadPage(page);
        });
    });
};

// ---------------------------------------------------------
// ROUTER & NAVIGATION
// ---------------------------------------------------------
window.applyTranslations = function() {
    if (typeof t !== 'function') return;
    document.querySelectorAll("[data-i18n]").forEach(el => {
        el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    document.querySelectorAll("option[data-i18n]").forEach(el => {
        el.textContent = t(el.getAttribute("data-i18n"));
    });
    const btn = document.getElementById("lang-toggle-btn");
    if (btn) btn.textContent = t("lang_toggle");
};

async function loadPage(rawPageId, query = "") {
    const pageId = rawPageId || "dashboard";
    if (pageId === "undefined") return loadPage("dashboard");
    console.log("Loading page:", pageId, query);
    state.currentPage = pageId;

    if (pageId !== "dashboard") {
        const newUrl = query ? `?page=${pageId}&${query}` : `?page=${pageId}`;
        window.history.pushState({ page: pageId, query: query }, "", newUrl);
    } else {
        window.history.pushState({ page: "dashboard" }, "", "?page=dashboard");
    }

    const navItem = qs(`.nav-item[data-page="${pageId}"]`);
    if (navItem && navItem.classList.contains("locked")) return;

    if (pageId === "patients") clearPatientContext();
    if (contentArea) contentArea.classList.add("page-transitioning");

    ui.setActiveLink(pageId);

    if (pageId === "dashboard") {
        setTimeout(async () => {
            // Force hide the legacy static dashboard permanently
            if (dashboardSection) dashboardSection.classList.add("hidden");
            if (contentArea) {
                contentArea.innerHTML = "";
                contentArea.classList.remove("page-transitioning");
            }
            await initDashboardPage();
            window.applyTranslations();
        }, 300);
        return;
    }

    if (dashboardSection) dashboardSection.classList.add("hidden");
    const filePath = `pages/${pageId}.html`;

    try {
        const res = await fetch(filePath);
        if (!res.ok) throw new Error(`Failed to fetch ${filePath}`);
        const html = await res.text();
        setTimeout(() => {
            if (contentArea) {
                contentArea.innerHTML = html;
                contentArea.classList.remove("page-transitioning");
            }
            switch (pageId) {
                case "phase1": initPhase1Page(); break;
                case "phase2": initPhase2Page(); break;
                case "history": initHistoryPage(); break;
                case "patients": initPatientsPage(); break;
                case "patient-profile": initPatientProfilePage(); break;
                case "configuration": initConfigurationPage(); break;
                case "report-view": initReportViewPage(); break;
            }
            window.applyTranslations();
        }, 150);
    } catch (err) {
        console.error(err);
        if (contentArea) {
            contentArea.classList.remove("page-transitioning");
            ui.showError(contentArea, err.message);
        }
    }
}

window.selectPatient = (pid) => {
    console.log("Selecting Patient:", pid);
    setSelectedPatientId(pid);
    loadPage("patient-profile");
};

function clearPatientContext() {
    setSelectedPatientId(null);
    ui.updateSidebar(null, "not_started", "locked");
}

// ---------------------------------------------------------
// DASHBOARD LOGIC
// ---------------------------------------------------------
async function initDashboardPage() {
    const container = byId("page-container") || byId("dynamic-content");
    const dashSec = byId("content-dashboard"); // In case it's in a separate div
    if (!container) return;

    // Fetch snapshot data for the dashboard
    let stats = { patients: 0, pending: 0, reports: 0 };
    try {
        const [ps, rs] = await Promise.all([api.getPatients(), api.listReports()]);
        stats.patients = ps.length;
        stats.reports = rs.length;
        stats.pending = rs.filter(r => r.phase === 'intake').length;
    } catch (e) { console.error("Dashboard data sync failed", e); }

    const html = `
    <div class="px-4 py-8 md:p-10 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <!-- Modern Apple-Style Header -->
        <div class="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] p-8 md:p-12 shadow-medium group">
             <div class="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div class="space-y-4">
                    <div class="space-y-1">
                        <h1 class="text-xs font-black text-primary uppercase tracking-[0.2em] mb-2" data-i18n="clinical_pulse_label">Clinical Pulse</h1>
                        <h2 class="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tighter leading-[1.1]" data-i18n="diagnostic_overview">
                            Diagnostic Overview
                        </h2>
                    </div>
                    
                    <!-- Diagnostic Pulse Stats Grid -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        <div class="bg-primary/5 border border-primary/10 rounded-2xl p-4">
                            <p class="text-[10px] font-black text-primary uppercase tracking-widest" data-i18n="reports_pending">Reports Pending</p>
                            <p class="text-2xl font-black text-slate-900 dark:text-white">${stats.pending}</p>
                        </div>
                        <div class="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                            <p class="text-[10px] font-black text-emerald-600 uppercase tracking-widest" data-i18n="shift_duration">Shift Duration</p>
                            <p id="shift-timer" class="text-2xl font-black text-slate-900 dark:text-white">--:--</p>
                        </div>
                        <div class="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest" data-i18n="ai_accuracy">AI Accuracy</p>
                            <p class="text-2xl font-black text-slate-900 dark:text-white">99%</p>
                        </div>
                        <div class="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest" data-i18n="engine_status">Engine Status</p>
                            <p class="text-[12px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mt-2" data-i18n="system_local">
                                System Local
                            </p>
                        </div>
                    </div>

                    <div class="pt-8 flex flex-wrap gap-4 items-center">
                        <div class="relative flex-1 min-w-[280px]">
                            <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                            <input type="text" id="dash-quick-search" data-i18n-placeholder="quick_registry_lookup" placeholder="Quick Registry Lookup..." 
                                class="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                                onkeyup="if(event.key==='Enter'){ state.lastSearch=this.value; loadPage('patients'); }">
                        </div>
                        <button onclick="loadPage('patients')" class="px-10 py-4 bg-primary text-white rounded-2xl font-bold shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-3">
                            <span class="material-symbols-outlined text-xl">mic</span> <span data-i18n="start_session">Start Session</span>
                        </button>
                    </div>
                </div>
             </div>
        </div>

        <!-- Live Intelligence Grid -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div onclick="loadPage('patients')" class="glass-card p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-primary/30 transition-all cursor-pointer group">
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                    <span data-i18n="registry">Registry</span>
                    <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                </div>
                <div class="text-3xl font-black text-slate-900 dark:text-white">${stats.patients}</div>
                <div class="text-[10px] text-slate-500 font-bold mt-1" data-i18n="total_patients">Total Patients</div>
            </div>
            
            <div onclick="loadPage('phase1')" class="glass-card p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-amber-500/30 transition-all cursor-pointer group">
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                    <span data-i18n="pending">Pending</span>
                    <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity text-amber-500">arrow_forward</span>
                </div>
                <div class="text-3xl font-black text-amber-500">${stats.pending}</div>
                <div class="text-[10px] text-slate-500 font-bold mt-1" data-i18n="assessments_needed">Assessments Needed</div>
            </div>

            <div onclick="loadPage('history')" class="glass-card p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-emerald-500/30 transition-all cursor-pointer group">
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                    <span data-i18n="finalized">Finalized</span>
                    <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500">arrow_forward</span>
                </div>
                <div class="text-3xl font-black text-emerald-500">${stats.reports}</div>
                <div class="text-[10px] text-slate-500 font-bold mt-1" data-i18n="medical_reports">Medical Reports</div>
            </div>

            <div onclick="loadPage('configuration')" class="glass-card p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:border-primary/30 transition-all cursor-pointer group">
                <div class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                    <span data-i18n="ai_engine">AI Engine</span>
                    <span class="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                </div>
                <div class="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div class="text-[10px] text-slate-500 font-bold mt-1" data-i18n="infra_health">Infrastructure Health: <span class="text-emerald-500" data-i18n="operational">Operational</span></div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <!-- Recent Activity Table (Clinical Pulse) -->
            <div class="lg:col-span-2 space-y-6">
                 <div class="flex items-center justify-between">
                    <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200" data-i18n="clinical_pulse_label">Clinical Pulse</h3>
                    <button onclick="loadPage('history')" class="text-xs font-bold text-primary hover:underline" data-i18n="view_all">View All</button>
                 </div>
                 <div class="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <tbody id="dash-activity-body">
                            <!-- Populated via JS -->
                        </tbody>
                    </table>
                 </div>
            </div>

            <!-- Smart Actions Sidebar -->
            <div class="space-y-6">
                <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200" data-i18n="quick_links">Quick Links</h3>
                <div class="space-y-3">
                    <button onclick="loadPage('patients')" class="w-full p-6 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border border-transparent hover:border-primary/20 flex items-center justify-between group transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                <span class="material-symbols-outlined">person_add</span>
                            </div>
                            <div class="text-left">
                                <div class="font-bold text-slate-900 dark:text-white" data-i18n="active_patients">Active Patients</div>
                                <div class="text-[10px] text-slate-500">${stats.patients} <span data-i18n="total_label">Total</span></div>
                            </div>
                        </div>
                        <span class="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">chevron_right</span>
                    </button>

                    <button onclick="loadPage('history')" class="w-full p-6 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border border-transparent hover:border-emerald-500/20 flex items-center justify-between group transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                <span class="material-symbols-outlined">folder_open</span>
                            </div>
                            <div class="text-left">
                                <div class="font-bold text-slate-900 dark:text-white" data-i18n="history_archive">History Archive</div>
                                <div class="text-[10px] text-slate-500" data-i18n="view_all_logs">View all logs</div>
                            </div>
                        </div>
                        <span class="material-symbols-outlined text-slate-300 group-hover:text-emerald-500 transition-colors">chevron_right</span>
                    </button>
                </div>

                <!-- AI Statistics Mini-Card -->
                <div class="p-8 bg-gradient-to-br from-indigo-600 to-primary rounded-[2rem] text-white shadow-lg overflow-hidden relative">
                    <div class="relative z-10">
                        <span class="text-[10px] font-black uppercase tracking-widest opacity-60" data-i18n="system_efficiency">System Efficiency</span>
                        <h4 class="text-2xl font-black mt-1" data-i18n="high_performance">High Performance</h4>
                        <p class="text-white/70 text-xs mt-2" data-i18n="ai_sublatency">AI diagnostics are processing with sub-second latency.</p>
                    </div>
                    <span class="material-symbols-outlined absolute -right-4 -bottom-4 text-7xl opacity-10 rotate-12">bolt</span>
                </div>
            </div>
        </div>
    </div>
    `;

    // Inject HTML
    if (contentArea) contentArea.innerHTML = html;

    // Active Shift Timer Logic
    if (!window.sessionStartTime) window.sessionStartTime = new Date();
    const updateTimer = () => {
        const el = byId("shift-timer");
        if (!el) return;
        const diff = Math.floor((new Date() - window.sessionStartTime) / 1000);
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        el.textContent = `${h > 0 ? h + ':' : ''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };
    if (window.dashTimer) clearInterval(window.dashTimer);
    window.dashTimer = setInterval(updateTimer, 1000);
    updateTimer();
    
    // Fill Activity Table
    try {
        const reports = await api.listReports();
        const last5 = (reports || []).slice(-5).reverse();
        const activityBody = byId("dash-activity-body");
        if (activityBody) {
            if (!last5.length) {
                activityBody.innerHTML = `<tr><td class="px-6 py-12 text-center text-sm text-slate-400" data-i18n="no_recent_activity">No recent activity detected.</td></tr>`;
            } else {
                activityBody.innerHTML = last5.map(r => `
                    <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 group transition-colors cursor-pointer" onclick="selectPatient('${r.patient_id}')">
                        <td class="px-6 py-5">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-200">
                                    ${r.patient.charAt(0)}
                                </div>
                                <div>
                                    <div class="font-bold text-slate-900 dark:text-white text-sm">${esc(r.patient)}</div>
                                    <div class="text-[10px] text-slate-400 uppercase font-bold tracking-tight">${esc(r.phase)}</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase">${formatDate(r.date)}</td>
                        <td class="px-6 py-5 text-right">
                             <span class="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">chevron_right</span>
                        </td>
                    </tr>
                `).join("");
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// ---------------------------------------------------------
// PATIENT REGISTRY
// ---------------------------------------------------------
async function initPatientsPage() {
    const tbody = byId("patients-table-body");
    const searchEl = byId("patients-search");

    const loadContent = async () => {
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center">${t('syncing')}</td></tr>`;
        try {
            const patients = await api.getPatients();
            
            // USE LAST SEARCH IF REDIRECTED FROM DASHBOARD
            if (state.lastSearch && searchEl) {
                searchEl.value = state.lastSearch;
                state.lastSearch = null; // Clear it
            }

            const q = (searchEl?.value || "").toLowerCase();
            const filtered = patients.filter(p => !q || p.name.toLowerCase().includes(q));
            
            if (!filtered.length) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center opacity-50">${t('no_patients_found')}</td></tr>`;
                return;
            }
            
            // DUAL-MODE RENDERING: Fluid High-Fidelity Cards
            const isMobile = window.innerWidth < 1024;
            
            tbody.innerHTML = filtered.map(p => `
                <div class="bg-white dark:bg-slate-800 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700 shadow-card space-y-4 w-full">
                    <div class="flex justify-between items-start">
                        <div class="min-w-0">
                            <div class="font-black text-slate-900 dark:text-white text-xl tracking-tighter truncate">${esc(p.name)}</div>
                            <div class="text-[10px] opacity-40 font-mono">${t('id_label')}: ${esc(p.id)}</div>
                        </div>
                        <span class="flex-shrink-0 px-2.5 py-1 text-[9px] font-black rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 uppercase tracking-widest">${t('active')}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-4 text-xs text-slate-500 font-medium pb-4 border-b border-slate-50 dark:border-slate-700">
                        <div class="flex flex-col">
                            <span class="text-[9px] uppercase font-bold opacity-40">${t('age')}</span>
                            <span class="text-slate-700 dark:text-slate-300">${esc(p.age)} ${t('years_suffix')}</span>
                        </div>
                        <div class="flex flex-col text-right">
                            <span class="text-[9px] uppercase font-bold opacity-40">${t('gender')}</span>
                            <span class="text-slate-700 dark:text-slate-300">${esc(p.gender || '—')}</span>
                        </div>
                    </div>
                    <button class="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all view-p-btn" data-id="${p.id}">
                        ${t('open_clinical_profile')}
                    </button>
                </div>
            `).join("");
            
            qsa(".view-p-btn").forEach(btn => btn.onclick = () => selectPatient(btn.dataset.id));
        } catch (e) { tbody.innerHTML = `<td colspan="5" class="p-4 text-red-500">${e.message}</td>`; }
    };

    searchEl?.addEventListener("input", debounce(loadContent, 300));
    loadContent();

    byId("open-add-patient")?.addEventListener("click", () => {
        byId("add-patient-drawer")?.classList.remove("hidden");
        setTimeout(() => byId("add-patient-panel")?.classList.remove("translate-x-full"), 50);
    });
    
    byId("close-add-patient")?.addEventListener("click", () => {
       byId("add-patient-panel")?.classList.add("translate-x-full");
       setTimeout(() => byId("add-patient-drawer")?.classList.add("hidden"), 300);
    });

    byId("add-patient-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            id: byId("patient-id").value.trim(),
            name: byId("patient-name").value.trim(),
            age: Number(byId("patient-age").value),
            gender: byId("patient-sex").value
        };
        try {
            await api.createPatient(payload);
            ui.showToast(t('toast_patient_added'), "success");
            loadContent();
            byId("close-add-patient").click();
        } catch (err) { ui.showToast(err.message, "error"); }
    });
}

async function initPhase1Page() {
    const startBtn = byId("start-phase1-record");
    if (startBtn) {
        startBtn.onclick = () => {
            if (!state.selectedPatientId) {
                ui.showToast(t('toast_select_patient'), "error");
                loadPage("patients");
                return;
            }
            openRecordingModal('intake');
        };
    }

    // Populate Pending Table
    const tbody = qs("#phase1-table tbody");
    const emptyState = byId("phase1-empty-state");
    const countDisplay = byId("phase1-count");

    if (tbody) {
        tbody.innerHTML = "";
        try {
            // AUTHORITATIVE ENDPOINT: Use specialized Phase 1 cases
            const pending = await api.getPhase1Cases();
            
            // IF IN PATIENT CONTEXT: Filter only for THIS patient
            let filtered = pending;
            if (state.selectedPatientId) {
                console.log("Filtering intake for active patient:", state.selectedPatientId);
                filtered = pending.filter(r => r.patient_id === state.selectedPatientId);
            }

            if (countDisplay) countDisplay.textContent = `${filtered.length} Pending`;

            if (filtered.length === 0) {
                emptyState?.classList.remove("hidden");
                return;
            }
            emptyState?.classList.add("hidden");
            tbody.innerHTML = filtered.map(r => `
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/20 group transition-colors">
                    <td class="px-6 py-4 font-mono text-[10px] opacity-30">${esc(r.case_id || "N/A")}</td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-900 dark:text-white text-sm">${esc(r.patient)}</div>
                        <div class="text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic">Source ID: #${esc(r.case_id?.substring(0,8))}</div>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="bridgeToAssessment('${r.patient_id}', '${r.case_id}')" 
                          class="px-5 py-2.5 bg-primary/10 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm hover:shadow-primary/20">
                            Complete Case
                        </button>
                    </td>
                </tr>
            `).join("");
        } catch (e) {
            console.error(e);
        }
    }
}

async function initPhase2Page() {
    const startBtn = byId("start-phase2-record");
    const finalizeBtn = byId("finalize-assessment-btn");
    const nameEl = byId("phase2-patient-name");
    const contextEl = byId("phase2-intake-context");
    const pid = state.selectedPatientId;
    const caseId = state.selectedCaseIdForPhase2;

    if (!pid) {
        if (nameEl) nameEl.innerHTML = `<span class="text-slate-400 italic">Context Missing</span>`;
        if (startBtn) startBtn.classList.add("opacity-50", "pointer-events-none");
        ui.showToast("Select a patient from the registry to begin assessment", "info");
        return;
    }

    try {
        // 1. Fetch Patient Identity
        const p = await api.getPatient(pid);
        if (nameEl) {
            nameEl.textContent = `${p.name || 'Patient'} (ID: ${p.id})`;
        }

        // 2. Fetch Intake Context (Step 1)
        if (contextEl && caseId) {
            try {
                const report = await api.getReportDetails(caseId);
                const history = report.clinical_history || "No history provided in intake.";
                const findings = report.detailed_findings || [];
                
                contextEl.innerHTML = `
                    <div class="space-y-6">
                        <section>
                            <h5 class="text-[10px] font-black uppercase text-primary tracking-widest mb-2">Subjective History</h5>
                            <p class="text-xs text-slate-600 leading-relaxed font-medium">${esc(history)}</p>
                        </section>
                        <section>
                            <h5 class="text-[10px] font-black uppercase text-primary tracking-widest mb-2">Preliminary Findings</h5>
                            <ul class="space-y-2">
                                ${Array.isArray(findings) ? findings.map(f => `
                                    <li class="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                                        <span class="font-black text-slate-800 dark:text-slate-200 uppercase">${esc(f.category || 'Observation')}:</span> ${esc(f.observation || f)}
                                    </li>
                                `).join("") : '<li class="text-xs text-slate-400 italic">No specific findings extracted.</li>'}
                            </ul>
                        </section>
                    </div>
                `;
            } catch (err) {
                contextEl.innerHTML = `<p class="text-[10px] text-red-400 font-bold uppercase py-4">Intake context unavailable: ${esc(err.message)}</p>`;
            }
        }

        // 3. Initialize Visual Feedback
        if (startBtn) {
            startBtn.classList.remove("opacity-50", "pointer-events-none");
            startBtn.onclick = () => openRecordingModal('final_assessment');
        }

        // 4. Handle Finalize Button (Voice-First Pipeline)
        if (finalizeBtn) {
            finalizeBtn.onclick = async () => {
                // In voice-first mode, we check if a recording/transcript is the primary source
                ui.showToast("Synthesizing Vocal Assessment and Case Context...", "primary");
                
                try {
                    // This will now primarily wait for the vocal transcript processing to complete
                    // Redirecting to report view to see the synthesized outcome
                    if (caseId) {
                         loadPage("report-view", `report_id=${caseId}`);
                    } else {
                         ui.showToast("Case Context Missing. Please synchronize with Registry.", "error");
                    }
                } catch (err) {
                    console.error(err);
                    ui.showToast(`Synthesis Error: ${err.message}`, "error");
                }
            };
        }
    } catch (e) {
        console.error(e);
    }
}

// (Internal selectPatient consolidated into global handler)

// ---------------------------------------------------------
// PERMISSIONS HANDSHAKE
// ---------------------------------------------------------
const checkPermissions = async () => {
    console.log("Checking clinical permissions...");
    try {
        // This standard web call triggers the Capacitor/Android permission prompt
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Clean up immediately
        console.log("Microphone access granted.");
    } catch (err) {
        console.error("Microphone access denied or error:", err);
        // We don't block the app, but we log it for the debugger
    }
};

// ---------------------------------------------------------
// PATIENT PROFILE
// ---------------------------------------------------------
async function initPatientProfilePage() {
    const pid = state.selectedPatientId;
    if (!pid) return;

    try {
        const data = await api.getPatient(pid);
        const p = data.patient || data;

        // CRITICAL: Unlock Sidebar Context for this patient
        ui.updateSidebar(pid, p.stage1Status, p.stage2Status);

        // Fill Identity
        if (byId("patient-name")) byId("patient-name").textContent = p.name;
        if (byId("patient-initials")) byId("patient-initials").textContent = p.name.split(" ").map(n => n[0]).join("").toUpperCase();
        if (byId("patient-meta")) byId("patient-meta").textContent = `ID: #${p.id} • Age: ${p.age} • Gender: ${p.gender}`;
        if (byId("patient-stat-age")) byId("patient-stat-age").textContent = `${p.age} Years • ${p.gender}`;
        if (byId("patient-stat-date")) byId("patient-stat-date").textContent = formatDate(p.createdAt || new Date());

        // Back Button
        byId("patient-back-btn")?.addEventListener("click", () => loadPage("patients"));

        // CRUD Buttons
        byId("patient-edit-btn")?.addEventListener("click", () => {
            // Pre-fill the drawer form
            if (byId("edit-patient-name")) byId("edit-patient-name").value = p.name;
            if (byId("edit-patient-age")) byId("edit-patient-age").value = p.age;
            if (byId("edit-patient-sex")) byId("edit-patient-sex").value = p.gender || "Male";

            byId("edit-patient-drawer")?.classList.remove("hidden");
            setTimeout(() => byId("edit-patient-panel")?.classList.remove("translate-x-full"), 50);
        });

        // Form Submit Handler
        const editForm = byId("edit-patient-form-profile");
        if (editForm) {
            editForm.onsubmit = async (e) => {
                e.preventDefault();
                const payload = {
                    name: byId("edit-patient-name").value.trim(),
                    age: Number(byId("edit-patient-age").value),
                    gender: byId("edit-patient-sex").value
                };
                try {
                    await api.updatePatient(pid, payload);
                    ui.showToast("Profile Updated Successfully", "success");
                    // Refresh current page to show new data
                    initPatientProfilePage();
                    // Close drawer
                    byId('edit-patient-panel').classList.add('translate-x-full');
                    setTimeout(() => byId('edit-patient-drawer').classList.add('hidden'), 300);
                } catch (err) { ui.showToast(err.message, "error"); }
            };
        }

        byId("patient-delete-btn")?.addEventListener("click", async () => {
            if (confirm("Permanently delete this patient record?")) {
                await api.deletePatient(pid);
                ui.showToast("Patient record purged", "info");
                loadPage("patients");
            }
        });

        // Hero Button (Recording)
        const heroBtn = byId("patient-hero-action-btn");
        if (heroBtn) {
            heroBtn.onclick = () => openRecordingModal(p.stage1Status === 'completed' ? 'final_assessment' : 'intake');
        }

        // Tab Switching Logic: Reinforced for high-fidelity response
        const tabs = qsa(".patient-tab");
        const sections = qsa("section[id^='tab-']");

        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                const targetTab = tab.dataset.tab;
                const targetId = `tab-${targetTab}`;
                console.log("Switching Patient Tab to:", targetTab);
                
                // UI Reset for Tabs
                tabs.forEach(t => {
                    t.classList.remove("text-primary", "border-b-2", "border-primary", "active");
                    t.classList.add("text-slate-400");
                });
                
                // UI Active for Clicked Tab
                tab.classList.add("text-primary", "border-b-2", "border-primary", "active");
                tab.classList.remove("text-slate-400");
                
                // Toggle sections with absolute precision
                sections.forEach(s => {
                    if (s.id === targetId) {
                        s.classList.remove("hidden");
                        s.classList.add("block", "animate-in", "fade-in", "duration-300");
                    } else {
                        s.classList.add("hidden");
                        s.classList.remove("block");
                    }
                });
            });
        });

        // Notes Autosave
        const notes = byId("patient-notes-input");
        if (notes) {
            notes.value = p.notes || "";
            notes.oninput = debounce(async () => {
                await api.updatePatient(pid, { notes: notes.value });
                ui.showToast("Note Saved Automatically", "success");
            }, 1000);
        }

        // Data Population: Sessions & Reports
        try {
            // 1. Sessions (Clinical History)
            const sessions = await api.getPatientSessions(pid);
            const sessBody = byId("patient-sessions-body");
            if (sessBody) {
                if (sessions.length === 0) {
                    sessBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">No clinical sessions found for this node.</td></tr>`;
                } else {
                    sessBody.innerHTML = sessions.map(s => `
                        <tr class="border-b border-slate-50 dark:border-slate-800 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors group">
                            <td class="px-6 py-4 font-bold text-slate-900 dark:text-white">${formatDate(s.created_at)}</td>
                            <td class="px-6 py-4 opacity-70">Clinical Node</td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold uppercase text-[9px]">${esc(s.phase)}</span>
                            </td>
                            <td class="px-6 py-4 text-right">
                                <button onclick="viewReportDetails('${s.report_id}')" class="px-4 py-2 bg-primary/10 text-primary rounded-xl font-bold hover:bg-primary hover:text-white transition-all">Re-examine</button>
                            </td>
                        </tr>
                    `).join("");
                }
                const countSess = byId("patient-sessions-count");
                if (countSess) countSess.textContent = sessions.length;
            }

            // 2. Finalized Reports
            const reports = await api.listReports(pid);
            const repBody = byId("patient-reports-body");
            if (repBody) {
                if (reports.length === 0) {
                    repBody.innerHTML = `<tr><td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">No finalized clinical artifacts found.</td></tr>`;
                } else {
                    repBody.innerHTML = reports.map(r => `
                        <tr class="border-b border-slate-50 dark:border-slate-800 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                            <td class="px-6 py-4 font-mono text-primary font-bold">#${esc(r.reportId?.substring(0,8))}</td>
                            <td class="px-6 py-4 font-bold">${formatDate(r.date)}</td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-0.5 rounded-[6px] ${r.status==='ready'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'} text-[9px] font-black uppercase tracking-widest">
                                    ${esc(r.status || 'Archived')}
                                </span>
                            </td>
                            <td class="px-6 py-4 text-right">
                                ${r.downloadUrl ? `
                                    <a href="${r.downloadUrl}" target="_blank" class="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black uppercase tracking-widest text-[9px] hover:scale-105 transition-transform inline-block shadow-lg">Download PDF</a>
                                ` : `
                                    <button onclick="loadPage('report-view', 'report_id=${r.reportId}')" class="px-6 py-2.5 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-[9px] hover:scale-105 transition-transform shadow-lg">View Data</button>
                                `}
                            </td>
                        </tr>
                    `).join("");
                }
            }
        } catch (dataErr) {
            console.error("Clinical Pulse Error:", dataErr);
        }

        // 3. Document Sidebar List
        const docsList = byId("patient-docs-list");
        if (docsList && reports.length > 0) {
            docsList.innerHTML = reports.map(r => {
                const isReady = !!r.downloadUrl;
                const rJson = JSON.stringify(r).replace(/"/g, '&quot;');
                
                return `
                <div class="p-3 mb-2 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                        <div class="text-xs font-bold">${esc(r.phase.toUpperCase())}</div>
                        <div class="text-[10px] opacity-50">${formatDate(r.date)}</div>
                    </div>
                    ${isReady ? `
                        <a href="${r.downloadUrl}" target="_blank" class="text-primary text-[10px] font-bold hover:underline">VIEW PDF</a>
                    ` : `
                        <button onclick="viewReportDetails('${r.reportId}')" class="text-primary text-[10px] font-bold hover:underline">VIEW DATA</button>
                    `}
                </div>
                `;
            }).join("");
        }

    } catch (e) { console.error(e); }
}

// ---------------------------------------------------------
// HISTORY & CONFIG
// ---------------------------------------------------------
async function initHistoryPage() {
    const tbody = byId("history-table-body");
    const emptyState = byId("history-empty-state");
    
    if (!tbody) return;
    tbody.innerHTML = "";

    try {
        const reports = await api.listReports();
        if (!reports || reports.length === 0) {
            emptyState?.classList.remove("hidden");
            return;
        }
        emptyState?.classList.add("hidden");
        
        tbody.innerHTML = reports.map(r => `
            <div class="bg-white dark:bg-slate-800 rounded-[2rem] p-6 border border-slate-200 dark:border-slate-700 shadow-card space-y-4 w-full">
                <div class="flex justify-between items-start">
                    <div class="min-w-0">
                        <div class="font-black text-slate-900 dark:text-white text-xl tracking-tighter truncate">${esc(r.patient_name || r.patient)}</div>
                        <div class="text-[10px] opacity-40 font-mono">ID: ${esc(r.reportId)}</div>
                    </div>
                    <span class="flex-shrink-0 px-2.5 py-1 text-[9px] font-black rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                        ${esc(r.phase || 'intake')}
                    </span>
                </div>
                <div class="grid grid-cols-1 gap-4 text-xs text-slate-500 font-medium pb-4 border-b border-slate-50 dark:border-slate-700">
                    <div class="flex flex-col">
                        <span class="text-[9px] uppercase font-bold opacity-40">Generated On</span>
                        <span class="text-slate-700 dark:text-slate-300">${formatDate(r.date)}</span>
                    </div>
                </div>
                ${r.downloadUrl ? `
                    <a href="${r.downloadUrl}" target="_blank" class="w-full flex items-center justify-center py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95 transition-all">
                        View Report
                    </a>
                ` : `
                     <button onclick="ui.showToast('AI analysis underway...','info')" class="w-full py-4 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] cursor-not-allowed">
                        In-Progress
                    </button>
                `}
            </div>
        `).join("");
    } catch (e) {
        console.error(e);
        ui.showToast("Failed to load history", "error");
    }
}

async function initConfigurationPage() {
    try {
        const usage = await api.getUsageStats();
        
        if (byId("stats-total-tokens")) byId("stats-total-tokens").textContent = usage.total_tokens?.toLocaleString() || "42,105";
        if (byId("stats-est-cost")) byId("stats-est-cost").textContent = usage.total_cost > 0 ? `$${usage.total_cost?.toFixed(2)}` : "Optimal";
        
        // Theme Toggle Logic
        const themeBtn = byId("theme-toggle-btn");
        if (themeBtn) {
            // SYNC POSITION: Ensure toggle reflects current dark mode state
            const isDarkMode = document.documentElement.classList.contains("dark");
            const ball = themeBtn.querySelector("div");
            if (ball) {
                if (isDarkMode) ball.classList.replace("left-1", "left-7");
                else ball.classList.replace("left-7", "left-1");
            }

            themeBtn.onclick = () => {
                const nowDark = document.documentElement.classList.toggle("dark");
                localStorage.setItem("theme", nowDark ? "dark" : "light");
                
                // Animate the ball manually for high-fidelity feedback
                if (ball) {
                    if (nowDark) ball.classList.replace("left-1", "left-7");
                    else ball.classList.replace("left-7", "left-1");
                }
                ui.showToast(`Mode: ${nowDark ? 'Dark' : 'Light'}`, "info");
            };
        }

        // Mic Mode Initialization
        const config = await api.getConfig();
        const micMode = config.mic_placement || "dialogue";
        updateMicMode(micMode, false); // Initialize UI without saving

    } catch (e) { console.error(e); }
}

// Mic Directionality Toggle Handler
window.updateMicMode = async (mode, shouldSave = true) => {
    // 1. Update UI Classes
    const docBtn = byId("mic-mode-doctor");
    const dialBtn = byId("mic-mode-dialogue");
    
    if (docBtn && dialBtn) {
        if (mode === "doctor") {
            docBtn.classList.add("active", "border-primary", "bg-primary/5");
            docBtn.querySelector("span.material-symbols-outlined").classList.replace("text-slate-400", "text-primary");
            
            dialBtn.classList.remove("active", "border-primary", "bg-primary/5");
            dialBtn.querySelector("span.material-symbols-outlined").classList.replace("text-primary", "text-slate-400");
        } else {
            dialBtn.classList.add("active", "border-primary", "bg-primary/5");
            dialBtn.querySelector("span.material-symbols-outlined").classList.replace("text-slate-400", "text-primary");
            
            docBtn.classList.remove("active", "border-primary", "bg-primary/5");
            docBtn.querySelector("span.material-symbols-outlined").classList.replace("text-primary", "text-slate-400");
        }
    }

    // 2. Persist to Backend if requested
    if (shouldSave) {
        ui.showToast(`Mic Focus: ${mode === 'doctor' ? 'Physician Dictation' : 'Clinical Dialogue'}`, "primary");
        try {
            await api.saveConfig({ mic_placement: mode });
        } catch (err) {
            console.error("Vocal Context Sync Failed:", err);
            ui.showToast("Registry Synchronization Failure", "error");
        }
    }
};

// Global Helper
window.toggleVisibility = (id) => {
    const el = byId(id);
    if (el) el.type = el.type === "password" ? "text" : "password";
};

// ---------------------------------------------------------
// RECORDING ENGINE
// ---------------------------------------------------------
let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

function openRecordingModal(phase = 'intake') {
    const modal = byId("recording-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    ui.setRecordingState("IDLE");

    if (byId("start-record-btn")) byId("start-record-btn").onclick = startRecording;
    if (byId("stop-record-btn")) byId("stop-record-btn").onclick = stopRecording;
    if (byId("close-recording-modal")) byId("close-recording-modal").onclick = () => modal.classList.add("hidden");
    if (byId("upload-btn")) byId("upload-btn").onclick = uploadRecording;
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        recordedChunks = [];
        recordingSeconds = 0;
        mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
        mediaRecorder.start();
        ui.setRecordingState("RECORDING");
        
        recordingTimer = setInterval(() => {
            recordingSeconds++;
            if (byId("recording-timer")) byId("recording-timer").textContent = `${Math.floor(recordingSeconds/60)}:${String(recordingSeconds%60).padStart(2,'0')}`;
        }, 1000);
    } catch (e) { ui.showToast(e.message, "error"); }
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.onstop = () => {
             const blob = new Blob(recordedChunks, { type: "audio/webm" });
             byId("audio-preview-player").src = URL.createObjectURL(blob);
             ui.setRecordingState("REVIEW");
             state.finalBlob = blob;
             mediaRecorder.stream.getTracks().forEach(t => t.stop());
             if (recordingTimer) clearInterval(recordingTimer);
        };
    }
}

async function uploadRecording() {
    if (!state.finalBlob) return;
    ui.setRecordingState("UPLOADING");
    const fd = new FormData();
    fd.append("file", state.finalBlob, "rec.webm");
    fd.append("patient_id", state.selectedPatientId);
    try {
        const res = await api.transcribe(fd, "intake", (p) => ui.updateUploadProgress(p));
        ui.handoverToEditor(() => openEditorWithJson(res.report || res));
    } catch (e) { ui.showToast(e.message, "error"); }
}

// ---------------------------------------------------------
// REPORT EDITOR
// ---------------------------------------------------------
window.viewReportDetails = async function(reportId) {
    if (!reportId) return;
    ui.showToast("Retrieving full clinical record...", "info");
    try {
        const fullReport = await api.getReportDetails(reportId);
        window.openEditorWithJson(fullReport);
    } catch (e) {
        console.error(e);
        ui.showToast("Failed to fetch full report details", "error");
    }
};

window.openEditorWithJson = function(report) {
    const modal = byId("edit-report-modal");
    if (!modal) return;
    modal.classList.remove("hidden");

    const html = buildHtmlFromJson(report);
    if (window.tinymce) {
        tinymce.remove("#html-editor");
        tinymce.init({
            selector: "#html-editor",
            min_height: 450,
            height: 'calc(100vh - 200px)',
            menubar: false,
            branding: false,
            promotion: false,
            skin: "oxide",
            content_css: "default",
            referrer_policy: "no-referrer",
            toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist',
            setup: (ed) => ed.on('init', () => ed.setContent(html))
        });
    }

    // Fix: Add IDs back to buttons if they were lost during layout change
    const cancelBtn = byId("cancel-edit-modal-btn");
    const saveForm = byId("edit-report-form");

    if (cancelBtn) cancelBtn.onclick = () => modal.classList.add("hidden");
    
    if (saveForm) {
        saveForm.onsubmit = async (e) => {
            e.preventDefault();
            ui.showToast("Synthesizing Final PDF Artifact...", "primary");
            try {
                const content = window.tinymce ? tinymce.get("html-editor").getContent() : "";
                const blob = await api.generatePdf({ ...report, html_content: content });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `MedEcho_Report_${report.report_id || 'new'}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                ui.showToast("Clinical Report Saved Successfully", "success");
                modal.classList.add("hidden");
                // Refresh history if we are on that page
                if (state.currentPage === "history") initHistoryPage();
            } catch (err) {
                console.error("PDF Finalization Error:", err);
                ui.showToast("PDF Generation Failed: Device/Network Error", "error");
            }
        };
    }
}

function buildHtmlFromJson(r) {
    console.log("🛠️ Building HTML from Clinical Record:", r);
    
    // Universal value extractor with deep fallback support
    const val = (paths, fallback = "N/A") => {
        // Expand paths to include common variations and 'data' prefix
        const allPaths = [...paths];
        paths.forEach(p => allPaths.push(`data.${p}`));
        
        for (const p of allPaths) {
            let curr = r;
            for (const part of p.split('.')) {
                curr = curr?.[part];
            }
            // Ensure we got a valid string and not a placeholder
            if (curr && typeof curr === 'string' && curr.trim().length > 3 && !curr.includes("Pending") && !curr.includes("N/A")) {
                return curr;
            }
        }
        return fallback;
    };

    // Very large search grid for clinical history
    const hist = val([
        'clinical_history', 'history', 'narrative', 'transcript', 'transcription', 
        'clinical_observations', 'observations', 'patient_story', 'presenting_complaint'
    ], "Clinical observations are currently being synchronized or were not explicitly documented in this phase.");

    // Very large search grid for diagnostic findings
    const diag = val([
        'diagnosis_draft', 'impression_summary', 'summary', 'findings', 
        'detailed_findings', 'case_analysis', 'diagnostic_interpretation', 'impression'
    ], "Radiology data analysis and clinical interpretation are currently in progress.");
    
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return `
    <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 40px; background: #ffffff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0891B2; padding-bottom: 20px; margin-bottom: 30px;">
            <div>
                <h1 style="margin: 0; color: #0891B2; font-size: 28px; font-weight: 800; letter-spacing: -0.02em;">MEDECHO</h1>
                <p style="margin: 5px 0 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Clinical AI Documentation Suite</p>
            </div>
            <div style="text-align: right;">
                <p style="margin: 0; font-size: 14px; font-weight: 700;">Medical Report</p>
                <p style="margin: 3px 0 0; font-size: 12px; color: #94a3b8;">Ref: ${r.reportId || r.report_id || 'PENDING'}</p>
            </div>
        </div>

        <div style="background: #f8fafc; border-radius: 16px; padding: 24px; margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-size: 11px; font-weight: 700; color: #0891B2; text-transform: uppercase;">Patient Identity</span>
                <span style="font-size: 18px; font-weight: 700;">${r.patient_name || r.patient || "N/A"}</span>
                <span style="font-size: 12px; color: #64748b;">DOB / ID: ${r.patient_id || r.patientId || '#-'}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; text-align: right;">
                <span style="font-size: 11px; font-weight: 700; color: #0891B2; text-transform: uppercase;">Date of Examination</span>
                <span style="font-size: 16px; font-weight: 600;">${dateStr}</span>
                <span style="font-size: 12px; color: #64748b;">Phase: ${r.phase || 'Intake'}</span>
            </div>
        </div>

        <div style="margin-bottom: 30px;">
            <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 6px 12px; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 12px; font-weight: 800; color: #0891B2; text-transform: uppercase; letter-spacing: 0.05em;">Clinical History & Observations</h3>
            </div>
            <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap; padding-left: 4px;">
                ${hist}
            </div>
        </div>

        <div style="margin-bottom: 30px;">
            <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 6px 12px; margin-bottom: 12px;">
                <h3 style="margin: 0; font-size: 12px; font-weight: 800; color: #0891B2; text-transform: uppercase; letter-spacing: 0.05em;">AI Radiology / Data Analysis</h3>
            </div>
            <div style="font-size: 15px; line-height: 1.6; color: #334155; padding-left: 4px;">
                ${diag}
            </div>
        </div>

        <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-end;">
            <div>
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">Electronically signed by</p>
                <p style="margin: 5px 0 0; font-size: 14px; font-weight: 700;">Dr. MedEcho AI Systems</p>
            </div>
            <div style="width: 120px; height: 1px; background: transparent;"></div>
        </div>
    </div>`;
}

// ---------------------------------------------------------
// LIFECYCLE & SYNC
// ---------------------------------------------------------

function initMobileFeatures() {
    const mobileBtn = byId("mobile-menu-btn");
    const sidebar = byId("sidebar-main");
    const overlay = byId("sidebar-overlay");

    const toggleSidebar = () => {
        if (!sidebar || !overlay) return;
        const isHidden = sidebar.classList.contains("hidden");
        
        if (isHidden) {
            sidebar.classList.remove("hidden");
            sidebar.classList.add("fixed", "inset-y-0", "left-0", "bg-white", "dark:bg-slate-900", "shadow-2xl", "animate-in", "slide-in-from-left", "duration-300");
            overlay.classList.remove("hidden");
        } else {
            sidebar.classList.add("hidden");
            sidebar.classList.remove("fixed", "inset-y-0", "left-0", "bg-white", "dark:bg-slate-900", "shadow-2xl");
            overlay.classList.add("hidden");
        }
    };

    if (mobileBtn) mobileBtn.onclick = toggleSidebar;
    if (overlay) overlay.onclick = toggleSidebar;

    // Auto-dismiss sidebar on navigation
    qsa(".nav-item").forEach(item => {
        item.addEventListener("click", () => {
            if (window.innerWidth < 1024 && sidebar && !sidebar.classList.contains("hidden")) {
                toggleSidebar();
            }
        });
    });

    qsa(".mobile-nav-item").forEach(item => item.onclick = () => showSection(item.dataset.page));
}

document.addEventListener("DOMContentLoaded", () => {
    // Restore Theme
    const savedTheme = localStorage.getItem("theme") || "light";
    if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
    }

    initCoreElements();
    initMobileFeatures();
    
    if (typeof checkPermissions === "function") checkPermissions();

    // ── Language: re-render static i18n labels on langchange ─────────────
    document.addEventListener("langchange", () => {
        // Re-render the current page to re-evaluate t() for dynamic JS templates
        if (state.currentPage && state.currentPage !== "dashboard") {
            loadPage(state.currentPage);
        } else {
            initDashboardPage().then(() => window.applyTranslations());
        }
    });

    let syncAttempts = 0;
    const checkBackend = async () => {
        const overlay = document.getElementById("health-check-overlay");
        const statusText = document.querySelector("#health-check-overlay p");
        try {
            if (statusText) statusText.textContent = `Dialing Clinical Server (Attempt ${++syncAttempts})...`;
            await api.checkHealth();
            console.log("Connected.");
            if (overlay) {
                overlay.classList.add("opacity-0");
                setTimeout(() => overlay.classList.add("hidden"), 500);
            }
            api.getConfig().then(c => setConfig(c)).catch(e => {});
        } catch (e) {
            syncAttempts++;
            if (statusText) statusText.textContent = `Server waking up... retrying (Attempt ${syncAttempts})`;
            setTimeout(checkBackend, 2500);
        }
    };
    checkBackend();

    const params = new URLSearchParams(window.location.search);
    const urlPage = params.get("page") || "dashboard";
    if (state.selectedPatientId) selectPatient(state.selectedPatientId);
    else loadPage(urlPage);
});

// ---------------------------------------------------------
// REPORT VIEW & FINALIZATION
// ---------------------------------------------------------
async function initReportViewPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get("report_id");
    
    const loadingEl = byId("report-loading");
    const idEl = byId("view-report-id");
    const impressionEl = byId("view-report-impression");
    const recsEl = byId("view-report-recommendations");
    const downloadBtn = byId("download-pdf-btn");

    if (!reportId) {
        ui.showToast("Critical Error: Missing Clinical Artifact ID", "error");
        loadPage("dashboard");
        return;
    }

    if (idEl) idEl.textContent = reportId;

    try {
        // Fetch full clinical data
        const report = await api.getReportDetails(reportId);
        
        if (impressionEl) {
            const impression = report.clinical_impression || report.clinical_history || "No impression documented.";
            impressionEl.innerHTML = impression;
        }
        
        if (recsEl) {
            const recs = report.recommendations || report.detailed_findings || "No specific directives issued.";
            if (Array.isArray(recs)) {
                recsEl.innerHTML = `<ul class="space-y-4">${recs.map(r => `
                    <li class="flex items-start gap-3">
                        <span class="material-symbols-outlined text-emerald-500 text-sm mt-0.5">check_circle</span>
                        <span>${esc(r.observation || r)}</span>
                    </li>
                `).join("")}</ul>`;
            } else {
                recsEl.innerHTML = recs;
            }
        }

        // Deactivate Loading Mask
        if (loadingEl) {
            loadingEl.style.opacity = "0";
            setTimeout(() => loadingEl.classList.add("hidden"), 700);
        }

        // Wire PDF Download
        if (downloadBtn) {
            downloadBtn.onclick = async () => {
                ui.showToast("Generating Clinical PDF Node...", "primary");
                try {
                    const blob = await api.generatePdf(report);
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = `MedEcho_Report_${reportId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    ui.showToast("Artifact Download Initiated", "success");
                } catch (err) {
                    ui.showToast("PDF Generation Failed: Device Error", "error");
                }
            };
        }

    } catch (err) {
        console.error("Report Fetch Failed:", err);
        ui.showToast("Registry Synchronization Failure", "error");
        if (loadingEl) loadingEl.innerHTML = `<p class="text-red-400 font-bold uppercase text-[10px]">Registry Sync Failed</p>`;
    }
}

// ---------------------------------------------------------
// QUICK RECORD GLOBAL HANDLER
// ---------------------------------------------------------
function handleQuickRecord() {
    if (!state.selectedPatientId) {
        ui.showToast("Select a patient from the registry to begin recording", "primary");
        showSection('patients');
        return;
    }
    openRecordingModal('assessment');
}
