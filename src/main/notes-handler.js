const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class NotesHandler {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.notesPath = path.join(this.userDataPath, 'notes-data.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        if (!fs.existsSync(this.notesPath)) {
            const defaultData = {
                notes: '',
                checklist: [],
                lastModified: new Date().toISOString()
            };
            fs.writeFileSync(this.notesPath, JSON.stringify(defaultData, null, 2));
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.notesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading notes:', error);
            return { notes: '', checklist: [], lastModified: null };
        }
    }

    saveData(data) {
        try {
            data.lastModified = new Date().toISOString();
            fs.writeFileSync(this.notesPath, JSON.stringify(data, null, 2));
            return { success: true };
        } catch (error) {
            console.error('Error saving notes:', error);
            return { success: false, error: error.message };
        }
    }

    updateNotes(notesText) {
        const data = this.loadData();
        data.notes = notesText;
        return this.saveData(data);
    }

    addChecklistItem(text) {
        const data = this.loadData();
        const newItem = {
            id: Date.now().toString(),
            text: text,
            done: false,
            createdAt: new Date().toISOString()
        };
        data.checklist.push(newItem);
        this.saveData(data);
        return newItem;
    }

    toggleChecklistItem(id) {
        const data = this.loadData();
        const item = data.checklist.find(i => i.id === id);
        if (item) {
            item.done = !item.done;
            this.saveData(data);
            return item;
        }
        return null;
    }

    deleteChecklistItem(id) {
        const data = this.loadData();
        data.checklist = data.checklist.filter(i => i.id !== id);
        this.saveData(data);
        return { success: true };
    }
}

module.exports = NotesHandler;