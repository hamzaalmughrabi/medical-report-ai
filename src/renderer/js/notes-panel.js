let notesData = { notes: '', checklist: [] };
let saveTimeout = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadNotesData();
    setupEventListeners();
});

function setupEventListeners() {
    // Toggle panel
    document.getElementById('notes-toggle-btn').addEventListener('click', openPanel);
    document.getElementById('close-notes-panel').addEventListener('click', closePanel);
    document.getElementById('notes-overlay').addEventListener('click', closePanel);

    // Notes textarea auto-save
    document.getElementById('notes-textarea').addEventListener('input', (e) => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveNotes(e.target.value), 500);
    });

    // Checklist add
    document.getElementById('add-checklist-btn').addEventListener('click', addChecklistItem);
    document.getElementById('checklist-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addChecklistItem();
    });
}

function openPanel() {
    document.getElementById('notes-panel').classList.remove('translate-x-full');
    document.getElementById('notes-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePanel() {
    document.getElementById('notes-panel').classList.add('translate-x-full');
    document.getElementById('notes-overlay').classList.add('hidden');
    document.body.style.overflow = '';
}

async function loadNotesData() {
    notesData = await window.notesAPI.load();
    document.getElementById('notes-textarea').value = notesData.notes || '';
    renderChecklist();
}

async function saveNotes(text) {
    await window.notesAPI.saveNotes(text);
    notesData.notes = text;
}

async function addChecklistItem() {
    const input = document.getElementById('checklist-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    const newItem = await window.notesAPI.addChecklistItem(text);
    notesData.checklist.push(newItem);
    input.value = '';
    renderChecklist();
}

async function toggleChecklistItem(id) {
    const updatedItem = await window.notesAPI.toggleChecklistItem(id);
    const item = notesData.checklist.find(i => i.id === id);
    if (item) item.done = updatedItem.done;
    renderChecklist();
}

async function deleteChecklistItem(id) {
    await window.notesAPI.deleteChecklistItem(id);
    notesData.checklist = notesData.checklist.filter(i => i.id !== id);
    renderChecklist();
}

function renderChecklist() {
    const container = document.getElementById('checklist-items');
    const emptyState = document.getElementById('checklist-empty');
    
    if (notesData.checklist.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = notesData.checklist.map(item => `
        <div class="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <input 
                type="checkbox" 
                ${item.done ? 'checked' : ''}
                onchange="toggleChecklistItem('${item.id}')"
                class="w-4 h-4 text-accent rounded focus:ring-2 focus:ring-accent cursor-pointer"
            >
            <span class="flex-1 text-sm text-slate-700 dark:text-slate-300 ${item.done ? 'line-through opacity-60' : ''}">
                ${item.text}
            </span>
            <button 
                onclick="deleteChecklistItem('${item.id}')"
                class="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
            >
                <span class="material-symbols-outlined text-red-600 text-lg">delete</span>
            </button>
        </div>
    `).join('');
}

// Make functions globally accessible
window.toggleChecklistItem = toggleChecklistItem;
window.deleteChecklistItem = deleteChecklistItem;