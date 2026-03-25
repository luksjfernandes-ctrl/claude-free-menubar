import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('claude', {
  startSession: () => ipcRenderer.invoke('claude:start'),
  write: (data: string) => ipcRenderer.invoke('claude:write', { data }),
  writeLine: (text: string) => ipcRenderer.invoke('claude:write-line', { text }),
  resize: (cols: number, rows: number) => ipcRenderer.invoke('claude:resize', { cols, rows }),
  onData: (callback: (data: string) => void) => {
    const handler = (_: any, data: string) => callback(data);
    ipcRenderer.on('claude:data', handler);
    return () => ipcRenderer.removeListener('claude:data', handler);
  },
  toggleTerminal: (visible: boolean) => ipcRenderer.send('terminal:toggle', visible),
  setTerminalMode: (mode: 'collapsed' | 'medium' | 'large') => ipcRenderer.send('terminal:set-mode', mode),
});

contextBridge.exposeInMainWorld('electronAPI', {
  dictationStart: () => ipcRenderer.invoke('dictation-start'),
  dictationStop: () => ipcRenderer.invoke('dictation-stop'),
});
