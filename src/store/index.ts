import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Line, Geophone } from '../types';
import { supabase } from '../lib/supabase';

export type SyncStatus = 'saved' | 'saving' | 'pending' | 'error';

interface Store {
  loggedIn: boolean;
  username: string;
  lines: Line[];
  activeLine: string | null;
  activeGeophoneIndex: number;
  syncStatus: SyncStatus;
  pendingSync: string[];          // line IDs waiting to be pushed (array for persist compat)

  login: (username: string) => void;
  logout: () => void;

  createLine: (name: string, count: number) => string;
  setActiveLine: (id: string) => void;
  setActiveGeophone: (index: number) => void;

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
  deleteLine: (lineId: string) => void;

  syncLine: (lineId: string) => Promise<void>;
  flushPending: () => Promise<void>;
  mergeFromCloud: () => Promise<void>;
  subscribeToChanges: () => void;
}

function makeId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeNoteId() {
  return `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
}

function makeGeophones(count: number): Geophone[] {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    sensorId: i + 1,
    hits: [],
    skipped: false,
    notes: [],
  }));
}

// Debounce per-line cloud pushes
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Suppress realtime echo of our own upserts
const localUpsertIds = new Set<string>();

// Prevent duplicate realtime subscriptions
let realtimeSubscribed = false;

// Stamp updatedAt on every line mutation
function touch(line: Line): Line {
  return { ...line, updatedAt: Date.now() };
}

function mutateLine(lines: Line[], id: string, fn: (l: Line) => Line): Line[] {
  return lines.map((l) => l.id === id ? touch(fn(l)) : l);
}

async function pushToSupabase(line: Line): Promise<boolean> {
  if (!supabase) return true; // no cloud configured — treat as success
  localUpsertIds.add(line.id);
  try {
    const { error } = await supabase.from('lines').upsert({
      id: line.id,
      name: line.name,
      data: JSON.stringify(line),
      updated_at: new Date(line.updatedAt).toISOString(),
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  } finally {
    setTimeout(() => localUpsertIds.delete(line.id), 3000);
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      username: '',
      lines: [],
      activeLine: null,
      activeGeophoneIndex: 0,
      syncStatus: 'saved',
      pendingSync: [],

      login: (username) => set({ loggedIn: true, username }),
      logout: () => set({ loggedIn: false, username: '', activeLine: null }),

      createLine: (name, count) => {
        const id = makeId();
        const line: Line = {
          id,
          name,
          geophones: makeGeophones(count),
          hitCounter: 0,
          lineNotes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((s) => ({ lines: [...s.lines, line], activeLine: id, activeGeophoneIndex: 0 }));
        get().syncLine(id);
        return id;
      },

      setActiveLine: (id) => set({ activeLine: id, activeGeophoneIndex: 0 }),
      setActiveGeophone: (index) => set({ activeGeophoneIndex: index }),

      replaceSensor: (lineId, position, newSensorId) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            geophones: l.geophones.map((g) =>
              g.position === position ? { ...g, sensorId: newSensorId } : g
            ),
          })),
        }));
        get().syncLine(lineId);
      },

      addHit: (lineId, position, invalid = false) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => {
            const totalHits = l.geophones.reduce((sum, g) => sum + g.hits.length, 0);
            const nextHit = totalHits + 1;
            return {
              ...l,
              hitCounter: nextHit,
              geophones: l.geophones.map((g) =>
                g.position === position
                  ? { ...g, hits: [...g.hits, { hitNumber: nextHit, invalid }] }
                  : g
              ),
            };
          }),
        }));
        get().syncLine(lineId);
      },

      undoLastHit: (lineId, position) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => {
            const geo = l.geophones.find((g) => g.position === position);
            if (!geo || geo.hits.length === 0) return l;
            const newGeophones = l.geophones.map((g) =>
              g.position === position ? { ...g, hits: g.hits.slice(0, -1) } : g
            );
            return {
              ...l,
              hitCounter: newGeophones.reduce((sum, g) => sum + g.hits.length, 0),
              geophones: newGeophones,
            };
          }),
        }));
        get().syncLine(lineId);
      },

      toggleHitValidity: (lineId, position, hitNumber) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            geophones: l.geophones.map((g) =>
              g.position !== position ? g : {
                ...g,
                hits: g.hits.map((h) =>
                  h.hitNumber === hitNumber ? { ...h, invalid: !h.invalid } : h
                ),
              }
            ),
          })),
        }));
        get().syncLine(lineId);
      },

      skipGeophone: (lineId, position) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            geophones: l.geophones.map((g) =>
              g.position === position ? { ...g, skipped: true } : g
            ),
          })),
        }));
        get().syncLine(lineId);
      },

      unskipGeophone: (lineId, position) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            geophones: l.geophones.map((g) =>
              g.position === position ? { ...g, skipped: false } : g
            ),
          })),
        }));
        get().syncLine(lineId);
      },

      addNote: (lineId, position, text) => {
        if (!text.trim()) return;
        const entry = { id: makeNoteId(), text: text.trim(), createdAt: Date.now() };
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            geophones: l.geophones.map((g) =>
              g.position === position ? { ...g, notes: [...g.notes, entry] } : g
            ),
          })),
        }));
        get().syncLine(lineId);
      },

      deleteNote: (lineId, position, noteId) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            geophones: l.geophones.map((g) =>
              g.position === position
                ? { ...g, notes: g.notes.filter((n) => n.id !== noteId) }
                : g
            ),
          })),
        }));
        get().syncLine(lineId);
      },

      addLineNote: (lineId, text) => {
        if (!text.trim()) return;
        const entry = { id: makeNoteId(), text: text.trim(), createdAt: Date.now() };
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            lineNotes: [...(l.lineNotes ?? []), entry],
          })),
        }));
        get().syncLine(lineId);
      },

      deleteLineNote: (lineId, noteId) => {
        set((s) => ({
          lines: mutateLine(s.lines, lineId, (l) => ({
            ...l,
            lineNotes: (l.lineNotes ?? []).filter((n) => n.id !== noteId),
          })),
        }));
        get().syncLine(lineId);
      },

      deleteLine: (lineId) => {
        // Cancel any pending debounced sync for this line before it fires
        const timer = syncTimers.get(lineId);
        if (timer) { clearTimeout(timer); syncTimers.delete(lineId); }
        set((s) => ({
          lines: s.lines.filter((l) => l.id !== lineId),
          activeLine: s.activeLine === lineId ? null : s.activeLine,
          pendingSync: s.pendingSync.filter((id) => id !== lineId),
        }));
        if (supabase) supabase.from('lines').delete().eq('id', lineId).then(() => {});
      },

      syncLine: async (lineId) => {
        // Data is already saved to localStorage by the set() call in the action above.
        // Now schedule a debounced cloud push.
        set((s) => ({
          syncStatus: 'pending',
          pendingSync: s.pendingSync.includes(lineId) ? s.pendingSync : [...s.pendingSync, lineId],
        }));

        const existing = syncTimers.get(lineId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
          syncTimers.delete(lineId);
          const line = get().lines.find((l) => l.id === lineId);
          if (!line) return;

          set({ syncStatus: 'saving' });
          const ok = await pushToSupabase(line);

          if (ok) {
            set((s) => {
              const next = s.pendingSync.filter((id) => id !== lineId);
              return { syncStatus: next.length === 0 ? 'saved' : 'pending', pendingSync: next };
            });
          } else {
            // Leave in pendingSync — flushPending will retry
            set({ syncStatus: 'error' });
          }
        }, 800);

        syncTimers.set(lineId, timer);
      },

      flushPending: async () => {
        const { pendingSync, lines } = get();
        if (pendingSync.length === 0 || !supabase) return;
        set({ syncStatus: 'saving' });
        const failed: string[] = [];
        for (const id of pendingSync) {
          const line = lines.find((l) => l.id === id);
          if (!line) continue;
          const ok = await pushToSupabase(line);
          if (!ok) failed.push(id);
        }
        set({ pendingSync: failed, syncStatus: failed.length === 0 ? 'saved' : 'error' });
      },

      mergeFromCloud: async () => {
        if (!supabase) return;
        try {
          const { data } = await supabase.from('lines').select('data, updated_at');
          if (!data) return;

          const cloudLines: Line[] = data.map((r) => JSON.parse(r.data));
          const cloudMap = new Map(cloudLines.map((l) => [l.id, l]));

          set((s) => {
            const merged: Line[] = [];

            // For each cloud line: take whichever version is newer
            for (const cl of cloudLines) {
              const local = s.lines.find((l) => l.id === cl.id);
              if (local && (local.updatedAt ?? 0) > (cl.updatedAt ?? 0)) {
                merged.push(local);
                setTimeout(() => get().syncLine(cl.id), 100);
              } else {
                merged.push(cl);
              }
            }

            // Local-only lines not yet in cloud — keep and push
            for (const ll of s.lines) {
              if (!cloudMap.has(ll.id) && s.pendingSync.includes(ll.id)) {
                // Still pending push — keep it locally and retry
                merged.push(ll);
                setTimeout(() => get().syncLine(ll.id), 100);
              }
              // If not in cloud and not pending, it was deleted remotely — drop it
            }

            return { lines: merged };
          });
        } catch {
          // Network failure — local data intact, retry on next merge
        }
      },

      subscribeToChanges: () => {
        if (!supabase || realtimeSubscribed) return;
        realtimeSubscribed = true;
        supabase
          .channel('lines-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'lines' }, (payload) => {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as { id: string }).id;
              const timer = syncTimers.get(id);
              if (timer) { clearTimeout(timer); syncTimers.delete(id); }
              set((s) => ({
                lines: s.lines.filter((l) => l.id !== id),
                pendingSync: s.pendingSync.filter((pid) => pid !== id),
              }));
              return;
            }
            const incoming = payload.new as { id: string; data: string };
            if (localUpsertIds.has(incoming.id)) return; // our own echo
            const remote: Line = JSON.parse(incoming.data);
            set((s) => {
              const local = s.lines.find((l) => l.id === remote.id);
              // Only apply remote if it's actually newer than what we have
              if (local && (local.updatedAt ?? 0) > (remote.updatedAt ?? 0)) return s;
              if (local) {
                return { lines: s.lines.map((l) => l.id === remote.id ? remote : l) };
              }
              return { lines: [...s.lines, remote] };
            });
          })
          .subscribe();
      },
    }),
    {
      name: 'geophone-store',
      version: 3,
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        if (!Array.isArray(state.lines)) return state;
        const now = Date.now();
        state.lines = (state.lines as Line[]).map((l) => ({
          ...l,
          updatedAt: (l as unknown as Record<string, unknown>).updatedAt
            ? l.updatedAt
            : now,
          lineNotes: Array.isArray(l.lineNotes)
            ? l.lineNotes
            : (l as unknown as Record<string, unknown>).lineNote
              ? [{ id: makeNoteId(), text: (l as unknown as Record<string, unknown>).lineNote as string, createdAt: now }]
              : [],
          geophones: l.geophones.map((g) => ({
            ...g,
            notes: Array.isArray(g.notes)
              ? g.notes
              : (g as unknown as Record<string, unknown>).note
                ? [{ id: makeNoteId(), text: (g as unknown as Record<string, unknown>).note as string, createdAt: now }]
                : [],
          })),
        }));
        return state;
      },
    }
  )
);

// Auto-retry pending syncs when network comes back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useStore.getState().flushPending();
  });
  // Also retry every 30s if there are pending items
  setInterval(() => {
    const { pendingSync, syncStatus } = useStore.getState();
    if (pendingSync.length > 0 && syncStatus === 'error') {
      useStore.getState().flushPending();
    }
  }, 30_000);
}
