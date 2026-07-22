/**
 * js/state.js
 * Centralized application state.
 */

const state = {
    currentUser: JSON.parse(localStorage.getItem("currentUser")) || null,
    selectedPatientId: localStorage.getItem("selectedPatientId") || null,
    isRecording: false,
    globalMediaRecorder: null,
    audioChunks: [],
    recordingStartTime: 0,
    recordingTimerInterval: null,
    selectedCaseIdForPhase2: null, // Issue #5 - Unified state
    audioContext: null,            // Issue #20 - Real audio visualizer
    analyser: null,

    // Configuration defaults
    config: {
        transcription_provider: "openai",
        llm_provider: "openai",
        openai_model: "gpt-4o",
        gemini_model: "gemini-1.5-pro"
    },

    // Cache/Data
    patients: [],
    reports: []
};

export default state;

// State Modifiers
export const setCurrentUser = (user) => {
    state.currentUser = user;
    if (user) {
        localStorage.setItem("currentUser", JSON.stringify(user));
    } else {
        localStorage.removeItem("currentUser");
    }
};

export const setSelectedPatientId = (id) => {
    state.selectedPatientId = id;
    if (id) {
        localStorage.setItem("selectedPatientId", id);
    } else {
        localStorage.removeItem("selectedPatientId");
    }
};

export const setConfig = (newConfig) => {
    state.config = { ...state.config, ...newConfig };
};
