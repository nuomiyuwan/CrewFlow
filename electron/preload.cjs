const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  platform: process.platform,
  arch: process.arch,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  minimizeWindow: () => ipcRenderer.invoke('window-control:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-control:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-control:close'),
  selectProjectFolder: () => ipcRenderer.invoke('project-folder:select'),
  openProjectFolder: (folderPath) => ipcRenderer.invoke('project-folder:open', folderPath),
  selectProjectFile: (title) => ipcRenderer.invoke('project-file:select', title),
  openProjectFile: (filePath) => ipcRenderer.invoke('project-file:open', filePath),
  exportProjects: (payload) => ipcRenderer.invoke('projects:export', payload),
  selectLibraryFile: (purpose) => ipcRenderer.invoke('library-file:select', purpose),
  identifyLibraryPath: (filePath) => ipcRenderer.invoke('library-path:identify', filePath),
  importLibraryFile: (payload) => ipcRenderer.invoke('library-file:import', payload),
  readLibraryFile: (payload) => ipcRenderer.invoke('library-file:read', payload),
  deleteLibraryFile: (payload) => ipcRenderer.invoke('library-file:delete', payload),
  openLibraryFile: (payload) => ipcRenderer.invoke('library-file:open', payload),
  revealLibraryFile: (payload) => ipcRenderer.invoke('library-file:reveal', payload),
  previewLibraryResource: (payload) => ipcRenderer.invoke('library-resource:preview', payload),
  selectUtilityFiles: (options) => ipcRenderer.invoke('utility-tools:select-files', options),
  convertUtilityDocument: (payload) => ipcRenderer.invoke('utility-tools:convert', payload),
  runUtilityPdfTool: (payload) => ipcRenderer.invoke('utility-tools:pdf', payload),
  cancelUtilityTask: (jobId) => ipcRenderer.invoke('utility-tools:cancel', jobId),
  utilityOutputPathsExist: (filePaths) => ipcRenderer.invoke('utility-tools:outputs-exist', filePaths),
  revealUtilityOutput: (filePath) => ipcRenderer.invoke('utility-tools:reveal', filePath),
  onUtilityProgress: (listener) => {
    const handler = (_event, progress) => listener(progress)
    ipcRenderer.on('utility-tools:progress', handler)
    return () => ipcRenderer.removeListener('utility-tools:progress', handler)
  },
  loadAppData: () => ipcRenderer.invoke('app-data:load'),
  saveAppData: (data) => ipcRenderer.invoke('app-data:save', data),
  getTeamServiceInfo: () => ipcRenderer.invoke('team-service:info'),
  discoverTeamServices: () => ipcRenderer.invoke('team-service:discover'),
  installTeamService: () => ipcRenderer.invoke('team-service:install'),
  restartTeamService: () => ipcRenderer.invoke('team-service:restart'),
  stopTeamService: () => ipcRenderer.invoke('team-service:stop'),
  getAppUpdateState: () => ipcRenderer.invoke('app-update:state'),
  checkAppUpdate: () => ipcRenderer.invoke('app-update:check'),
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
