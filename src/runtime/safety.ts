import fs from 'fs';
import path from 'path';

export interface OperatorSafetyState {
  emergency_stop: boolean;
  reason: string | null;
  updated_at: number;
  updated_by: string;
}

export interface OperatorSafetyControllerOptions {
  dataDir: string;
  now?: () => number;
  statePath?: string;
}

const DEFAULT_UPDATED_BY = 'operator';

function defaultState(now: () => number): OperatorSafetyState {
  return {
    emergency_stop: false,
    reason: null,
    updated_at: now(),
    updated_by: DEFAULT_UPDATED_BY,
  };
}

function normalizeState(input: unknown, now: () => number): OperatorSafetyState {
  if (!input || typeof input !== 'object') {
    return defaultState(now);
  }
  const payload = input as Partial<OperatorSafetyState>;
  return {
    emergency_stop: payload.emergency_stop === true,
    reason: typeof payload.reason === 'string' && payload.reason.trim().length > 0
      ? payload.reason.trim()
      : null,
    updated_at: typeof payload.updated_at === 'number' && Number.isFinite(payload.updated_at)
      ? payload.updated_at
      : now(),
    updated_by: typeof payload.updated_by === 'string' && payload.updated_by.trim().length > 0
      ? payload.updated_by.trim()
      : DEFAULT_UPDATED_BY,
  };
}

export class OperatorSafetyController {
  private readonly now: () => number;
  private readonly statePath: string;
  private state: OperatorSafetyState;

  constructor(options: OperatorSafetyControllerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.statePath = options.statePath ?? path.join(options.dataDir, 'runtime', 'operator-safety.json');
    this.state = this.loadState();
  }

  getState(): OperatorSafetyState {
    return { ...this.state };
  }

  isExecutionAllowed(): boolean {
    return this.state.emergency_stop === false;
  }

  activate(reason: string | null, updatedBy = DEFAULT_UPDATED_BY): OperatorSafetyState {
    const normalizedReason = typeof reason === 'string' && reason.trim().length > 0
      ? reason.trim()
      : 'Operator emergency stop activated.';
    this.state = {
      emergency_stop: true,
      reason: normalizedReason,
      updated_at: this.now(),
      updated_by: updatedBy,
    };
    this.persistState();
    return this.getState();
  }

  resume(note: string | null, updatedBy = DEFAULT_UPDATED_BY): OperatorSafetyState {
    this.state = {
      emergency_stop: false,
      reason: typeof note === 'string' && note.trim().length > 0 ? note.trim() : null,
      updated_at: this.now(),
      updated_by: updatedBy,
    };
    this.persistState();
    return this.getState();
  }

  private loadState(): OperatorSafetyState {
    if (!fs.existsSync(this.statePath)) {
      const fallback = defaultState(this.now);
      this.writeState(fallback);
      return fallback;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as unknown;
      const normalized = normalizeState(raw, this.now);
      this.writeState(normalized);
      return normalized;
    } catch {
      const fallback = defaultState(this.now);
      this.writeState(fallback);
      return fallback;
    }
  }

  private persistState(): void {
    this.writeState(this.state);
  }

  private writeState(state: OperatorSafetyState): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }
}
