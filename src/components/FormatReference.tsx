import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const Section: React.FC<{
  id: string;
  title: string;
  active: string | null;
  toggle: (id: string) => void;
  children: React.ReactNode;
}> = ({ id, title, active, toggle, children }) => (
  <div>
    <button
      type="button"
      onClick={() => toggle(id)}
      className="flex items-center gap-1 font-medium text-foreground mb-2 w-full text-left text-sm hover:text-primary transition-colors"
    >
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${active === id ? 'rotate-180' : ''}`} />
      {title}
    </button>
    {active === id && (
      <div className="space-y-3 border-l-2 border-primary/20 pl-3 mt-2">
        {children}
      </div>
    )}
  </div>
);

const SubGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">{label}</p>
    <ul className="space-y-1 text-muted-foreground text-xs">{children}</ul>
  </div>
);

const P: React.FC<{ code: string; desc: string }> = ({ code, desc }) => (
  <li><span className="text-primary font-mono">{code}</span> — {desc}</li>
);

export const FormatReference: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<string | null>(null);

  const toggleSection = (id: string) => {
    setActiveSection(prev => prev === id ? null : id);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        <span>Format Reference</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div className="space-y-4 text-sm">

          {/* ── Basic Syntax ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Basic Syntax</h4>
            <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
              (W×H)[g=...;pg=...;gc=...;gb=...]:symbol[params]start-end;...
            </code>
            <p className="text-xs text-muted-foreground mt-1.5">
              Grid: <code className="bg-secondary/50 px-1 rounded">(N)</code> square or <code className="bg-secondary/50 px-1 rounded">(W×H)</code> rectangular
            </p>
          </div>

          {/* ── Grid Size ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Grid Size</h4>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li><span className="text-primary font-mono">(5)</span> — square 5×5</li>
              <li><span className="text-primary font-mono">(10×3)</span> — rectangular 10 cols × 3 rows</li>
              <li><span className="text-primary font-mono">(8x4)</span> — lowercase x also works</li>
            </ul>
          </div>

          {/* ── Symbol Parameters (full schema) ── */}
          <Section id="params" title="Symbol Parameters" active={activeSection} toggle={toggleSection}>
            {/* Compact preview */}
            <code className="block bg-secondary/50 p-2 rounded text-xs font-mono mb-2 break-all leading-relaxed">
              [id= ;z= ;l= ;v= ;d= ;po= ;f= ;m= ;sp= ;w= ;r= ;st= ;c= ;b= ;bc= ;bb= ;k= ;t= ;p= ]
            </code>

            <SubGroup label="Identity & Content">
              <P code="id=" desc="unique ID, referenced via #id" />
              <P code="z=" desc="plane index (Z-depth in scene)" />
              <P code="l=" desc="layer index within a plane" />
              <P code="v=" desc="simbols for streaming or payload: glyph, $svg, #id" />
            </SubGroup>

            <SubGroup label="Static Geometry (baked)">
              <P code="d=" desc="final cell range [start, end] for streaming" />
              <P code="po=" desc="grid bounds [start, end]" />
              <P code="g=" desc="grid bounds [start, end]" />
              <P code="pg=" desc="grid bounds [start, end]" />
            </SubGroup>

            <SubGroup label="Transform Vector (strict order 0→5)">
              <P code="f=" desc="0 — flip: h, v, hv" />
              <P code="m=" desc="1 — margin (object-fit compression)" />
              <P code="sp=" desc="2 — skew / parallelogram (angle, force)" />
              <P code="w=" desc="3 — warp (non-linear distortion)" />
              <P code="r=" desc="4 — rotation (degrees)" />
              <P code="st=" desc="5 — perspective / taper (trapezoid)" />
            </SubGroup>

            <SubGroup label="Style: Symbol">
              <P code="c=" desc="symbol face color (HSLA, r)" />
              <P code="b=" desc="symbol border (HLSA, w)" />
            </SubGroup>

            <SubGroup label="Style: Layer">
              <P code="bc=" desc="layer background fill (HSLA, r)" />
              <P code="bb=" desc="layer border (container stroke) (HSLA, w)" />
            </SubGroup>

            <SubGroup label="Style: Grid">
              <P code="gc=" desc="grid background color  (HSLA, r)" />
              <P code="gb=" desc="grid border (outer frame) (HSLA, w)" />
            </SubGroup>

            <SubGroup label="State & Animation">
              <P code="k=" desc="keyframe index" />
              <P code="t=" desc="transition duration (ms)" />
              <P code="p=" desc="play state: 0, 1, 01, 10, 010, 101, 100, 001, 000" />
            </SubGroup>
          </Section>

          {/* ── Content Prefixes ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Content Prefixes</h4>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li><span className="text-primary font-mono">"text"</span> — direct string / glyph literal</li>
              <li><span className="text-primary font-mono">#id</span> — reference by ID</li>
              <li><span className="text-primary font-mono">$url</span> — external resource (SVG, PNG, URL)</li>
            </ul>
          </div>

          {/* ── Streaming & History Blocks ── */}
          <Section id="streaming" title="Streaming & History" active={activeSection} toggle={toggleSection}>
            <p className="text-xs text-muted-foreground">
              Parameters can be split across multiple <code className="bg-secondary/50 px-1 rounded">[]</code> blocks.
            </p>

            <SubGroup label="Single block">
              <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
                A[r=45;st=90 30;c=red]0-24
              </code>
            </SubGroup>

            <SubGroup label="Streaming (split blocks)">
              <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
                A[r=45][st=90 30][c=red]0-24
              </code>
            </SubGroup>

            <SubGroup label="Delta operations">
              <P code="r=45" desc="absolute assignment" />
              <P code="r+=45" desc="relative delta (add)" />
              <P code="r-=45" desc="relative delta (subtract)" />
              <P code="r>=45" desc="relative delta (add)" />
              <P code="r<=45" desc="relative delta (subtract)" />
            </SubGroup>

            <SubGroup label="History blocks">
              <code className="block bg-secondary/50 p-2 rounded text-xs font-mono leading-relaxed">
                A[r=0][r+=45][st+=90 30][op=4 24]0-24
              </code>
            </SubGroup>

            <SubGroup label="Keyframe blocks (k=)">
              <code className="block bg-secondary/50 p-2 rounded text-xs font-mono leading-relaxed">
                A[k=0;t=0;r=0][k=1;t=2000;r+=360]0-24
              </code>
              <li className="list-none text-xs text-muted-foreground mt-1">
                <span className="font-mono text-primary">k=N</span> — keyframe index,
                <span className="font-mono text-primary"> t=</span> — duration in ms.
              </li>
            </SubGroup>
            
            <SubGroup label="Streaming use (v=) & (d=)">
              <code className="block bg-secondary/50 p-2 rounded text-xs font-mono leading-relaxed">
                [v="A";d=0 24;k=0;t=0;r=0][k=1;t=2;r+=360];
              </code>
              <li className="list-none text-xs text-muted-foreground mt-1">
                <span className="font-mono text-primary">v=A</span> — simbols,
                <span className="font-mono text-primary"> d=</span> — overall positioning.
              </li>
            </SubGroup>
          </Section>

          {/* ── Play States ── */}
          <Section id="playstates" title="Play States (p=)" active={activeSection} toggle={toggleSection}>
            <P code="0" desc="static start (pause at first frame)" />
            <P code="1" desc="static end (pause at last frame)" />
            <P code="01" desc="forward (one-shot playback)" />
            <P code="10" desc="reverse (one-shot reverse)" />
            <P code="010" desc="ping-pong loop" />
            <P code="101" desc="reverse ping-pong loop" />
            <P code="100 / 001" desc="clear queue (keep first/last frame)" />
            <P code="000" desc="delete layer (garbage collection)" />
          </Section>
          
          {/* ── Index Formula ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Index Formula</h4>
            <code className="block bg-secondary/50 p-2 rounded text-xs font-mono">
              index = Y × W + X
            </code>
            <p className="text-xs text-muted-foreground mt-1">
              where X, Y — coordinates, W — grid width
            </p>
          </div>

          {/* ── Comments ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Comments</h4>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li><span className="text-primary font-mono"># comment</span></li>
              <li><span className="text-primary font-mono">// comment</span></li>
              <li><span className="text-primary font-mono">-- comment</span></li>
              <li><span className="text-primary font-mono">/* block */</span></li>
            </ul>
          </div>

          {/* ── Rendering Order ── */}
          <Section id="render" title="Rendering Order (11 layers)" active={activeSection} toggle={toggleSection}>
            <SubGroup label="Group 1 — Grid">
              <P code="1" desc="Grid Background (gc)" />
              <P code="2" desc="Grid Border (gb)" />
              <P code="3" desc="Grid subdivision lines" />
              <P code="4" desc="Cell index labels (editor only)" />
            </SubGroup>
            <SubGroup label="Group 2 — Layer">
              <P code="5" desc="Layer Background (bc)" />
              <P code="6" desc="Layer Border (bb)" />
            </SubGroup>
            <SubGroup label="Group 3 — Symbol">
              <P code="7" desc="Symbol Face (v + c)" />
              <P code="7.1" desc="Shadow / Glow mask" />
              <P code="8" desc="Symbol Border (b)" />
              <P code="9" desc="Special Effects (WebGL)" />
              <P code="10" desc="Alpha Correction mask" />
            </SubGroup>
          </Section>

          {/* ── Layers ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Layers</h4>
            <p className="text-xs text-muted-foreground">
              Lower <span className="font-mono text-primary">l=</span> → drawn first (farther).<br/>
              Higher <span className="font-mono text-primary">l=</span> → drawn last (closer).
            </p>
          </div>
          
          {/* ── Layers ── */}
          <div>
            <h4 className="font-medium text-foreground mb-2">Playn</h4>
            <p className="text-xs text-muted-foreground">
              Range <span className="font-mono text-primary">z=</span> →  unbroken numerical sequence of layers l=
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
