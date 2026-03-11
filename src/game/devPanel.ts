/**
 * devPanel.ts — Developer Vex Test Panel
 *
 * A floating HTML overlay for toggling Vexes on/off and setting their rank
 * without going through the shop. Toggle with the backtick key (`).
 *
 * Usage from GameScene:
 *   import { DevPanel } from './devPanel'
 *   const devPanel = new DevPanel(this.activeVexes, (vexes) => this.onDevVexChange(vexes))
 *   this.devPanel = devPanel
 *   devPanel.bindKey()        — attach window keydown listener for backtick
 */

import { STARTER_VEX_FACTORIES, VexId, Vex, upgradeVex } from './vex'

/** Called whenever the panel changes the active Vex list */
export type DevChangeCallback = (activeVexes: Vex[]) => void

const PANEL_ID = 'vextris-dev-panel'

const PANEL_CSS = `
#${PANEL_ID} {
  display: none;
  position: fixed;
  top: 12px;
  right: 12px;
  width: 260px;
  background: rgba(8, 12, 20, 0.96);
  border: 2px solid #444;
  border-radius: 8px;
  z-index: 2000;
  font-family: "Press Start 2P", monospace;
  color: #fff;
  padding: 14px;
  gap: 0;
  box-shadow: 0 0 30px rgba(0,0,0,0.7);
}
#${PANEL_ID}.open { display: block; }

#${PANEL_ID} h3 {
  margin: 0 0 10px;
  font-size: 10px;
  color: #32CD32;
  letter-spacing: 1px;
  border-bottom: 1px solid #333;
  padding-bottom: 8px;
}
#${PANEL_ID} .dev-hint {
  font-size: 7px;
  color: #555;
  margin-bottom: 10px;
}

#${PANEL_ID} .vex-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #1a1a1a;
  gap: 6px;
}
#${PANEL_ID} .vex-name {
  font-size: 8px;
  color: #ccc;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${PANEL_ID} .vex-name.color-kind { color: #FFD700; }
#${PANEL_ID} .vex-name.line-kind  { color: #00BFFF; }

#${PANEL_ID} .rank-btns {
  display: flex;
  gap: 3px;
}
#${PANEL_ID} .rank-btn {
  font-family: "Press Start 2P", monospace;
  font-size: 7px;
  width: 22px;
  height: 22px;
  border: 1px solid #444;
  background: #111;
  color: #666;
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
  line-height: 22px;
  text-align: center;
}
#${PANEL_ID} .rank-btn.active {
  background: #1a3a1a;
  color: #32CD32;
  border-color: #32CD32;
}
#${PANEL_ID} .rank-btn.off {
  background: #111;
  color: #444;
  border-color: #222;
}

#${PANEL_ID} .clear-btn {
  margin-top: 12px;
  width: 100%;
  font-family: "Press Start 2P", monospace;
  font-size: 8px;
  padding: 7px;
  background: #2a0808;
  color: #FF6347;
  border: 1px solid #5a1a1a;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 1px;
}
#${PANEL_ID} .clear-btn:hover { background: #3a1010; }
`

/** Short display names for each Vex */
const VEX_META: Record<VexId, { label: string; kind: 'color' | 'line' }> = {
  blackout: { label: 'Blackout', kind: 'color' },
  fog: { label: 'Fog', kind: 'color' },
  corruption: { label: 'Corruption', kind: 'color' },
  quicksand: { label: 'Quicksand', kind: 'line' },
  amnesia: { label: 'Amnesia', kind: 'line' },
  rising_dread: { label: 'Rising Dread', kind: 'line' },
}

export class DevPanel {
  private el: HTMLElement
  private activeVexes: Vex[]
  private onChange: DevChangeCallback
  /** Tracks current rank selection per ID (0 = off) */
  private state: Map<VexId, 0 | 1 | 2 | 3> = new Map()

  constructor(activeVexes: Vex[], onChange: DevChangeCallback) {
    this.activeVexes = activeVexes
    this.onChange = onChange

    // Seed state from whatever Vexes are already active
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]
    for (const id of allIds) {
      const existing = activeVexes.find(v => v.id === id)
      this.state.set(id, existing ? existing.rank as 1 | 2 | 3 : 0)
    }

    this.el = this.build()
    document.body.appendChild(this.el)
  }

  /**
   * Attach a window-level keydown listener for the backtick key.
   * Using window instead of Phaser's keyboard so it works regardless
   * of which element has focus (Phaser canvas, HTML overlay, etc.).
   */
  bindKey(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === '`') this.toggle()
    })
  }

  toggle(): void {
    this.el.classList.toggle('open')
  }

  /** Call this after activeVexes is reset (e.g. new run) */
  syncFromGame(activeVexes: Vex[]): void {
    this.activeVexes = activeVexes
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]
    for (const id of allIds) {
      const existing = activeVexes.find(v => v.id === id)
      this.state.set(id, existing ? existing.rank as 1 | 2 | 3 : 0)
    }
    this.refreshUI()
  }

  destroy(): void {
    this.el.remove()
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private build(): HTMLElement {
    this.injectCSS()

    const panel = document.createElement('div')
    panel.id = PANEL_ID

    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]

    panel.innerHTML = `
      <h3>⚙ DEV — VEXES</h3>
      <div class="dev-hint">Backtick (\`) to close</div>
      ${allIds.map(id => this.rowHTML(id)).join('')}
      <button class="clear-btn" id="dev-clear-vexes">CLEAR ALL</button>
    `

    // Attach rank button handlers
    for (const id of allIds) {
      for (const rank of [1, 2, 3] as const) {
        const btn = panel.querySelector<HTMLButtonElement>(`[data-vex="${id}"][data-rank="${rank}"]`)
        btn?.addEventListener('click', () => this.handleRankClick(id, rank))
      }
    }

    panel.querySelector('#dev-clear-vexes')?.addEventListener('click', () => this.clearAll())

    return panel
  }

  private rowHTML(id: VexId): string {
    const meta = VEX_META[id]
    const cur = this.state.get(id) ?? 0

    const rankBtn = (r: 1 | 2 | 3) => {
      const cls = cur === r ? 'rank-btn active' : cur === 0 ? 'rank-btn off' : 'rank-btn'
      return `<button class="${cls}" data-vex="${id}" data-rank="${r}">${['I', 'II', 'III'][r - 1]}</button>`
    }

    return `
      <div class="vex-row" id="dev-row-${id}">
        <span class="vex-name ${meta.kind}-kind">${meta.label}</span>
        <div class="rank-btns">
          ${rankBtn(1)}${rankBtn(2)}${rankBtn(3)}
        </div>
      </div>
    `
  }

  private handleRankClick(id: VexId, rank: 1 | 2 | 3): void {
    const cur = this.state.get(id) ?? 0

    if (cur === rank) {
      // Toggle off
      this.removeVex(id)
      this.state.set(id, 0)
    } else if (cur === 0) {
      // Add new at rank
      this.addVex(id, rank)
      this.state.set(id, rank)
    } else {
      // Change rank
      const vex = this.activeVexes.find(v => v.id === id)
      if (vex) {
        const oldRank = vex.rank as 1 | 2 | 3
        upgradeVex(vex, rank)
        vex.onRankChange?.(oldRank, rank)
      }
      this.state.set(id, rank)
    }

    this.refreshUI()
    this.onChange(this.activeVexes)
  }

  private addVex(id: VexId, rank: 1 | 2 | 3): void {
    const vex = STARTER_VEX_FACTORIES[id](rank)
    this.activeVexes.push(vex)
    vex.onApply?.(rank)
  }

  private removeVex(id: VexId): void {
    const idx = this.activeVexes.findIndex(v => v.id === id)
    if (idx !== -1) this.activeVexes.splice(idx, 1)
    // Disable the effect — call disableFn if available in future
    // For now: effects clean themselves up when replaced/disabled
  }

  private clearAll(): void {
    // Fire onRankChange/disable for each active Vex if needed
    this.activeVexes.splice(0, this.activeVexes.length)
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]
    for (const id of allIds) this.state.set(id, 0)
    this.refreshUI()
    this.onChange(this.activeVexes)
  }

  private refreshUI(): void {
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]
    for (const id of allIds) {
      const cur = this.state.get(id) ?? 0
      for (const rank of [1, 2, 3] as const) {
        const btn = this.el.querySelector<HTMLButtonElement>(`[data-vex="${id}"][data-rank="${rank}"]`)
        if (!btn) continue
        btn.className = cur === rank ? 'rank-btn active' : cur === 0 ? 'rank-btn off' : 'rank-btn'
      }
    }
  }

  private cssInjected = false
  private injectCSS(): void {
    if (this.cssInjected) return
    this.cssInjected = true
    const style = document.createElement('style')
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
  }
}
