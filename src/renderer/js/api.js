import state from "./state.js";

// ── BACKEND URLS ───────────────────────────────────────────────────────
// Replace AWS_URL below with your actual AWS endpoint once deployed
// Format: https://<id>.execute-api.<region>.amazonaws.com  OR
//         https://<subdomain>.amazonaws.com  OR any custom domain
const AWS_URL = "https://medecho.duckdns.org"; // ← replace with your AWS URL
const LOCAL_URL = "http://192.168.100.2:8001";

// PRIORITY: 1. Manually saved URL (from Settings page)
//           2. AWS URL (if running on HTTPS / cloud host)
//           3. Local Network IP (development)
const _hostname = window.location.hostname;
const _isCloud = window.location.protocol === "https:"
    || _hostname.includes("amazonaws.com")
    || _hostname.includes("execute-api")
    || _hostname.includes("railway.app")
    || _hostname.includes("render.com")
    || _hostname.includes("medecho");

const _savedUrl = localStorage.getItem("medecho_server_url");

export const API_URL = (_savedUrl && !_savedUrl.includes("localhost"))
    ? _savedUrl
    : (_isCloud ? AWS_URL : LOCAL_URL);

console.log(`[MedEcho] Active Backend: ${API_URL}`);
console.log(`[MedEcho] Environment: ${_isCloud ? "PRODUCTION/CLOUD" : "DEVELOPMENT/LOCAL"}`);

/**
 * Generic fetch wrapper with error handling
 */
async function request(endpoint, options = {}) {
    // 10-second timeout for mobile resilience
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
        const url = `${API_URL}${endpoint}`;
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API Error ${res.status}: ${errorText || res.statusText}`);
        }
        // Return JSON if content-type is json, else text or blob?
        // For now assume JSON unless specified
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await res.json();
        }
        return res;
    } catch (err) {
        console.error(`Request failed: ${endpoint}`, err);
        throw err;
    }
}

export const api = {
    // Clinical Engine Health & Lifecycle
    checkHealth: () => request("/health"),

    // Config
    getConfig: () => request("/config"),
    saveConfig: (config) => request("/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
    }),
    getUsageStats: () => request("/usage-stats"),

    // Patients
    getPatients: () => request("/patients"),
    getPatient: (id) => request(`/patients/${id}`),
    createPatient: (data) => request("/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }),
    updatePatient: (id, data) => request(`/patients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }),
    deletePatient: (id) => request(`/patients/${id}`, { method: "DELETE" }),

    reopenStage1: (id) => request(`/patients/${id}/reopen-stage1`, { method: "POST" }),
    generateAiDiagnosis: (id) => request(`/patients/${id}/ai-diagnosis`, { method: "POST" }),

    // Documents
    async uploadDocument(patientId, formData) {
        return request(`/patients/${patientId}/documents`, {
            method: "POST",
            body: formData
        });
    },
    getPatientDocuments: (patientId) => request(`/patients/${patientId}/documents`),
    getPatientSessions: (patientId) => request(`/patients/${patientId}/sessions`),

    // System / Checklist API
    getSystemChecklist: () => request("/system/checklist"),
    saveSystemChecklist: (data) => request("/system/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }),

    // Reports / Cases
    listReports: (patientId = null) => {
        let url = "/list-reports";
        if (patientId) url += `?patient_id=${patientId}`;
        return request(url);
    },
    getReportDetails: (reportId) => request(`/reports/${reportId}/details`),

    // Phase 1
    getPhase1Cases: (patientId = null) => {
        let url = "/phase1-cases";
        if (patientId) url += `?patient_id=${patientId}`;
        return request(url);
    },

    // Audio Upload
    transcribe: (formData, phase, onProgress) => {
        const endpoint = phase === "final_assessment" ? "/phase2-transcribe" : "/phase1-transcribe";
        const url = `${API_URL}${endpoint}`;

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url);

            if (onProgress) {
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percent = (event.loaded / event.total) * 100;
                        onProgress(percent);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        // Check content type
                        const contentType = xhr.getResponseHeader("content-type");
                        if (contentType && contentType.includes("application/json")) {
                            resolve(JSON.parse(xhr.responseText));
                        } else {
                            resolve(xhr.responseText);
                        }
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else {
                    reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            };

            xhr.onerror = () => reject(new Error("Network Error"));
            xhr.send(formData);
        });
    },

    // PDF Generation
    async generatePdf(reportData) {
        const res = await request("/generate-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_json: reportData })
        });
        return await res.blob();
    }
};
