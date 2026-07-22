// Sticky Widget Logic
import { api } from "./api.js";

let stickyData = { notes: '', checklist: [] };
let saveTimeout = null;

async function initStickyWidget() {
    await loadStickyData();

    // Toggle Open/Close via Class (New Button in Header)
    const widget = document.getElementById('sticky-notes-widget');
    const headerBtn = document.getElementById('sticky-header-btn');

    if (headerBtn && widget) {
        headerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasOpen = widget.classList.contains('open');
            widget.classList.toggle('open');
            const icon = widget.querySelector('.sticky-toggle span');
            if (icon) icon.textContent = !wasOpen ? 'expand_less' : 'expand_more';
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!widget.contains(e.target) && !e.target.closest('#sticky-notes-widget')) { // Allow clicks inside widget
                widget.classList.remove('open');
                const icon = widget.querySelector('.sticky-toggle span');
                if (icon) icon.textContent = 'expand_more';
            }
        });
    }

    // New Patient Button
    const newPatientBtn = document.getElementById('new-patient-btn');
    if (newPatientBtn) {
        newPatientBtn.addEventListener('click', uncheckAllForNewPatient);
    }

    // Add Item Logic
    const addBtn = document.getElementById('sticky-add-btn');
    const addInput = document.getElementById('sticky-add-input');

    if (addBtn && addInput) {
        const addItem = async () => {
            const text = addInput.value.trim();
            if (!text) return;

            // Generate ID
            const id = Date.now().toString();
            stickyData.checklist.push({ id, text, done: false });
            addInput.value = "";
            render();
            await saveStickyData();
        };

        addBtn.addEventListener('click', addItem);
        addInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addItem();
        });
    }

    // Notes Auto-Save (Textarea)
    const notesInput = document.getElementById('sticky-notes-text');
    if (notesInput) {
        notesInput.addEventListener('input', (e) => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                stickyData.notes = e.target.value;
                saveStickyData();
            }, 500);
        });
    }

    // Interval fetch (poll for changes)
    setInterval(loadStickyData, 5000);
}

async function loadStickyData() {
    try {
        const data = await api.getSystemChecklist();
        const newData = data || { notes: '', checklist: [] };
        
        const notesInput = document.getElementById('sticky-notes-text');
        const isNotesFocused = document.activeElement === notesInput;

        // Merge logic
        stickyData.checklist = newData.checklist;
        if (!isNotesFocused) {
            stickyData.notes = newData.notes;
        }

        render();
    } catch (e) {
        // Issue #8: Silent retry during backend initialization to avoid console noise
        console.warn('Sticky widget: Backend syncing...');
        // The interval in initStickyWidget will handle the retry automatically
    }
}

async function saveStickyData() {
    try {
        await api.saveSystemChecklist(stickyData);
    } catch (e) {
        console.error('Save error:', e);
    }
}

function render() {
    // Render Notes (only if not focused to avoid cursor reset)
    const notesEl = document.getElementById('sticky-notes-text');
    if (notesEl && document.activeElement !== notesEl) {
        notesEl.value = stickyData.notes || '';
    }

    // Render Checklist
    const checklistEl = document.getElementById('sticky-checklist');
    if (checklistEl) {
        if (stickyData.checklist?.length > 0) {
            checklistEl.innerHTML = stickyData.checklist.map(item => `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; background: #f8fafc; padding: 6px; rounded: 6px;">
                    <div class="sticky-checklist-item ${item.done ? 'done' : ''}" 
                         onclick="window.toggleStickyItem('${item.id}')" 
                         style="cursor: pointer; flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span>${item.done ? '☑' : '☐'}</span>
                        <span class="text" style="font-size: 13px;">${item.text}</span>
                    </div>
                    <button onclick="window.deleteStickyItem('${item.id}')" 
                        style="background: transparent; border: none; cursor: pointer; color: #ef4444; padding: 2px; opacity: 0.6; transition: opacity 0.2s;"
                        onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.6'">
                        <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                    </button>
                </div>
            `).join('');
        } else {
            checklistEl.innerHTML = '<div class="sticky-notes-text empty">No questions added</div>';
        }
    }
}

// Global functions for inline onclick handlers
window.toggleStickyItem = async (id) => {
    const item = stickyData.checklist.find(i => i.id === id);
    if (item) {
        item.done = !item.done;
        render(); // Optimistic update
        await saveStickyData();
    }
};

window.deleteStickyItem = async (id) => {
    if (confirm("Delete this question?")) {
        stickyData.checklist = stickyData.checklist.filter(i => i.id !== id);
        render(); // Optimistic update
        await saveStickyData();
    }
};

async function uncheckAllForNewPatient() {
    if (confirm("Start new patient? This will clear checklist marks and notes.")) {
        stickyData.checklist.forEach(i => i.done = false);
        stickyData.notes = "";
        render();
        await saveStickyData();
    }
}

document.addEventListener('DOMContentLoaded', initStickyWidget);
