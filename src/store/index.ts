import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Line, Geophone, Project, ScanDay } from '../types';
import { supabase } from '../lib/supabase';

export type SyncStatus = 'saved' | 'saving' | 'pending' | 'error';

interface Store {
  loggedIn: boolean;
  username: string;

  projects: Project[];
  scanDays: ScanDay[];
  lines: Line[];

  activeProjectId: string | null;
  activeScanDayId: string | null;
  activeLine: string | null;
  activeGeophoneIndex: number;

  syncStatus: SyncStatus;
  pendingSync: string[];   // "project:id" | "scanday:id" | "line:id"

  login: (username: string) => void;
  logout: () => void;

  // Projects
  createProject: (name: string) => string;
  setActiveProject: (id: string) => void;
  deleteProject: (projectId: string) => void;

  // Scan days
  createScanDay: (projectId: string, name: string, date: string) => string;
  setActiveScanDay: (id: string) => void;
  deleteScanDay: (scanDayId: string) => void;

  // Lines
  createLine: (scanDayId: string, name: string, count: number) => string;
  setActiveLine: (id: string) => void;
  setActiveGeophone: (index: number) => void;
  deleteLine: (lineId: string) => void;

  // Line mutations
  replaceSensor: (lineId: string, position: number, newSensorId: number) => void;
  addHit: (lineId: string, position: number, invalid?: boolean) => void;
  undoLastHit: (lineId: string, position: number) => void;
  toggleHitValidity: (lineId: string, position: number, hitNumber: number) => void;
  skipGeophone: (lineId: string, position: number) => void;
  unskipGeophone: (lineId: string, position: number) => void;
  addNote: (lineId: string, position: number, text: string) => void;
  deleteNote: (lineId: string, position: number, noteId: string) => void;
  addLineNote: (lineId: string, text: string) => void;
  deleteLineNote: (lineId: string, noteId: string) => void;
  setAutoAdvance: (lineId: string, value: boolean) => void;
  setSensorSpacing: (lineId: string, metres: number) => void;
  startTimer: (lineId: string) => void;
  pauseTimer: (lineId: string) => void;

  // Sync
  syncItem: (type: 'project' | 'scanday' | 'line', id: string) => Promise<void>;
  flushPending: () => Promise<void>;
  mergeFromCloud: () => Promise<void>;
  subscribeToChanges: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeNoteId() { return `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`; }

function makeGeophones(count: number): Geophone[] {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1, sensorId: i + 1, hits: [], skipped: false, notes: [],
  }));
}

function now() { return Date.now(); }

function touchLine(line: Line): Line { return { ...line, updatedAt: now() }; }

function mutateLines(lines: Line[], id: string, fn: (l: Line) => Line): Line[] {
  return lines.map((l) => l.id === id ? touchLine(fn(l)) : l);
}

// Debounce timers per item key ("line:id", etc.)
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const localUpsertIds = new Set<string>();

async function pushItem(type: 'project' | 'scanday' | 'line', item: Project | ScanDay | Line): Promise<boolean> {
  if (!supabase) return true;
  const key = `${type}:${item.id}`;
  localUpsertIds.add(key);
  try {
    const table = type === 'project' ? 'projects' : type === 'scanday' ? 'scan_days' : 'lines';
    const row: Record<string, unknown> = {
      id: item.id,
      data: JSON.stringify(item),
      updated_at: new Date(item.updatedAt).toISOString(),
    };
    if (type === 'scanday') row.project_id = (item as ScanDay).projectId;
    if (type === 'line') row.name = (item as Line).name;
    const { error } = await supabase.from(table).upsert(row);
    if (error) throw error;
    return true;
  } catch {
    return false;
  } finally {
    setTimeout(() => localUpsertIds.delete(key), 3000);
  }
}

// ── store ─────────────────────────────────────────────────────────────────────

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      username: '',
      projects: [],
      scanDays: [],
      lines: [],
      activeProjectId: null,
      activeScanDayId: null,
      activeLine: null,
      activeGeophoneIndex: 0,
      syncStatus: 'saved',
      pendingSync: [],

      login: (username) => set({ loggedIn: true, username }),
      logout: () => set({ loggedIn: false, username: '', activeProjectId: null, activeScanDayId: null, activeLine: null }),

      // ── Projects ──────────────────────────────────────────────────────────

      createProject: (name) => {
        const id = makeId('proj');
        const project: Project = { id, name, createdAt: now(), updatedAt: now() };
        set((s) => ({ projects: [...s.projects, project] }));
        get().syncItem('project', id);
        return id;
      },

      setActiveProject: (id) => set({ activeProjectId: id, activeScanDayId: null }),

      deleteProject: (projectId) => {
        // Delete all scan days and lines under this project
        const { scanDays, lines } = get();
        const dayIds = scanDays.filter((d) => d.projectId === projectId).map((d) => d.id);
        const lineIds = lines.filter((l) => dayIds.includes(l.scanDayId)).map((l) => l.id);
        lineIds.forEach((id) => { const t = syncTimers.get(`line:${id}`); if (t) { clearTimeout(t); syncTimers.delete(`line:${id}`); } });
        dayIds.forEach((id) => { const t = syncTimers.get(`scanday:${id}`); if (t) { clearTimeout(t); syncTimers.delete(`scanday:${id}`); } });
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== projectId),
          scanDays: s.scanDays.filter((d) => d.projectId !== projectId),
          lines: s.lines.filter((l) => !dayIds.includes(l.scanDayId)),
          pendingSync: s.pendingSync.filter((k) => !lineIds.includes(k.split(':')[1]) && !dayIds.includes(k.split(':')[1]) && k !== `project:${projectId}`),
        }));
        if (supabase) {
          lineIds.forEach((id) => supabase!.from('lines').delete().eq('id', id).then(() => {}));
          dayIds.forEach((id) => supabase!.from('scan_days').delete().eq('id', id).then(() => {}));
          supabase.from('projects').delete().eq('id', projectId).then(() => {});
        }
      },

      // ── Scan days ─────────────────────────────────────────────────────────

      createScanDay: (projectId, name, date) => {
        const id = makeId('day');
        const day: ScanDay = { id, projectId, name, date, createdAt: now(), updatedAt: now() };
        set((s) => ({ scanDays: [...s.scanDays, day] }));
        get().syncItem('scanday', id);
        return id;
      },

      setActiveScanDay: (id) => set({ activeScanDayId: id }),

      deleteScanDay: (scanDayId) => {
        const { lines } = get();
        const lineIds = lines.filter((l) => l.scanDayId === scanDayId).map((l) => l.id);
        lineIds.forEach((id) => { const t = syncTimers.get(`line:${id}`); if (t) { clearTimeout(t); syncTimers.delete(`line:${id}`); } });
        const t = syncTimers.get(`scanday:${scanDayId}`); if (t) { clearTimeout(t); syncTimers.delete(`scanday:${scanDayId}`); }
        set((s) => ({
          scanDays: s.scanDays.filter((d) => d.id !== scanDayId),
          lines: s.lines.filter((l) => l.scanDayId !== scanDayId),
          pendingSync: s.pendingSync.filter((k) => !lineIds.includes(k.split(':')[1]) && k !== `scanday:${scanDayId}`),
        }));
        if (supabase) {
          lineIds.forEach((id) => supabase!.from('lines').delete().eq('id', id).then(() => {}));
          supabase.from('scan_days').delete().eq('id', scanDayId).then(() => {});
        }
      },

      // ── Lines ─────────────────────────────────────────────────────────────

      createLine: (scanDayId, name, count) => {
        const id = makeId('line');
        const line: Line = {
          id, scanDayId, name,
          geophones: makeGeophones(count),
          hitCounter: 0, lineNotes: [],
          createdAt: now(), updatedAt: now(),
          elapsedMs: 0, autoAdvance: false,
        };
        set((s) => ({ lines: [...s.lines, line], activeLine: id, activeGeophoneIndex: 0 }));
        get().syncItem('line', id);
        return id;
      },

      setActiveLine: (id) => set({ activeLine: id, activeGeophoneIndex: 0 }),
      setActiveGeophone: (index) => set({ activeGeophoneIndex: index }),

      deleteLine: (lineId) => {
        const timer = syncTimers.get(`line:${lineId}`);
        if (timer) { clearTimeout(timer); syncTimers.delete(`line:${lineId}`); }
        set((s) => ({
          lines: s.lines.filter((l) => l.id !== lineId),
          activeLine: s.activeLine === lineId ? null : s.activeLine,
          pendingSync: s.pendingSync.filter((k) => k !== `line:${lineId}`),
        }));
        if (supabase) supabase.from('lines').delete().eq('id', lineId).then(() => {});
      },

      // ── Line mutations ────────────────────────────────────────────────────

      replaceSensor: (lineId, position, newSensorId) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, geophones: l.geophones.map((g) => g.position === position ? { ...g, sensorId: newSensorId } : g) })) }));
        get().syncItem('line', lineId);
      },

      addHit: (lineId, position, invalid = false) => {
        set((s) => ({
          lines: mutateLines(s.lines, lineId, (l) => {
            const total = l.geophones.reduce((sum, g) => sum + g.hits.length, 0);
            const next = total + 1;
            return { ...l, hitCounter: next, geophones: l.geophones.map((g) => g.position === position ? { ...g, hits: [...g.hits, { hitNumber: next, invalid }] } : g) };
          }),
        }));
        get().syncItem('line', lineId);
      },

      undoLastHit: (lineId, position) => {
        set((s) => ({
          lines: mutateLines(s.lines, lineId, (l) => {
            const geo = l.geophones.find((g) => g.position === position);
            if (!geo || geo.hits.length === 0) return l;
            const newGeo = l.geophones.map((g) => g.position === position ? { ...g, hits: g.hits.slice(0, -1) } : g);
            return { ...l, hitCounter: newGeo.reduce((sum, g) => sum + g.hits.length, 0), geophones: newGeo };
          }),
        }));
        get().syncItem('line', lineId);
      },

      toggleHitValidity: (lineId, position, hitNumber) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, geophones: l.geophones.map((g) => g.position !== position ? g : { ...g, hits: g.hits.map((h) => h.hitNumber === hitNumber ? { ...h, invalid: !h.invalid } : h) }) })) }));
        get().syncItem('line', lineId);
      },

      skipGeophone: (lineId, position) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, geophones: l.geophones.map((g) => g.position === position ? { ...g, skipped: true } : g) })) }));
        get().syncItem('line', lineId);
      },

      unskipGeophone: (lineId, position) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, geophones: l.geophones.map((g) => g.position === position ? { ...g, skipped: false } : g) })) }));
        get().syncItem('line', lineId);
      },

      addNote: (lineId, position, text) => {
        if (!text.trim()) return;
        const entry = { id: makeNoteId(), text: text.trim(), createdAt: now() };
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, geophones: l.geophones.map((g) => g.position === position ? { ...g, notes: [...g.notes, entry] } : g) })) }));
        get().syncItem('line', lineId);
      },

      deleteNote: (lineId, position, noteId) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, geophones: l.geophones.map((g) => g.position === position ? { ...g, notes: g.notes.filter((n) => n.id !== noteId) } : g) })) }));
        get().syncItem('line', lineId);
      },

      addLineNote: (lineId, text) => {
        if (!text.trim()) return;
        const entry = { id: makeNoteId(), text: text.trim(), createdAt: now() };
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, lineNotes: [...(l.lineNotes ?? []), entry] })) }));
        get().syncItem('line', lineId);
      },

      deleteLineNote: (lineId, noteId) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, lineNotes: (l.lineNotes ?? []).filter((n) => n.id !== noteId) })) }));
        get().syncItem('line', lineId);
      },

      setAutoAdvance: (lineId, value) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, autoAdvance: value })) }));
        get().syncItem('line', lineId);
      },

      setSensorSpacing: (lineId, metres) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, sensorSpacing: metres })) }));
        get().syncItem('line', lineId);
      },

      startTimer: (lineId) => {
        set((s) => ({ lines: mutateLines(s.lines, lineId, (l) => ({ ...l, timerStartedAt: l.timerStartedAt ?? now() })) }));
        get().syncItem('line', lineId);
      },

      pauseTimer: (lineId) => {
        set((s) => ({
          lines: mutateLines(s.lines, lineId, (l) => {
            if (!l.timerStartedAt) return l;
            return { ...l, elapsedMs: (l.elapsedMs ?? 0) + (now() - l.timerStartedAt), timerStartedAt: undefined };
          }),
        }));
        get().syncItem('line', lineId);
      },

      // ── Sync ──────────────────────────────────────────────────────────────

      syncItem: async (type, id) => {
        const key = `${type}:${id}`;
        set((s) => ({
          syncStatus: 'pending',
          pendingSync: s.pendingSync.includes(key) ? s.pendingSync : [...s.pendingSync, key],
        }));

        const existing = syncTimers.get(key);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
          syncTimers.delete(key);
          const { projects, scanDays, lines } = get();
          const item = type === 'project'
            ? projects.find((p) => p.id === id)
            : type === 'scanday'
              ? scanDays.find((d) => d.id === id)
              : lines.find((l) => l.id === id);
          if (!item) return;

          set({ syncStatus: 'saving' });
          const ok = await pushItem(type, item);
          if (ok) {
            set((s) => {
              const next = s.pendingSync.filter((k) => k !== key);
              return { syncStatus: next.length === 0 ? 'saved' : 'pending', pendingSync: next };
            });
          } else {
            set({ syncStatus: 'error' });
          }
        }, 800);

        syncTimers.set(key, timer);
      },

      flushPending: async () => {
        const { pendingSync, projects, scanDays, lines } = get();
        if (pendingSync.length === 0 || !supabase) return;
        set({ syncStatus: 'saving' });
        const failed: string[] = [];
        for (const key of pendingSync) {
          const [type, id] = key.split(':') as ['project' | 'scanday' | 'line', string];
          const item = type === 'project'
            ? projects.find((p) => p.id === id)
            : type === 'scanday'
              ? scanDays.find((d) => d.id === id)
              : lines.find((l) => l.id === id);
          if (!item) continue;
          const ok = await pushItem(type, item);
          if (!ok) failed.push(key);
        }
        set({ pendingSync: failed, syncStatus: failed.length === 0 ? 'saved' : 'error' });
      },

      mergeFromCloud: async () => {
        if (!supabase) return;
        try {
          const [projRes, dayRes, lineRes] = await Promise.all([
            supabase.from('projects').select('data'),
            supabase.from('scan_days').select('data'),
            supabase.from('lines').select('data'),
          ]);

          const cloudProjects: Project[] = (projRes.data ?? []).map((r) => JSON.parse(r.data));
          const cloudDays: ScanDay[] = (dayRes.data ?? []).map((r) => JSON.parse(r.data));
          const cloudLines: Line[] = (lineRes.data ?? []).map((r) => JSON.parse(r.data));

          set((s) => {
            const { pendingSync } = s;

            function mergeList<T extends { id: string; updatedAt: number }>(
              local: T[], cloud: T[], pendingKey: (id: string) => string
            ): T[] {
              const cloudMap = new Map(cloud.map((c) => [c.id, c]));
              const merged: T[] = [];
              for (const c of cloud) {
                const l = local.find((x) => x.id === c.id);
                if (l && (l.updatedAt ?? 0) > (c.updatedAt ?? 0)) {
                  merged.push(l);
                  setTimeout(() => {
                    const key = pendingKey(l.id);
                    const [type, id] = key.split(':') as ['project' | 'scanday' | 'line', string];
                    get().syncItem(type, id);
                  }, 100);
                } else {
                  merged.push(c);
                }
              }
              for (const l of local) {
                if (!cloudMap.has(l.id) && pendingSync.includes(pendingKey(l.id))) {
                  merged.push(l);
                  setTimeout(() => {
                    const key = pendingKey(l.id);
                    const [type, id] = key.split(':') as ['project' | 'scanday' | 'line', string];
                    get().syncItem(type, id);
                  }, 100);
                }
              }
              return merged;
            }

            return {
              projects: mergeList(s.projects, cloudProjects, (id) => `project:${id}`),
              scanDays: mergeList(s.scanDays, cloudDays, (id) => `scanday:${id}`),
              lines: mergeList(s.lines, cloudLines, (id) => `line:${id}`),
            };
          });
        } catch {
          // network failure — local data intact
        }
      },

      subscribeToChanges: () => {
        setInterval(() => get().mergeFromCloud(), 3000);
      },
    }),
    {
      name: 'geophone-store',
      version: 5,
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        const n = Date.now();

        // Migrate old flat lines into a default project/scanday
        if (Array.isArray(state.lines) && state.lines.length > 0 && !(state.lines[0] as Line).scanDayId) {
          const projectId = makeId('proj');
          const dayId = makeId('day');
          state.projects = [{ id: projectId, name: 'Imported', createdAt: n, updatedAt: n }];
          state.scanDays = [{ id: dayId, projectId, name: 'Day 1', date: new Date().toISOString().slice(0, 10), createdAt: n, updatedAt: n }];
          state.lines = (state.lines as Line[]).map((l) => ({
            ...l,
            scanDayId: dayId,
            updatedAt: (l.updatedAt ?? n),
            elapsedMs: (l.elapsedMs ?? 0),
            autoAdvance: (l.autoAdvance ?? false),
            lineNotes: Array.isArray(l.lineNotes) ? l.lineNotes : [],
            geophones: l.geophones.map((g) => ({
              ...g,
              notes: Array.isArray(g.notes) ? g.notes : [],
            })),
          }));
        }

        if (!Array.isArray(state.projects)) state.projects = [];
        if (!Array.isArray(state.scanDays)) state.scanDays = [];
        if (!Array.isArray(state.lines)) state.lines = [];

        return state;
      },
    }
  )
);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useStore.getState().flushPending());
  setInterval(() => {
    const { pendingSync, syncStatus } = useStore.getState();
    if (pendingSync.length > 0 && syncStatus === 'error') useStore.getState().flushPending();
  }, 30_000);
}
