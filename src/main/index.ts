import { app, shell, BrowserWindow, ipcMain, screen } from 'electron';
import { execSync, spawn, ChildProcess } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendFileSync, existsSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import * as claude from './claudeRunner';

app.commandLine.appendSwitch('enable-speech-dispatcher');

const logPath = join(app.getPath('home'), 'claude-pty-debug.log');
writeFileSync(logPath, `[DEBUG START] ${new Date().toISOString()}\n`);

let mainWindow: BrowserWindow;
let recordingProcess: ChildProcess | null = null;
const AUDIO_TMP = join(tmpdir(), 'claude-free-dictation.wav');

function resolveTranscribeFilePath(): string | null {
  const candidates = [
    join(process.cwd(), 'src/native/transcribe-file'),
    join(process.cwd(), 'out/native/transcribe-file'),
    join(__dirname, '../native/transcribe-file'),
    join(process.resourcesPath, 'native/transcribe-file'),
    join(process.resourcesPath, 'app.asar.unpacked/native/transcribe-file'),
  ];

  return candidates.find((path) => existsSync(path)) ?? null;
}

type RecorderCommand = {
  bin: string;
  args: string[];
};

function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch (_error) {
    return false;
  }
}

function getRecordCommand(): RecorderCommand | null {
  const recCandidates = [
    'rec',
    '/opt/homebrew/bin/rec',
    '/usr/local/bin/rec',
  ];
  const recBin = recCandidates.find((candidate) => (
    candidate.includes('/') ? existsSync(candidate) : commandExists(candidate)
  ));
  if (recBin) {
    return {
      bin: recBin,
      args: ['-q', '-r', '16000', '-c', '1', AUDIO_TMP],
    };
  }

  const ffmpegCandidates = [
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ];
  const ffmpegBin = ffmpegCandidates.find((candidate) => (
    candidate.includes('/') ? existsSync(candidate) : commandExists(candidate)
  ));
  if (ffmpegBin) {
    return {
      bin: ffmpegBin,
      args: ['-y', '-f', 'avfoundation', '-i', ':default', '-ar', '16000', '-ac', '1', AUDIO_TMP],
    };
  }

  return null;
}

function createWindow(): void {
  const WINDOW_WIDTH = 420;
  const COLLAPSED_HEIGHT = 100;
  const MEDIUM_EXPANDED_HEIGHT = 420;
  const LARGE_EXPANDED_HEIGHT = 620;
  type TerminalMode = 'collapsed' | 'medium' | 'large';

  const getSafeHeight = (height: number): number => {
    const workAreaHeight = screen.getPrimaryDisplay().workAreaSize.height;
    return Math.max(COLLAPSED_HEIGHT, Math.min(height, workAreaHeight - 40));
  };

  const applyTerminalMode = (mode: TerminalMode): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (mode === 'collapsed') {
      mainWindow.setResizable(false);
      mainWindow.setMinimumSize(WINDOW_WIDTH, COLLAPSED_HEIGHT);
      mainWindow.setSize(WINDOW_WIDTH, COLLAPSED_HEIGHT, true);
      return;
    }

    const targetHeight = mode === 'large'
      ? getSafeHeight(LARGE_EXPANDED_HEIGHT)
      : getSafeHeight(MEDIUM_EXPANDED_HEIGHT);

    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(WINDOW_WIDTH, COLLAPSED_HEIGHT);
    mainWindow.setSize(WINDOW_WIDTH, targetHeight, true);
  };

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: COLLAPSED_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
        return;
      }
      callback(false);
    }
  );

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // --- Handlers IPC ---
  
  ipcMain.handle('claude:start', async () => {
    console.log('[IPC] startSession solicitado');
    appendFileSync(logPath, `[IPC] startSession em ${new Date().toISOString()}\n`);
    
    claude.startSession((data) => {
      // LOG EM ARQUIVO PARA SABER SE O PTY ESTÁ ENVIANDO
      appendFileSync(logPath, data);
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('claude:data', data);
      }
    });
  });

  ipcMain.handle('claude:write', async (_, { data }) => {
    claude.write(data);
  });

  ipcMain.handle('claude:write-line', async (_, { text }) => {
    console.log('[IPC] writeLine:', text);
    claude.writeLine(text);
  });

  ipcMain.handle('claude:resize', async (_, { cols, rows }) => {
    console.log(`[IPC] resize: ${cols}x${rows}`);
    claude.resize(cols, rows);
  });

  ipcMain.on('terminal:toggle', (_event, visible: boolean) => {
    applyTerminalMode(visible ? 'medium' : 'collapsed');
  });

  ipcMain.on('terminal:set-mode', (_event, mode: TerminalMode) => {
    if (mode !== 'collapsed' && mode !== 'medium' && mode !== 'large') {
      return;
    }
    applyTerminalMode(mode);
  });

  ipcMain.handle('dictation-start', async () => {
    if (recordingProcess && recordingProcess.exitCode === null) {
      return { error: 'Recording already in progress' };
    }

    const transcribePath = resolveTranscribeFilePath();
    if (!transcribePath) {
      return { error: 'transcribe-file binary not found' };
    }

    const command = getRecordCommand();
    if (!command) {
      return { error: 'Neither rec (sox) nor ffmpeg found. Install: brew install sox' };
    }

    try { unlinkSync(AUDIO_TMP); } catch (_error) {}

    const proc = spawn(command.bin, command.args, { stdio: 'ignore' });
    recordingProcess = proc;

    proc.on('error', (error) => {
      console.error('[dictation] recording error:', error);
      if (recordingProcess === proc) {
        recordingProcess = null;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('dictation-error', error.message);
      }
    });

    proc.on('close', () => {
      if (recordingProcess === proc) {
        recordingProcess = null;
      }
    });

    return { status: 'recording' as const };
  });

  ipcMain.handle('dictation-stop', async () => {
    const proc = recordingProcess;
    if (!proc) {
      return { error: 'Not recording' };
    }

    await new Promise<void>((resolve) => {
      if (proc.exitCode !== null) {
        resolve();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      proc.once('close', finish);

      try {
        proc.kill('SIGTERM');
      } catch (_error) {
        finish();
      }

      setTimeout(() => {
        if (proc.exitCode === null && !proc.killed) {
          try {
            proc.kill('SIGKILL');
          } catch (_error) {}
        }
        finish();
      }, 2000);
    });

    if (recordingProcess === proc) {
      recordingProcess = null;
    }

    if (!existsSync(AUDIO_TMP)) {
      return { error: 'Audio file not created' };
    }

    const stats = statSync(AUDIO_TMP);
    if (stats.size < 1000) {
      try { unlinkSync(AUDIO_TMP); } catch (_error) {}
      return { error: 'Audio file too small (no audio captured)' };
    }

    const transcribePath = resolveTranscribeFilePath();
    if (!transcribePath) {
      try { unlinkSync(AUDIO_TMP); } catch (_error) {}
      return { error: 'transcribe-file binary not found' };
    }

    try {
      const text = await new Promise<string>((resolve, reject) => {
        const transcribeProc = spawn(transcribePath, [AUDIO_TMP], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        const timeout = setTimeout(() => {
          if (transcribeProc.exitCode === null && !transcribeProc.killed) {
            transcribeProc.kill();
          }
          reject(new Error('Transcription timeout'));
        }, 30000);

        transcribeProc.stdout?.on('data', (chunk: Buffer | string) => {
          stdout += chunk.toString();
        });

        transcribeProc.stderr?.on('data', (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });

        transcribeProc.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });

        transcribeProc.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0 && stdout.trim()) {
            resolve(stdout.trim());
            return;
          }
          reject(new Error(stderr.trim() || `Exit code ${code ?? 'unknown'}`));
        });
      });

      return { text };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transcription failed';
      console.error('[dictation] transcription failed:', message);
      return { error: message };
    } finally {
      try { unlinkSync(AUDIO_TMP); } catch (_error) {}
    }
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.claude-free-menubar');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  claude.killSession();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
