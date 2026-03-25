import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

type DictationStartResponse = {
  status?: 'recording';
  error?: string;
};

type DictationStopResponse = {
  text?: string;
  error?: string;
};

type TerminalMode = 'collapsed' | 'medium' | 'large';

declare global {
  interface Window {
    claude: {
      startSession: () => Promise<void>;
      write: (data: string) => Promise<void>;
      writeLine: (text: string) => Promise<void>;
      resize: (cols: number, rows: number) => Promise<void>;
      onData: (callback: (data: string) => void) => () => void;
      toggleTerminal: (visible: boolean) => void;
      setTerminalMode?: (mode: TerminalMode) => void;
    };
    electronAPI: {
      dictationStart: () => Promise<DictationStartResponse>;
      dictationStop: () => Promise<DictationStopResponse>;
    };
  }
}

export default function App() {
  const BAR_STACK_HEIGHT = 100;
  const SHELL_PADDING = 16;

  const [terminalMode, setTerminalMode] = useState<TerminalMode>('collapsed');
  const [input, setInput] = useState('');
  const [chunkCount, setChunkCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);
  const terminalVisible = terminalMode !== 'collapsed';

  useEffect(() => {
    void window.claude.startSession();

    const unsubscribe = window.claude.onData((data) => {
      setChunkCount((prev) => prev + 1);
      if (xtermRef.current) xtermRef.current.write(data);

      setIsStreaming(true);
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = setTimeout(() => {
        setIsStreaming(false);
      }, 900);
    });

    return () => {
      unsubscribe();
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (window.claude.setTerminalMode) {
      window.claude.setTerminalMode(terminalMode);
    } else {
      window.claude.toggleTerminal(terminalVisible);
    }

    if (terminalVisible && terminalRef.current && !initialized.current) {
      initialized.current = true;
      const xterm = new Terminal({
        theme: {
          background: '#09090B',
          foreground: '#f5f5f7',
          cursor: '#f5f5f7',
          cursorAccent: '#0A84FF',
          selectionBackground: 'rgba(90, 90, 98, 0.42)',
        },
        fontFamily: 'SF Mono, Menlo, Monaco, "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        allowTransparency: true,
        scrollback: 50000,
        scrollSensitivity: 1,
      });
      const fit = new FitAddon();
      xterm.loadAddon(fit);
      xterm.open(terminalRef.current);
      xtermRef.current = xterm;
      fitAddonRef.current = fit;
      xterm.onData((data) => window.claude.write(data));
      setTimeout(() => {
        try {
          fit.fit();
          xterm.focus();
          window.claude.resize(xterm.cols, xterm.rows);
        } catch (_error) {}
      }, 320);
    } else if (terminalVisible && fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          xtermRef.current?.focus();
          if (xtermRef.current) window.claude.resize(xtermRef.current.cols, xtermRef.current.rows);
        } catch (_error) {}
      }, 240);
    }
  }, [terminalMode, terminalVisible]);

  useEffect(() => {
    if (terminalVisible) {
      setTimeout(() => {
        xtermRef.current?.focus();
      }, 80);
      return;
    }

    inputRef.current?.focus();
  }, [terminalVisible]);

  useEffect(() => {
    if (!terminalVisible) return;

    const handleResize = () => {
      try {
        fitAddonRef.current?.fit();
        if (xtermRef.current) window.claude.resize(xtermRef.current.cols, xtermRef.current.rows);
      } catch (_error) {}
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [terminalVisible]);

  const handleSend = () => {
    const command = input.trim();
    if (!command) return;
    window.claude.writeLine(command);
    setInput('');
  };

  const handleClean = () => {
    if (isListening) {
      setIsListening(false);
      setIsTranscribing(true);
      void window.electronAPI.dictationStop().finally(() => setIsTranscribing(false));
    }

    window.claude.writeLine('/clean');
    setIsStreaming(false);
    setInput('');
  };

  const handleClearConversation = () => {
    if (isListening) {
      setIsListening(false);
      setIsTranscribing(true);
      void window.electronAPI.dictationStop().finally(() => setIsTranscribing(false));
    }

    window.claude.writeLine('/clear');
    xtermRef.current?.clear();
    setIsStreaming(false);
    setChunkCount(0);
    setInput('');
  };

  const cycleTerminalMode = () => {
    setTerminalMode((prev) => {
      if (prev === 'collapsed') return 'medium';
      if (prev === 'medium') return 'large';
      return 'collapsed';
    });
  };

  const toggleDictation = async () => {
    if (isListening) {
      setIsListening(false);
      setIsTranscribing(true);
      const result = await window.electronAPI.dictationStop();
      if (result.text) {
        setInput((prev) => (prev ? `${prev} ${result.text}` : result.text));
      } else if (result.error) {
        console.error('[dictation] stop error:', result.error);
      }
      setIsTranscribing(false);
      return;
    }

    const result = await window.electronAPI.dictationStart();
    if (result.error) {
      console.error('[dictation] start error:', result.error);
      return;
    }

    setIsListening(true);
  };

  const handlePrimaryAction = () => {
    if (isTranscribing) return;

    if (isListening) {
      void toggleDictation();
      return;
    }

    if (input.trim()) {
      handleSend();
      return;
    }

    void toggleDictation();
  };

  const terminalHeight = `calc(100vh - ${BAR_STACK_HEIGHT + SHELL_PADDING}px)`;
  const placeholder = 'Ask Claude Code anything...';
  const contextPercent = Math.min(100, Math.round(chunkCount * 1.8));
  const contextToneClass = contextPercent >= 90
    ? 'bg-[#ff453a]'
    : contextPercent >= 70
      ? 'bg-[#ff9f0a]'
      : 'bg-[#30d158]';
  const terminalActionTitle = terminalMode === 'collapsed'
    ? 'Expandir terminal (médio)'
    : terminalMode === 'medium'
      ? 'Expandir terminal (maior)'
      : 'Minimizar terminal';
  const actionTitle = isTranscribing
    ? 'Finalizando ditado...'
    : isListening
      ? 'Parar ditado'
      : input.trim()
        ? 'Enviar'
        : 'Iniciar ditado';

  return (
    <div className="flex flex-col h-screen bg-transparent overflow-hidden text-white p-2 items-center">
      <div className="w-full max-w-[420px] flex flex-col h-full">
        <div
          className={`flex-1 overflow-hidden relative transition-all duration-300 border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.3)] flex flex-col bg-[#09090b]/95 ${terminalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.99] pointer-events-none'}`}
          style={{
            height: terminalVisible ? terminalHeight : '0px',
            borderRadius: '12px',
            marginBottom: terminalVisible ? '6px' : '0px',
          }}
        >
          <div
            className="h-7 bg-[#141414] border-b border-white/[0.06] flex items-center justify-between px-3 no-drag shrink-0 hover:bg-[#191919] transition-colors cursor-pointer"
            onClick={() => setTerminalMode('collapsed')}
          >
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-[#30d158]' : 'bg-white/40'}`} />
              <span className="text-[12px] text-white/60">Terminal</span>
            </div>

            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                title={`Contexto da conversa: ${contextPercent}%`}
                aria-label={`Contexto da conversa: ${contextPercent}%`}
                className="h-5 px-2 rounded-full border border-white/[0.10] bg-white/[0.04] inline-flex items-center gap-1 text-[10px] text-white/65"
                onClick={(event) => event.stopPropagation()}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${contextToneClass}`} />
                <span>{contextPercent}%</span>
              </button>

              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-white/28">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>

          <div
            ref={terminalRef}
            onMouseDown={() => xtermRef.current?.focus()}
            className="flex-1 bg-[#09090b] no-drag relative terminal-shell"
          />
        </div>

        <div className="h-[100px] flex flex-col gap-[6px]">
          <div className="rounded-[12px] bg-[#1a1a1a] border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.3)] px-[10px] py-[6px] flex items-center justify-between drag-region">
            <div className="inline-flex items-center gap-2 no-drag">
              <div className={`w-1.5 h-1.5 rounded-full ${chunkCount > 0 ? 'bg-[#30d158]' : 'bg-[#4a4a4a]'}`} />
              <span className="text-[12px] font-medium text-white/75">New Tab</span>
            </div>

            <div className="inline-flex items-center gap-3 text-white/55 no-drag">
              <button
                onClick={cycleTerminalMode}
                title={terminalActionTitle}
                aria-label={terminalActionTitle}
                className="hover:text-white/88 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {terminalMode === 'large' ? (
                    <path d="m6 9 6 6 6-6" />
                  ) : terminalMode === 'medium' ? (
                    <>
                      <path d="M12 4v11" />
                      <path d="M8.5 11.5 12 15l3.5-3.5" />
                    </>
                  ) : (
                    <>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </>
                  )}
                </svg>
              </button>

              <button
                onClick={handleClearConversation}
                title="Limpar conversa (/clear)"
                aria-label="Limpar conversa (/clear)"
                className="hover:text-white/88 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>

              <button
                title="Menu"
                aria-label="Menu"
                className="hover:text-white/88 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="rounded-[12px] bg-[#242424] border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.3)] px-[8px] py-[4px] flex items-center no-drag">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!input.trim() && terminalVisible) {
                    void window.claude.write('\r');
                    return;
                  }
                  handleSend();
                }

                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                  e.preventDefault();
                  handleClean();
                }
              }}
              placeholder={placeholder}
              className="flex-1 bg-transparent border-none outline-none text-[12px] text-[#f5f5f7] placeholder-white/32"
              ref={inputRef}
            />

            <button
              onClick={handlePrimaryAction}
              disabled={isTranscribing}
              title={actionTitle}
              aria-label={isListening ? 'Parar gravação' : input.trim() ? 'Enviar' : 'Gravar voz'}
              className={`h-8 w-8 rounded-full border border-white/[0.10] flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-[#ff3b30] text-white dictation-pulse'
                  : 'bg-[#333333] text-white/88 hover:bg-[#3b3b3b]'
              } ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isTranscribing ? (
                <span className="text-[12px] leading-none">⏳</span>
              ) : isListening ? (
                <span className="text-[12px] leading-none">⏹</span>
              ) : input.trim() ? (
                <span className="text-[14px] leading-none">→</span>
              ) : (
                <span className="text-[13px] leading-none">🎙</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
