import * as pty from 'node-pty';
import { IPty } from 'node-pty';
import { join } from 'path';

let ptyProcess: IPty | null = null;
let onDataCallback: ((data: string) => void) | null = null;
let dataBuffer = '';

export function startSession(onData: (data: string) => void): void {
  // Se o PTY já existe, apenas atualizamos o callback (essencial para HMR)
  if (ptyProcess) {
    console.log('[claude-pty] Atualizando callback para sessão existente PID:', ptyProcess.pid);
    onDataCallback = onData;
    // Enviar o que já acumulamos se houver
    if (dataBuffer) {
      onDataCallback(dataBuffer);
      dataBuffer = '';
    }
    return;
  }

  onDataCallback = onData;
  dataBuffer = ''; 
  
  const isWin = process.platform === 'win32';
  const home = process.env.USERPROFILE || process.env.HOME || '/Users/lucasjonasfernandes';
  const claudeHome = `${home}/.claude-free-home`;
  
  // No Windows, o wrapper pode precisar ser um .bat ou chamar node diretamente
  // Por enquanto, tentamos detectar se estamos no ambiente original ou um novo
  const claudeBin = isWin 
    ? join(home, '.claude-free-home', '.claude', 'claude-free-wrapper.bat') 
    : '/Users/lucasjonasfernandes/.claude-free-home/.claude/claude-free-wrapper.sh';

  try {
    const shell = isWin ? 'powershell.exe' : '/bin/bash';
    const args = isWin ? ['-ExecutionPolicy', 'Bypass', '-File', claudeBin] : [claudeBin];

    ptyProcess = pty.spawn(isWin ? shell : claudeBin, isWin ? args : [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: join(home, 'Developer'),
      env: {
        ...process.env,
        HOME: claudeHome,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    });

    console.log(`[claude-free] PTY iniciado (${process.platform}), PID:`, ptyProcess.pid);

    ptyProcess.onData((data: string) => {
      if (onDataCallback) {
        if (dataBuffer) {
          onDataCallback(dataBuffer);
          dataBuffer = '';
        }
        onDataCallback(data);
      } else {
        dataBuffer += data;
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[claude-free] Claude Code encerrado (${exitCode})`);
      ptyProcess = null;
      onDataCallback = null;
    });

  } catch (error) {
    console.error('[main] Erro ao iniciar PTY:', error);
  }
}

export function write(data: string): void {
  if (!ptyProcess) return;
  ptyProcess.write(data);
}

export function writeLine(text: string): void {
  write(text + '\r');
}

export function resize(cols: number, rows: number): void {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
}

export function killSession(): void {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
    onDataCallback = null;
  }
}

export function isActive(): boolean {
  return ptyProcess !== null;
}
