/**
 * UniMPG Parser v1.0
 * Полный парсер для интерактивного плеера.
 * Вес: ~18 KB (minified + gzip)
 * 
 * Назначение:
 * - Интерактивная анимация
 * - Ключевые кадры с дельтами
 * - Play State управление
 */

import type { BaseSymbol, BaseSpec, Keyframe, TransformVector, LayerStyles, Bounds } from '../unicomp-core/types';
import { parseBounds, parseAngleForce, parseVec3, SECURITY_LIMITS } from '../unicomp-core/utils';

export const PLAY_STATES = {
  STATIC_START: 0,
  STATIC_END: 1,
  FORWARD: 2,
  REVERSE: 3,
  PING_PONG: 4,
  REVERSE_PING: 5,
  CLEAR_DROP_FIRST: 6,
  CLEAR_DROP_LAST: 7,
  DELETE: 8,
} as const;

export interface MpgSymbol extends BaseSymbol {
  keyframes: Keyframe[];
  tr?: TransformVector;
  lc?: LayerStyles;
  pg?: Bounds;
  po?: Bounds;
}

export interface MpgScene extends BaseSpec {
  symbols: MpgSymbol[];
  playState: number;
  totalDuration: number;
}

export function parseUniMPG(input: string): MpgScene {
  const symbols: MpgSymbol[] = [];
  let gridW = 10, gridH = 10;
  
  const gridMatch = input.match(/^\((\d+)(?:×(\d+))?\)/);
  if (gridMatch) {
    gridW = parseInt(gridMatch[1], 10);
    gridH = gridMatch[2] ? parseInt(gridMatch[2], 10) : gridW;
  }
  
  const colonIdx = input.indexOf(':');
  const layersPart = colonIdx > 0 ? input.substring(colonIdx + 1) : input;
  
  const symbolRegex = /([#@$]?\w+)?(\[[^\]]+\])+(\d+-\d+)/g;
  let match: RegExpExecArray | null;
  
  while ((match = symbolRegex.exec(layersPart)) !== null) {
    const sym: MpgSymbol = {
      v: match[1],
      d: parseBounds(match[3]),
      keyframes: []
    };
    
    const blocks = match[0].match(/\[[^\]]+\]/g) || [];
    for (const block of blocks) {
      const params = block.slice(1, -1).split(';');
      const kf: Partial<Keyframe> = {};
      
      for (const p of params) {
        const [k, v] = p.split('=');
        if (!k || !v) continue;
        
        const val = v.replace(/"/g, '');
        
        if (k === 'k') kf.k = parseInt(val, 10);
        else if (k === 't') kf.t = parseFloat(val);
        else if (k === 'p') kf.p = parsePlayState(val);
        else if (k === 'r') kf.tr = { ...kf.tr, r: parseFloat(val) };
        else if (k === 'c') kf.lc = { ...kf.lc, c: val };
        else if (k === 'bc') kf.lc = { ...kf.lc, bc: val };
      }
      
      if (kf.k !== undefined) {
        sym.keyframes.push(kf as Keyframe);
      }
    }
    
    symbols.push(sym);
  }
  
  const totalDuration = symbols.reduce((sum, s) => 
    sum + s.keyframes.reduce((kSum, k) => kSum + (k.t || 1), 0), 0
  );
  
  return {
    grid: { g: { x: gridW, y: gridH } },
    symbols,
    playState: symbols[0]?.keyframes[0]?.p || 0,
    totalDuration,
    version: '1.0'
  };
}

function parsePlayState(str: string): number {
  const map: Record<string, number> = {
    '0': 0, '1': 1, '01': 2, '10': 3,
    '010': 4, '101': 5, '100': 6, '001': 7, '000': 8
  };
  return map[str] || parseInt(str, 10);
}

export class MpgPlayer {
  private scene: MpgScene;
  private currentTime: number = 0;
  private isPlaying: boolean = false;
  
  constructor(scene: MpgScene) {
    this.scene = scene;
  }
  
  play(): void {
    this.isPlaying = true;
    this.tick();
  }
  
  pause(): void {
    this.isPlaying = false;
  }
  
  private tick(): void {
    if (!this.isPlaying) return;
    
    this.currentTime += 0.016; // ~60fps
    if (this.currentTime >= this.scene.totalDuration) {
      switch (this.scene.playState) {
        case PLAY_STATES.FORWARD:
          this.currentTime = 0;
          break;
        case PLAY_STATES.PING_PONG:
          this.isPlaying = false;
          break;
        case PLAY_STATES.DELETE:
          this.scene.symbols = [];
          break;
      }
    }
    
    requestAnimationFrame(() => this.tick());
  }
  
  getCurrentFrame(): number {
    let accumulated = 0;
    for (const sym of this.scene.symbols) {
      for (const kf of sym.keyframes) {
        accumulated += kf.t || 1;
        if (this.currentTime <= accumulated) return kf.k || 0;
      }
    }
    return 0;
  }
}