# UniComp Editor

A React + TypeScript frontend application for editing and rendering UniComp specifications — a custom format for defining grid-based symbolic compositions.

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS v3 + shadcn/ui components
- **Routing**: React Router DOM v6
- **State/Data**: TanStack React Query
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts

## Project Structure

```
src/
  components/       # UI components including UniCompRenderer, panels, controls
  hooks/            # Custom React hooks
  lib/              # Core logic: unicomp-parser.ts, utilities
  pages/            # Route pages (Index, NotFound)
  App.tsx           # Root app with providers and routing
  main.tsx          # Entry point
```

## Development

- Dev server runs on port 5000 (`npm run dev`)
- Workflow: "Start application" → `npm run dev`

## Deployment

- Target: Static site
- Build: `npm run build` → outputs to `dist/`

## Notable Fixes Applied During Import

- Fixed syntax error in `vite.config.ts` (missing comma after `strictPort`)
- Fixed `=>` instead of `return` in `src/components/UniCompRenderer.tsx` (lines ~154-165)
- Fixed `interface` used for union type in `src/lib/unicomp-parser.ts` → changed to `type ParseResult`
- Removed duplicate re-export block at end of `src/lib/unicomp-parser.ts`
