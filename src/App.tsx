import { useState, useEffect } from 'react';
import { useStore } from './store';
import { exportLines } from './lib/export';
import type { Line } from './types';
import './App.css';

// ─── Login ────────────────────────────────────────────────────────────────────
function Login() {
  const login = useStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'Exo12345') {
      login(username.trim() || 'Field Worker');
    } else {
      setError('Invalid password');
    }
  }

  return (
    <div className="screen login-screen">
      <div className="login-box">
        <div className="logo-wrap">
          <div className="logo-hex">⬡</div>
          <div className="logo-text">EXODIGO <span>FIELD</span></div>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            className="field-input"
            placeholder="Your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
          <input
            className="field-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
          />
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primary full-width" type="submit">ENTER</button>
        </form>
      </div>
    </div>
  );
}

// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ lines, onClose }: { lines: Line[]; onClose: () => void }) {
  const [filename, setFilename] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function doExport() {
    const toExport = lines.filter((l) => selected.has(l.id));
    if (!toExport.length || !filename.trim()) return;
    exportLines(toExport, filename.trim());
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">EXPORT</div>
        <input
          className="field-input"
          placeholder="File name (e.g. geophone_hits_line2)"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          autoFocus
        />
        <div className="modal-label">Select lines:</div>
        {lines.map((l) => (
          <label key={l.id} className="check-row">
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
            {l.name}
          </label>
        ))}
        <div className="modal-actions">
          <button className="btn-primary" onClick={doExport} disabled={!filename.trim() || selected.size === 0}>
            DOWNLOAD
          </button>
          <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function Home({ onSelectLine, onNewLine }: {
  onSelectLine: (id: string) => void;
  onNewLine: () => void;
}) {
  const { lines, username, logout, mergeFromCloud, deleteLine } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { mergeFromCloud(); }, []);

  function handleDelete(id: string) {
    deleteLine(id);
    setConfirmDelete(null);
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <div className="top-title">LINES</div>
        <div className="top-right">
          <span className="top-user">{username}</span>
          <button className="btn-ghost" onClick={logout}>OUT</button>
        </div>
      </header>

      <div className="line-list">
        {lines.length === 0 && (
          <div className="empty-state">No lines yet. Create your first line.</div>
        )}
        {[...lines].reverse().map((line) => {
          const total = line.geophones.length;
          const done = line.geophones.filter((g) => g.hits.length >= 3 || g.skipped).length;
          const pct = Math.round((done / total) * 100);
          return (
            <div key={line.id} className="line-card" onClick={() => onSelectLine(line.id)}>
              <div className="line-card-header">
                <div className="line-card-name">{line.name}</div>
                <button className="btn-delete-line" onClick={(e) => { e.stopPropagation(); setConfirmDelete(line.id); }}>✕</button>
              </div>
              <div className="line-card-meta">
                <span>{total} geophones</span>
                <span>{line.hitCounter} hits recorded</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="progress-label">{pct}% complete</div>
            </div>
          );
        })}
      </div>

      <div className="bottom-actions">
        <button className="btn-primary" onClick={onNewLine}>+ NEW LINE</button>
        <button className="btn-outline" onClick={() => setExportOpen(true)} disabled={lines.length === 0}>
          EXPORT
        </button>
      </div>

      {exportOpen && <ExportModal lines={lines} onClose={() => setExportOpen(false)} />}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">DELETE LINE?</div>
            <div className="modal-sub">
              {lines.find(l => l.id === confirmDelete)?.name} — all data will be lost.
            </div>
            <div className="modal-actions">
              <button className="btn-danger" onClick={() => handleDelete(confirmDelete)}>DELETE</button>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New Line ─────────────────────────────────────────────────────────────────
function NewLine({ onDone, onBack }: { onDone: (id: string) => void; onBack: () => void }) {
  const createLine = useStore((s) => s.createLine);
  const [name, setName] = useState('');
  const [count, setCount] = useState('');

  function handleCreate() {
    const n = parseInt(count);
    if (!name.trim() || isNaN(n) || n < 1) return;
    const id = createLine(name.trim().toUpperCase(), n);
    onDone(id);
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← BACK</button>
        <div className="top-title">NEW LINE</div>
      </header>
      <div className="setup-body">
        <div className="setup-label">LINE NAME</div>
        <input
          className="field-input big-input"
          placeholder="e.g. LINE 4"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="setup-label">NUMBER OF GEOPHONES</div>
        <input
          className="field-input big-input"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 88"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          min="1"
        />
        <button
          className="btn-primary full-width"
          onClick={handleCreate}
          disabled={!name.trim() || !count || parseInt(count) < 1}
        >
          CREATE LINE
        </button>
      </div>
    </div>
  );
}

// ─── Line Setup ───────────────────────────────────────────────────────────────
function LineSetup({ lineId, onStart, onBack }: {
  lineId: string;
  onStart: () => void;
  onBack: () => void;
}) {
  const { lines, replaceSensor } = useStore();
  const line = lines.find((l) => l.id === lineId)!;
  const [editing, setEditing] = useState<number | null>(null);
  const [repVal, setRepVal] = useState('');

  function submitReplace(position: number) {
    const n = parseInt(repVal);
    if (!isNaN(n) && n > 0) replaceSensor(lineId, position, n);
    setEditing(null);
    setRepVal('');
  }

  if (!line) return null;

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← BACK</button>
        <div className="top-title">{line.name} SETUP</div>
        <button className="btn-primary" onClick={onStart}>START →</button>
      </header>

      <div className="setup-hint">Tap a geophone to replace its sensor ID</div>

      <div className="geo-grid">
        {line.geophones.map((g) => (
          <div
            key={g.position}
            className={`geo-chip ${g.sensorId !== g.position ? 'replaced' : ''}`}
            onClick={() => { setEditing(g.position); setRepVal(String(g.sensorId)); }}
          >
            <div className="geo-chip-pos">#{g.position}</div>
            <div className="geo-chip-sensor">{g.sensorId}</div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">REPLACE SENSOR</div>
            <div className="modal-sub">Position #{editing}</div>
            <input
              className="field-input big-input"
              type="number"
              inputMode="numeric"
              placeholder="New sensor ID"
              value={repVal}
              onChange={(e) => setRepVal(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => submitReplace(editing)}>CONFIRM</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recording ────────────────────────────────────────────────────────────────
function Recording({ lineId, onBack }: { lineId: string; onBack: () => void }) {
  const { lines, activeGeophoneIndex, setActiveGeophone, addHit, undoLastHit, toggleHitValidity, skipGeophone, unskipGeophone, replaceSensor, addNote, deleteNote, addLineNote, deleteLineNote } = useStore();
  const line = lines.find((l) => l.id === lineId)!;
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [lineNoteOpen, setLineNoteOpen] = useState(false);
  const [lineNoteText, setLineNoteText] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceVal, setReplaceVal] = useState('');
  const [overviewOpen, setOverviewOpen] = useState(false);

  const geo = line?.geophones[activeGeophoneIndex];
  const totalHits = geo?.hits.length ?? 0;
  const validHits = geo?.hits.filter((h) => !h.invalid).length ?? 0;
  const isLast = activeGeophoneIndex === (line?.geophones.length ?? 1) - 1;

  useEffect(() => {
    setNoteText('');
  }, [activeGeophoneIndex, lineId]);

  if (!line || !geo) return null;

  const hitColor = validHits >= 3 ? '#00ff9d' : validHits >= 2 ? '#f5a623' : '#ff4d6d';

  function next() { if (!isLast) setActiveGeophone(activeGeophoneIndex + 1); }
  function prev() { if (activeGeophoneIndex > 0) setActiveGeophone(activeGeophoneIndex - 1); }

  function handleSkip() {
    skipGeophone(lineId, geo.position);
    next();
  }


  return (
    <div className="screen recording-screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← LINES</button>
        <div className="top-title">{line.name}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-ghost" onClick={() => setOverviewOpen(true)}>ALL</button>
          <button className="btn-ghost" onClick={() => setLineNoteOpen(true)}>
            NOTE{(line.lineNotes ?? []).length > 0 ? ` (${line.lineNotes.length})` : ''}
          </button>
          <button className="btn-ghost" onClick={() => setNavOpen(true)}>GO TO</button>
        </div>
      </header>

      {/* Geo nav */}
      <div className="geo-nav">
        <button className="nav-arrow" onClick={prev} disabled={activeGeophoneIndex === 0}>‹</button>
        <div className="geo-info">
          <div className="geo-position">#{geo.position}</div>
          <div className="geo-sensor tappable" onClick={() => { setReplaceVal(String(geo.sensorId)); setReplaceOpen(true); }}>
            sensor {geo.sensorId} ✎
          </div>
          {geo.sensorId !== geo.position && <div className="geo-replaced-badge">REPLACED</div>}
          <div className="geo-progress">{activeGeophoneIndex + 1} / {line.geophones.length}</div>
        </div>
        <button className="nav-arrow" onClick={next} disabled={isLast}>›</button>
      </div>

      {/* Hit display */}
      <div className="hit-display">
        <div className="hit-count" style={{ color: hitColor }}>{validHits}</div>
        <div className="hit-label">VALID HITS</div>
        {totalHits !== validHits && (
          <div className="hit-invalid-count">{totalHits - validHits} invalid</div>
        )}
        {geo.hits.length > 0 && (
          <button className="btn-undo" onClick={() => undoLastHit(lineId, geo.position)}>
            ↩ UNDO LAST HIT
          </button>
        )}
      </div>

      <div className="global-counter">
        LINE TOTAL: <strong>{line.hitCounter}</strong> hits
      </div>

      {/* Big hit button */}
      <div className="action-buttons">
        <button
          className="btn-hit"
          onClick={() => addHit(lineId, geo.position, false)}
          disabled={geo.skipped}
        >
          +1
        </button>
      </div>

      {/* Secondary actions */}
      <div className="secondary-buttons">
        <button
          className="btn-secondary btn-invalid"
          onClick={() => addHit(lineId, geo.position, true)}
          disabled={geo.skipped}
        >
          INVALID +1
        </button>
        <button className="btn-secondary btn-note" onClick={() => setNoteOpen(true)}>
          NOTE{geo.notes.length > 0 ? ` (${geo.notes.length})` : ''}
        </button>
        <button
          className={`btn-secondary btn-skip ${geo.skipped ? 'btn-skipped' : ''}`}
          onClick={geo.skipped ? () => unskipGeophone(lineId, geo.position) : handleSkip}
        >
          {geo.skipped ? 'UNDO SKIP' : 'SKIP'}
        </button>
      </div>

      {/* Hit chips */}
      {geo.hits.length > 0 && (
        <div className="hit-list">
          <div className="hit-list-hint">TAP HIT TO TOGGLE VALID/INVALID</div>
          {geo.hits.map((h) => (
            <span
              key={h.hitNumber}
              className={`hit-chip ${h.invalid ? 'hit-chip-invalid' : ''}`}
              onClick={() => toggleHitValidity(lineId, geo.position, h.hitNumber)}
            >
              {h.hitNumber}{h.invalid ? ' ✕' : ' ✓'}
            </span>
          ))}
        </div>
      )}

      {noteOpen && (
        <div className="modal-overlay" onClick={() => setNoteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">NOTES — Geophone #{geo.position}</div>
            <div className="notes-list">
              {geo.notes.length === 0 && <div className="notes-empty">No notes yet</div>}
              {geo.notes.map((n) => (
                <div key={n.id} className="note-entry">
                  <span className="note-text">{n.text}</span>
                  <button className="note-delete" onClick={() => deleteNote(lineId, geo.position, n.id)}>✕</button>
                </div>
              ))}
            </div>
            <div className="note-add-row">
              <textarea
                className="field-input note-input"
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
              />
              <button className="btn-primary" onClick={() => {
                addNote(lineId, geo.position, noteText);
                setNoteText('');
              }} disabled={!noteText.trim()}>ADD</button>
            </div>
            <button className="btn-ghost full-width" onClick={() => setNoteOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {navOpen && (
        <div className="modal-overlay" onClick={() => setNavOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">GO TO GEOPHONE</div>
            <GoToInput max={line.geophones.length} onGo={(i) => { setActiveGeophone(i - 1); setNavOpen(false); }} />
            <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setNavOpen(false)}>CANCEL</button>
          </div>
        </div>
      )}

      {lineNoteOpen && (
        <div className="modal-overlay" onClick={() => setLineNoteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">LINE NOTES — {line.name}</div>
            <div className="notes-list">
              {(line.lineNotes ?? []).length === 0 && <div className="notes-empty">No notes yet</div>}
              {(line.lineNotes ?? []).map((n) => (
                <div key={n.id} className="note-entry">
                  <span className="note-text">{n.text}</span>
                  <button className="note-delete" onClick={() => deleteLineNote(lineId, n.id)}>✕</button>
                </div>
              ))}
            </div>
            <div className="note-add-row">
              <textarea
                className="field-input note-input"
                placeholder="e.g. Part 2, new line starts here..."
                value={lineNoteText}
                onChange={(e) => setLineNoteText(e.target.value)}
                rows={2}
                autoFocus
              />
              <button className="btn-primary" onClick={() => {
                addLineNote(lineId, lineNoteText);
                setLineNoteText('');
              }} disabled={!lineNoteText.trim()}>ADD</button>
            </div>
            <button className="btn-ghost full-width" onClick={() => setLineNoteOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {overviewOpen && (
        <OverviewPanel
          lineId={lineId}
          onClose={() => setOverviewOpen(false)}
          onJump={(i) => setActiveGeophone(i)}
        />
      )}

      {replaceOpen && (
        <div className="modal-overlay" onClick={() => setReplaceOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">REPLACE SENSOR</div>
            <div className="modal-sub">Geophone #{geo.position}</div>
            <input
              className="field-input big-input"
              type="number"
              inputMode="numeric"
              placeholder="New sensor ID"
              value={replaceVal}
              onChange={(e) => setReplaceVal(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => {
                const n = parseInt(replaceVal);
                if (!isNaN(n) && n > 0) replaceSensor(lineId, geo.position, n);
                setReplaceOpen(false);
              }}>CONFIRM</button>
              <button className="btn-ghost" onClick={() => setReplaceOpen(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────
function OverviewPanel({ lineId, onClose, onJump }: {
  lineId: string;
  onClose: () => void;
  onJump: (index: number) => void;
}) {
  const lines = useStore((s) => s.lines);
  const line = lines.find((l) => l.id === lineId)!;
  if (!line) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="overview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overview-header">
          <div className="modal-title">ALL GEOPHONES — {line.name}</div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="overview-grid">
          {line.geophones.map((g, i) => {
            const valid = g.hits.filter((h) => !h.invalid).length;
            const status = g.skipped ? 'skipped' : valid >= 3 ? 'done' : valid > 0 ? 'partial' : 'empty';
            return (
              <div
                key={g.position}
                className={`ov-chip ov-${status}`}
                onClick={() => { onJump(i); onClose(); }}
              >
                <div className="ov-pos">#{g.position}</div>
                <div className="ov-sensor">{g.sensorId !== g.position ? `s${g.sensorId}` : ''}</div>
                <div className="ov-hits">{g.skipped ? '—' : valid}</div>
              </div>
            );
          })}
        </div>
        <div className="overview-legend">
          <span className="leg done">■ 3+ hits</span>
          <span className="leg partial">■ 1-2 hits</span>
          <span className="leg empty">■ no hits</span>
          <span className="leg skipped">■ skipped</span>
        </div>
      </div>
    </div>
  );
}

function GoToInput({ max, onGo }: { max: number; onGo: (n: number) => void }) {
  const [val, setVal] = useState('');
  return (
    <>
      <input
        className="field-input big-input"
        type="number"
        inputMode="numeric"
        placeholder={`1 – ${max}`}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoFocus
      />
      <button
        className="btn-primary full-width"
        onClick={() => { const n = parseInt(val); if (n >= 1 && n <= max) onGo(n); }}
      >
        GO
      </button>
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type Screen = 'home' | 'new-line' | 'line-setup' | 'recording';

export default function App() {
  const { loggedIn, setActiveLine, mergeFromCloud, subscribeToChanges, syncStatus, pendingSync } = useStore();
  const [screen, setScreen] = useState<Screen>('home');
  const [activeId, setActiveId] = useState<string | null>(null);

  const flushPending = useStore((s) => s.flushPending);

  useEffect(() => {
    if (loggedIn) {
      mergeFromCloud();
      subscribeToChanges();
    }
  }, [loggedIn]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && loggedIn) {
        flushPending();
        mergeFromCloud();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loggedIn]);

  if (!loggedIn) return <Login />;

  function openLine(id: string) {
    setActiveLine(id);
    setActiveId(id);
    setScreen('recording');
  }

  function newLineDone(id: string) {
    setActiveId(id);
    setScreen('line-setup');
  }

  const pendingCount = pendingSync.length;
  const syncLabel = syncStatus === 'saving' ? '↑ saving…'
    : syncStatus === 'error' ? `✕ ${pendingCount} unsaved`
    : syncStatus === 'pending' ? `● ${pendingCount} pending`
    : '✓ saved';
  const syncClass = `sync-pill sync-${syncStatus}`;

  return (
    <>
      <div className={syncClass}>{syncLabel}</div>
      {screen === 'home' && (
        <Home onSelectLine={openLine} onNewLine={() => setScreen('new-line')} />
      )}
      {screen === 'new-line' && (
        <NewLine onDone={newLineDone} onBack={() => setScreen('home')} />
      )}
      {screen === 'line-setup' && activeId && (
        <LineSetup
          lineId={activeId}
          onStart={() => setScreen('recording')}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'recording' && activeId && (
        <Recording lineId={activeId} onBack={() => setScreen('home')} />
      )}
    </>
  );
}
