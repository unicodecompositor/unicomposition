// UniCompCore.ts
import { parseUniComp, UniCompSpec } from './unicomp-parser';

// ---------- Baking Logic ----------
export function bakeD(initial: [number, number, number, number], ops: {
  o?: [number, number];
  s?: [number, number];
  me?: [number, number];
  se?: [number, number];
}): [[number, number], [number, number]] {
  let [x1, y1, x2, y2] = initial;

  if (ops.o) { x1 += ops.o[0]; y1 += ops.o[1]; x2 += ops.o[0]; y2 += ops.o[1]; }
  if (ops.s) { x2 += ops.s[0]; y2 += ops.s[1]; }
  if (ops.me) { x1 -= ops.me[0]; y1 -= ops.me[1]; x2 += ops.me[0]; y2 += ops.me[1]; }
  if (ops.se) { x1 -= ops.se[0]; y1 -= ops.se[1]; x2 += ops.se[0]; y2 += ops.se[1]; }

  return [[x1, y1], [x2, y2]];
}

// ---------- Collapse History ----------
export function collapseHistory(history: any[]): any {
  if (!history || history.length === 0) return {};
  return history[history.length - 1];
}

// ---------- Play State Interpreter ----------
export function interpretPlayState(code: string): string {
  switch (code) {
    case '0': return 'Static Start';
    case '1': return 'Static End';
    case '01': return 'Forward';
    case '10': return 'Reverse';
    case '010': return 'Ping-Pong';
    case '101': return 'Reverse Ping-Pong';
    case '100': return 'Clear Keep First';
    case '001': return 'Clear  Keep Last';
    case '000': return 'Delete';
    default: return '0';
  }
}

// ---------- Play State Interpreter ----------
export function interpretSelectEditState(code: string): string {
  switch (code) {
    case '11': return 'Selected';
    case '01': return 'Hidden';
    case '00': return 'Locked';
    case '10': return 'Visible';
    default: return '10';
  }
}

// ---------- Parse UniComp Safe ----------
export function parseUniCompSafe(raw: string): { success: boolean; spec?: UniCompSpec; error?: string } {
  try {
    const result = parseUniComp(raw);
    if (result && result.success) {
      return { success: true, spec: result.spec };
    }
    if (result && !result.success) {
      return { success: false, error: (result as any).error?.message || 'Parse failed' };
    }
    return { success: false, error: 'Parse failed' };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Unknown parse error' };
  }
}
