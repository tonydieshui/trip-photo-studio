const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('photoStudio', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  chooseSource: () => ipcRenderer.invoke('dialog:choose-source'),
  createProject: (input) => ipcRenderer.invoke('project:create', input),
  setActiveProject: (projectId) => ipcRenderer.invoke('project:set-active', projectId),
  rescanProject: (projectId) => ipcRenderer.invoke('project:rescan', projectId),
  removeProject: (projectId) => ipcRenderer.invoke('project:remove', projectId),
  revealProjectSource: (projectId) => ipcRenderer.invoke('project:reveal-source', projectId),
  revealAsset: (assetId) => ipcRenderer.invoke('asset:reveal', assetId),
  updateAsset: (input) => ipcRenderer.invoke('asset:update', input),
  restartAnalysis: (projectId) => ipcRenderer.invoke('analysis:restart', projectId),
  exportPicks: (projectId) => ipcRenderer.invoke('project:export-picks', projectId),
  onScanProgress: (callback) => subscribe('scan-progress', callback),
  onAnalysisProgress: (callback) => subscribe('analysis-progress', callback),
  onExportProgress: (callback) => subscribe('export-progress', callback)
});
