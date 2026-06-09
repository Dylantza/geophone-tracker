export interface Hit {
  hitNumber: number;
  invalid: boolean;
}

export interface Note {
  id: string;
  text: string;
  createdAt: number;
}

export interface Geophone {
  position: number;
  sensorId: number;
  hits: Hit[];
  skipped: boolean;
  notes: Note[];
}

export interface Line {
  id: string;
  scanDayId: string;
  name: string;
  geophones: Geophone[];
  hitCounter: number;
  lineNotes: Note[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  sensorSpacing?: number;
  elapsedMs: number;
  timerStartedAt?: number;
  autoAdvance: boolean;
}

export interface ScanDay {
  id: string;
  projectId: string;
  name: string;
  date: string;         // ISO date string e.g. "2026-06-09"
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
