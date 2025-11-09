// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration ---
const API_URL = "http://localhost:8000"; // Targeting FastAPI server for robust Electron connection
// Global Firebase variables
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? initialAuthToken : null; // Corrected check

let app;
let db;
let auth;
let userId = null;
let isAuthReady = false;

// --- DOM Elements ---
const contentArea = document.getElementById('dynamic-content');
const userIdDisplay = document.getElementById('user-id-display');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
// const html = document.documentElement; // No longer needed for theme toggle

// Navigation Elements
const navItems = document.querySelectorAll('.nav-item');
const tabItems = document.querySelectorAll('.tab-item');
const allNavElements = [...navItems, ...tabItems];
const dashboardSection = document.getElementById('content-dashboard');

// Modals
const patientModal = document.getElementById('add-patient-modal');
const patientForm = document.getElementById('new-patient-form');
const recordingModal = document.getElementById('recording-modal');
const editReportModal = document.getElementById('edit-report-modal');
const editReportForm = document.getElementById('edit-report-form');
const editPatientInfo = document.getElementById('edit-report-patient-info');
const reportContentArea = document.getElementById('report-content');
const editFeedback = document.getElementById('edit-feedback');

// Audio Recording Elements
const startRecordBtn = document.getElementById('start-record-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const recordingStatus = document.getElementById('recording-status');
const recordingTimer = document.getElementById('recording-timer');
const modalFeedback = document.getElementById('modal-feedback');
const dashboardActivityBody = document.getElementById('dashboard-activity-body');

// --- Audio State ---
let mediaRecorder;
let audioChunks = [];
let audioBlob;
let audioStream;
let timerInterval;

// Initialize mock data for the dashboard since the API returns only a file (not JSON)
let recentReportsData = [
    { caseId: 'RPT-1004', patientName: 'Johnathan Doe', date: '2024-07-28', type: 'Consultation', status: 'Complete' },
    { caseId: 'RPT-1005', patientName: 'Eleanor Pena', date: '2024-07-27', type: 'Follow-up', status: 'Processing' },
];

// --- Utility Functions & Rendering ---

// **** THIS IS THE GUARANTEED FIX ****
// This function is rewritten to use direct style manipulation,
// which AVOIDS the DOMException error completely.
const showMessage = (element, message, type = 'success', duration = 2000) => {
    
    // 1. Clean up old classes and reset style
    element.classList.remove('text-green-500', 'text-red-500', 'text-primary', 'dark:text-primary', 'hidden');
    element.style.color = ''; // Remove any inline style

    // 2. Set color using element.style (This will not fail)
    if (type === 'error') {
        element.style.color = 'red';
    } else if (type === 'primary') {
        element.style.color = '#195de6'; // Your app's primary blue color
    } else { // Success
        element.style.color = 'green';
    }

    // 3. Set text and show
    element.textContent = message;
    element.classList.remove('hidden');
    
    // 4. Set timeout to hide
    if (duration > 0) {
        setTimeout(() => {
            element.classList.add('hidden');
            element.style.color = ''; // Reset style on hide
        }, duration);
    }
};

const getCollectionPath = (collectionName) => {
    if (!userId) {
        console.error("User ID is not defined for collection path. Using public fallback.");
        return `/artifacts/${appId}/public/data/${collectionName}`; 
    }
    return `/artifacts/${appId}/users/${userId}/${collectionName}`;
};

/**
 * Renders the small 'Recent Activity' table on the Dashboard based on local mock data.
 */
const renderDashboardRecentActivity = () => {
    if (!dashboardActivityBody) return;

    dashboardActivityBody.innerHTML = '';
    
    const recentActivity = [...recentReportsData]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    if (recentActivity.length === 0) {
        dashboardActivityBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No recent activity recorded.</td></tr>`;
        return;
    }
    
    recentActivity.forEach(report => {
        let statusClass = report.status === 'Complete' 
            ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' 
            : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300';
            
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">${report.patientName} (${report.caseId})</td>
            <td class="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">${report.date}</td>
            <td class.whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">${report.type}</td>
            <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full ${statusClass} px-2.5 py-0.5 text-xs font-medium">${report.status}</span>
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-right font-medium"><a class="text-primary hover:underline" href="#">View</a></td>
        `;
        dashboardActivityBody.appendChild(row);
    });
};

const renderReports = (patients) => { 
    const reportsTableBody = document.getElementById('reports-table-body');
    if (!reportsTableBody) return; 
    reportsTableBody.innerHTML = ''; 
    if (patients.length === 0) {
        reportsTableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No patient records or reports found.</td></tr>`;
        return;
    }
    patients.forEach(patient => {
        const row = document.createElement('tr');
        let statusText = patient.status || 'Unknown';
        let statusClass = 'bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-300';
        if (statusText === 'Active') {
            statusClass = 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300';
        } else if (statusText === 'Follow-up') {
            statusClass = 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300';
        } else if (statusText === 'Error') {
            statusClass = 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300';
        }
        row.innerHTML = `
            <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">${patient.name || 'N/A'} (ID: ${patient.patientId || 'N/A'})</td>
            <td class="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">${patient.latestReport || 'N/A'}</td>
            <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full ${statusClass} px-2.5 py-0.5 text-xs font-medium">${statusText}</span>
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-center font-medium space-x-2">
                <button data-patient-id="${patient.id}" data-patient-name="${patient.name}" class="edit-report-btn text-blue-500 dark:text-blue-400 hover:underline text-sm">Edit Report</button>
                <button data-patient-id="${patient.id}" data-patient-name="${patient.name}" class="export-pdf-btn flex-shrink-0 inline-flex items-center rounded-md border border-transparent bg-primary px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-primary/90">
                    <span class="material-symbols-outlined text-sm mr-1">picture_as_pdf</span> PDF Export
                </button>
            </td>
        `;
        reportsTableBody.appendChild(row);
    });
    attachReportActionListeners();
};

const attachReportActionListeners = () => {
    const addPatientBtnDynamic = document.getElementById('add-patient-btn');
    if (addPatientBtnDynamic) {
        addPatientBtnDynamic.addEventListener('click', () => patientModal.classList.remove('hidden'));
    }
    document.querySelectorAll('.edit-report-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const patientId = e.target.getAttribute('data-patient-id');
            const patientName = e.target.getAttribute('data-patient-name');
            openEditReportModal(patientId, patientName);
        });
    });
    document.querySelectorAll('.export-pdf-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const patientId = e.target.getAttribute('data-patient-id');
            const patientName = e.target.getAttribute('data-patient-name');
            simulatePdfExport(patientId, patientName, e.target);
        });
    });
};

const startPatientListener = () => {
    if (!db || !userId || !isAuthReady) {
        console.error("Firestore not ready or user not authenticated.");
        return;
    }
    const patientsColRef = collection(db, getCollectionPath('patients'));
    onSnapshot(patientsColRef, (snapshot) => {
        const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (document.getElementById('reports-table-body')) {
            renderReports(patients);
        }
    }, (error) => {
        console.error("Error listening to reports collection:", error);
        const reportsTableBody = document.getElementById('reports-table-body');
        if (reportsTableBody) {
             reportsTableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500 dark:text-red-400">Error loading data. Check console.</td></tr>`;
        }
    });
};


// --- Audio Recording Logic ---

const startTimer = () => { 
    let seconds = 0;
    recordingTimer.classList.remove('hidden');
    timerInterval = setInterval(() => {
        seconds++;
        const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        recordingTimer.textContent = `${mins}:${secs}`;
    }, 1000);
};
const stopTimer = () => { 
    clearInterval(timerInterval);
};
const resetRecordingUI = () => { 
    stopTimer();
    recordingTimer.textContent = '00:00';
    recordingTimer.classList.add('hidden');
    recordingStatus.textContent = 'Ready to Record';
    startRecordBtn.classList.remove('hidden');
    stopRecordBtn.classList.add('hidden');
    stopRecordBtn.disabled = true;
    document.getElementById('record-error-message').classList.add('hidden');
    modalFeedback.classList.add('hidden');
};
const startRecording = async () => { 
    resetRecordingUI();
    audioChunks = [];
    
    try {
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(audioStream);
        mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
        
        mediaRecorder.onstop = () => {
            stopTimer();
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            // Stop mic input visually
            audioStream.getTracks().forEach(track => track.stop());
            initiateReportGeneration(); // Trigger API call
        };
        
        mediaRecorder.start();
        startTimer();
        recordingStatus.textContent = 'Recording...';
        startRecordBtn.classList.add('hidden');
        stopRecordBtn.classList.remove('hidden');
        stopRecordBtn.disabled = false;
        
    } catch (err) {
        console.error("Error accessing microphone:", err);
        recordingStatus.textContent = 'Microphone access denied or failed.';
        document.getElementById('record-error-message').textContent = 'Error: Please ensure you have allowed microphone access.';
        document.getElementById('record-error-message').classList.remove('hidden');
        if (audioStream) audioStream.getTracks().forEach(track => track.stop());
        resetRecordingUI();
    }
};
const stopRecording = () => { 
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        stopRecordBtn.disabled = true;
    }
};

/**
 * Handles the completion of recording and sends the audio to the FastAPI backend.
 * This function handles the PDF response directly.
 */
const initiateReportGeneration = async () => {
    stopRecordBtn.classList.add('hidden');
    startRecordBtn.classList.add('hidden');

    // --- DEBUG CHECK: Is the recorded blob empty? ---
    if (!audioBlob || audioBlob.size === 0) {
        const errorMsg = 'FAILURE: Audio recording captured a zero-size file. Try recording longer or ensure microphone input is working.';
        console.error(errorMsg, 'Blob Size:', audioBlob ? audioBlob.size : 'N/A');
        recordingStatus.textContent = 'Recording Failed (No Data).';
        showMessage(modalFeedback, errorMsg, 'error', 5000);
        return;
    }
    // --------------------------------------------------

    // 1. Show generation status
    recordingStatus.textContent = 'Uploading & Generating Report...';
    showMessage(modalFeedback, `Sending audio (Size: ${audioBlob.size} bytes) to FastAPI...`, 'primary', 0);

    try {
        // --- REAL API CALL IMPLEMENTATION ---
        const formData = new FormData();
        formData.append("file", audioBlob, `consultation_${new Date().getTime()}.webm`);

        // Log the exact URL being targeted
        console.log(`[Frontend] Attempting POST to: ${API_URL}/generate-report`);

        const response = await fetch(`${API_URL}/generate-report`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            // Check for potential server crashes or 500 errors
            const errorBody = await response.text();
            throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}. Server message: ${errorBody.substring(0, 100)}...`);
        }
        
        // 2. Report Generated - Handle PDF Response
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        
        // Trigger download
        const a = document.createElement('a');
        a.href = downloadUrl;
        
        // Use a robust filename extraction
        let filename = 'medical_report.pdf';
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+?)"/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        // 3. Update UI feedback
        recordingStatus.textContent = 'Download Complete!';
        showMessage(modalFeedback, 
            `✅ Report Generated! PDF download initiated.`, 
            'success', 
            4000
        );
        
        // 4. Update the dashboard mock data to show a successful activity
        recentReportsData.unshift({
            caseId: `RPT-${Math.floor(Math.random() * 1000) + 1000}`, 
            patientName: "New Consultation Report", 
            date: new Date().toISOString().split('T')[0],
            type: 'Consultation',
            status: 'Complete'
        });
        renderDashboardRecentActivity();

        // 5. Close the modal after a short delay
        setTimeout(() => {
            recordingModal.classList.add('hidden');
            resetRecordingUI();
        }, 4500);

    } catch (error) {
        console.error("Report Generation Failed:", error);
        recordingStatus.textContent = 'Generation Failed.';
        const detailedError = error instanceof TypeError && error.message.includes('fetch') 
            ? 'Network connection failed. Check if FastAPI server is running on localhost:8000.'
            : `Server processing or HTTP error. Details: ${error.message}`;
            
        showMessage(modalFeedback, detailedError, 'error', 8000);
    }
};


// --- SPA Navigation Logic and Setup ---

const loadContent = async (pageId) => {
    if (pageId === 'dashboard') {
        dashboardSection.classList.remove('hidden');
        contentArea.innerHTML = '';
        return;
    }
    dashboardSection.classList.add('hidden');
    const fileName = `${pageId}.html`;
    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`Could not load ${fileName}`);
        const htmlContent = await response.text();
        contentArea.innerHTML = htmlContent;
        
        if (pageId === 'reports') {
            if (isAuthReady) {
                 const patientsColRef = collection(db, getCollectionPath('patients'));
                 onSnapshot(patientsColRef, (snapshot) => {
                     renderReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                 });
            }
        }
        if (pageId === 'settings') {
            const settingsForm = document.getElementById('settings-form');
            if (settingsForm) { settingsForm.addEventListener('submit', handleSettingsSubmit); }
            // All theme toggle logic removed
        }
        
    } catch (error) {
        console.error("Error loading page content:", error);
        contentArea.innerHTML = `<p class="text-red-500">Failed to load ${pageId} content. ${error.message}</p>`;
    }
};

const handleNavigationClick = (e) => {
    e.preventDefault();
    const pageId = e.currentTarget.getAttribute('data-page');
    loadContent(pageId);
    setActiveLink(pageId);
    if (window.innerWidth < 768) { sidebar.classList.add('-translate-x-full'); }
};

const setActiveLink = (pageId) => {
    allNavElements.forEach(el => {
        const isSidebarItem = el.tagName === 'LI';
        if (isSidebarItem) {
            el.classList.remove('bg-primary/10', 'dark:bg-primary/20', 'text-primary');
            el.classList.add('text-gray-600', 'dark:text-gray-400', 'hover:bg-gray-100', 'dark:hover:bg-gray-800');
        } else {
            el.classList.remove('border-primary', 'text-primary', 'font-semibold');
            el.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400', 'hover:border-gray-300', 'dark:hover:border-gray-600', 'hover:text-gray-700', 'dark:hover:text-gray-300', 'font-medium');
        }
    });
    allNavElements.filter(el => el.getAttribute('data-page') === pageId)
        .forEach(el => {
            const isSidebarItem = el.tagName === 'LI';
            if (isSidebarItem) {
                el.classList.add('bg-primary/10', 'dark:bg-primary/20', 'text-primary');
                el.classList.remove('text-gray-600', 'dark:text-gray-400', 'hover:bg-gray-100', 'dark:hover:bg-gray-800');
            } else {
                el.classList.add('border-primary', 'text-primary', 'font-semibold');
                el.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400', 'hover:border-gray-300', 'dark:hover:border-gray-600', 'hover:text-gray-700', 'dark:hover:text-gray-300', 'font-medium');
            }
        });
};


// --- Handlers for Modals/Forms ---

const handleNewPatientSubmit = async (e) => {
    e.preventDefault();
    const saveButton = e.submitter;
    if (!db || !userId || !isAuthReady) {
        console.error("Database not ready. Please wait for authentication.");
        showMessage(document.getElementById('profile-feedback'), "System busy. Please try again in a moment.", 'error');
        return;
    }
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;
    const formData = new FormData(patientForm);
    const newPatient = {
        name: formData.get('name') || 'Unnamed Patient',
        patientId: formData.get('patientId').toUpperCase(),
        latestReport: new Date().toISOString().split('T')[0],
        status: 'Active',
        createdAt: new Date(),
    };
    try {
        const patientsColRef = collection(db, getCollectionPath('patients'));
        await addDoc(patientsColRef, newPatient);
        showMessage(document.getElementById('profile-feedback'), "Patient added successfully!", 'success', 1500);
        patientForm.reset();
        setTimeout(() => patientModal.classList.add('hidden'), 500); 
    } catch (error) {
        console.error("Error adding patient:", error);
        showMessage(document.getElementById('profile-feedback'), "Failed to add patient. See console.", 'error', 3000);
    } finally {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
};

const handleEditReportSubmit = (e) => {
    e.preventDefault();
    const saveButton = e.submitter;
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Saving...';
    saveButton.disabled = true;
    setTimeout(() => {
        showMessage(editFeedback, "Report saved successfully!", 'success', 1500);
        setTimeout(() => {
            editReportModal.classList.add('hidden');
            saveButton.textContent = originalText;
            saveButton.disabled = false;
        }, 1800);
    }, 1000);
};

const handleSettingsSubmit = (e) => {
    e.preventDefault();
    const profileFeedback = document.getElementById('profile-feedback');
    showMessage(profileFeedback, "Profile saved successfully!", 'success', 2000);
};

// Theme toggle functions removed

const openEditReportModal = (patientId, patientName) => {
    editPatientInfo.innerHTML = `Editing report for: <strong class="text-gray-800 dark:text-white">${patientName} (ID: ${patientId})</strong>`;
    reportContentArea.value = `[AI GENERATED REPORT FOR ${patientName}]\n\n* **Patient ID:** ${patientId}\n* **Date:** ${new Date().toISOString().split('T')[0]}\n* **Summary:** The patient presented with symptoms consistent with minor arterial fibrillation. Medication dosage adjusted. Follow up in 4 weeks. Report is ready for review and edit.`;
    editFeedback.classList.add('hidden');
    editReportModal.classList.remove('hidden');
};

const simulatePdfExport = (patientId, patientName, button) => {
    const originalText = button.textContent;
    button.innerHTML = '<span class="material-symbols-outlined text-sm mr-1 animate-spin">sync</span> Exporting...';
    button.disabled = true;

    setTimeout(() => {
        // Since we cannot run FastAPI here, this button is a client-side mock
        alert(`Simulating PDF export for ${patientName} (ID: ${patientId}). Download Complete!`);
        button.innerHTML = originalText;
        button.disabled = false;
    }, 1500);
};


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Load & Theme Setup
    const initialPage = 'dashboard';
    loadContent(initialPage);
    setActiveLink(initialPage);
    // updateThemeSwitch(html.classList.contains('dark')); // Removed
    
    // 2. Attach Global Event Listeners
    allNavElements.forEach(el => el.addEventListener('click', handleNavigationClick));
    if (menuToggle) menuToggle.addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));

    // 3. Attach Modal/Dashboard Listeners
    document.getElementById('close-modal').addEventListener('click', () => patientModal.classList.add('hidden'));
    document.getElementById('cancel-modal').addEventListener('click', () => patientModal.classList.add('hidden'));
    patientForm.addEventListener('submit', handleNewPatientSubmit);
    
    document.getElementById('record-session-btn').addEventListener('click', () => { 
        recordingModal.classList.remove('hidden');
        const closeRecordingModalBtn = document.getElementById('close-recording-modal');
        if (closeRecordingModalBtn) closeRecordingModalBtn.addEventListener('click', () => {
            recordingModal.classList.add('hidden');
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            if (audioStream) audioStream.getTracks().forEach(track => track.stop());
            resetRecordingUI();
        });
        if (startRecordBtn) startRecordBtn.addEventListener('click', startRecording);
        if (stopRecordBtn) stopRecordBtn.addEventListener('click', stopRecording);
        resetRecordingUI();
    });

    document.getElementById('close-edit-modal').addEventListener('click', () => editReportModal.classList.add('hidden'));
    document.getElementById('cancel-edit-modal').addEventListener('click', () => editReportModal.classList.add('hidden'));
    editReportForm.addEventListener('submit', handleEditReportSubmit);

    // 4. Initialize Firebase & Initial Dashboard Render
    setupFirebase();
    renderDashboardRecentActivity(); // Initial render of mock data
});

const setupFirebase = async () => {
    try {
        if (!firebaseConfig) { console.error("Firebase config is missing."); return; }
        setLogLevel('Debug');
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        const authPromise = new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) { userId = user.uid; } else { // Corrected: user.uid
                    try {
                        if (initialAuthToken) { await signInWithCustomToken(auth, initialAuthToken); }
                        else { await signInAnonymously(auth); }
                        userId = auth.currentUser.uid;
                    } catch (error) { userId = crypto.randomUUID(); }
                }
                isAuthReady = true;
                if(userIdDisplay) userIdDisplay.textContent = `User ID: ${userId}`;
                unsubscribe();
                resolve();
            });
        });
        await authPromise;
        
        startPatientListener();

    } catch (error) {
        console.error("Error during Firebase initialization:", error);
        userId = crypto.randomUUID();
        isAuthReady = true;
        if(userIdDisplay) userIdDisplay.textContent = `Error connecting. ID: ${userId}`;
    }
};