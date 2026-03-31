import React, { useState, useRef, useCallback, useEffect } from 'react';
import { UniCompSpec, stringifySpec } from '@/lib/unicomp-parser';
import { UniCompRenderer } from '@/components/UniCompRenderer';
import { Button } from '@/components/ui/button';
import { Grid, Hash, Maximize2, Eye, Download, Play, Square, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { renderSpecToOffscreen } from '@/lib/render-utils';
import { useKeyframeAnimation } from '@/hooks/useKeyframeAnimation';
import { GridPalette } from '@/components/GridPalette';

// ============================================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: отрисовка спека на канвасе для превью
// ============================================================================
function drawSpecOnCanvas(
  ctx: CanvasRenderingContext2D,
  spec: UniCompSpec,
  canvasW: number,
  canvasH: number,
) {
  const pixelsPerCell = Math.max(
    24,
    Math.min(96, Math.round((Math.min(canvasW / spec.gridWidth, canvasH / spec.gridHeight) || 1) * 2)),
  );
  const rendered = renderSpecToOffscreen(spec, pixelsPerCell, 'hsl(210, 20%, 92%)');
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.drawImage(rendered, 0, 0, rendered.width, rendered.height, 0, 0, canvasW, canvasH);
  ctx.restore();
}

// ============================================================================
// КОМПОНЕНТ: Фоновая сетка (расширяется за пределы редактора)
// ============================================================================
const BackgroundGrid: React.FC<{
  spec: UniCompSpec | null;
  containerSize: number;
}> = ({ spec, containerSize }) => {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || !spec) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridWidth = spec.gridWidth;
    const gridHeight = spec.gridHeight;
    const cellSize = Math.min(containerSize / gridWidth, containerSize / gridHeight);

    // Заполняем весь вьюпорт
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, vw, vh);

    // Центрируем редактор
    const editorW = cellSize * gridWidth;
    const editorH = cellSize * gridHeight;
    const offsetX = (vw - editorW) / 2;
    const offsetY = (vh - editorH) / 2;

    // Рисуем сетку на весь экран
    ctx.strokeStyle = 'hsl(220, 15%, 15%)';
    ctx.lineWidth = 0.5;

    // Вертикальные линии
    const startGridX = offsetX % cellSize;
    for (let x = startGridX; x < vw; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vh);
      ctx.stroke();
    }

    // Горизонтальные линии
    const startGridY = offsetY % cellSize;
    for (let y = startGridY; y < vh; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(vw, y);
      ctx.stroke();
    }
  }, [spec, containerSize]);

  if (!spec) return null;
  return <canvas ref={bgCanvasRef} className="fixed inset-0 z-0 pointer-events-none" style={{ top: 0, left: 0 }} />;
};

// ============================================================================
// ОСНОВНОЙ КОМПОНЕНТ: Панель визуализации сетки
// ============================================================================
interface GridVisualizationPanelProps {
  spec: UniCompSpec | null;
  deferredSpec: UniCompSpec | null;
  showGrid: boolean;
  showIndices: boolean;
  containerSize: number;
  selectionSet: number[];
  lockedSet: number[];
  hiddenSet: number[];
  onToggleGrid: () => void;
  onToggleIndices: () => void;
  onCycleLayoutMode: () => void;
  onCellDoubleClick: (idx: number) => void;
  onUpdateCode: (code: string, isFinal: boolean) => void;
  onTripleTapEmpty: () => void;
  angleStep: number;
  extraToolbar?: React.ReactNode;
  canvasContainerRef?: React.RefObject<HTMLDivElement>;
  layoutMode?: 'normal' | 'split' | 'fullscreen';
  fullscreenViewMode?: 'edit' | 'preview';
}

export const GridVisualizationPanel: React.FC<GridVisualizationPanelProps> = ({
  spec,
  deferredSpec,
  showGrid,
  showIndices,
  containerSize,
  selectionSet,
  lockedSet,
  hiddenSet,
  onToggleGrid,
  onToggleIndices,
  onCycleLayoutMode,
  onCellDoubleClick,
  onUpdateCode,
  onTripleTapEmpty,
  angleStep,
  extraToolbar,
  canvasContainerRef,
  layoutMode = 'normal',
  fullscreenViewMode,
}) => {
  // Режим просмотра: edit (редактор) или preview (результат)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  
  // История цветов сетки для undo
  const [gridColorHistory, setGridColorHistory] = useState<UniCompSpec[]>([]);
  
  // Рефы
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);

  // ============================================================================
  // ОБРАБОТКА ПАЛИТРЫ СЕТКИ (gc= background, gb= border)
  // ============================================================================
  const handleGridPaletteChange = useCallback((data: {
    background: string;
    backgroundOpacity: number;
    borderRadius: string;
    borderWidth: number;
    borderColor: string;
    borderOpacity: number;
  }, isFinal: boolean) => {
    if (!spec) return;
    
    if (isFinal) {
      setGridColorHistory(h => [...h, JSON.parse(JSON.stringify(spec))]);
    }
    
    const newSpec: UniCompSpec = {
      ...spec,
      background: data.background,
      backgroundOpacity: data.backgroundOpacity ?? 1,
      borderRadius: data.borderRadius || undefined,
      strokeWidth: data.borderWidth > 0 ? data.borderWidth : undefined,
      // Всегда сохраняем цвет и прозрачность, даже если ширина 0 (для восстановления)
      strokeColor: data.borderColor || 'hsl(0, 0%, 100%)',
      strokeOpacity: data.borderOpacity ?? 1,
    };
    
    onUpdateCode(stringifySpec(newSpec), isFinal);
  }, [spec, onUpdateCode]);

  // Undo для цветов сетки
  const handleGridColorUndo = useCallback(() => {
    if (gridColorHistory.length === 0) return;
    const prev = gridColorHistory[gridColorHistory.length - 1];
    setGridColorHistory(h => h.slice(0, -1));
    onUpdateCode(stringifySpec(prev), true);
  }, [gridColorHistory, onUpdateCode]);

  // ============================================================================
  // АНИМАЦИЯ: ключевые кадры + play state (p=)
  // ============================================================================
  const { isPlaying, specHasKeyframes, animatedSpec, togglePlay, currentPlayState } = useKeyframeAnimation(deferredSpec);

  // В фулскрине режим просмотра управляется извне
  const effectiveViewMode = layoutMode === 'fullscreen' ? (fullscreenViewMode || 'edit') : viewMode;
  const isFullscreen = layoutMode === 'fullscreen';

  // Выбираем, какую спецификацию рендерить: анимированную или статичную
  const previewSpec = isPlaying && animatedSpec ? animatedSpec : deferredSpec;

  // ============================================================================
  // ОТРИСОВКА ПРЕВЬЮ НА CANVAS
  // ============================================================================
  useEffect(() => {
    if (effectiveViewMode !== 'preview') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const specToRender = previewSpec;

    // Вычисляем размеры канваса
    let canvasW = containerSize;
    let canvasH = containerSize;
    if (specToRender) {
      const ratio = specToRender.gridWidth / specToRender.gridHeight;
      if (ratio > 1) canvasH = containerSize / ratio;
      else canvasW = containerSize * ratio;
    }

    // В фулскрине — больше канвас
    if (isFullscreen) {
      const maxW = window.innerWidth * 0.85;
      const maxH = (window.innerHeight - 80) * 0.85;
      if (specToRender) {
        const ratio = specToRender.gridWidth / specToRender.gridHeight;
        if (ratio > 1) {
          canvasW = Math.min(maxW, maxH * ratio);
          canvasH = canvasW / ratio;
        } else {
          canvasH = Math.min(maxH, maxW / ratio);
          canvasW = canvasH * ratio;
        }
      } else {
        canvasW = Math.min(maxW, maxH);
        canvasH = canvasW;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Пустое состояние
    if (!specToRender || specToRender.symbols.length === 0) {
      ctx.fillStyle = 'hsl(210, 15%, 30%)';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('—', canvasW / 2, canvasH / 2);
      return;
    }

    drawSpecOnCanvas(ctx, specToRender, canvasW, canvasH);
  }, [effectiveViewMode, previewSpec, containerSize, isFullscreen]);

  // ============================================================================
  // ЭКСПОРТ В HTML/CANVAS
  // ============================================================================
  const handleExport = () => {
    const specToExport = deferredSpec;
    if (!specToExport) return;

    const W = 600;
    const H = Math.round(W * specToExport.gridHeight / specToExport.gridWidth);
    const exportCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    exportCanvas.width = W * dpr;
    exportCanvas.height = H * dpr;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    drawSpecOnCanvas(ctx, specToExport, W, H);

    const raw = specToExport.raw || '';
    const pngDataUrl = exportCanvas.toDataURL('image/png');
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>UniComp Export</title>
  <style>
    body { margin: 0; background: #0d1117; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    canvas { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <canvas id="uc" width="${W}" height="${H}"></canvas>
  <script>
    (function() {
      const canvas = document.getElementById('uc');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const displayW = ${W};
      const displayH = ${H};
      const dpr = window.devicePixelRatio || 1;
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      canvas.style.width = displayW + 'px';
      canvas.style.height = displayH + 'px';
      const img = new Image();
      img.onload = function() {
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, displayW, displayH);
        ctx.drawImage(img, 0, 0, displayW, displayH);
      };
      img.src = '${pngDataUrl}';
    })();
  </script>
  <!-- UniComp Rule: ${raw.replace(/-->/g, '--&gt;')} -->
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unicomp-export.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================================================
  // РЕНДЕР: Фулскрин режим (упрощённый, без хедера)
  // ============================================================================
  if (isFullscreen) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full relative" ref={canvasContainerRef}>
        {/* Фоновая сетка за пределами редактора */}
        <BackgroundGrid spec={spec} containerSize={containerSize} />
        
        {/* Скрытая кнопка экспорта для тулбара */}
        <button ref={exportButtonRef} data-grid-viz-export className="hidden" onClick={handleExport} />

        {effectiveViewMode === 'edit' ? (
          <div className="relative z-10">
            <UniCompRenderer
              spec={spec}
              showGrid={showGrid}
              showIndices={showIndices}
              size={containerSize}
              selectionSet={selectionSet}
              lockedSet={lockedSet}
              hiddenSet={hiddenSet}
              onCellDoubleClick={onCellDoubleClick}
              onUpdateCode={onUpdateCode}
              onTripleTapEmpty={onTripleTapEmpty}
              angleStep={angleStep}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center relative z-10">
            {deferredSpec && deferredSpec.symbols.length > 0 ? (
              <div className="relative">
                <canvas ref={previewCanvasRef} className="rounded-lg" />
                
                {/* Кнопка play/pause — учитывает p= через currentPlayState */}
                {specHasKeyframes && (
                  <button
                    onClick={togglePlay}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-background/80 border border-border backdrop-blur-sm flex items-center justify-center hover:bg-accent transition-colors"
                    title={isPlaying ? 'Stop animation' : 'Play animation'}
                  >
                    {isPlaying ? (
                      <Square className="h-4 w-4 text-foreground" />
                    ) : (
                      <Play className="h-4 w-4 text-foreground ml-0.5" />
                    )}
                  </button>
                )}
                
                {/* Индикатор текущего play state (p=) */}
                {currentPlayState !== undefined && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-background/80 px-2 py-0.5 rounded border border-border">
                    p={currentPlayState}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">No result to preview</span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // РЕНДЕР: Нормальный / Сплит режим (с хедером и тулбарами)
  // ============================================================================
  
  // Кнопки переключения сетки и индексов
  const displayToggles = (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", showGrid && "text-primary")}
        onClick={onToggleGrid}
        title="Toggle Grid"
      >
        <Grid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", showIndices && "text-primary")}
        onClick={onToggleIndices}
        title="Toggle Indices"
      >
        <Hash className="h-4 w-4" />
      </Button>
    </>
  );

  // Хедер панели
  const headerControls = (
    <div className="flex items-center gap-1">
      {displayToggles}
      
      {/* Переключение edit/preview */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", viewMode === 'preview' && "text-primary")}
        onClick={() => setViewMode(v => v === 'edit' ? 'preview' : 'edit')}
        title={viewMode === 'edit' ? 'Switch to Result Preview' : 'Switch to Edit Mode'}
      >
        <Eye className="h-4 w-4" />
      </Button>
      
      {/* Экспорт */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleExport}
        title="Export as HTML Canvas"
        disabled={!deferredSpec}
      >
        <Download className="h-4 w-4" />
      </Button>
      
      {/* Палитра сетки (gc=, gb=) */}
      <GridPalette
        background={spec?.background || 'hsl(220, 18%, 10%)'}
        backgroundOpacity={spec?.backgroundOpacity ?? 1}
        borderRadius={spec?.borderRadius || ''}
        borderWidth={spec?.strokeWidth ?? 0}
        borderColor={spec?.strokeColor || 'hsl(0, 0%, 100%)'}
        borderOpacity={spec?.strokeOpacity ?? 1}
        onChange={handleGridPaletteChange}
        onUndo={handleGridColorUndo}
        canUndo={gridColorHistory.length > 0}
      />
      
      {/* Доп. тулбар (если передан) */}
      {extraToolbar}
      
      {/* Смена режима макета */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onCycleLayoutMode}
        title="Expand view"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col items-center relative min-h-[400px] w-full h-full" ref={canvasContainerRef}>
      {/* Хедер панели */}
      <div className="panel-header w-full flex items-center justify-between mb-4">
        <span>GRID VISUALIZATION {viewMode === 'preview' ? '— RESULT' : ''}</span>
        {headerControls}
      </div>

      {/* Основной контент: редактор или превью */}
      {viewMode === 'edit' ? (
        <UniCompRenderer
          spec={spec}
          showGrid={showGrid}
          showIndices={showIndices}
          size={containerSize}
          selectionSet={selectionSet}
          lockedSet={lockedSet}
          hiddenSet={hiddenSet}
          onCellDoubleClick={onCellDoubleClick}
          onUpdateCode={onUpdateCode}
          onTripleTapEmpty={onTripleTapEmpty}
          angleStep={angleStep}
        />
      ) : (
        <div className="flex flex-col items-center justify-center w-full flex-1">
          <div
            className="rounded-lg bg-background border border-border p-4 glow-primary flex items-center justify-center relative"
            style={{ width: containerSize, height: containerSize, maxWidth: '100%' }}
          >
            {deferredSpec && deferredSpec.symbols.length > 0 ? (
              <>
                <canvas ref={previewCanvasRef} />
                
                {/* Play/Pause кнопка с учётом p= */}
                {specHasKeyframes && (
                  <button
                    onClick={togglePlay}
                    className="absolute top-3 right-3 w-10 h-10 rounded-full bg-background/80 border border-border backdrop-blur-sm flex items-center justify-center hover:bg-accent transition-colors"
                    title={isPlaying ? 'Stop animation' : 'Play animation'}
                  >
                    {isPlaying ? (
                      <Square className="h-4 w-4 text-foreground" />
                    ) : (
                      <Play className="h-4 w-4 text-foreground ml-0.5" />
                    )}
                  </button>
                )}
                
                {/* Индикатор p= */}
                {currentPlayState !== undefined && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-background/80 px-2 py-0.5 rounded border border-border">
                    p={currentPlayState}
                  </div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground text-sm">No result to preview</span>
            )}
          </div>
          
          {/* Отображение исходного кода под превью */}
          {deferredSpec && (
            <code className="mt-2 text-[10px] text-muted-foreground font-mono max-w-[300px] truncate">
              {deferredSpec.raw}
            </code>
          )}
        </div>
      )}
    </div>
  );
};