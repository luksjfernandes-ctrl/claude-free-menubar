import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

// Hack para TypeScript reconhecer as chamadas globais
declare global {
  interface Window {
    claude: {
      send: (text: string) => Promise<void>
      sendRaw: (text: string) => Promise<void>
      resize: (cols: number, rows: number) => Promise<void>
      newSession: () => Promise<void>
      isActive: () => Promise<boolean>
      onData: (callback: (data: string) => void) => () => void
    }
  }
}

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Criar terminal com visual Apple Dark
    const xterm = new XTerm({
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#1e1e1e',
        selectionBackground: '#3a3a3a',
        black: '#1e1e1e',
        brightBlack: '#6e6e6e',
        red: '#ff5f56',
        brightRed: '#ff5f56',
        green: '#27c93f',
        brightGreen: '#27c93f',
        yellow: '#ffbd2e',
        brightYellow: '#ffbd2e',
        blue: '#0a84ff',
        brightBlue: '#409cff',
        magenta: '#ff79c6',
        brightMagenta: '#ff79c6',
        cyan: '#8be9fd',
        brightCyan: '#8be9fd',
        white: '#f1f1f0',
        brightWhite: '#ffffff',
      },
      fontFamily: 'SF Mono, Menlo, Monaco, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(terminalRef.current);
    
    // Pequeno delay para garantir que o container está pronto
    setTimeout(() => {
      fitAddon.fit();
      window.claude.resize(xterm.cols, xterm.rows);
    }, 100);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Receber dados do PTY
    const unsubscribe = window.claude.onData((data: string) => {
      xterm.write(data);
    });

    // Enviar input do usuário (teclado/colar) para o PTY
    xterm.onData((data: string) => {
      window.claude.sendRaw(data);
    });

    // Redimensionar
    const handleResize = () => {
      fitAddon.fit();
      window.claude.resize(xterm.cols, xterm.rows);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
    };
  }, []);

  return (
    <div 
      ref={terminalRef} 
      className="w-full h-full bg-[#1e1e1e] px-2 py-1 overflow-hidden"
    />
  );
}
