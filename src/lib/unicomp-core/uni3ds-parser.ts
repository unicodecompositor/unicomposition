/**
 * Uni3DS Parser v1.0
 * Парсер для псевдо-3D сцены (6 сторон куба).
 * Вес: ~15 KB (minified + gzip)
 * 
 * Назначение:
 * - VR/AR панорамы
 * - 6-стороннее окружение
 * - Псевдо-3D паралакс
 */

import type { BaseSpec, Vec3 } from '../unicomp-core/types';
import { parseUniPNG, PngScene } from './unipng-parser';
import { parseVec3 } from '../unicomp-core/utils';

export type CubeFace = 'front' | 'right' | 'left' | 'top' | 'bottom' | 'back';

export const CUBE_FACES: CubeFace[] = ['front', 'right', 'left', 'top', 'bottom', 'back'];

export interface CubeScene extends BaseSpec {
  faces: Record<CubeFace, PngScene>;
  vp?: Vec3;
  zd?: Vec3;
  zi?: number;
}

export function parseUni3DS(input: string): CubeScene {
  const lines = input.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const faces: Partial<Record<CubeFace, PngScene>> = {};
  
  let vp: Vec3 | undefined;
  let zd: Vec3 | undefined;
  let zi: number | undefined;
  
  const vpMatch = input.match(/vp=\[([^\]]+)\]/);
  const zdMatch = input.match(/zd=\[([^\]]+)\]/);
  const ziMatch = input.match(/zi=(\d+)/);
  
  if (vpMatch) vp = parseVec3(vpMatch[1]);
  if (zdMatch) zd = parseVec3(zdMatch[1]);
  if (ziMatch) zi = parseInt(ziMatch[1], 10);
  
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i].trim();
    const face = CUBE_FACES[i];
    
    try {
      faces[face] = parseUniPNG(line);
    } catch (e) {
      console.warn(`Face ${face} parse error:`, e);
    }
  }
  
  return {
    grid: { g: { x: 10, y: 10 } },
    symbols: [],
    faces: faces as Record<CubeFace, PngScene>,
    vp,
    zd,
    zi,
    version: '1.0'
  };
}

export function rotateCube(scene: CubeScene, axis: 'X' | 'Y' | 'Z', degrees: number): CubeScene {
  const faces = { ...scene.faces };
  const temp = { ...faces };
  
  if (axis === 'Y') {
    faces.front = temp.right;
    faces.right = temp.back;
    faces.back = temp.left;
    faces.left = temp.front;
  } else if (axis === 'X') {
    faces.front = temp.top;
    faces.top = temp.back;
    faces.back = temp.bottom;
    faces.bottom = temp.front;
  }
  
  return { ...scene, faces };
}

export function cubeToUniMPG(scene: CubeScene): string {
  return CUBE_FACES.map((face, i) => 
    `zi=${i}${stringifyScene(scene.faces[face])}`
  ).join('\n');
}

function stringifyScene(scene: PngScene): string {
  const grid = `(${scene.grid.g?.x}×${scene.grid.g?.y})`;
  const symbols = scene.symbols.map(s => 
    `${s.v || ''}${s.d.start}-${s.d.end}`
  ).join(';');
  return `${grid}:${symbols}`;
}

export class CubeViewer {
  private scene: CubeScene;
  private currentFace: CubeFace = 'front';
  private rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  
  constructor(scene: CubeScene) {
    this.scene = scene;
  }
  
  setFace(face: CubeFace): void {
    this.currentFace = face;
  }
  
  rotate(axis: 'x' | 'y' | 'z', degrees: number): void {
    this.rotation[axis] += degrees;
    if (Math.abs(this.rotation[axis]) >= 90) {
      this.rotateCube(axis as 'X' | 'Y' | 'Z');
      this.rotation[axis] = 0;
    }
  }
  
  private rotateCube(axis: 'X' | 'Y' | 'Z'): void {
    this.scene = rotateCube(this.scene, axis, 90);
  }
  
  getCurrentFace(): PngScene {
    return this.scene.faces[this.currentFace];
  }
}