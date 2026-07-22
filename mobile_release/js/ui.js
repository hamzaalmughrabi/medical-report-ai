/**
 * js/ui.js
 * Shared UI components and DOM manipulation helpers.
 */

import { qs, qsa } from "./utils.js";

let currentRecordingState = "IDLE";

export const ui = {
    getRecordingState: () => currentRecordingState,
    // Sidebar & Navigation
    updateSidebar: (patientId, stage1Status, stage2Status) => {
        const allNavs = qsa(".nav-item");

        if (!patientId) {
            // Locked state
            allNavs.forEach(el => {
                const p = el.dataset.page;
                if (["history", "phase1", "phase2", "patient-profile"].includes(p)) {
                    el.classList.add("locked");
                    const badge = el.querySelector(".status-badge");
                    if (badge) badge.remove();
                } else {
                    el.classList.remove("locked");
                }
            });
            return;
        }

        // Patient Active
        allNavs.forEach(el => {
            const p = el.dataset.page;

            if (p === "history") el.classList.remove("locked");

            if (p === "phase1") {
                el.classList.remove("locked");
                ui.updateBadge(el, stage1Status);
            }

            if (p === "phase2") {
                if (stage2Status === "locked") {
                    el.classList.add("locked");
                    const badge = el.querySelector(".status-badge");
                    if (badge) badge.remove();
                } else {
                    el.classList.remove("locked");
                    ui.updateBadge(el, stage2Status);
                }
            }
        });
    },

    updateBadge: (navItem, status) => {
        let badge = navItem.querySelector(".status-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "status-badge ml-auto text-xs px-2 py-0.5 rounded-full font-medium hidden md:inline-block";
            navItem.appendChild(badge);
        }

        if (status === "completed") {
            badge.textContent = "Done";
            badge.className = "status-badge ml-auto text-xs px-2 py-0.5 rounded-full font-medium hidden md:inline-block bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
        } else {
            badge.remove();
        }
    },

    setActiveLink: (pageId) => {
        const allNavs = qsa(".nav-item, .tab-item, .mobile-nav-item");
        allNavs.forEach(el => {
            el.classList.remove("active");
            // Also remove legacy inline styles if present
            el.classList.remove("text-primary", "font-semibold");
            const parentLi = el.closest("li");
            if (parentLi) parentLi.classList.remove("bg-primary/10");
        });

        const activeEls = [...allNavs].filter(el => el.dataset.page === pageId);
        activeEls.forEach(el => {
            el.classList.add("active");
            // Standardize active appearance
            if (el.classList.contains("nav-item")) {
                el.classList.add("bg-primary/10", "text-primary", "font-bold", "border-r-4", "border-primary");
            } else if (el.classList.contains("mobile-nav-item")) {
               // Mobile nav active state handled by CSS .active
            } else {
                el.classList.add("text-primary", "font-semibold");
            }
        });
    },

    // Recording Modal UI
    setRecordingState: (state) => {
        const els = {
            startBtn: qs("#start-record-btn"),
            activeControls: qs("#active-controls"),
            pauseBtn: qs("#pause-record-btn"),
            resumeBtn: qs("#resume-record-btn"),
            stopBtn: qs("#stop-record-btn"),
            previewContainer: qs("#audio-preview-container"),
            progressContainer: qs("#upload-progress-container"),
            timer: qs("#recording-timer"),
            status: qs("#recording-status"),
            visualizer: qs("#audio-visualizer"),
            pulse: qs("#recording-pulse"),
            pausedOverlay: qs("#paused-overlay"),
            micWrapper: qs("#mic-icon-wrapper")
        };

        if (!els.startBtn) return; // Modal not open

        currentRecordingState = state;

        // Reset defaults
        els.startBtn.classList.add("hidden");
        els.activeControls.classList.add("hidden");
        els.previewContainer.classList.add("hidden");
        els.progressContainer.classList.add("hidden");
        els.timer.classList.add("hidden");
        els.visualizer.classList.add("hidden");
        els.pulse.classList.add("hidden");
        els.pausedOverlay.classList.add("hidden");
        if (els.micWrapper) els.micWrapper.classList.remove("scale-110", "border-4", "border-red-500");

        switch (state) {
            case "IDLE":
                els.startBtn.classList.remove("hidden");
                if (els.status) {
                    els.status.textContent = "Ready to begin";
                    els.status.className = "text-slate-600 dark:text-slate-400 font-medium";
                }
                if (els.timer) els.timer.textContent = "00:00";
                break;

            case "RECORDING":
                els.activeControls.classList.remove("hidden");
                els.pauseBtn.classList.remove("hidden");
                els.resumeBtn.classList.add("hidden");
                els.timer.classList.remove("hidden");
                els.visualizer.classList.remove("hidden");
                els.pulse.classList.remove("hidden");
                if (els.status) {
                    els.status.textContent = "Recording in progress...";
                    els.status.className = "text-red-600 font-bold animate-pulse";
                }
                if (els.micWrapper) els.micWrapper.classList.add("scale-110", "border-4", "border-red-500");
                break;

            case "PAUSED":
                els.activeControls.classList.remove("hidden");
                els.pauseBtn.classList.add("hidden");
                els.resumeBtn.classList.remove("hidden");
                els.timer.classList.remove("hidden");
                els.pausedOverlay.classList.remove("hidden");
                if (els.status) {
                    els.status.textContent = "Session Paused";
                    els.status.className = "text-amber-600 font-bold";
                }
                break;

            case "REVIEW":
                els.previewContainer.classList.remove("hidden");
                if (els.status) {
                    els.status.textContent = "Review Audio";
                    els.status.className = "text-slate-900 dark:text-white font-bold";
                }
                break;

            case "UPLOADING":
                els.progressContainer.classList.remove("hidden");
                if (els.status) {
                    els.status.textContent = "Processing Report...";
                    els.status.className = "text-primary font-bold";
                }
                break;
        }
    },

    updateUploadProgress: (percent) => {
        const bar = qs("#progress-bar-fill");
        const text = qs("#progress-percent");

        if (bar) bar.style.width = `${percent}%`;
        if (text) text.textContent = `${Math.round(percent)}%`;

        const status = qs("#recording-status");
        if (percent >= 100 && status) {
            status.textContent = "Processing Report (AI)...";
            status.className = "text-purple-600 font-bold animate-pulse";
        }
    },

    showToast: (msg, type = "info") => {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            container.className = "fixed top-4 right-4 z-50 flex flex-col gap-2";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");

        let bgClass = "bg-slate-800 text-white";
        let icon = "info";

        if (type === "success") {
            bgClass = "bg-green-600 text-white";
            icon = "check_circle";
        } else if (type === "error") {
            bgClass = "bg-red-600 text-white";
            icon = "error";
        }

        toast.className = `${bgClass} shadow-lg rounded-xl px-4 py-3 min-w-[300px] flex items-center gap-3 transform transition-all duration-300 translate-x-full opacity-0`;
        toast.innerHTML = `
            <span class="material-symbols-outlined">${icon}</span>
            <span class="text-sm font-medium">${msg}</span>
        `;

        container.appendChild(toast);

        // Animate In
        requestAnimationFrame(() => {
            toast.classList.remove("translate-x-full", "opacity-0");
        });

        // Remove
        setTimeout(() => {
            toast.classList.add("translate-x-full", "opacity-0");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Loading
    showLoading: (container, msg = "Loading...") => {
        container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 space-y-4">
        <div class="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <p class="text-slate-400 text-sm font-medium animate-pulse">${msg}</p>
      </div>
    `;
    },

    showError: (container, msg) => {
        container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 text-red-500 animate-in fade-in">
        <span class="material-symbols-outlined text-4xl mb-2">error</span>
        <p class="font-bold">Failed to load content.</p>
        <p class="text-xs text-slate-400 mt-1">${msg}</p>
        <button onclick="location.reload()" class="mt-6 px-6 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm hover:bg-slate-200 transition-colors">Reload Application</button>
      </div>
    `;
    },

    // Handover Transition: Recording -> Editor
    handoverToEditor: (onComplete) => {
        const recModal = qs("#recording-modal");
        const editorModal = qs("#edit-report-modal");
        
        if (!recModal || !editorModal) {
            onComplete();
            return;
        }

        // 1. Zoom out the recording modal
        recModal.querySelector("div").style.transform = "scale(0.95)";
        recModal.style.opacity = "0";
        recModal.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

        setTimeout(() => {
            recModal.classList.add("hidden");
            recModal.style.transform = "";
            recModal.style.opacity = "";
            
            // 2. Slide up the editor modal
            editorModal.classList.remove("hidden");
            const panel = editorModal.querySelector("div");
            panel.style.transform = "translateY(20px)";
            panel.style.opacity = "0";
            panel.style.transition = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
            
            requestAnimationFrame(() => {
                panel.style.transform = "translateY(0)";
                panel.style.opacity = "1";
                if (onComplete) onComplete();
            });
        }, 300);
    }
};
