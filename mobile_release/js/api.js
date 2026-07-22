import state from "./state.js";

// Connect to local backend by default, but allow overrides via localStorage (for Mobile/APK)
const DEFAULT_URL = "http://localhost:8001";
export const API_URL = localStorage.getItem("medecho_server_url") || DEFAULT_URL;

console.log("MedEcho API connected to:", API_URL);

/**
 * Generic fetch wrapper with error handling
 */
async function request(endpoint, options = {}) {
    try {
        const url = `${API_URL}${endpoint}`;
        const res = await fetch(url, options);
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
