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
  lineNotes: Note[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  sensorSpacing?: number;   // metres between sensors
  elapsedMs: number;        // total recorded ms (excludes paused time)
  timerStartedAt?: number;  // wall-clock ms when timer last resumed, null if paused
  autoAdvance: boolean;     // move to next geo after 3 valid hits
}

export interface AppState {
  loggedIn: boolean;
  lines: Line[];
  activeLine: string | null;
  activeGeophoneIndex: number;
}
