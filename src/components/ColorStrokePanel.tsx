import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Palette } from 'lucide-react';

// Parse hsl string to components
function parseHsl(color?: string): [number, number, number] {
  if (!color) return [185, 80, 50];
  const m = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*\)/);
  if (m) return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  // Named colors fallback
  const NAMED: Record<string, [number, number, number]> = {
    red: [0, 80, 55], green: [120, 70, 45], blue: [210, 80, 55],
    yellow: [50, 90, 50], orange: [30, 90, 55], purple: [280, 70, 55],
    pink: [340, 80, 60], cyan: [185, 80, 50], white: [0, 0, 100],
    black: [0, 0, 10], gray: [0, 0, 50], grey: [0, 0, 50],
  };
  return NAMED[color.toLowerCase()] || [185, 80, 50];
}

function hslToString(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

interface ColorStrokePanelProps {
  color?: string;
  opacity?: number;
  background?: string;
  strokeWidth?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  onColorChange: (color: string, opacity: number, isFinal: boolean) => void;
  onBackgroundChange: (background: string, isFinal: boolean) => void;
  onStrokeChange: (width: number, color: string, opacity: number, isFinal: boolean) => void;
  style?: React.CSSProperties;
}

const RING_SIZE = 116;
const CX = RING_SIZE / 2;
const CY = RING_SIZE / 2;
const OUTER_R = 50;
const INNER_R = 32;
const SEGMENTS = 72;

// Generate arc path for one segment
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

const ColorWheel: React.FC<{
  hue: number;
  saturation: number;
  lightness: number;
  onHueChange: (h: number, final: boolean) => void;
}> = ({ hue, saturation, lightness, onHueChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const getHueFromEvent = useCallback((clientX: number, clientY: number): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - CX;
    const y = clientY - rect.top - CY;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    return ((angle / (2 * Math.PI)) * 360 + 360) % 360;
  }, []);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    onHueChange(getHueFromEvent(clientX, clientY), false);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      onHueChange(getHueFromEvent(clientX, clientY), false);
    };
    const onEnd = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const clientX = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'changedTouches' in e ? (e as TouchEvent).changedTouches[0].clientY : (e as MouseEvent).clientY;
      onHueChange(getHueFromEvent(clientX, clientY), true);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [onHueChange, getHueFromEvent]);

  const indicatorAngle = (hue / 360) * 2 * Math.PI - Math.PI / 2;
  const indicatorR = (OUTER_R + INNER_R) / 2;
  const indicatorX = CX + indicatorR * Math.cos(indicatorAngle);
  const indicatorY = CY + indicatorR * Math.sin(indicatorAngle);

  return (
    <svg
      ref={svgRef}
      width={RING_SIZE}
      height={RING_SIZE}
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <path
          key={i}
          d={arcPath(i, SEGMENTS, OUTER_R, INNER_R, CX, CY)}
          fill={`hsl(${(i / SEGMENTS) * 360}, ${saturation}%, ${lightness}%)`}
        />
      ))}
      {/* Center color preview */}
      <circle cx={CX} cy={CY} r={INNER_R - 3} fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`} />
      {/* Indicator dot */}
      <circle
        cx={indicatorX}
        cy={indicatorY}
        r={6}
        fill="none"
        stroke="white"
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }}
      />
      <circle
        cx={indicatorX}
        cy={indicatorY}
        r={4}
        fill={`hsl(${hue}, ${saturation}%, ${lightness}%)`}
        stroke="white"
        strokeWidth={1.5}
      />
    </svg>
  );
};

export const ColorStrokePanel: React.FC<ColorStrokePanelProps> = ({
  color,
  opacity = 1,
  background,
  strokeWidth = 0,
  strokeColor,
  strokeOpacity = 1,
  onColorChange,
  onBackgroundChange,
  onStrokeChange,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'fill' | 'bg' | 'stroke'>('fill');

  const [hsl, setHsl] = useState<[number, number, number]>(() => parseHsl(color));
  const [alpha, setAlpha] = useState(opacity);
  
  const [bgHsl, setBgHsl] = useState<[number, number, number]>(() => parseHsl(background));
  
  const [strokeHsl, setStrokeHsl] = useState<[number, number, number]>(() => parseHsl(strokeColor));
  const [strokeW, setStrokeW] = useState(strokeWidth);
  const [strokeAlpha, setStrokeAlpha] = useState(strokeOpacity);

  // Sync from outside when selection changes
  useEffect(() => { setHsl(parseHsl(color)); setAlpha(opacity); }, [color, opacity]);
  useEffect(() => { setBgHsl(parseHsl(background)); }, [background]);
  useEffect(() => {
    setStrokeHsl(parseHsl(strokeColor));
    setStrokeW(strokeWidth);
    setStrokeAlpha(strokeOpacity);
  }, [strokeColor, strokeWidth, strokeOpacity]);

  const panelRef = useRef<HTMLDivElement>(null);
  
  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const currentColor = hslToString(hsl[0], hsl[1], hsl[2]);
  const currentStrokeColor = hslToString(strokeHsl[0], strokeHsl[1], strokeHsl[2]);

  return (
    <div ref={panelRef} style={style} className="absolute z-30 pointer-events-auto">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card/90 border border-border backdrop-blur-sm hover:border-primary/50 transition-colors shadow-lg"
        title="Color & Border"
      >
        <div
          className="w-4 h-4 rounded-full border border-border"
          style={{ background: `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)` }}
        />
        <Palette className="w-3.5 h-3.5 text-muted-foreground" />
        {strokeW > 0 && (
          <div
            className="w-4 h-4 rounded-full border-2"
            style={{ borderColor: currentStrokeColor, background: 'transparent' }}
          />
        )}
      </button>

      {/* Dropdown popup */}
      {isOpen && (
        <div className="absolute top-full mt-1.5 left-0 w-[200px] bg-card border border-border rounded-xl shadow-2xl p-3 space-y-3 z-40">
          {/* Section tabs */}
          <div className="flex rounded-md overflow-hidden border border-border text-[11px] font-medium">
            <button
              type="button"
              className={cn("flex-1 py-1 transition-colors", activeSection === 'fill' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              onClick={() => setActiveSection('fill')}
            >Fill</button>
            <button
              type="button"
              className={cn("flex-1 py-1 transition-colors", activeSection === 'bg' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              onClick={() => setActiveSection('bg')}
            >BG</button>
            <button
              type="button"
              className={cn("flex-1 py-1 transition-colors", activeSection === 'stroke' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              onClick={() => setActiveSection('stroke')}
            >Border</button>
          </div>

          {activeSection === 'fill' ? (
            <>
              {/* Color wheel */}
              <div className="flex justify-center">
                <ColorWheel
                  hue={hsl[0]}
                  saturation={hsl[1]}
                  lightness={hsl[2]}
                  onHueChange={(h, final) => {
                    const newHsl: [number, number, number] = [h, hsl[1], hsl[2]];
                    setHsl(newHsl);
                    onColorChange(hslToString(newHsl[0], newHsl[1], newHsl[2]), alpha, final);
                  }}
                />
              </div>

              {/* Saturation slider */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Saturation {Math.round(hsl[1])}%</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={hsl[1]}
                  onChange={(e) => {
                    const s = parseInt(e.target.value);
                    const newHsl: [number, number, number] = [hsl[0], s, hsl[2]];
                    setHsl(newHsl);
                    onColorChange(hslToString(...newHsl), alpha, false);
                  }}
                  onMouseUp={() => onColorChange(currentColor, alpha, true)}
                  onTouchEnd={() => onColorChange(currentColor, alpha, true)}
                  className="color-slider w-full"
                  style={{
                    background: `linear-gradient(to right, hsl(${hsl[0]}, 0%, ${hsl[2]}%), hsl(${hsl[0]}, 100%, ${hsl[2]}%))`
                  }}
                />
              </div>

              {/* Lightness slider */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Lightness {Math.round(hsl[2])}%</div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={1}
                  value={hsl[2]}
                  onChange={(e) => {
                    const l = parseInt(e.target.value);
                    const newHsl: [number, number, number] = [hsl[0], hsl[1], l];
                    setHsl(newHsl);
                    onColorChange(hslToString(...newHsl), alpha, false);
                  }}
                  onMouseUp={() => onColorChange(currentColor, alpha, true)}
                  onTouchEnd={() => onColorChange(currentColor, alpha, true)}
                  className="color-slider w-full"
                  style={{
                    background: `linear-gradient(to right, hsl(${hsl[0]}, ${hsl[1]}%, 10%), hsl(${hsl[0]}, ${hsl[1]}%, 50%), hsl(${hsl[0]}, ${hsl[1]}%, 90%))`
                  }}
                />
              </div>

              {/* Opacity slider */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Opacity α = {Math.round(alpha * 100)}%</div>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[alpha]}
                  onValueChange={([a]) => { setAlpha(a); onColorChange(currentColor, a, false); }}
                  onValueCommit={([a]) => { setAlpha(a); onColorChange(currentColor, a, true); }}
                />
              </div>
            </>
          ) : activeSection === 'bg' ? (
            <>
              {/* Background color wheel */}
              <div className="flex justify-center">
                <ColorWheel
                  hue={bgHsl[0]}
                  saturation={bgHsl[1]}
                  lightness={bgHsl[2]}
                  onHueChange={(h, final) => {
                    const newHsl: [number, number, number] = [h, bgHsl[1], bgHsl[2]];
                    setBgHsl(newHsl);
                    onBackgroundChange(hslToString(...newHsl), final);
                  }}
                />
              </div>
              {/* BG Saturation */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Saturation {Math.round(bgHsl[1])}%</div>
                <input
                  type="range" min={0} max={100} step={1} value={bgHsl[1]}
                  onChange={(e) => {
                    const s = parseInt(e.target.value);
                    const newHsl: [number, number, number] = [bgHsl[0], s, bgHsl[2]];
                    setBgHsl(newHsl);
                    onBackgroundChange(hslToString(...newHsl), false);
                  }}
                  onMouseUp={() => onBackgroundChange(hslToString(...bgHsl), true)}
                  onTouchEnd={() => onBackgroundChange(hslToString(...bgHsl), true)}
                  className="color-slider w-full"
                  style={{ background: `linear-gradient(to right, hsl(${bgHsl[0]}, 0%, ${bgHsl[2]}%), hsl(${bgHsl[0]}, 100%, ${bgHsl[2]}%))` }}
                />
              </div>
              {/* BG Lightness */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Lightness {Math.round(bgHsl[2])}%</div>
                <input
                  type="range" min={10} max={90} step={1} value={bgHsl[2]}
                  onChange={(e) => {
                    const l = parseInt(e.target.value);
                    const newHsl: [number, number, number] = [bgHsl[0], bgHsl[1], l];
                    setBgHsl(newHsl);
                    onBackgroundChange(hslToString(...newHsl), false);
                  }}
                  onMouseUp={() => onBackgroundChange(hslToString(...bgHsl), true)}
                  onTouchEnd={() => onBackgroundChange(hslToString(...bgHsl), true)}
                  className="color-slider w-full"
                  style={{ background: `linear-gradient(to right, hsl(${bgHsl[0]}, ${bgHsl[1]}%, 10%), hsl(${bgHsl[0]}, ${bgHsl[1]}%, 50%), hsl(${bgHsl[0]}, ${bgHsl[1]}%, 90%))` }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Stroke width (fraction of cell size, 0..0.5) */}
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Width: {(strokeW * 100).toFixed(1)}% ({strokeW.toFixed(3)})</div>
                <Slider
                  min={0}
                  max={0.5}
                  step={0.005}
                  value={[strokeW]}
                  onValueChange={([w]) => { setStrokeW(w); onStrokeChange(w, currentStrokeColor, strokeAlpha, false); }}
                  onValueCommit={([w]) => { setStrokeW(w); onStrokeChange(w, currentStrokeColor, strokeAlpha, true); }}
                />
              </div>

              {strokeW > 0 && (
                <>
                  {/* Stroke color wheel */}
                  <div className="flex justify-center">
                    <ColorWheel
                      hue={strokeHsl[0]}
                      saturation={strokeHsl[1]}
                      lightness={strokeHsl[2]}
                      onHueChange={(h, final) => {
                        const newHsl: [number, number, number] = [h, strokeHsl[1], strokeHsl[2]];
                        setStrokeHsl(newHsl);
                        const sc = hslToString(...newHsl);
                        onStrokeChange(strokeW, sc, strokeAlpha, final);
                      }}
                    />
                  </div>

                  {/* Stroke saturation */}
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Saturation {Math.round(strokeHsl[1])}%</div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={strokeHsl[1]}
                      onChange={(e) => {
                        const s = parseInt(e.target.value);
                        const newHsl: [number, number, number] = [strokeHsl[0], s, strokeHsl[2]];
                        setStrokeHsl(newHsl);
                        onStrokeChange(strokeW, hslToString(...newHsl), strokeAlpha, false);
                      }}
                      onMouseUp={() => onStrokeChange(strokeW, currentStrokeColor, strokeAlpha, true)}
                      onTouchEnd={() => onStrokeChange(strokeW, currentStrokeColor, strokeAlpha, true)}
                      className="color-slider w-full"
                      style={{
                        background: `linear-gradient(to right, hsl(${strokeHsl[0]}, 0%, ${strokeHsl[2]}%), hsl(${strokeHsl[0]}, 100%, ${strokeHsl[2]}%))`
                      }}
                    />
                  </div>

                  {/* Stroke lightness */}
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Lightness {Math.round(strokeHsl[2])}%</div>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={1}
                      value={strokeHsl[2]}
                      onChange={(e) => {
                        const l = parseInt(e.target.value);
                        const newHsl: [number, number, number] = [strokeHsl[0], strokeHsl[1], l];
                        setStrokeHsl(newHsl);
                        onStrokeChange(strokeW, hslToString(...newHsl), strokeAlpha, false);
                      }}
                      onMouseUp={() => onStrokeChange(strokeW, currentStrokeColor, strokeAlpha, true)}
                      onTouchEnd={() => onStrokeChange(strokeW, currentStrokeColor, strokeAlpha, true)}
                      className="color-slider w-full"
                      style={{
                        background: `linear-gradient(to right, hsl(${strokeHsl[0]}, ${strokeHsl[1]}%, 10%), hsl(${strokeHsl[0]}, ${strokeHsl[1]}%, 50%), hsl(${strokeHsl[0]}, ${strokeHsl[1]}%, 90%))`
                      }}
                    />
                  </div>

                  {/* Stroke opacity */}
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Opacity α = {Math.round(strokeAlpha * 100)}%</div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[strokeAlpha]}
                      onValueChange={([a]) => { setStrokeAlpha(a); onStrokeChange(strokeW, currentStrokeColor, a, false); }}
                      onValueCommit={([a]) => { setStrokeAlpha(a); onStrokeChange(strokeW, currentStrokeColor, a, true); }}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
