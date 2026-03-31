import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Palette, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Parse hsl string to components
function parseHsl(color?: string): [number, number, number] {
  if (!color) return [220, 18, 10];
  const m = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return [220, 18, 10];
}

function hslToString(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

export interface GridPaletteProps {
  background?: string;
  backgroundOpacity?: number;
  borderRadius?: string;
  borderWidth?: number;
  borderColor?: string;
  borderOpacity?: number;
  onChange: (data: {
    background: string;
    backgroundOpacity: number;
    borderRadius: string;
    borderWidth: number;
    borderColor: string;
    borderOpacity: number;
  }, isFinal: boolean) => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

const RING_SIZE = 90;
const CX = RING_SIZE / 2;
const CY = RING_SIZE / 2;
const OUTER_R = 38;
const INNER_R = 25;
const SEGMENTS = 72;

function arcPath(i: number, total: number, outerR: number, innerR: number, cx: number, cy: number): string {
  const a0 = ((i / total) * 2 - 0.5) * Math.PI;
  const a1 = (((i + 1) / total) * 2 - 0.5) * Math.PI;
  const x1 = cx + outerR * Math.cos(a0);
  const y1 = cy + outerR * Math.sin(a0);
  const x2 = cx + outerR * Math.cos(a1);
  const y2 = cy + outerR * Math.sin(a1);
  const x3 = cx + innerR * Math.cos(a1);
  const y3 = cy + innerR * Math.sin(a1);
  const x4 = cx + innerR * Math.cos(a0);
  const y4 = cy + innerR * Math.sin(a0);
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;
}

const MiniColorWheel: React.FC<{
  hue: number; saturation: number; lightness: number;
  onHueChange: (h: number, final: boolean) => void;
}> = ({ hue, saturation, lightness, onHueChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const getHue = useCallback((cx: number, cy: number) => {
    if (!svgRef.current) return 0;
    const r = svgRef.current.getBoundingClientRect();
    const angle = Math.atan2(cy - r.top - CY, cx - r.left - CX) + Math.PI / 2;
    return ((angle / (2 * Math.PI)) * 360 + 360) % 360;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const cx = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const cy = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      onHueChange(getHue(cx, cy), false);
    };
    const onEnd = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const cx = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const cy = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      onHueChange(getHue(cx, cy), true);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onEnd); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  }, [onHueChange, getHue]);

  const ia = (hue / 360) * 2 * Math.PI - Math.PI / 2;
  const ir = (OUTER_R + INNER_R) / 2;

  return (
    <svg ref={svgRef} width={RING_SIZE} height={RING_SIZE} style={{ cursor: 'crosshair', touchAction: 'none' }}
      onMouseDown={e => { e.preventDefault(); dragging.current = true; onHueChange(getHue(e.clientX, e.clientY), false); }}
      onTouchStart={e => { e.preventDefault(); dragging.current = true; onHueChange(getHue(e.touches[0].clientX, e.touches[0].clientY), false); }}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <path key={i} d={arcPath(i, SEGMENTS, OUTER_R, INNER_R, CX, CY)}
          fill={`hsl(${(i / SEGMENTS) * 360}, ${saturation}%, ${lightness}%)`} />
      ))}
      <circle cx={CX} cy={CY} r={INNER_R - 3} fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`} />
      <circle cx={CX + ir * Math.cos(ia)} cy={CY + ir * Math.sin(ia)} r={4} fill="none" stroke="white" strokeWidth={2} style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }} />
    </svg>
  );
};

/** Grid palette as a popover dropdown — controls gc= and gb= only */
export const GridPalette: React.FC<GridPaletteProps> = ({
  background, backgroundOpacity = 1, borderRadius = '',
  borderWidth = 0, borderColor, borderOpacity = 1,
  onChange, onUndo, canUndo,
}) => {
  const [bgHsl, setBgHsl] = useState<[number, number, number]>(() => parseHsl(background));
  const [bgAlpha, setBgAlpha] = useState(backgroundOpacity);
  const [radius, setRadius] = useState(borderRadius);
  const [bwHsl, setBwHsl] = useState<[number, number, number]>(() => parseHsl(borderColor));
  const [bw, setBw] = useState(borderWidth);
  const [bwAlpha, setBwAlpha] = useState(borderOpacity);

  useEffect(() => { setBgHsl(parseHsl(background)); setBgAlpha(backgroundOpacity); setRadius(borderRadius); }, [background, backgroundOpacity, borderRadius]);
  useEffect(() => { setBwHsl(parseHsl(borderColor)); setBw(borderWidth); setBwAlpha(borderOpacity); }, [borderColor, borderWidth, borderOpacity]);

  const emit = useCallback((bg: [number, number, number], ba: number, r: string, bH: [number, number, number], bW: number, bA: number, f: boolean) => {
    onChange({ background: hslToString(...bg), backgroundOpacity: ba, borderRadius: r, borderWidth: bW, borderColor: hslToString(...bH), borderOpacity: bA }, f);
  }, [onChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Grid Colors (gc/gb)"
        >
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 space-y-3"
        side="bottom"
        align="end"
        sideOffset={4}
      >
        {/* Undo button */}
        {canUndo && onUndo && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1 right-1 h-6 w-6 p-0"
            onClick={onUndo}
            title="Undo grid change"
          >
            <Undo2 className="h-3 w-3" />
          </Button>
        )}

        {/* gc= Grid Background */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Grid BG (gc=)</div>
          <div className="flex justify-center">
            <MiniColorWheel hue={bgHsl[0]} saturation={bgHsl[1]} lightness={bgHsl[2]}
              onHueChange={(h, f) => { const n: [number, number, number] = [h, bgHsl[1], bgHsl[2]]; setBgHsl(n); emit(n, bgAlpha, radius, bwHsl, bw, bwAlpha, f); }} />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Sat {Math.round(bgHsl[1])}%</div>
            <input type="range" min={0} max={100} step={1} value={bgHsl[1]} className="color-slider w-full"
              style={{ background: `linear-gradient(to right, hsl(${bgHsl[0]}, 0%, ${bgHsl[2]}%), hsl(${bgHsl[0]}, 100%, ${bgHsl[2]}%))` }}
              onChange={e => { const n: [number, number, number] = [bgHsl[0], +e.target.value, bgHsl[2]]; setBgHsl(n); emit(n, bgAlpha, radius, bwHsl, bw, bwAlpha, false); }}
              onMouseUp={() => emit(bgHsl, bgAlpha, radius, bwHsl, bw, bwAlpha, true)} />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Light {Math.round(bgHsl[2])}%</div>
            <input type="range" min={5} max={95} step={1} value={bgHsl[2]} className="color-slider w-full"
              style={{ background: `linear-gradient(to right, hsl(${bgHsl[0]}, ${bgHsl[1]}%, 5%), hsl(${bgHsl[0]}, ${bgHsl[1]}%, 50%), hsl(${bgHsl[0]}, ${bgHsl[1]}%, 95%))` }}
              onChange={e => { const n: [number, number, number] = [bgHsl[0], bgHsl[1], +e.target.value]; setBgHsl(n); emit(n, bgAlpha, radius, bwHsl, bw, bwAlpha, false); }}
              onMouseUp={() => emit(bgHsl, bgAlpha, radius, bwHsl, bw, bwAlpha, true)} />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Opacity {Math.round(bgAlpha * 100)}%</div>
            <Slider min={0} max={1} step={0.01} value={[bgAlpha]}
              onValueChange={([a]) => { setBgAlpha(a); emit(bgHsl, a, radius, bwHsl, bw, bwAlpha, false); }}
              onValueCommit={([a]) => { setBgAlpha(a); emit(bgHsl, a, radius, bwHsl, bw, bwAlpha, true); }} />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Radius {radius || '0'}</div>
            <Slider min={0} max={50} step={1} value={[parseFloat(radius) || 0]}
              onValueChange={([v]) => { const r = v > 0 ? `${v}%` : ''; setRadius(r); emit(bgHsl, bgAlpha, r, bwHsl, bw, bwAlpha, false); }}
              onValueCommit={([v]) => { const r = v > 0 ? `${v}%` : ''; setRadius(r); emit(bgHsl, bgAlpha, r, bwHsl, bw, bwAlpha, true); }} />
          </div>
        </div>

        <div className="border-t border-border" />

        {/* gb= Grid Border */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Grid Border (gb=)</div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">Width {(bw * 100).toFixed(1)}%</div>
            <Slider min={0} max={0.5} step={0.005} value={[bw]}
              onValueChange={([w]) => { setBw(w); emit(bgHsl, bgAlpha, radius, bwHsl, w, bwAlpha, false); }}
              onValueCommit={([w]) => { setBw(w); emit(bgHsl, bgAlpha, radius, bwHsl, w, bwAlpha, true); }} />
          </div>
          {bw > 0 && (
            <>
              <div className="flex justify-center">
                <MiniColorWheel hue={bwHsl[0]} saturation={bwHsl[1]} lightness={bwHsl[2]}
                  onHueChange={(h, f) => { const n: [number, number, number] = [h, bwHsl[1], bwHsl[2]]; setBwHsl(n); emit(bgHsl, bgAlpha, radius, n, bw, bwAlpha, f); }} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">Sat {Math.round(bwHsl[1])}%</div>
                <input type="range" min={0} max={100} step={1} value={bwHsl[1]} className="color-slider w-full"
                  style={{ background: `linear-gradient(to right, hsl(${bwHsl[0]}, 0%, ${bwHsl[2]}%), hsl(${bwHsl[0]}, 100%, ${bwHsl[2]}%))` }}
                  onChange={e => { const n: [number, number, number] = [bwHsl[0], +e.target.value, bwHsl[2]]; setBwHsl(n); emit(bgHsl, bgAlpha, radius, n, bw, bwAlpha, false); }}
                  onMouseUp={() => emit(bgHsl, bgAlpha, radius, bwHsl, bw, bwAlpha, true)} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">Light {Math.round(bwHsl[2])}%</div>
                <input type="range" min={5} max={95} step={1} value={bwHsl[2]} className="color-slider w-full"
                  style={{ background: `linear-gradient(to right, hsl(${bwHsl[0]}, ${bwHsl[1]}%, 5%), hsl(${bwHsl[0]}, ${bwHsl[1]}%, 50%), hsl(${bwHsl[0]}, ${bwHsl[1]}%, 95%))` }}
                  onChange={e => { const n: [number, number, number] = [bwHsl[0], bwHsl[1], +e.target.value]; setBwHsl(n); emit(bgHsl, bgAlpha, radius, n, bw, bwAlpha, false); }}
                  onMouseUp={() => emit(bgHsl, bgAlpha, radius, bwHsl, bw, bwAlpha, true)} />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">Opacity {Math.round(bwAlpha * 100)}%</div>
                <Slider min={0} max={1} step={0.01} value={[bwAlpha]}
                  onValueChange={([a]) => { setBwAlpha(a); emit(bgHsl, bgAlpha, radius, bwHsl, bw, a, false); }}
                  onValueCommit={([a]) => { setBwAlpha(a); emit(bgHsl, bgAlpha, radius, bwHsl, bw, a, true); }} />
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
