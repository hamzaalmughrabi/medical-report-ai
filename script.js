// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration ---
const API_URL = "http://localhost:8001"; // FIX: Reverted to port 8000 to match backend_api.py
// Global Firebase variables
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? initialAuthToken : null;

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
// const reportContentArea = document.getElementById('report-content'); // No longer a simple textarea
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

// --- Utility Functions & Rendering ---

const showMessage = (element, message, type = 'success', duration = 2000) => {
    element.classList.remove('text-green-500', 'text-red-500', 'text-primary', 'dark:text-primary', 'hidden');
    element.style.color = ''; 
    if (type === 'error') {
        element.style.color = 'red';
    } else if (type === 'primary') {
        element.style.color = '#195de6';
    } else { 
        element.style.color = 'green';
    }
    element.textContent = message;
    element.classList.remove('hidden');
    
    if (duration > 0) {
        setTimeout(() => {
            element.classList.add('hidden');
            element.style.color = ''; 
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
 * Renders the small 'Recent Activity' table on the Dashboard by fetching REAL data from the /reports endpoint.
 */
const renderDashboardRecentActivity = async () => {
    if (!dashboardActivityBody) return;
    dashboardActivityBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">Loading activity...</td></tr>`;

    let reportFiles = [];
    try {
        const response = await fetch(`${API_URL}/reports`);
        if (!response.ok) throw new Error('Failed to fetch reports list');
        const data = await response.json();
        reportFiles = data.reports || [];
        
        // NEW: Sort files by name (assuming filename contains a timestamp or date)
        // This is a basic sort, a better sort would be by file metadata/date
        reportFiles.sort().reverse(); 

    } catch (err) {
        console.error("Failed to load reports for dashboard:", err);
        dashboardActivityBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to load activity. Is backend running?</td></tr>`;
        return;
    }

    dashboardActivityBody.innerHTML = ''; // Clear "Loading..."
    
    const recentActivity = reportFiles.slice(0, 5); // Get top 5

    if (recentActivity.length === 0) {
        dashboardActivityBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No recent activity recorded.</td></tr>`;
        return;
    }
    
    recentActivity.forEach(filename => {
        const parts = filename.replace('.pdf', '').split('_');
        const patientName = parts.length > 1 ? parts[1] : "Report";
        const caseId = parts[0] || filename;
        const date = parts.length > 2 ? parts[2] : "N/A";

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">${patientName} (${caseId})</td>
            <td class="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">${date}</td>
            <td class="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">Consultation</td>
            <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium">Complete</span>
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-right font-medium">
                <button data-filename="${filename}" class="dashboard-download-btn text-primary hover:underline text-sm font-semibold inline-flex items-center">
                    <span class="material-symbols-outlined text-base align-middle mr-1">download</span>
                    View/Download
                </button>
            </td>
        `;
        dashboardActivityBody.appendChild(row);
    });

    dashboardActivityBody.querySelectorAll('.dashboard-download-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const filename = e.currentTarget.getAttribute('data-filename');
            downloadReport(filename, e.currentTarget); 
        });
    });
};

// --- History Page Rendering Functions ---

const renderHistoryPage = (reportFiles) => {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return; 

    tableBody.innerHTML = ''; 

    if (!reportFiles || reportFiles.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No reports found in the 'reports/' directory.</td></tr>`;
        return;
    }
    
    // Sort files by name (newest first, assuming timestamp in name)
    reportFiles.sort().reverse();

    reportFiles.forEach(filename => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">${filename}</td>
            <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium">Available</span>
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-center font-medium">
                <button data-filename="${filename}" class="download-report-btn text-primary hover:underline text-sm font-semibold">
                    <span class="material-symbols-outlined text-base align-middle mr-1">download</span>
                    Download
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.download-report-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const filename = e.currentTarget.getAttribute('data-filename');
            downloadReport(filename, e.currentTarget);
        });
    });
};

const downloadReport = async (filename, button) => {
    const originalText = button.innerHTML;
    button.innerHTML = `<span class="material-symbols-outlined text-base align-middle mr-1 animate-spin">sync</span> Downloading...`;
    button.disabled = true;

    try {
        const response = await fetch(`${API_URL}/reports/${filename}`);
        if (!response.ok) {
            throw new Error(`File not found or server error (Status: ${response.status})`);
        }
        
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
        console.error("Error downloading file:", error);
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
};

// --- Firestore patient listener (No longer used, but harmless) ---
const startPatientListener = () => {
    if (!db || !userId || !isAuthReady) {
        console.error("Firestore not ready or user not authenticated.");
        return;
    }
    const patientsColRef = collection(db, getCollectionPath('patients'));
    onSnapshot(patientsColRef, (snapshot) => {
        const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Firestore patient data updated (listener active)", patients);
    }, (error) => {
        console.error("Error listening to patients collection:", error);
    });
};


// --- Audio Recording Logic (Unchanged) ---
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
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(audioStream);
        mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
        
        mediaRecorder.onstop = () => {
            stopTimer();
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
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
 * WORKFLOW STEP 1:
 * Handles the completion of recording and sends audio to the /transcribe-audio endpoint.
 * On success, it calls the new /convert-json-to-html endpoint.
 */
const initiateReportGeneration = async () => {
    stopRecordBtn.classList.add('hidden');
    startRecordBtn.classList.add('hidden');

    if (!audioBlob || audioBlob.size === 0) {
        const errorMsg = 'FAILURE: Audio recording captured a zero-size file. Try recording longer.';
        console.error(errorMsg, 'Blob Size:', audioBlob ? audioBlob.size : 'N/A');
        recordingStatus.textContent = 'Recording Failed (No Data).';
        showMessage(modalFeedback, errorMsg, 'error', 5000);
        return;
    }

    recordingStatus.textContent = 'Transcribing Audio...';
    showMessage(modalFeedback, `Sending audio (Size: ${audioBlob.size} bytes) to FastAPI...`, 'primary', 0);

    try {
        const formData = new FormData();
        formData.append("file", audioBlob, `consultation_${new Date().getTime()}.webm`);

        console.log(`[Frontend] Step 1: POST to: ${API_URL}/transcribe-audio`);
        const response = await fetch(`${API_URL}/transcribe-audio`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Server message: ${errorBody.substring(0, 100)}...`);
        }
        
        const jsonData = await response.json();
        console.log("[Frontend] Step 1 Success: Received JSON data from backend:", jsonData);
        
        // --- NEW STEP 2: Fetch HTML version for editing ---
        recordingStatus.textContent = 'Generating Editable Report...';
        showMessage(modalFeedback, `Received JSON, generating HTML draft...`, 'primary', 0);
        
        fetchHtmlDraft(jsonData);

    } catch (error) {
        console.error("Transcription Failed:", error);
        recordingStatus.textContent = 'Transcription Failed.';
        const detailedError = error instanceof TypeError && error.message.includes('fetch') 
            ? 'Network connection failed. Check if FastAPI server is running.'
            : `Server processing or HTTP error. Details: ${error.message}`;
        showMessage(modalFeedback, detailedError, 'error', 8000);
    }
};

/**
 * WORKFLOW STEP 2:
 * Takes the JSON from Step 1, sends it to the /convert-json-to-html endpoint.
 * On success, it opens the Edit Modal with the returned HTML.
 */
const fetchHtmlDraft = async (jsonData) => {
    try {
        console.log(`[Frontend] Step 2: POST to: ${API_URL}/convert-json-to-html`);
        const response = await fetch(`${API_URL}/convert-json-to-html`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jsonData),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Server message: ${errorBody.substring(0, 100)}...`);
        }

        const data = await response.json();
        const htmlContent = data.html_content;
        console.log("[Frontend] Step 2 Success: Received HTML draft.");

        // Close recording modal
        recordingModal.classList.add('hidden');
        resetRecordingUI();
        
        // Open the edit modal with the HTML data
        openEditModalWithHtml(htmlContent);

    } catch (error) {
        console.error("HTML Draft Generation Failed:", error);
        showMessage(modalFeedback, `Error generating HTML draft: ${error.message}`, 'error', 8000);
    }
};


/**
 * NEW: Opens the Edit Modal and initializes the TinyMCE Rich Text Editor.
 */
const openEditModalWithHtml = (htmlContent) => {
    // Make sure no old editor instances exist
    tinymce.remove('#html-editor');
    
    tinymce.init({
        selector: '#html-editor',
        // --- THIS IS THE FIX ---
        // Removed 'autoresize' from the plugins list
        plugins: 'lists link autolink', 
        // -----------------------
        toolbar: 'undo redo | blocks | bold italic | bullist numlist | link',
        menubar: false,
        statusbar: false,
        height: '100%', // Let flexbox control the height
        setup: (editor) => {
            // This runs after the editor is initialized
            editor.on('init', () => {
                editor.setContent(htmlContent);
                console.log("[Frontend] TinyMCE initialized and content set.");
                // Show the modal *after* the editor is ready
                editReportModal.classList.remove('hidden');
            });
        }
    });
    
    editFeedback.classList.add('hidden'); // Hide any old feedback
};

/**
 * WORKFLOW STEP 3:
 * Handles the "Save Final PDF" button press.
 * Sends the *edited HTML* from TinyMCE to the /convert-html-to-pdf endpoint.
 */
const handleEditFormSubmit = async (e) => {
    e.preventDefault();
    const saveButton = e.submitter;
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Generating Final PDF...';
    saveButton.disabled = true;

    // 1. Get edited HTML content from TinyMCE
    const editedHtml = tinymce.get('html-editor').getContent();
    if (!editedHtml) {
        showMessage(editFeedback, "Error: Cannot save empty report.", 'error', 4000);
        saveButton.textContent = originalText;
        saveButton.disabled = false;
        return;
    }

    try {
        console.log(`[Frontend] Step 3: POST to: ${API_URL}/convert-html-to-pdf`);

        // 2. Send the *edited HTML* to the backend
        const response = await fetch(`${API_URL}/convert-html-to-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ html_content: editedHtml }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Server message: ${errorBody.substring(0, 100)}...`);
        }

        // 3. Receive the final PDF blob and trigger download
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        // Try to get filename from header
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

        // 4. Show success and close modal
        showMessage(editFeedback, `✅ PDF Generated and Downloaded!`, 'success', 3000);
        
        // 5. Update the dashboard recent activity table by re-fetching the list
        await renderDashboardRecentActivity();

        // 6. Close and destroy the editor
        setTimeout(() => {
            editReportModal.classList.add('hidden');
            tinymce.remove('#html-editor');
        }, 3500);

    } catch (error) {
        console.error("PDF Generation Failed:", error);
        const detailedError = error instanceof TypeError && error.message.includes('fetch') 
            ? 'Network connection failed. Check if FastAPI server is running.'
            : `Server processing or HTTP error. Details: ${error.message}`;
        showMessage(editFeedback, detailedError, 'error', 8000);
    } finally {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
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
    const fileName = `${pageId}.html`; // Will be 'history.html'
    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`Could not load ${fileName}`);
        const htmlContent = await response.text();
        contentArea.innerHTML = htmlContent;
        
        if (pageId === 'history') {
            try {
                const reportResponse = await fetch(`${API_URL}/reports`);
                if (!reportResponse.ok) throw new Error('Failed to fetch reports list');
                const data = await reportResponse.json();
                renderHistoryPage(data.reports || []);
            } catch (err) {
                console.error("Failed to load reports:", err);
                const tableBody = document.getElementById('history-table-body');
                if(tableBody) tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-red-500">Failed to load reports from backend. Is it running?</td></tr>`;
            }
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
    // This function is no longer attached to any active button
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Load
    const initialPage = 'dashboard';
    loadContent(initialPage);
    setActiveLink(initialPage);
    
    // 2. Attach Global Event Listeners
    allNavElements.forEach(el => el.addEventListener('click', handleNavigationClick));
    if (menuToggle) menuToggle.addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));

    // 3. Attach Modal/Dashboard Listeners
    const addPatientBtn = document.getElementById('add-patient-btn');
    if (addPatientBtn) {
        addPatientBtn.addEventListener('click', () => patientModal.classList.remove('hidden'));
    }
    const closeModalBtn = document.getElementById('close-modal');
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => patientModal.classList.add('hidden'));
    
    const cancelModalBtn = document.getElementById('cancel-modal');
    if(cancelModalBtn) cancelModalBtn.addEventListener('click', () => patientModal.classList.add('hidden'));

    if(patientForm) patientForm.addEventListener('submit', handleNewPatientSubmit);
    
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

    // --- MODIFIED: Edit modal now calls the new PDF generation function ---
    document.getElementById('close-edit-modal').addEventListener('click', () => {
        editReportModal.classList.add('hidden');
        tinymce.remove('#html-editor'); // Destroy editor instance
    });
    document.getElementById('cancel-edit-modal').addEventListener('click', () => {
        editReportModal.classList.add('hidden');
        tinymce.remove('#html-editor'); // Destroy editor instance
    });
    editReportForm.addEventListener('submit', handleEditFormSubmit); // Changed to new function

    // 4. Initialize Firebase & Initial Dashboard Render
    setupFirebase();
    renderDashboardRecentActivity(); // Initial render of LIVE data
});

const setupFirebase = async () => {
    try {
        if (!firebaseConfig) { console.error("Firebase config is missing."); return; }
        setLogLevel('Debug');
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        const authPromise = new Promise((resolve) => {
            onAuthStateChanged(auth, async (user) => {
                if (user) { userId = user.uid; } else { 
                    try {
                        if (initialAuthToken) { await signInWithCustomToken(auth, initialAuthToken); }
                        else { await signInAnonymously(auth); }
                        userId = auth.currentUser.uid;
                    } catch (error) { userId = crypto.randomUUID(); }
                }
                isAuthReady = true;
                if(userIdDisplay) userIdDisplay.textContent = `User ID: ${userId}`;
                resolve(); 
            }, (error) => { 
                console.error("Auth state error:", error);
                userId = crypto.randomUUID();
                isAuthReady = true;
                if(userIdDisplay) userIdDisplay.textContent = `Error connecting. ID: ${userId}`;
                resolve(); 
            });
        });
        await authPromise;
        
        startPatientListener(); // This listener is for Firestore

    } catch (error) {
        console.error("Error during Firebase initialization:", error);
        userId = crypto.randomUUID();
        isAuthReady = true;
        if(userIdDisplay) userIdDisplay.textContent = `Error connecting. ID: ${userId}`;
    }
};