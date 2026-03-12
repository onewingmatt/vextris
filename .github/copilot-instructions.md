# Vextris: Copilot Instructions

## Project Overview

Vextris is a Tetris-inspired puzzle game built with **Phaser 3**, **TypeScript**, and **Vite**. The unique mechanic is a "Vex" curse system: players can acquire increasingly-powerful downsides (visual and gameplay penalties) in exchange for scoring multipliers. The game progresses through 10 levels, each with increased difficulty and new Vex offerings.

**Architecture:**
- **GameScene** (src/game/scenes/GameScene.ts) - Main game loop; handles piece placement, gravity, line clearing, scoring, and level progression
- **Vex System** (src/game/vex.ts) - Abstract "curse" system; each Vex applies visual effects and modifies scoring via a multiplier system
- **Shop System** (src/game/shop.ts) - Between-level UI overlay; offers new Vexes or rank-ups (1–3) based on active Vex count
- **Effects** (src/game/effects/) - Visual modifiers (fog, blackout) triggered by active Vexes

## Build & Development

### Commands
- **`npm run dev`** - Start Vite dev server (port 3000)
- **`npm run build`** - Compile TypeScript, then bundle with Vite (output: `dist/`)
- **`npm run preview`** - Preview the production build locally

### TypeScript Configuration
- Target: **ES2020**
- Strict mode enabled; unused locals/parameters are errors
- No emit (type-checking only; compilation handled by Vite)

## Key Conventions & Patterns

### Scoring System
The scoring formula uses **two independent multiplier buckets**:
1. **Color multiplier** - scales `totalClusterPoints` (sum of cluster sizes squared)
2. **Line multiplier** - scales `linesCleared` count

Formula: `(totalClusterPoints × colorMult) × (linesCleared × lineMult)`

Every Vex's `getMultiplier(context)` returns a number added to its bucket. The `ScoringContext` type (in vex.ts) carries all move-specific data (lines cleared, clusters, colors, combo, time, level).

### Piece & Board State
- **Board**: 10×18 grid of `Cell` objects; gravity-based physics with Game Boy-style delay table
- **Input handling**: DAS (Delayed Auto Shift, 16 frames) + ARR (Auto Repeat Rate, 6 frames); soft drop has no delay
- **Piece hold**: Can hold once per lock; resets on piece lock
- **Gravity table**: Decreases frames-per-drop at each level, capping at 1 frame (NES Tetris style)

### Level Progression
- Starts at level 1, advances every 10 lines cleared
- Each level has `LevelParams` (in config.ts): `Resolve` meter, time limit, allowed Vex pool
- **Resolve** is a resource that drains real-time (−0.5/s) and per-piece (−1); runs out → level ends
- New Vexes unlock in the shop based on progression level

### Vex Architecture
- **VexId**: Unique identifier (e.g., "darkness", "blur")
- **VexKind**: Either `'color'` or `'line'` (which multiplier bucket it affects)
- **Rank**: 1–3; higher rank = stronger effect and multiplier
- **Factory Functions**: `createDarkness()`, `createBlur()`, etc.; return a Vex object
- **Active Vexes**: Stored in GameScene; each Vex's `enable()` and `disable()` methods manage visual effects (via `enableFog`, `disableBlackout`, etc.)

### Effect System
- Effects are toggled via `enable()`/`disable()` functions (e.g., `enableFog`, `disableFog`)
- Stacking: Multiple active Vexes can enable the same effect; use a reference count or boolean check to avoid double-enabling
- Overlay rendering: Done via Canvas API within Phaser's render pipeline

## File Structure Reference

```
src/
├── main.ts                    # Entry point; creates Phaser game instance
├── config.ts                  # Game constants (board size, gravity, pieces, colors)
├── vex.ts                     # Vex type definitions & factory functions
├── vexBar.ts                  # UI component showing active Vexes
├── shop.ts                    # Shop overlay UI (HTML/CSS + logic)
├── devPanel.ts                # Dev tools (level skip, score editor, etc.)
├── game/
│   ├── config.ts              # Export game constants
│   ├── scenes/
│   │   └── GameScene.ts       # Main game loop & state management
│   ├── effects/
│   │   ├── fog.ts             # Fog visual effect
│   │   └── blackout.ts        # Blackout visual effect
│   ├── vexBar.ts              # Render active Vex display
│   └── shop.ts                # Shop UI
```

## Common Workflows

### Adding a New Vex
1. Define factory in `vex.ts`: `export function createMyVex(rank: 1|2|3): Vex { ... }`
2. Add to `STARTER_VEX_FACTORIES` array
3. If visual effect needed, create/add to `effects/` directory
4. Test via shop by setting `currentLevel` to unlock it

### Modifying Scoring
- Adjust `getMultiplier()` in the Vex to change multiplier value
- If changing the formula itself, update `GameScene.moveScore` calculation and the docstring in `vex.ts`

### Debugging Level/Progression
- Use `DevPanel` to skip levels, set score, inspect state
- Check `currentLevelParams` in GameScene for Resolve meter behavior
- Gravity table is indexed by `level` (0-based); verify `GRAVITY_TABLE[level]` exists before referencing

## MCP Server Configuration

### Playwright MCP
For browser automation and game integration testing:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-playwright"]
    }
  }
}
```
Use for: Automated visual regression testing, end-to-end game flow validation, headless browser testing.

### Puppeteer MCP
For alternative browser automation:
```json
{
  "mcpServers": {
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
    }
  }
}
```
Use for: Screenshot capture, performance profiling, DOM inspection during gameplay.

## Notes

- **Rendering**: Phaser handles most rendering; effects overlay the canvas via Canvas API
- **Frame-based timing**: All input & gravity logic uses frame counts (assumes 60 FPS)
- **Type safety**: Use exported types from `config.ts` and `vex.ts` to catch mismatches early
