import { useState, useCallback, useRef } from 'react';
import { UniCompSpec, SymbolSpec, getRect, stringifySpec } from '@/lib/unicomp-parser';

interface Operation {
  id: number;
  type: 'move' | 'scale';
  delta: { dx: number; dy: number } | { dw: number; dh: number };
  affectedLayerIndices: number[];
  beforeSpec: UniCompSpec;   // полная копия
  afterSpec: UniCompSpec;    // результат после операции
}

export function useOperationHistory(initialSpec: UniCompSpec | null) {
  const [spec, setSpec] = useState<UniCompSpec | null>(initialSpec);
  const historyRef = useRef<Operation[]>([]);
  const currentIndexRef = useRef<0>(-1);

  const execute = useCallback((
    type: 'move' | 'scale',
    delta: { dx: number; dy: number } | { dw: number; dh: number },
    affectedLayerIndices: number[],
    newSpec: UniCompSpec,
  ) => {
    // Удаляем все операции после currentIndex
    historyRef.current = historyRef.current.slice(0, currentIndexRef.current + 1);
    const newOp: Operation = {
      id: historyRef.current.length,
      type,
      delta,
      affectedLayerIndices,
      beforeSpec: JSON.parse(JSON.stringify(spec)),
      afterSpec: JSON.parse(JSON.stringify(newSpec)),
    };
    historyRef.current.push(newOp);
    currentIndexRef.current = historyRef.current.length - 1;
    setSpec(newSpec);
    return newSpec;
  }, [spec]);

  const undo = useCallback(() => {
    if (currentIndexRef.current < 0) return null;
    const prev = historyRef.current[currentIndexRef.current];
    currentIndexRef.current--;
    setSpec(prev.beforeSpec);
    return prev.beforeSpec;
  }, []);

  const redo = useCallback(() => {
    if (currentIndexRef.current + 1 >= historyRef.current.length) return null;
    currentIndexRef.current++;
    const next = historyRef.current[currentIndexRef.current];
    setSpec(next.afterSpec);
    return next.afterSpec;
  }, []);

  const canUndo = currentIndexRef.current >= 0;
  const canRedo = currentIndexRef.current + 1 < historyRef.current.length;

  return { spec, setSpec, execute, undo, redo, canUndo, canRedo };
}