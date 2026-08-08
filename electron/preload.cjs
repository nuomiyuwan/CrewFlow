const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  platform: process.platform,
  arch: process.arch,
  selectProjectFolder: () => ipcRenderer.invoke('project-folder:select'),
  openProjectFolder: (folderPath) => ipcRenderer.invoke('project-folder:open', folderPath),
  selectProjectFile: (title) => ipcRenderer.invoke('project-file:select', title),
  openProjectFile: (filePath) => ipcRenderer.invoke('project-file:open', filePath),
  loadAppData: () => ipcRenderer.invoke('app-data:load'),
  saveAppData: (data) => ipcRenderer.invoke('app-data:save', data),
  getTeamServiceInfo: () => ipcRenderer.invoke('team-service:info'),
  installTeamService: () => ipcRenderer.invoke('team-service:install'),
  restartTeamService: () => ipcRenderer.invoke('team-service:restart'),
  stopTeamService: () => ipcRenderer.invoke('team-service:stop'),
  getAppUpdateState: () => ipcRenderer.invoke('app-update:state'),
  downloadAppUpdate: (payload) => ipcRenderer.invoke('app-update:download', payload),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  onAppUpdateState: (listener) => {
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('app-update:state-changed', handler)
    return () => ipcRenderer.removeListener('app-update:state-changed', handler)
  },
  copyText: (value) => ipcRenderer.invoke('clipboard:write-text', value),
  loadAssistantSettings: () => ipcRenderer.invoke('assistant-settings:load'),
  saveAssistantSettings: (payload) => ipcRenderer.invoke('assistant-settings:save', payload),
  deleteAssistantOnlineProfile: (profileId) => ipcRenderer.invoke('assistant-profile:delete', profileId),
  testAssistantProvider: (payload) => ipcRenderer.invoke('assistant-provider:test', payload),
  requestAssistant: (payload) => ipcRenderer.invoke('assistant:request', payload),
})
