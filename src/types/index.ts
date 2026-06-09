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
  position: number;       // chronological # (1-N)
  sensorId: number;       // actual sensor used (may be replacement)
  hits: Hit[];
  skipped: boolean;
  notes: Note[];
}

export interface Line {
  id: string;
  name: string;
  geophones: Geophone[];
  hitCounter: number;
  lineNotes: Note[];      // multiple notes for the whole line
  createdAt: number;
  completedAt?: number;
}

export interface AppState {
  loggedIn: boolean;
  lines: Line[];
  activeLine: string | null;
  activeGeophoneIndex: number;
}
