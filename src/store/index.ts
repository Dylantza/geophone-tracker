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

// Debounce map — avoid hammering Supabase on rapid hits
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Track our own in-flight upserts so realtime doesn't echo them back
const localUpsertIds = new Set<string>();

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      loggedIn: false,
      username: '',
      lines: [],
      activeLine: null,
      activeGeophoneIndex: 0,
      syncStatus: 'saved',

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
        };
        set((s) => ({ lines: [...s.lines, line], activeLine: id, activeGeophoneIndex: 0 }));
        get().syncLine(id);
        return id;
      },

      setActiveLine: (id) => set({ activeLine: id, activeGeophoneIndex: 0 }),
      setActiveGeophone: (index) => set({ activeGeophoneIndex: index }),

      replaceSensor: (lineId, position, newSensorId) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : {
              ...l,
              geophones: l.geophones.map((g) =>
                g.position === position ? { ...g, sensorId: newSensorId } : g
              ),
            }
          ),
        }));
        get().syncLine(lineId);
      },

      addHit: (lineId, position, invalid = false) => {
        set((s) => ({
          lines: s.lines.map((l) => {
            if (l.id !== lineId) return l;
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
          lines: s.lines.map((l) => {
            if (l.id !== lineId) return l;
            const geo = l.geophones.find((g) => g.position === position);
            if (!geo || geo.hits.length === 0) return l;
            const newGeophones = l.geophones.map((g) =>
              g.position === position ? { ...g, hits: g.hits.slice(0, -1) } : g
            );
            const newCounter = newGeophones.reduce((sum, g) => sum + g.hits.length, 0);
            return { ...l, hitCounter: newCounter, geophones: newGeophones };
          }),
        }));
        get().syncLine(lineId);
      },

      toggleHitValidity: (lineId, position, hitNumber) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : {
              ...l,
              geophones: l.geophones.map((g) =>
                g.position !== position ? g : {
                  ...g,
                  hits: g.hits.map((h) =>
                    h.hitNumber === hitNumber ? { ...h, invalid: !h.invalid } : h
                  ),
                }
              ),
            }
          ),
        }));
        get().syncLine(lineId);
      },

      skipGeophone: (lineId, position) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : {
              ...l,
              geophones: l.geophones.map((g) =>
                g.position === position ? { ...g, skipped: true } : g
              ),
            }
          ),
        }));
        get().syncLine(lineId);
      },

      unskipGeophone: (lineId, position) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : {
              ...l,
              geophones: l.geophones.map((g) =>
                g.position === position ? { ...g, skipped: false } : g
              ),
            }
          ),
        }));
        get().syncLine(lineId);
      },

      addNote: (lineId, position, text) => {
        if (!text.trim()) return;
        const entry = { id: makeNoteId(), text: text.trim(), createdAt: Date.now() };
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : {
              ...l,
              geophones: l.geophones.map((g) =>
                g.position === position ? { ...g, notes: [...g.notes, entry] } : g
              ),
            }
          ),
        }));
        get().syncLine(lineId);
      },

      deleteNote: (lineId, position, noteId) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : {
              ...l,
              geophones: l.geophones.map((g) =>
                g.position === position ? { ...g, notes: g.notes.filter((n) => n.id !== noteId) } : g
              ),
            }
          ),
        }));
        get().syncLine(lineId);
      },

      addLineNote: (lineId, text) => {
        if (!text.trim()) return;
        const entry = { id: makeNoteId(), text: text.trim(), createdAt: Date.now() };
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : { ...l, lineNotes: [...(l.lineNotes ?? []), entry] }
          ),
        }));
        get().syncLine(lineId);
      },

      deleteLineNote: (lineId, noteId) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.id !== lineId ? l : { ...l, lineNotes: (l.lineNotes ?? []).filter((n) => n.id !== noteId) }
          ),
        }));
        get().syncLine(lineId);
      },

      deleteLine: (lineId) => {
        set((s) => ({
          lines: s.lines.filter((l) => l.id !== lineId),
          activeLine: s.activeLine === lineId ? null : s.activeLine,
        }));
        if (supabase) {
          supabase.from('lines').delete().eq('id', lineId).then(() => {});
        }
      },

      syncLine: async (lineId) => {
        // Always save locally first (already done via set)
        // Debounce the cloud push — wait 800ms after last change
        set({ syncStatus: 'pending' });
        const existing = syncTimers.get(lineId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
          syncTimers.delete(lineId);
          if (!supabase) return;
          const line = get().lines.find((l) => l.id === lineId);
          if (!line) return;
          set({ syncStatus: 'saving' });
          localUpsertIds.add(lineId);
          try {
            const { error } = await supabase.from('lines').upsert({
              id: line.id,
              name: line.name,
              data: JSON.stringify(line),
              updated_at: new Date().toISOString(),
            });
            if (error) throw error;
            set({ syncStatus: 'saved' });
          } catch (e) {
            console.warn('Sync failed, will retry on next change', e);
            set({ syncStatus: 'error' });
          } finally {
            setTimeout(() => localUpsertIds.delete(lineId), 2000);
          }
        }, 800);

        syncTimers.set(lineId, timer);
      },

      mergeFromCloud: async () => {
        if (!supabase) return;
        try {
          const { data } = await supabase
            .from('lines')
            .select('data')
            .order('updated_at', { ascending: false });
          if (!data) return;
          const cloudLines: Line[] = data.map((r) => JSON.parse(r.data));
          set((s) => {
            // Merge: cloud wins for existing lines, keep local-only lines too
            const cloudMap = new Map(cloudLines.map((l) => [l.id, l]));
            const localMap = new Map(s.lines.map((l) => [l.id, l]));
            const merged: Line[] = [];
            // All cloud lines
            for (const cl of cloudLines) merged.push(cl);
            // Local-only lines not yet pushed
            for (const ll of s.lines) {
              if (!cloudMap.has(ll.id)) merged.push(ll);
            }
            // Push any local lines that aren't in cloud yet
            for (const ll of s.lines) {
              if (!cloudMap.has(ll.id)) {
                get().syncLine(ll.id);
              }
            }
            void localMap;
            return { lines: merged };
          });
        } catch (e) {
          console.warn('Load from cloud failed', e);
        }
      },

      subscribeToChanges: () => {
        if (!supabase) return;
        supabase
          .channel('lines-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'lines' }, (payload) => {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as { id: string }).id;
              set((s) => ({ lines: s.lines.filter((l) => l.id !== id) }));
              return;
            }
            const incoming = payload.new as { id: string; data: string };
            // Skip if this is our own upsert echoing back
            if (localUpsertIds.has(incoming.id)) return;
            const line: Line = JSON.parse(incoming.data);
            set((s) => {
              const exists = s.lines.find((l) => l.id === line.id);
              if (exists) {
                return { lines: s.lines.map((l) => l.id === line.id ? line : l) };
              }
              return { lines: [...s.lines, line] };
            });
          })
          .subscribe();
      },
    }),
    {
      name: 'geophone-store',
      version: 2,
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        if (!Array.isArray(state.lines)) return state;
        state.lines = (state.lines as Line[]).map((l) => ({
          ...l,
          lineNotes: (l as unknown as Record<string, unknown>).lineNotes
            ? l.lineNotes
            : (l as unknown as Record<string, unknown>).lineNote
              ? [{ id: makeNoteId(), text: (l as unknown as Record<string, unknown>).lineNote as string, createdAt: Date.now() }]
              : [],
          geophones: l.geophones.map((g) => ({
            ...g,
            notes: Array.isArray(g.notes)
              ? g.notes
              : (g as unknown as Record<string, unknown>).note
                ? [{ id: makeNoteId(), text: (g as unknown as Record<string, unknown>).note as string, createdAt: Date.now() }]
                : [],
          })),
        }));
        return state;
      },
    }
  )
);
