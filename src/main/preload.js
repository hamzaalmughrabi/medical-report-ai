const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesAPI', {
    load: () => ipcRenderer.invoke('notes:load'),
    saveNotes: (text) => ipcRenderer.invoke('notes:saveNotes', text),
    addChecklistItem: (text) => ipcRenderer.invoke('notes:addChecklistItem', text),
    toggleChecklistItem: (id) => ipcRenderer.invoke('notes:toggleChecklistItem', id),
    deleteChecklistItem: (id) => ipcRenderer.invoke('notes:deleteChecklistItem', id),
    getLocalIP: () => ipcRenderer.invoke('app:local-ip')
});