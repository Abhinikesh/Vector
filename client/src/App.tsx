import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Editor, { loader } from '@monaco-editor/react';

// Eagerly pre-load Monaco editor assets in the background as early as possible
loader.init().catch(err => console.error('Monaco pre-load failed:', err));
import JSZip from 'jszip';
import {
  Check,
  Zap,
  WifiOff,
  Wifi,
  Plus,
  X,
  RefreshCw,
  Monitor,
  EyeOff,
  MapIcon,
  Share,
  Download,
} from './Icons';
import { detectLanguage } from './utils/languageDetector';
import './App.css';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'http://localhost:5001').replace(/\/+$/, '');

interface IFile {
  filename: string;
  content: string;
  language: string;
  order: number;
}

/* ─── App ───────────────────────────────────────────────────── */
function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomCreatedAt, setRoomCreatedAt] = useState<string | null>(null);
  const [receiveCodeInput, setReceiveCodeInput] = useState<string>('');
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveLoading, setReceiveLoading] = useState<boolean>(false);

  const [files, setFiles] = useState<IFile[]>([]);
  const [activeFilename, setActiveFilename] = useState<string | null>(null);
  const [shared, setShared] = useState<boolean>(false);

  const [minimapVisible, setMinimapVisible] = useState<boolean>(true);
  const [renamingFilename, setRenamingFilename] = useState<string | null>(null);
  const [renameInputVal, setRenameInputVal] = useState<string>('');

  // Inline add-file input state
  const [isAddingFile, setIsAddingFile] = useState<boolean>(false);
  const [newFilenameVal, setNewFilenameVal] = useState<string>('');
  const [addFileError, setAddFileError] = useState<string | null>(null);



  const [connectionStatus, setConnectionStatus] = useState<'Live' | 'Reconnecting...' | 'Offline'>('Offline');

  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string>('');

  const socketRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const isRemoteEditRef = useRef<boolean>(false);
  const isTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<any>(null);
  const lastEmitTimeRef = useRef<number>(0);
  const emitTimeoutRef = useRef<any>(null);
  const localAddingFilenameRef = useRef<string | null>(null);

  const hasHtmlFile = files.some(f => f.filename.toLowerCase().endsWith('.html'));

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (emitTimeoutRef.current) clearTimeout(emitTimeoutRef.current);
    };
  }, []);



  /* ── Save active tab in localStorage ─────────────────────── */
  useEffect(() => {
    if (roomCode && activeFilename) {
      localStorage.setItem(`vector_active_file_${roomCode}`, activeFilename);
    }
  }, [roomCode, activeFilename]);

  /* ── Initial active tab selector ────────────────────────── */
  const selectInitialActiveFile = useCallback((code: string, filesList: IFile[]) => {
    if (filesList.length === 0) return;
    const saved = localStorage.getItem(`vector_active_file_${code}`);
    if (saved && filesList.some(f => f.filename === saved)) {
      setActiveFilename(saved);
    } else {
      setActiveFilename(filesList[0].filename);
    }
  }, []);

  /* ── Helper to parse the initial room code from path, query or hash ── */
  const getInitialCode = useCallback(() => {
    const hash = window.location.hash.replace('#', '').trim();
    if (/^\d{6}$/.test(hash)) return hash;

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('code');
    if (roomParam && /^\d{6}$/.test(roomParam.trim())) return roomParam.trim();

    const path = window.location.pathname.replace('/', '').trim();
    if (/^\d{6}$/.test(path)) return path;

    return null;
  }, []);

  /* ── Helper to format the creation timestamp ── */
  const formatTimestamp = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return `Created ${date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}, ${date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })}`;
    } catch (e) {
      return '';
    }
  };

  /* ── Preview compiler ──────────────────────────────────────── */
  const generatePreviewContent = useCallback((filesList: IFile[]): string => {
    const htmlFile = filesList.find(f => f.filename.toLowerCase().endsWith('.html'));
    if (!htmlFile) return '';

    const css = filesList
      .filter(f => f.filename.toLowerCase().endsWith('.css'))
      .map(f => f.content).join('\n');

    const js = filesList
      .filter(f => f.filename.toLowerCase().endsWith('.js'))
      .map(f => f.content).join('\n');

    let doc = htmlFile.content;

    const styleTag = `<style>\n${css}\n</style>`;
    if (doc.includes('</head>')) {
      doc = doc.replace('</head>', `${styleTag}\n</head>`);
    } else if (doc.includes('<head>')) {
      doc = doc.replace('<head>', `<head>\n${styleTag}`);
    } else {
      doc = styleTag + '\n' + doc;
    }

    const scriptTag = `<script>\n${js}\n</script>`;
    if (doc.includes('</body>')) {
      doc = doc.replace('</body>', `${scriptTag}\n</body>`);
    } else {
      doc = doc + '\n' + scriptTag;
    }

    return doc;
  }, []);

  /* ── Debounced preview (500 ms) ──────────────────────────── */
  useEffect(() => {
    if (!hasHtmlFile) {
      setShowPreview(false);
      return () => {};
    }
    const timer = setTimeout(() => {
      setPreviewSrcDoc(generatePreviewContent(files));
    }, 500);
    return () => clearTimeout(timer);
  }, [files, hasHtmlFile, generatePreviewContent]);

  /* ── Remote edit helper ──────────────────────────────────── */
  const applyRemoteEdit = (filename: string, content: string) => {
    setFiles(prev => prev.map(f => f.filename === filename ? { ...f, content } : f));

    if (filename === activeFilename && editorRef.current) {
      const cur = editorRef.current.getValue();
      if (content !== cur) {
        isRemoteEditRef.current = true;
        const pos = editorRef.current.getPosition();
        const sel = editorRef.current.getSelections();
        const top = editorRef.current.getScrollTop();
        editorRef.current.setValue(content);
        if (pos) editorRef.current.setPosition(pos);
        if (sel) editorRef.current.setSelections(sel);
        editorRef.current.setScrollTop(top);
        isRemoteEditRef.current = false;
      }
    }
  };

  /* ── Idle resync ─────────────────────────────────────────── */
  const triggerIdleSync = async () => {
    if (!roomCode) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms/${roomCode}`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: IFile[] = data.files.sort((a: IFile, b: IFile) => a.order - b.order);
      setFiles(prev => {
        const active = fetched.find(f => f.filename === activeFilename);
        if (active && activeFilename) {
          const local = prev.find(f => f.filename === activeFilename);
          if (local && local.content !== active.content) applyRemoteEdit(activeFilename, active.content);
        }
        return fetched;
      });
      if (data.createdAt) {
        setRoomCreatedAt(data.createdAt);
      }
    } catch (err) {
      console.error('Idle sync error:', err);
    }
  };

  /* ── Socket setup ────────────────────────────────────────── */
  useEffect(() => {
    socketRef.current = io(SERVER_URL, {
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    const onConnect = async () => {
      setConnectionStatus('Live');
      if (roomCode) {
        socketRef.current.emit('join-room', roomCode);
        try {
          const res = await fetch(`${SERVER_URL}/api/rooms/${roomCode}`);
          if (res.ok) {
            const data = await res.json();
            const fetched: IFile[] = data.files.sort((a: IFile, b: IFile) => a.order - b.order);
            setFiles(fetched);
            if (data.createdAt) {
              setRoomCreatedAt(data.createdAt);
            }
          }
        } catch (err) {
          console.error('Reconnect fetch error:', err);
        }
      }
    };

    const onDisconnect = (reason: string) => {
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        setConnectionStatus('Offline');
      } else {
        setConnectionStatus('Reconnecting...');
      }
    };

    socketRef.current.on('connect', onConnect);
    socketRef.current.on('disconnect', onDisconnect);
    socketRef.current.on('connect_error', () => setConnectionStatus('Reconnecting...'));

    if (socketRef.current.connected) setConnectionStatus('Live');

    socketRef.current.on('file:edit', ({ filename, content }: { filename: string; content: string }) => {
      if (filename !== activeFilename) {
        setFiles(prev => prev.map(f => f.filename === filename ? { ...f, content } : f));
      } else {
        if (!isTypingRef.current) {
          applyRemoteEdit(filename, content);
        } else {
          setFiles(prev => prev.map(f => f.filename === filename ? { ...f, content } : f));
        }
      }
    });

    socketRef.current.on('file:add', (newFile: IFile) => {
      setFiles(prev => {
        if (prev.some(f => f.filename === newFile.filename)) return prev;
        return [...prev, newFile].sort((a, b) => a.order - b.order);
      });
      if (localAddingFilenameRef.current === newFile.filename) {
        setActiveFilename(newFile.filename);
        localAddingFilenameRef.current = null;
      }
    });

    socketRef.current.on('file:rename', ({ oldFilename, newFilename, language }: any) => {
      setFiles(prev => prev.map(f =>
        f.filename === oldFilename ? { ...f, filename: newFilename, language } : f
      ));
      setActiveFilename(cur => cur === oldFilename ? newFilename : cur);
    });

    socketRef.current.on('file:delete', ({ filename }: { filename: string }) => {
      setFiles(prev => {
        const next = prev.filter(f => f.filename !== filename);
        setActiveFilename(cur => {
          if (cur === filename) return next.length > 0 ? next[0].filename : null;
          return cur;
        });
        return next;
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect', onConnect);
        socketRef.current.off('disconnect', onDisconnect);
        socketRef.current.off('connect_error');
        socketRef.current.off('file:edit');
        socketRef.current.off('file:add');
        socketRef.current.off('file:rename');
        socketRef.current.off('file:delete');
        socketRef.current.disconnect();
      }
    };
  }, [roomCode, activeFilename]);

  const activeFile = files.find(f => f.filename === activeFilename) || null;

  /* ── Join room logic ─────────────────────────────────────── */
  const handleJoinRoom = async (code: string) => {
    if (receiveLoading) return;
    setReceiveLoading(true);
    setReceiveError(null);

    try {
      const res = await fetch(`${SERVER_URL}/api/rooms/${code}`);
      if (!res.ok) {
        if (res.status === 404) {
          setReceiveError('Session not found');
        } else {
          setReceiveError('Server error');
        }
        setReceiveLoading(false);
        return;
      }
      const data = await res.json();

      // Leave old room
      if (socketRef.current) {
        socketRef.current.emit('leave-room');
      }

      setRoomCode(data.code);
      if (data.createdAt) {
        setRoomCreatedAt(data.createdAt);
      }
      setFiles(data.files.sort((a: IFile, b: IFile) => a.order - b.order));
      selectInitialActiveFile(data.code, data.files);

      // Join new room
      if (socketRef.current) {
        socketRef.current.emit('join-room', data.code);
      }

      setReceiveCodeInput('');
      setReceiveError(null);
      window.location.hash = data.code;
    } catch (err) {
      console.error(err);
      setReceiveError('Connection error');
    } finally {
      setReceiveLoading(false);
    }
  };

  const handleReceiveCodeChange = async (val: string) => {
    const numeric = val.replace(/\D/g, '').slice(0, 6);
    setReceiveCodeInput(numeric);
    setReceiveError(null);

    if (numeric.length === 6) {
      await handleJoinRoom(numeric);
    }
  };

  const handleReceiveSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (receiveCodeInput.length !== 6) {
      setReceiveError('Must be 6 digits');
      return;
    }
    await handleJoinRoom(receiveCodeInput);
  };

  // Initial load auto-join or silent room creation
  useEffect(() => {
    const initApp = async () => {
      const initialCode = getInitialCode();
      if (initialCode) {
        try {
          const res = await fetch(`${SERVER_URL}/api/rooms/${initialCode}`);
          if (res.ok) {
            const data = await res.json();
            setRoomCode(data.code);
            if (data.createdAt) {
              setRoomCreatedAt(data.createdAt);
            }
            setFiles(data.files.sort((a: IFile, b: IFile) => a.order - b.order));
            selectInitialActiveFile(data.code, data.files);
            if (socketRef.current) {
              socketRef.current.emit('join-room', data.code);
            }
            return;
          }
        } catch (err) {
          console.error('Error fetching initial room:', err);
        }
      }

      // Create new room automatically if no valid initial code exists
      try {
        const res = await fetch(`${SERVER_URL}/api/rooms`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setRoomCode(data.code);
          if (data.createdAt) {
            setRoomCreatedAt(data.createdAt);
          }
          setFiles(data.files.sort((a: IFile, b: IFile) => a.order - b.order));
          selectInitialActiveFile(data.code, data.files);
          if (socketRef.current) {
            socketRef.current.emit('join-room', data.code);
          }
          window.location.hash = data.code;
        }
      } catch (err) {
        console.error('Error creating default room:', err);
      }
    };

    initApp();
  }, [getInitialCode]);

  /* ── Throttled emit (250 ms) ─────────────────────────────── */
  const throttledEmitEdit = (filename: string, content: string) => {
    if (!roomCode) return;
    const LIMIT = 250;
    const now = Date.now();
    if (now - lastEmitTimeRef.current >= LIMIT) {
      socketRef.current.emit('file:edit', { code: roomCode, filename, content });
      lastEmitTimeRef.current = now;
      if (emitTimeoutRef.current) { clearTimeout(emitTimeoutRef.current); emitTimeoutRef.current = null; }
    } else {
      if (emitTimeoutRef.current) clearTimeout(emitTimeoutRef.current);
      emitTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('file:edit', { code: roomCode, filename, content });
        lastEmitTimeRef.current = Date.now();
      }, LIMIT - (now - lastEmitTimeRef.current));
    }
  };

  const handleEditorDidMount = (editor: any) => { editorRef.current = editor; };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || isRemoteEditRef.current) return;
    if (!roomCode || !activeFilename) return;

    setFiles(prev => prev.map(f => f.filename === activeFilename ? { ...f, content: value } : f));

    isTypingRef.current = true;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      triggerIdleSync();
    }, 2000);

    throttledEmitEdit(activeFilename, value);
  };
  const handleShareCode = async () => {
    if (!roomCode) return;
    const shareText = `Join my Vector session — code: ${roomCode}`;
    const shareUrl = `${window.location.origin}/#${roomCode}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Vector Code Session',
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  const handleDownloadZip = async () => {
    if (!roomCode || files.length === 0) return;
    try {
      const zip = new JSZip();
      files.forEach(file => {
        zip.file(file.filename, file.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vector-${roomCode}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP generation failed:', err);
    }
  };

  /* ── Inline add-file input handlers ─────────────────────── */
  const handleOpenAddFile = () => {
    setIsAddingFile(true);
    setNewFilenameVal('');
    setAddFileError(null);
  };

  const handleCommitNewFile = () => {
    if (!roomCode) return;
    const trimmed = newFilenameVal.trim();
    if (!trimmed) { setIsAddingFile(false); return; }
    if (files.some(f => f.filename.toLowerCase() === trimmed.toLowerCase())) {
      setAddFileError('Name already exists');
      return;
    }
    localAddingFilenameRef.current = trimmed;
    socketRef.current.emit('file:add', { code: roomCode, filename: trimmed, language: detectLanguage(trimmed) });
    setIsAddingFile(false);
    setNewFilenameVal('');
    setAddFileError(null);
  };

  const handleCancelAddFile = () => {
    setIsAddingFile(false);
    setNewFilenameVal('');
    setAddFileError(null);
  };

  /* ── Rename handlers ─────────────────────────────────────── */
  const handleStartRename = (filename: string) => {
    setRenamingFilename(filename);
    setRenameInputVal(filename);
  };

  const handleRenameConfirm = () => {
    if (!roomCode || !renamingFilename) return;
    const trimmed = renameInputVal.trim();
    if (!trimmed || trimmed === renamingFilename) { setRenamingFilename(null); return; }
    if (files.some(f => f.filename.toLowerCase() === trimmed.toLowerCase() && f.filename !== renamingFilename)) {
      setRenamingFilename(null);
      return;
    }
    socketRef.current.emit('file:rename', {
      code: roomCode,
      oldFilename: renamingFilename,
      newFilename: trimmed,
      language: detectLanguage(trimmed),
    });
    setRenamingFilename(null);
  };

  /* ── Delete handler — no confirm dialog, × only shows when >1 file ── */
  const handleDeleteFile = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    if (!roomCode || files.length <= 1) return;
    socketRef.current.emit('file:delete', { code: roomCode, filename });
  };

  /* ─── Connection status icon helper ─────────────────────── */
  const StatusIcon = () => {
    if (connectionStatus === 'Live') return <Wifi size={13} />;
    if (connectionStatus === 'Reconnecting...') return <WifiOff size={13} />;
    return <WifiOff size={13} />;
  };

  /* ═══════════════════════════════════════════════════════════
     VIEW
  ═══════════════════════════════════════════════════════════ */

  if (!roomCode) {
    return (
      <div className="landing-container">
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
          Initializing workspace...
        </div>
      </div>
    );
  }

  const dotClass = connectionStatus === 'Live' ? 'live'
                 : connectionStatus === 'Reconnecting...' ? 'reconnecting'
                 : 'offline';

  return (
    <div className="editor-layout">

      {/* ── Header ── */}
      <header className="editor-header">
        <div className="header-left">
          <strong className="app-logo">Vector</strong>

          <div className="code-badge-wrapper">
            <span className="code-badge-label">Your code:</span>
            <span className="code-badge">
              <strong>{roomCode}</strong>
            </span>
            {/* Share is now the only action next to the code */}
            <button onClick={handleShareCode} className="btn-share">
              {shared
                ? <><Check size={12} /> Shared</>
                : <><Share size={12} /> Share</>}
            </button>
          </div>

          {/* Receive a code sits directly after the code badge */}
          <div className="receive-code-wrapper">
            <span className="receive-code-label">Receive a code:</span>
            <form onSubmit={handleReceiveSubmit} style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                maxLength={6}
                placeholder="6-digit code"
                value={receiveCodeInput}
                onChange={e => handleReceiveCodeChange(e.target.value)}
                className="receive-code-input"
                disabled={receiveLoading}
              />
            </form>
            {receiveError && <span className="receive-code-error">{receiveError}</span>}
          </div>

          {/* Created timestamp — after Receive a code */}
          {roomCreatedAt && (
            <span className="room-timestamp">
              {formatTimestamp(roomCreatedAt)}
            </span>
          )}
        </div>

        <div className="header-right">
          {/* Connection status — no person count */}
          <div className="status-indicator">
            <span className={`status-dot ${dotClass}`} />
            <StatusIcon />
            <span className="status-text">{connectionStatus}</span>
          </div>

          {hasHtmlFile && (
            <button
              onClick={() => setShowPreview(prev => !prev)}
              className={`btn-preview-toggle ${showPreview ? 'active' : ''}`}
            >
              {showPreview
                ? <><EyeOff size={13} /> Hide Preview</>
                : <><Monitor size={13} /> Preview</>}
            </button>
          )}

          <label className="minimap-toggle">
            <input
              type="checkbox"
              checked={minimapVisible}
              onChange={e => setMinimapVisible(e.target.checked)}
            />
            <MapIcon size={12} />
            Minimap
          </label>

          <button onClick={handleDownloadZip} className="btn-download">
            <Download size={13} />
            Download
          </button>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="tab-bar">
        <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
          {files.map(file => {
            const isActive = file.filename === activeFilename;
            const isRenaming = file.filename === renamingFilename;

            return (
              <div
                key={file.filename}
                onClick={() => !isRenaming && setActiveFilename(file.filename)}
                className={`tab-item ${isActive ? 'active' : ''}`}
                title="Double-click to rename"
              >
                {isRenaming ? (
                  <input
                    value={renameInputVal}
                    onChange={e => setRenameInputVal(e.target.value)}
                    onBlur={handleRenameConfirm}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameConfirm();
                      if (e.key === 'Escape') setRenamingFilename(null);
                    }}
                    autoFocus
                    className="tab-rename-input"
                  />
                ) : (
                  <span onDoubleClick={() => handleStartRename(file.filename)} className="tab-name">
                    {file.filename}
                  </span>
                )}

                {files.length > 1 && (
                  <button
                    onClick={e => handleDeleteFile(e, file.filename)}
                    className="tab-delete-btn"
                    title="Delete file"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Inline new-file input — appears in the tab strip itself */}
          {isAddingFile && (
            <div className="tab-item tab-item--adding">
              <input
                value={newFilenameVal}
                onChange={e => { setNewFilenameVal(e.target.value); setAddFileError(null); }}
                onBlur={handleCancelAddFile}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCommitNewFile(); }
                  if (e.key === 'Escape') handleCancelAddFile();
                }}
                placeholder="filename.ext"
                autoFocus
                className="tab-rename-input tab-new-file-input"
                title="Type a filename and press Enter, or Escape to cancel"
              />
              {addFileError && <span className="tab-add-error">{addFileError}</span>}
            </div>
          )}
        </div>

        <button onClick={handleOpenAddFile} className="tab-add-btn" title="New file">
          <Plus size={14} />
        </button>
      </div>

      {/* ── Workspace ── */}
      <div className="editor-workspace">
        <div className="editor-editor-pane">
          {activeFile ? (
            <>
              <Editor
                height="100%"
                theme="vs-dark"
                language={activeFile.language}
                value={activeFile.content}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                options={{
                  lineNumbers: 'on',
                  minimap: { enabled: minimapVisible },
                  fontSize: 14,
                  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  automaticLayout: true,
                  readOnly: connectionStatus !== 'Live',
                  renderLineHighlight: 'gutter',
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
              {connectionStatus !== 'Live' && (
                <div className="editor-offline-overlay">
                  <div className="offline-message">
                    <span><WifiOff size={16} /> Connection lost</span>
                    <p>Edits are disabled while reconnecting. Your work is safe — don't close this tab.</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-file-screen">
              <p>No file selected. Add a file to begin.</p>
            </div>
          )}
        </div>

        {/* ── Live Preview Pane ── */}
        {showPreview && hasHtmlFile && (
          <div className="editor-preview-pane">
            <div className="preview-pane-header">
              <span className="preview-pane-label">
                <Zap size={12} />
                Live Preview
              </span>
              <button
                className="btn-preview-refresh"
                onClick={() => setPreviewSrcDoc(generatePreviewContent(files))}
                title="Force refresh"
              >
                <RefreshCw size={11} />
                Refresh
              </button>
            </div>
            <iframe
              srcDoc={previewSrcDoc}
              sandbox="allow-scripts"
              title="Vector Live Preview"
              className="preview-iframe"
            />
          </div>
        )}
      </div>

    </div>
  );
}

export default App;
