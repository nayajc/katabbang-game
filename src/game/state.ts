/** Game phase state machine: title -> running -> slowmo -> result -> gameover. */
export type Phase = 'title' | 'running' | 'slowmo' | 'result' | 'gameover';

const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  title: ['running'],
  running: ['slowmo', 'result', 'gameover'],
  slowmo: ['result', 'gameover'],
  result: ['running', 'gameover'],
  gameover: ['title', 'running'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

export class StateMachine {
  private _phase: Phase = 'title';
  private _onChange?: (to: Phase, from: Phase) => void;

  constructor(onChange?: (to: Phase, from: Phase) => void) {
    this._onChange = onChange;
  }

  get phase(): Phase {
    return this._phase;
  }

  is(...phases: Phase[]): boolean {
    return phases.includes(this._phase);
  }

  /** Returns false (and does nothing) for an illegal transition. */
  set(to: Phase): boolean {
    const from = this._phase;
    if (from === to) return true;
    if (!canTransition(from, to)) return false;
    this._phase = to;
    this._onChange?.(to, from);
    return true;
  }
}
