/**
 * UniLib Parser v1.0
 * Парсер для библиотек ассетов.
 * Вес: ~5 KB (minified + gzip)
 * 
 * Назначение:
 * - Хранение наборов объектов
 * - CDN, архивы, биржи
 * - Манифест и метаданные
 */

import type { BaseSpec } from '../unicomp-core/types';

export interface LibAsset {
  id: string;
  type: 'unicomp' | 'uniasc' | 'unipng' | 'unigif';
  data: string;
  tags?: string[];
  version?: string;
}

export interface LibManifest {
  name: string;
  version: string;
  author?: string;
  license?: string;
  dependencies?: string[];
  assets: LibAsset[];
  createdAt?: string;
  updatedAt?: string;
}

export function parseUniLib(input: string): LibManifest {
  try {
    const json = JSON.parse(input);
    return {
      name: json.name || 'Untitled',
      version: json.version || '1.0',
      author: json.author,
      license: json.license,
      dependencies: json.dependencies || [],
      assets: (json.assets || []).map((a: any) => ({
        id: a.id,
        type: a.type || 'unicomp',
        data: a.data,
        tags: a.tags || [],
        version: a.version
      })),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt
    };
  } catch {
    return parseTextLib(input);
  }
}

function parseTextLib(input: string): LibManifest {
  const assets: LibAsset[] = [];
  const lines = input.split('\n');
  let currentAsset: Partial<LibAsset> = {};
  
  const manifest: LibManifest = {
    name: 'UniLib',
    version: '1.0',
    assets
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('#!')) {
      const [k, v] = trimmed.slice(2).split('=');
      if (k === 'name') manifest.name = v;
      else if (k === 'version') manifest.version = v;
      else if (k === 'author') manifest.author = v;
    } else if (trimmed.startsWith('#@')) {
      if (currentAsset.id) assets.push(currentAsset as LibAsset);
      const [, id, type] = trimmed.match(/#@([^:]+):(\w+)/) || [];
      currentAsset = { id, type: type as any, data: '' };
    } else if (currentAsset.id) {
      currentAsset.data = (currentAsset.data || '') + trimmed;
    }
  }
  
  if (currentAsset.id) {
    assets.push(currentAsset as LibAsset);
  }
  
  return manifest;
}

export function stringifyLib(manifest: LibManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export function validateLib(manifest: LibManifest): string[] {
  const errors: string[] = [];
  
  if (!manifest.name) errors.push('Missing name');
  if (!manifest.version) errors.push('Missing version');
  if (manifest.assets.length === 0) errors.push('No assets');
  
  for (const asset of manifest.assets) {
    if (!asset.id) errors.push(`Asset missing ID`);
    if (!asset.data) errors.push(`Asset ${asset.id} missing data`);
  }
  
  return errors;
}

export function mergeLibs(lib1: LibManifest, lib2: LibManifest): LibManifest {
  return {
    ...lib1,
    assets: [...lib1.assets, ...lib2.assets],
    dependencies: [...(lib1.dependencies || []), ...(lib2.dependencies || [])]
  };
}