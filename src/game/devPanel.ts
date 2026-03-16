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
import { audioManager, SfxId } from './audio'

/** Called whenever the panel changes the active Vex list */
export type DevChangeCallback = (activeVexes: Vex[]) => void

const PANEL_ID = 'vextris-dev-panel'

const PANEL_CSS = `
#${PANEL_ID} {
  display: none;
  position: fixed;
  top: 12px;
  right: 12px;
  width: min(360px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  background: rgba(16, 12, 22, 0.96);
  border: 2px solid #5a3a42;
  border-radius: 8px;
  z-index: 2000;
  font-family: "Press Start 2P", monospace;
  color: #e8d9c8;
  padding: 14px;
  gap: 0;
  box-shadow: 0 0 30px rgba(0,0,0,0.74);
  touch-action: none;
  overflow-y: auto;
}
#${PANEL_ID}.open { display: block; }

#${PANEL_ID}-toggle {
  position: fixed;
  bottom: 16px;
  left: 16px;
  width: 46px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(16, 12, 22, 0.7);
  color: rgba(255, 255, 255, 0.85);
  font-family: "Press Start 2P", monospace;
  font-size: 10px;
  cursor: pointer;
  z-index: 2000;
  transition: transform 0.1s ease, opacity 0.25s ease;
}
#${PANEL_ID}-toggle:hover {
  transform: translateY(-1px);
}
#${PANEL_ID}-toggle:active {
  transform: translateY(0);
}
#${PANEL_ID}-toggle.hidden {
  opacity: 0;
  pointer-events: none;
}

#${PANEL_ID} h3 {
  margin: 0 0 10px;
  font-size: 10px;
  color: #d6b07a;
  letter-spacing: 1px;
  border-bottom: 1px solid #4a2d35;
  padding-bottom: 8px;
}
#${PANEL_ID} .dev-hint {
  font-size: 7px;
  color: #8f7d70;
  margin-bottom: 10px;
}

#${PANEL_ID} .vex-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #2a1f2a;
  gap: 6px;
}
#${PANEL_ID} .vex-name {
  font-size: 8px;
  color: #d4c2b2;
  flex: 1;
  line-height: 1.4;
  padding-right: 4px;
}
#${PANEL_ID} .vex-name.color-kind { color: #caa56c; }
#${PANEL_ID} .vex-name.line-kind  { color: #89acb8; }

#${PANEL_ID} .rank-btns {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex: 0 0 auto;
}
#${PANEL_ID} .rank-btn {
  font-family: "Press Start 2P", monospace;
  font-size: 6px;
  width: 18px;
  height: 18px;
  border: 1px solid #5a3a42;
  background: #19121f;
  color: #8f7d70;
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
  line-height: 18px;
  text-align: center;
}
#${PANEL_ID} .rank-btn.active {
  background: #2a1c21;
  color: #d6b07a;
  border-color: #d6b07a;
}
#${PANEL_ID} .rank-btn.off {
  background: #19121f;
  color: #5f4f58;
  border-color: #2b202f;
}

#${PANEL_ID} .clear-btn {
  margin-top: 12px;
  width: 100%;
  font-family: "Press Start 2P", monospace;
  font-size: 8px;
  padding: 7px;
  background: #2a1215;
  color: #c97567;
  border: 1px solid #704048;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 1px;
}
#${PANEL_ID} .clear-btn:hover { background: #3a171b; }

@media (max-width: 700px) {
  #${PANEL_ID} {
    top: 8px;
    right: 8px;
    left: 8px;
    width: auto;
    max-height: calc(100vh - 16px);
    padding: 12px;
  }
}
`

/** Short display names for each Vex */
const VEX_META: Record<VexId, { label: string; kind: 'color' | 'line' }> = {
  blackout: { label: 'Blackout', kind: 'color' },
  fog: { label: 'Fog', kind: 'color' },
  corruption: { label: 'Corruption', kind: 'color' },
  quicksand: { label: 'Quicksand', kind: 'line' },
  amnesia: { label: 'Amnesia', kind: 'line' },
  rising_dread: { label: 'Rising Dread', kind: 'line' },
  lead_fingers: { label: 'Lead Fingers', kind: 'line' },
  whiplash: { label: 'Whiplash', kind: 'line' },
  tremor: { label: 'Tremor', kind: 'color' },
  mirage: { label: 'Mirage', kind: 'color' },
  jinxed: { label: 'Jinxed', kind: 'line' },
  pressure: { label: 'Pressure', kind: 'color' },
}

const ALL_SFX: SfxId[] = [
  'move',
  'rotate',
  'hold',
  'hardDrop',
  'lock',
  'lineClear',
  'levelClear',
  'fail',
  'shopOpen',
  'uiClick',
  'quicksand',
  'amnesia',
  'corruption',
  'risingWarn',
  'risingImpact',
  'blackout',
  'fog',
  'tremor',
  'leadFingers',
  'whiplash',
  'mirage',
  'jinxed',
  'pressure',
]

export class DevPanel {
  private el: HTMLElement
  private activeVexes: Vex[]
  private onChange: DevChangeCallback
  /** Tracks current rank selection per ID (0 = off) */
  private state: Map<VexId, 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10> = new Map()

  constructor(activeVexes: Vex[], onChange: DevChangeCallback) {
    this.activeVexes = activeVexes
    this.onChange = onChange

    // Seed state from whatever Vexes are already active
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]
    for (const id of allIds) {
      const existing = activeVexes.find(v => v.id === id)
      this.state.set(id, existing ? existing.rank as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 : 0)
    }

    this.el = this.build()
    document.body.appendChild(this.el)

    // Expose the panel globally so automated tests can open/close it reliably.
    window.__vextrisDevPanel = this

    // Add a small always-visible toggle button so dev mode can be opened without needing a specific keyboard key.
    // This is especially useful for non-US keyboard layouts or when backtick is hard to reach.
    this.createToggleButton()
  }

  /** Open the dev panel. */
  open(): void {
    this.el.classList.add('open')
  }

  /** Close the dev panel. */
  close(): void {
    this.el.classList.remove('open')
  }

  /**
   * Attach a window-level keydown listener for the backtick key.
   * Using window instead of Phaser's keyboard so it works regardless
   * of which element has focus (Phaser canvas, HTML overlay, etc.).
   */
  bindKey(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Support backtick/tilde (varies by locale), plus a fallback hotkey.
      const isBacktick = e.key === '`' || e.key === '~' || e.code === 'Backquote'
      const isAlternate = e.key.toLowerCase() === 'd' && e.ctrlKey && e.shiftKey
      if (isBacktick || isAlternate) {
        e.preventDefault()
        this.toggle()
      }
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
      this.state.set(id, existing ? existing.rank as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 : 0)
    }
    this.refreshUI()
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
      <button class="clear-btn" id="dev-test-sfx">TEST SFX</button>
    `

    // Attach rank button handlers
    for (const id of allIds) {
      for (const rank of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
        const btn = panel.querySelector<HTMLButtonElement>(`[data-vex="${id}"][data-rank="${rank}"]`)
        btn?.addEventListener('click', () => this.handleRankClick(id, rank))
      }
    }

    panel.querySelector('#dev-clear-vexes')?.addEventListener('click', () => this.clearAll())
    panel.querySelector('#dev-test-sfx')?.addEventListener('click', () => this.testSfx())

    return panel
  }

  private rowHTML(id: VexId): string {
    const meta = VEX_META[id]
    const cur = this.state.get(id) ?? 0

    const rankBtn = (r: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10) => {
      const cls = cur === r ? 'rank-btn active' : cur === 0 ? 'rank-btn off' : 'rank-btn'
      const labels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
      return `<button class="${cls}" data-vex="${id}" data-rank="${r}">${labels[r - 1]}</button>`
    }

    return `
      <div class="vex-row" id="dev-row-${id}">
        <span class="vex-name ${meta.kind}-kind">${meta.label}</span>
        <div class="rank-btns">
          ${rankBtn(1)}${rankBtn(2)}${rankBtn(3)}${rankBtn(4)}${rankBtn(5)}${rankBtn(6)}${rankBtn(7)}${rankBtn(8)}${rankBtn(9)}${rankBtn(10)}
        </div>
      </div>
    `
  }

  private handleRankClick(id: VexId, rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): void {
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
        upgradeVex(vex, rank)
      }
      this.state.set(id, rank)
    }

    this.refreshUI()
    this.onChange(this.activeVexes)
  }

  private addVex(id: VexId, rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): void {
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

  private async testSfx(): Promise<void> {
    const btn = this.el.querySelector<HTMLButtonElement>('#dev-test-sfx')
    if (!btn) return

    btn.disabled = true
    btn.textContent = 'TESTING...'

    console.log('DevPanel: playing all SFX', ALL_SFX)
    console.log('Audio settings:', audioManager.getSettings())

    for (const id of ALL_SFX) {
      audioManager.playSfx(id, { rank: 3, linesCleared: 2 })
      await new Promise((resolve) => setTimeout(resolve, 220))
    }

    btn.textContent = 'TEST SFX'
    btn.disabled = false
  }

  private refreshUI(): void {
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]
    for (const id of allIds) {
      const cur = this.state.get(id) ?? 0
      for (const rank of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
        const btn = this.el.querySelector<HTMLButtonElement>(`[data-vex="${id}"][data-rank="${rank}"]`)
        if (!btn) continue
        btn.className = cur === rank ? 'rank-btn active' : cur === 0 ? 'rank-btn off' : 'rank-btn'
      }
    }
  }

  private cssInjected = false
  private toggleButton?: HTMLElement

  private injectCSS(): void {
    if (this.cssInjected) return
    this.cssInjected = true
    const style = document.createElement('style')
    style.textContent = PANEL_CSS
    document.head.appendChild(style)
  }

  private createToggleButton(): void {
    if (this.toggleButton || typeof document === 'undefined') return

    const btn = document.createElement('button')
    btn.id = `${PANEL_ID}-toggle`
    btn.textContent = 'DEV'
    btn.title = 'Toggle dev panel (backtick / Ctrl+Shift+D)'
    btn.addEventListener('click', () => this.toggle())
    document.body.appendChild(btn)
    this.toggleButton = btn
  }

  destroy(): void {
    this.el.remove()
    if (this.toggleButton) {
      this.toggleButton.remove()
      this.toggleButton = undefined
    }
  }
}
