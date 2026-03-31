/**
 * UniStr Parser v1.0
 * Парсер для потоковой передачи данных.
 * Вес: ~12 KB (minified + gzip)
 * 
 * Назначение:
 * - WebSocket стриминг
 * - Real-time синхронизация
 * - Дельта-обновления
 */

import type { BaseSymbol, Bounds } from '../unicomp-core/types';
import { parseBounds } from '../unicomp-core/utils';

export interface StreamFrame {
  id: string;
  timestamp: number;
  delta: {
    v?: string;
    d?: Bounds;
    tr?: any;
    lc?: any;
  };
  isStart: boolean;
  isStop: boolean;
}

export interface StreamState {
  currentId: string | null;
  frames: StreamFrame[];
  isActive: boolean;
  lastSync: number;
}

export function parseUniStr(input: string): StreamState {
  const state: StreamState = {
    currentId: null,
    frames: [],
    isActive: false,
    lastSync: Date.now()
  };
  
  const markers = input.split(/(START|STOP|NEXT|DELTA)/g);
  
  for (let i = 0; i < markers.length; i++) {
    const token = markers[i].trim();
    
    if (token === 'START') {
      state.isActive = true;
      if (i + 1 < markers.length) {
        state.currentId = markers[i + 1].trim();
        i++;
      }
    } else if (token === 'STOP') {
      state.isActive = false;
    } else if (token === 'NEXT') {
      if (i + 1 < markers.length) {
        state.currentId = markers[i + 1].trim();
        i++;
      }
    } else if (token === 'DELTA' && state.isActive && state.currentId) {
      if (i + 1 < markers.length) {
        const deltaStr = markers[i + 1].trim();
        const delta = parseDelta(deltaStr);
        
        state.frames.push({
          id: state.currentId,
          timestamp: Date.now(),
          delta,
          isStart: !state.frames.some(f => f.id === state.currentId),
          isStop: false
        });
        i++;
      }
    }
  }
  
  return state;
}

function parseDelta(str: string): StreamFrame['delta'] {
  const delta: StreamFrame['delta'] = {};
  const params = str.split(';');
  
  for (const p of params) {
    const [k, v] = p.split('=');
    if (!k || !v) continue;
    
    const val = v.replace(/"/g, '');
    
    if (k === 'v') delta.v = val;
    else if (k === 'd') delta.d = parseBounds(val);
    else if (k === 'tr' || k === 'lc') {
      try {
        delta[k] = JSON.parse(val);
      } catch {
        delta[k] = val;
      }
    }
  }
  
  return delta;
}

export function createStreamFrame(
  id: string,
  delta: StreamFrame['delta'],
  isStart = false,
  isStop = false
): string {
  const deltaStr = Object.entries(delta)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(';');
  
  return `${isStart ? 'START' : ''}${id}DELTA${deltaStr}${isStop ? 'STOP' : ''}`;
}

export function compressStream(state: StreamState): string {
  return state.frames.map(f => 
    `${f.id}:${JSON.stringify(f.delta)}:${f.timestamp}`
  ).join('|');
}

export function decompressStream(compressed: string): StreamState {
  const frames = compressed.split('|').map(part => {
    const [id, deltaStr, ts] = part.split(':');
    return {
      id,
      delta: JSON.parse(deltaStr),
      timestamp: parseInt(ts, 10),
      isStart: false,
      isStop: false
    };
  });
  
  return {
    currentId: frames[0]?.id || null,
    frames,
    isActive: true,
    lastSync: Date.now()
  };
}