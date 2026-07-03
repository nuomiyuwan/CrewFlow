const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  selectProjectFolder: () => ipcRenderer.invoke('project-folder:select'),
  openProjectFolder: (folderPath) => ipcRenderer.invoke('project-folder:open', folderPath),
  selectProjectFile: (title) => ipcRenderer.invoke('project-file:select', title),
  openProjectFile: (filePath) => ipcRenderer.invoke('project-file:open', filePath),
  loadAppData: () => ipcRenderer.invoke('app-data:load'),
  saveAppData: (data) => ipcRenderer.invoke('app-data:save', data),
})
