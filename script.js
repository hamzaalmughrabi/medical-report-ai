// --- Firebase Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration ---
const API_URL = "http://localhost:8000"; // Targeting FastAPI server
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

// --- REMOVED hard-coded recentReportsData array ---

// --- Utility Functions & Rendering ---

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
    } catch (err) {
        console.error("Failed to load reports for dashboard:", err);
        dashboardActivityBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-red-500">Failed to load activity. Is backend running?</td></tr>`;
        return;
    }

    dashboardActivityBody.innerHTML = ''; // Clear "Loading..."
    
    // Slice to get only the top 5 most recent
    const recentActivity = reportFiles.slice(0, 5);

    if (recentActivity.length === 0) {
        dashboardActivityBody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No recent activity recorded.</td></tr>`;
        return;
    }
    
    recentActivity.forEach(filename => {
        // We parse the filename to get the display data (e.g., "report_John_Doe_2025-10-10.pdf")
        // This is a basic guess; you can customize this logic
        const parts = filename.replace('.pdf', '').split('_');
        const patientName = parts[1] || "Report";
        const caseId = parts[0] || filename;
        const date = parts[2] || "N/A";

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">${patientName} (${caseId})</td>
            <td class="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">${date}</td>
            <td class="whitespace-nowrap px-6 py-4 text-gray-500 dark:text-gray-400">Consultation</td>
            <td class="whitespace-nowrap px-6 py-4">
                <span class="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium">Complete</span>
            </td>
            <td class="whitespace-nowrap px-6 py-4 text-right font-medium">
                <!-- THIS IS THE FIX: Changed <a> to <button> with class and data attribute -->
                <button data-filename="${filename}" class="dashboard-download-btn text-primary hover:underline text-sm font-semibold inline-flex items-center">
                    <span class="material-symbols-outlined text-base align-middle mr-1">download</span>
                    View/Download
                </button>
            </td>
        `;
        dashboardActivityBody.appendChild(row);
    });

    // --- NEW: Attach listeners to the buttons we just created ---
    dashboardActivityBody.querySelectorAll('.dashboard-download-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const filename = e.currentTarget.getAttribute('data-filename');
            // Reuse the existing downloadReport function
            downloadReport(filename, e.currentTarget); 
        });
    });
};

// --- History Page Rendering Functions ---

/**
 * Renders the table on the History page with data from the /reports endpoint.
 */
const renderHistoryPage = (reportFiles) => {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return; // Failsafe if element isn't loaded

    tableBody.innerHTML = ''; // Clear "Loading..."

    if (!reportFiles || reportFiles.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No reports found in the 'reports/' directory.</td></tr>`;
        return;
    }

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

    // Add event listeners to all new download buttons
    document.querySelectorAll('.download-report-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const filename = e.currentTarget.getAttribute('data-filename');
            downloadReport(filename, e.currentTarget);
        });
    });
};

/**
 * Calls the backend to download a specific report file.
 */
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
        // Do not use alert()
        console.error(`Failed to download ${filename}. See console for details.`);
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
};

// --- Firestore patient listener (can be removed if no longer using Add Patient) ---
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
 * NEW WORKFLOW STEP 1:
 * Handles the completion of recording and sends audio to the /transcribe-audio endpoint.
 * On success, it opens the Edit Modal with the returned JSON.
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

        console.log(`[Frontend] Attempting POST to: ${API_URL}/transcribe-audio`);

        const response = await fetch(`${API_URL}/transcribe-audio`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Server message: ${errorBody.substring(0, 100)}...`);
        }
        
        // --- Success! We have JSON data ---
        const jsonData = await response.json();
        
        console.log("[Frontend] Received JSON data from backend:", jsonData);
        
        // Close recording modal
        recordingModal.classList.add('hidden');
        resetRecordingUI();
        
        // Open the edit modal with the data
        openEditModalWithData(jsonData);

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
 * NEW: Opens the Edit Modal and populates it with the JSON data from the backend.
 */
const openEditModalWithData = (jsonData) => {
    // Format the JSON to be human-readable in the textarea
    const formattedJson = JSON.stringify(jsonData, null, 2); 
    
    reportContentArea.value = formattedJson; // Set textarea value
    
    // Set info text (optional, but helpful)
    const reportId = jsonData.report_id || 'N/A';
    editPatientInfo.textContent = `Review and edit the transcribed JSON data for Report ID: ${reportId}`;
    
    editFeedback.classList.add('hidden'); // Hide any old feedback
    editReportModal.classList.remove('hidden'); // Show the modal
};

/**
 * NEW WORKFLOW STEP 2:
 * Handles the "Save & Download PDF" button press from the Edit Modal.
 * Sends the edited JSON to the /generate-pdf endpoint.
 */
const handleEditFormSubmit = async (e) => {
    e.preventDefault();
    const saveButton = e.submitter;
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Generating PDF...';
    saveButton.disabled = true;

    let jsonData;
    try {
        // 1. Parse the edited text from the textarea back into a JSON object
        jsonData = JSON.parse(reportContentArea.value);
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        showMessage(editFeedback, "Error: The text in the editor is not valid JSON.", 'error', 4000);
        saveButton.textContent = originalText;
        saveButton.disabled = false;
        return;
    }

    try {
        console.log(`[Frontend] Attempting POST to: ${API_URL}/generate-pdf`);

        // 2. Send the *edited JSON data* to the backend
        const response = await fetch(`${API_URL}/generate-pdf`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jsonData), // Send the JSON object as a string
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}. Server message: ${errorBody.substring(0, 100)}...`);
        }

        // 3. Receive the final PDF blob and trigger download
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        let filename = `${jsonData.report_id || 'medical_report'}.pdf`;
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
        
        // --- THIS IS THE FIX ---
        // 4. Update the dashboard recent activity table by re-fetching the list
        await renderDashboardRecentActivity();
        // --- END OF FIX ---

        // 5. Close the modal after a short delay
        setTimeout(() => {
            editReportModal.classList.add('hidden');
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
    const fileName = `${pageId}.html`; // Will be 'settings.html' or 'history.html'
    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`Could not load ${fileName}`);
        const htmlContent = await response.text();
        contentArea.innerHTML = htmlContent;
        
        // --- NEW: Load history page data ---
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
        // ---------------------------------
        
        if (pageId === 'settings') {
            const settingsForm = document.getElementById('settings-form');
            if (settingsForm) { settingsForm.addEventListener('submit', handleSettingsSubmit); }
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


// --- Handlers for Modals/Forms (Unchanged) ---
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
const handleSettingsSubmit = (e) => {
    e.preventDefault();
    const profileFeedback = document.getElementById('profile-feedback');
    showMessage(profileFeedback, "Profile saved successfully!", 'success', 2000);
};

// --- (openEditReportModal and simulatePdfExport removed, replaced by new workflow) ---

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
    // Note: 'add-patient-btn' no longer exists on the main UI, so we check for it.
    const addPatientBtn = document.getElementById('add-patient-btn');
    if (addPatientBtn) {
        addPatientBtn.addEventListener('click', () => patientModal.classList.remove('hidden'));
    }
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

    // --- MODIFIED: Edit modal now calls the new PDF generation function ---
    document.getElementById('close-edit-modal').addEventListener('click', () => editReportModal.classList.add('hidden'));
    document.getElementById('cancel-edit-modal').addEventListener('click', () => editReportModal.classList.add('hidden'));
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
                resolve(); // Resolve promise on first auth state check
            }, (error) => { // Handle auth errors
                console.error("Auth state error:", error);
                userId = crypto.randomUUID();
                isAuthReady = true;
                if(userIdDisplay) userIdDisplay.textContent = `Error connecting. ID: ${userId}`;
                resolve(); // Resolve even on error to not block app
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