import { useState, useEffect, useRef } from 'react';
import { useStore } from './store';
import { exportLines } from './lib/export';
import type { Line } from './types';
import './App.css';

// ─── Beep ─────────────────────────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

// ─── Timer hook ───────────────────────────────────────────────────────────────
function useLineTimer(line: Line) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!line.timerStartedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [line.timerStartedAt]);
  const totalMs = (line.elapsedMs ?? 0) + (line.timerStartedAt ? Date.now() - line.timerStartedAt : 0);
  const s = Math.floor(totalMs / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function today() { return new Date().toISOString().slice(0, 10); }

// ─── Login ────────────────────────────────────────────────────────────────────
function Login() {
  const login = useStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password === 'Exo12345') login(username.trim() || 'Field Worker');
    else setError('Invalid password');
  }

  return (
    <div className="screen login-screen">
      <div className="login-box">
        <div className="logo-wrap">
          <div className="logo-hex">⬡</div>
          <div className="logo-text">EXODIGO <span>FIELD</span></div>
        </div>
        <form onSubmit={handleSubmit}>
          <input className="field-input" placeholder="Your name" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          <input className="field-input" type="password" placeholder="Password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
          {error && <div className="error-msg">{error}</div>}
          <button className="btn-primary full-width" type="submit">ENTER</button>
        </form>
      </div>
    </div>
  );
}

// ─── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ onClose }: { onClose: () => void }) {
  const { projects, scanDays, lines } = useStore();
  const [filename, setFilename] = useState('');
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  function toggleLine(id: string) {
    setSelectedLines((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleDay(dayId: string) {
    const dayLines = lines.filter((l) => l.scanDayId === dayId).map((l) => l.id);
    const allSelected = dayLines.every((id) => selectedLines.has(id));
    setSelectedLines((s) => {
      const n = new Set(s);
      dayLines.forEach((id) => allSelected ? n.delete(id) : n.add(id));
      return n;
    });
  }

  function toggleProject(projectId: string) {
    const projLines = lines.filter((l) => {
      const day = scanDays.find((d) => d.id === l.scanDayId);
      return day?.projectId === projectId;
    }).map((l) => l.id);
    const allSelected = projLines.every((id) => selectedLines.has(id));
    setSelectedLines((s) => {
      const n = new Set(s);
      projLines.forEach((id) => allSelected ? n.delete(id) : n.add(id));
      return n;
    });
  }

  function doExport() {
    const toExport = lines.filter((l) => selectedLines.has(l.id));
    if (!toExport.length || !filename.trim()) return;
    exportLines(toExport, filename.trim());
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-tall" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">EXPORT</div>
        <input className="field-input" placeholder="File name" value={filename} onChange={(e) => setFilename(e.target.value)} autoFocus />
        <div className="modal-label">Select lines to export:</div>
        <div className="export-tree">
          {projects.map((proj) => {
            const projDays = scanDays.filter((d) => d.projectId === proj.id);
            const projLines = lines.filter((l) => projDays.some((d) => d.id === l.scanDayId));
            if (projLines.length === 0) return null;
            const allProjSel = projLines.every((l) => selectedLines.has(l.id));
            return (
              <div key={proj.id} className="export-project">
                <label className="export-row export-proj-row">
                  <input type="checkbox" checked={allProjSel} onChange={() => toggleProject(proj.id)} />
                  <span className="export-proj-name">{proj.name}</span>
                </label>
                {projDays.map((day) => {
                  const dayLines = lines.filter((l) => l.scanDayId === day.id);
                  if (dayLines.length === 0) return null;
                  const allDaySel = dayLines.every((l) => selectedLines.has(l.id));
                  const isExpanded = expandedDays.has(day.id);
                  return (
                    <div key={day.id} className="export-day">
                      <div className="export-row export-day-row">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <input type="checkbox" checked={allDaySel} onChange={() => toggleDay(day.id)} />
                          <span>{day.name} <span className="export-date">{day.date}</span></span>
                        </label>
                        <button className="btn-ghost btn-xs" onClick={() => setExpandedDays((s) => { const n = new Set(s); n.has(day.id) ? n.delete(day.id) : n.add(day.id); return n; })}>
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                      {isExpanded && dayLines.map((l) => (
                        <label key={l.id} className="export-row export-line-row">
                          <input type="checkbox" checked={selectedLines.has(l.id)} onChange={() => toggleLine(l.id)} />
                          {l.name}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn-primary" onClick={doExport} disabled={!filename.trim() || selectedLines.size === 0}>
            DOWNLOAD ({selectedLines.size})
          </button>
          <button className="btn-ghost" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

// ─── Projects screen ──────────────────────────────────────────────────────────
function Projects({ onSelect, onExport }: { onSelect: (id: string) => void; onExport: () => void }) {
  const { projects, scanDays, lines, username, logout, createProject, mergeFromCloud } = useStore();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => { mergeFromCloud(); }, []);

  function handleCreate() {
    if (!newName.trim()) return;
    const id = createProject(newName.trim().toUpperCase());
    setNewName(''); setCreating(false);
    onSelect(id);
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <div className="top-title">PROJECTS</div>
        <div className="top-right">
          <span className="top-user">{username}</span>
          <button className="btn-ghost" onClick={onExport}>EXPORT</button>
          <button className="btn-ghost" onClick={logout}>OUT</button>
        </div>
      </header>

      <div className="line-list">
        {projects.length === 0 && !creating && (
          <div className="empty-state">No projects yet.</div>
        )}
        {[...projects].reverse().map((proj) => {
          const projDays = scanDays.filter((d) => d.projectId === proj.id);
          const projLines = lines.filter((l) => projDays.some((d) => d.id === l.scanDayId));
          const totalGeo = projLines.reduce((sum, l) => sum + l.geophones.length, 0);
          const doneGeo = projLines.reduce((sum, l) => sum + l.geophones.filter((g) => g.hits.filter(h => !h.invalid).length >= 3 || g.skipped).length, 0);
          const pct = totalGeo > 0 ? Math.round((doneGeo / totalGeo) * 100) : 0;
          return (
            <div key={proj.id} className="line-card" onClick={() => onSelect(proj.id)}>
              <div className="line-card-header">
                <div className="line-card-name">{proj.name}</div>
              </div>
              <div className="line-card-meta">
                <span>{projDays.length} scan day{projDays.length !== 1 ? 's' : ''}</span>
                <span>{projLines.length} line{projLines.length !== 1 ? 's' : ''}</span>
              </div>
              {totalGeo > 0 && (
                <>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="progress-label">{doneGeo}/{totalGeo} geophones · {pct}%</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="bottom-actions">
        <button className="btn-primary" onClick={() => setCreating(true)}>+ NEW PROJECT</button>
      </div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">NEW PROJECT</div>
            <input className="field-input big-input" placeholder="Project name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreate} disabled={!newName.trim()}>CREATE</button>
              <button className="btn-ghost" onClick={() => setCreating(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scan Days screen ─────────────────────────────────────────────────────────
function ScanDays({ projectId, onSelect, onBack }: { projectId: string; onSelect: (id: string) => void; onBack: () => void }) {
  const { projects, scanDays, lines, createScanDay } = useStore();
  const project = projects.find((p) => p.id === projectId)!;
  const days = scanDays.filter((d) => d.projectId === projectId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(today());

  function handleCreate() {
    if (!newName.trim()) return;
    const id = createScanDay(projectId, newName.trim().toUpperCase(), newDate);
    setCreating(false); setNewName(''); setNewDate(today());
    onSelect(id);
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← BACK</button>
        <div className="top-title">{project?.name}</div>
      </header>

      <div className="line-list">
        {days.length === 0 && <div className="empty-state">No scan days yet.</div>}
        {[...days].reverse().map((day) => {
          const dayLines = lines.filter((l) => l.scanDayId === day.id);
          const totalGeo = dayLines.reduce((sum, l) => sum + l.geophones.length, 0);
          const doneGeo = dayLines.reduce((sum, l) => sum + l.geophones.filter((g) => g.hits.filter(h => !h.invalid).length >= 3 || g.skipped).length, 0);
          const pct = totalGeo > 0 ? Math.round((doneGeo / totalGeo) * 100) : 0;
          return (
            <div key={day.id} className="line-card" onClick={() => onSelect(day.id)}>
              <div className="line-card-header">
                <div className="line-card-name">{day.name}</div>
                <div className="line-card-date">{day.date}</div>
              </div>
              <div className="line-card-meta">
                <span>{dayLines.length} line{dayLines.length !== 1 ? 's' : ''}</span>
                <span>{totalGeo} geophones</span>
              </div>
              {totalGeo > 0 && (
                <>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="progress-label">{doneGeo}/{totalGeo} · {pct}%</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="bottom-actions">
        <button className="btn-primary" onClick={() => setCreating(true)}>+ NEW SCAN DAY</button>
      </div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">NEW SCAN DAY</div>
            <div className="setup-label">NAME</div>
            <input className="field-input big-input" placeholder="e.g. DAY 1" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <div className="setup-label" style={{ marginTop: 12 }}>DATE</div>
            <input className="field-input big-input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreate} disabled={!newName.trim()}>CREATE</button>
              <button className="btn-ghost" onClick={() => setCreating(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lines screen ─────────────────────────────────────────────────────────────
function LinesScreen({ scanDayId, onSelect, onNewLine, onBack }: {
  scanDayId: string;
  onSelect: (id: string) => void;
  onNewLine: () => void;
  onBack: () => void;
}) {
  const { scanDays, lines, deleteLine } = useStore();
  const day = scanDays.find((d) => d.id === scanDayId)!;
  const dayLines = lines.filter((l) => l.scanDayId === scanDayId);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← BACK</button>
        <div className="top-title">{day?.name}</div>
        <div className="top-right">
          <span className="top-user">{day?.date}</span>
        </div>
      </header>

      <div className="line-list">
        {dayLines.length === 0 && <div className="empty-state">No lines yet.</div>}
        {[...dayLines].reverse().map((line) => {
          const total = line.geophones.length;
          const done = line.geophones.filter((g) => g.hits.filter(h => !h.invalid).length >= 3 || g.skipped).length;
          const pct = Math.round((done / total) * 100);
          const elapsed = (line.elapsedMs ?? 0) + (line.timerStartedAt ? Date.now() - line.timerStartedAt : 0);
          return (
            <div key={line.id} className="line-card" onClick={() => onSelect(line.id)}>
              <div className="line-card-header">
                <div className="line-card-name">{line.name}</div>
                <button className="btn-delete-line" onClick={(e) => { e.stopPropagation(); setConfirmDelete(line.id); }}>✕</button>
              </div>
              <div className="line-card-meta">
                <span>{total} geophones</span>
                <span>{line.hitCounter} hits</span>
                {elapsed > 0 && <span>{fmtMs(elapsed)}</span>}
                {line.sensorSpacing && <span>{line.sensorSpacing}m</span>}
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <div className="progress-label">{done}/{total} · {pct}%</div>
            </div>
          );
        })}
      </div>

      <div className="bottom-actions">
        <button className="btn-primary" onClick={onNewLine}>+ NEW LINE</button>
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">DELETE LINE?</div>
            <div className="modal-sub">{lines.find(l => l.id === confirmDelete)?.name} — all data will be lost.</div>
            <div className="modal-actions">
              <button className="btn-danger" onClick={() => { deleteLine(confirmDelete); setConfirmDelete(null); }}>DELETE</button>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New Line ─────────────────────────────────────────────────────────────────
function NewLine({ scanDayId, onDone, onBack }: { scanDayId: string; onDone: (id: string) => void; onBack: () => void }) {
  const createLine = useStore((s) => s.createLine);
  const [name, setName] = useState('');
  const [count, setCount] = useState('');

  function handleCreate() {
    const n = parseInt(count);
    if (!name.trim() || isNaN(n) || n < 1) return;
    const id = createLine(scanDayId, name.trim().toUpperCase(), n);
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
        <input className="field-input big-input" placeholder="e.g. LINE 4" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="setup-label">NUMBER OF GEOPHONES</div>
        <input className="field-input big-input" type="number" inputMode="numeric" placeholder="e.g. 88" value={count} onChange={(e) => setCount(e.target.value)} min="1" />
        <button className="btn-primary full-width" onClick={handleCreate} disabled={!name.trim() || !count || parseInt(count) < 1}>CREATE LINE</button>
      </div>
    </div>
  );
}

// ─── Line Setup ───────────────────────────────────────────────────────────────
function LineSetup({ lineId, onStart, onBack }: { lineId: string; onStart: () => void; onBack: () => void }) {
  const { lines, replaceSensor, setSensorSpacing, setAutoAdvance } = useStore();
  const line = lines.find((l) => l.id === lineId)!;
  const [editing, setEditing] = useState<number | null>(null);
  const [repVal, setRepVal] = useState('');
  const [spacingVal, setSpacingVal] = useState(String(line?.sensorSpacing ?? ''));

  if (!line) return null;

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← BACK</button>
        <div className="top-title">{line.name} SETUP</div>
        <button className="btn-primary" onClick={onStart}>START →</button>
      </header>

      <div className="setup-settings">
        <div className="setup-setting-item">
          <div className="setup-setting-label">SENSOR SPACING (m)</div>
          <input
            className="field-input setup-setting-input"
            type="number" inputMode="decimal" placeholder="e.g. 10"
            value={spacingVal}
            onChange={(e) => setSpacingVal(e.target.value)}
            onBlur={() => { const n = parseFloat(spacingVal); if (!isNaN(n) && n > 0) setSensorSpacing(lineId, n); }}
          />
        </div>
        <div className="setup-setting-item">
          <div className="setup-setting-label">AUTO-ADVANCE AT 3 HITS</div>
          <button className={`toggle-btn ${line.autoAdvance ? 'toggle-on' : ''}`} onClick={() => setAutoAdvance(lineId, !line.autoAdvance)}>
            {line.autoAdvance ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="setup-hint">Tap a geophone to replace its sensor ID</div>
      <div className="geo-grid">
        {line.geophones.map((g) => (
          <div key={g.position} className={`geo-chip ${g.sensorId !== g.position ? 'replaced' : ''}`} onClick={() => { setEditing(g.position); setRepVal(String(g.sensorId)); }}>
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
            <input className="field-input big-input" type="number" inputMode="numeric" placeholder="New sensor ID" value={repVal} onChange={(e) => setRepVal(e.target.value)} autoFocus />
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => { const n = parseInt(repVal); if (!isNaN(n) && n > 0) replaceSensor(lineId, editing, n); setEditing(null); setRepVal(''); }}>CONFIRM</button>
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
  const { lines, activeGeophoneIndex, setActiveGeophone, addHit, undoLastHit, toggleHitValidity, skipGeophone, unskipGeophone, replaceSensor, addNote, deleteNote, addLineNote, deleteLineNote, startTimer, pauseTimer, setAutoAdvance } = useStore();
  const line = lines.find((l) => l.id === lineId)!;
  const timerStr = useLineTimer(line ?? { elapsedMs: 0, autoAdvance: false } as Line);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [lineNoteOpen, setLineNoteOpen] = useState(false);
  const [lineNoteText, setLineNoteText] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceVal, setReplaceVal] = useState('');
  const [overviewOpen, setOverviewOpen] = useState(false);
  const prevValidHits = useRef(0);

  const geo = line?.geophones[activeGeophoneIndex];
  const totalHits = geo?.hits.length ?? 0;
  const validHits = geo?.hits.filter((h) => !h.invalid).length ?? 0;
  const isLast = activeGeophoneIndex === (line?.geophones.length ?? 1) - 1;
  const total = line?.geophones.length ?? 0;
  const done = line?.geophones.filter((g) => g.hits.filter(h => !h.invalid).length >= 3 || g.skipped).length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = total - done;

  useEffect(() => {
    if (!line || !geo) return;
    // Only fire when crossing the 3-valid threshold upward (not already at 3+)
    if (validHits >= 3 && prevValidHits.current < 3) {
      playBeep();
      if (line.autoAdvance && !isLast) setTimeout(() => setActiveGeophone(activeGeophoneIndex + 1), 400);
    }
    prevValidHits.current = validHits;
  }, [validHits]);

  // Seed prevValidHits with the current geo's existing valid hits so navigating
  // to a geo that already has 3+ hits never re-triggers auto-advance
  useEffect(() => {
    prevValidHits.current = geo?.hits.filter((h) => !h.invalid).length ?? 0;
    setNoteText('');
  }, [activeGeophoneIndex, lineId]);

  if (!line || !geo) return null;

  const hitColor = validHits >= 3 ? '#00ff9d' : validHits >= 2 ? '#f5a623' : '#ff4d6d';
  const isRunning = !!line.timerStartedAt;

  function next() { if (!isLast) setActiveGeophone(activeGeophoneIndex + 1); }
  function prev() { if (activeGeophoneIndex > 0) setActiveGeophone(activeGeophoneIndex - 1); }

  return (
    <div className="screen recording-screen">
      <header className="top-bar">
        <button className="btn-ghost" onClick={onBack}>← LINES</button>
        <div className="top-title">{line.name}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn-ghost" onClick={() => setOverviewOpen(true)}>ALL</button>
          <button className="btn-ghost" onClick={() => setLineNoteOpen(true)}>NOTE{(line.lineNotes ?? []).length > 0 ? ` (${line.lineNotes.length})` : ''}</button>
          <button className="btn-ghost" onClick={() => setNavOpen(true)}>GO TO</button>
        </div>
      </header>

      <div className="rec-progress-wrap">
        <div className="rec-progress-bar"><div className="rec-progress-fill" style={{ width: `${pct}%` }} /></div>
        <div className="rec-progress-meta">
          <span>{done}/{total} done</span>
          <span className="rec-progress-remain">{remaining} left</span>
        </div>
      </div>

      <div className="timer-bar">
        <span className="timer-display">{timerStr}</span>
        <button className={`btn-timer ${isRunning ? 'btn-timer-pause' : 'btn-timer-start'}`} onClick={() => isRunning ? pauseTimer(lineId) : startTimer(lineId)}>
          {isRunning ? '⏸ PAUSE' : '▶ START'}
        </button>
        <button className={`auto-badge-btn ${line.autoAdvance ? 'auto-on' : 'auto-off'}`} onClick={() => setAutoAdvance(lineId, !line.autoAdvance)}>
          AUTO {line.autoAdvance ? 'ON' : 'OFF'}
        </button>
        {line.sensorSpacing && <span className="spacing-badge">{line.sensorSpacing}m</span>}
      </div>

      <div className="geo-nav">
        <button className="nav-arrow" onClick={prev} disabled={activeGeophoneIndex === 0}>‹</button>
        <div className="geo-info">
          <div className="geo-position">#{geo.position}</div>
          <div className="geo-sensor tappable" onClick={() => { setReplaceVal(String(geo.sensorId)); setReplaceOpen(true); }}>sensor {geo.sensorId} ✎</div>
          {geo.sensorId !== geo.position && <div className="geo-replaced-badge">REPLACED</div>}
          <div className="geo-progress">{activeGeophoneIndex + 1} / {line.geophones.length}</div>
        </div>
        <button className="nav-arrow" onClick={next} disabled={isLast}>›</button>
      </div>

      <div className="hit-display">
        <div className="hit-count" style={{ color: hitColor }}>{validHits}</div>
        <div className="hit-label">VALID HITS</div>
        {totalHits !== validHits && <div className="hit-invalid-count">{totalHits - validHits} invalid</div>}
        {geo.hits.length > 0 && <button className="btn-undo" onClick={() => undoLastHit(lineId, geo.position)}>↩ UNDO LAST HIT</button>}
      </div>

      <div className="global-counter">LINE TOTAL: <strong>{line.hitCounter}</strong> hits</div>

      <div className="action-buttons">
        <button className="btn-hit" onClick={() => addHit(lineId, geo.position, false)} disabled={geo.skipped}>+1</button>
      </div>

      <div className="secondary-buttons">
        <button className="btn-secondary btn-invalid" onClick={() => addHit(lineId, geo.position, true)} disabled={geo.skipped}>INVALID +1</button>
        <button className="btn-secondary btn-note" onClick={() => setNoteOpen(true)}>NOTE{geo.notes.length > 0 ? ` (${geo.notes.length})` : ''}</button>
        <button className={`btn-secondary btn-skip ${geo.skipped ? 'btn-skipped' : ''}`} onClick={geo.skipped ? () => unskipGeophone(lineId, geo.position) : () => { skipGeophone(lineId, geo.position); next(); }}>
          {geo.skipped ? 'UNDO SKIP' : 'SKIP'}
        </button>
      </div>

      {geo.hits.length > 0 && (
        <div className="hit-list">
          <div className="hit-list-hint">TAP HIT TO TOGGLE VALID/INVALID</div>
          {geo.hits.map((h) => (
            <span key={h.hitNumber} className={`hit-chip ${h.invalid ? 'hit-chip-invalid' : ''}`} onClick={() => toggleHitValidity(lineId, geo.position, h.hitNumber)}>
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
              <textarea className="field-input note-input" placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} />
              <button className="btn-primary" onClick={() => { addNote(lineId, geo.position, noteText); setNoteText(''); }} disabled={!noteText.trim()}>ADD</button>
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
              <textarea className="field-input note-input" placeholder="e.g. Part 2 starts here..." value={lineNoteText} onChange={(e) => setLineNoteText(e.target.value)} rows={2} autoFocus />
              <button className="btn-primary" onClick={() => { addLineNote(lineId, lineNoteText); setLineNoteText(''); }} disabled={!lineNoteText.trim()}>ADD</button>
            </div>
            <button className="btn-ghost full-width" onClick={() => setLineNoteOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {overviewOpen && <OverviewPanel lineId={lineId} onClose={() => setOverviewOpen(false)} onJump={(i) => setActiveGeophone(i)} />}

      {replaceOpen && (
        <div className="modal-overlay" onClick={() => setReplaceOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">REPLACE SENSOR</div>
            <div className="modal-sub">Geophone #{geo.position}</div>
            <input className="field-input big-input" type="number" inputMode="numeric" placeholder="New sensor ID" value={replaceVal} onChange={(e) => setReplaceVal(e.target.value)} autoFocus />
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => { const n = parseInt(replaceVal); if (!isNaN(n) && n > 0) replaceSensor(lineId, geo.position, n); setReplaceOpen(false); }}>CONFIRM</button>
              <button className="btn-ghost" onClick={() => setReplaceOpen(false)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────
function OverviewPanel({ lineId, onClose, onJump }: { lineId: string; onClose: () => void; onJump: (index: number) => void }) {
  const line = useStore((s) => s.lines.find((l) => l.id === lineId))!;
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
              <div key={g.position} className={`ov-chip ov-${status}`} onClick={() => { onJump(i); onClose(); }}>
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
      <input className="field-input big-input" type="number" inputMode="numeric" placeholder={`1 – ${max}`} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
      <button className="btn-primary full-width" onClick={() => { const n = parseInt(val); if (n >= 1 && n <= max) onGo(n); }}>GO</button>
    </>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
type Screen = 'projects' | 'scandays' | 'lines' | 'new-line' | 'line-setup' | 'recording';

export default function App() {
  const { loggedIn, setActiveLine, mergeFromCloud, subscribeToChanges, syncStatus, pendingSync } = useStore();
  const [screen, setScreen] = useState<Screen>('projects');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeScanDayId, setActiveScanDayId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const flushPending = useStore((s) => s.flushPending);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (loggedIn) { mergeFromCloud(); subscribeToChanges(); }
  }, [loggedIn]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && loggedIn) { flushPending(); mergeFromCloud(); }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loggedIn]);

  if (!loggedIn) return <Login />;

  const pendingCount = pendingSync.length;
  const syncLabel = syncStatus === 'saving' ? '↑ saving…'
    : syncStatus === 'error' ? `✕ ${pendingCount} unsaved`
    : syncStatus === 'pending' ? `● ${pendingCount} pending`
    : '✓ saved';

  return (
    <>
      <div className={`sync-pill sync-${syncStatus}`}>{syncLabel}</div>

      {screen === 'projects' && (
        <Projects
          onSelect={(id) => { setActiveProjectId(id); setScreen('scandays'); }}
          onExport={() => setExportOpen(true)}
        />
      )}
      {screen === 'scandays' && activeProjectId && (
        <ScanDays
          projectId={activeProjectId}
          onSelect={(id) => { setActiveScanDayId(id); setScreen('lines'); }}
          onBack={() => setScreen('projects')}
        />
      )}
      {screen === 'lines' && activeScanDayId && (
        <LinesScreen
          scanDayId={activeScanDayId}
          onSelect={(id) => { setActiveLine(id); setActiveLineId(id); setScreen('recording'); }}
          onNewLine={() => setScreen('new-line')}
          onBack={() => setScreen('scandays')}
        />
      )}
      {screen === 'new-line' && activeScanDayId && (
        <NewLine
          scanDayId={activeScanDayId}
          onDone={(id) => { setActiveLineId(id); setScreen('line-setup'); }}
          onBack={() => setScreen('lines')}
        />
      )}
      {screen === 'line-setup' && activeLineId && (
        <LineSetup
          lineId={activeLineId}
          onStart={() => setScreen('recording')}
          onBack={() => setScreen('lines')}
        />
      )}
      {screen === 'recording' && activeLineId && (
        <Recording lineId={activeLineId} onBack={() => setScreen('lines')} />
      )}

      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </>
  );
}
