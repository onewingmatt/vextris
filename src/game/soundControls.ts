import { audioManager, AudioChannel, AudioSettings } from './audio'

type VolumeChannel = AudioChannel
type MixChannel = Exclude<AudioChannel, 'master'>

const ROOT_ID = 'vextris-sound-controls'
const TOGGLE_ID = 'vextris-sound-toggle'
const PANEL_ID = 'vextris-sound-panel'

const STYLE = `
#${TOGGLE_ID} {
  position: fixed;
  right: 12px;
  top: 12px;
  z-index: 2200;
  font-family: "Press Start 2P", monospace;
  font-size: 8px;
  letter-spacing: 1px;
  border: 1px solid #5a3b43;
  background: rgba(18, 13, 20, 0.95);
  color: #d6c1ad;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(122, 66, 72, 0.24);
}

#${PANEL_ID} {
  position: fixed;
  right: 12px;
  top: 44px;
  width: min(280px, calc(100vw - 24px));
  z-index: 2199;
  background: rgba(14, 10, 18, 0.96);
  border: 1px solid #5a3b43;
  border-radius: 8px;
  padding: 12px;
  font-family: "Press Start 2P", monospace;
  box-shadow: 0 0 18px rgba(122, 66, 72, 0.2);
  display: none;
}

#${PANEL_ID}.open {
  display: block;
}

#${PANEL_ID} .sound-title {
  color: #d6c1ad;
  font-size: 9px;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

#${PANEL_ID} .sound-row {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) 38px 42px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

#${PANEL_ID} .sound-spacer {
  width: 42px;
}

#${PANEL_ID} .sound-row label {
  color: #e7d7c7;
  font-size: 7px;
}

#${PANEL_ID} .sound-row input[type="range"] {
  width: 100%;
  accent-color: #c48f63;
}

#${PANEL_ID} .sound-value {
  color: #bfa58f;
  font-size: 7px;
  text-align: right;
}

#${PANEL_ID} .sound-chan-btn {
  font-family: "Press Start 2P", monospace;
  font-size: 6px;
  padding: 5px 4px;
  border: 1px solid #5a434c;
  background: rgba(24, 17, 27, 0.9);
  color: #d6c1ad;
  border-radius: 4px;
  cursor: pointer;
}

#${PANEL_ID} .sound-chan-btn.muted {
  border-color: #8b4a46;
  background: rgba(40, 14, 17, 0.9);
  color: #efb8b0;
}

#${PANEL_ID} .sound-actions {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

#${PANEL_ID} .sound-btn {
  flex: 1;
  font-family: "Press Start 2P", monospace;
  font-size: 7px;
  padding: 7px 6px;
  border: 1px solid #5a434c;
  background: rgba(22, 16, 25, 0.92);
  color: #ddc7b1;
  border-radius: 4px;
  cursor: pointer;
}

#${PANEL_ID} .sound-btn.muted {
  border-color: #8b4a46;
  color: #efb8b0;
  background: rgba(38, 13, 16, 0.92);
}

#${PANEL_ID} .sound-help {
  margin-top: 8px;
  color: #9d8575;
  font-size: 6px;
}

@media (max-width: 700px) {
  #${TOGGLE_ID} {
    top: auto;
    bottom: 12px;
    right: 10px;
  }

  #${PANEL_ID} {
    top: auto;
    bottom: 44px;
    right: 10px;
  }
}
`

let styleInjected = false
let singleton: SoundControls | null = null

export class SoundControls {
  private root: HTMLDivElement
  private toggleButton: HTMLButtonElement
  private panel: HTMLDivElement
  private sliders: Record<VolumeChannel, HTMLInputElement>
  private values: Record<VolumeChannel, HTMLSpanElement>
  private channelMuteButtons: Record<MixChannel, HTMLButtonElement>
  private muteButton: HTMLButtonElement
  private keyHandler: (event: KeyboardEvent) => void

  constructor() {
    audioManager.init()
    this.injectStyle()

    this.root = document.createElement('div')
    this.root.id = ROOT_ID

    this.toggleButton = document.createElement('button')
    this.toggleButton.id = TOGGLE_ID
    this.toggleButton.type = 'button'
    this.toggleButton.textContent = 'SOUND'

    this.panel = document.createElement('div')
    this.panel.id = PANEL_ID
    this.panel.innerHTML = `
      <div class="sound-title">AUDIO CONTROL</div>
      ${this.sliderRow('master', 'MASTER')}
      ${this.sliderRow('music', 'MUSIC')}
      ${this.sliderRow('sfx', 'SFX')}
      ${this.sliderRow('vex', 'VEX')}
      <div class="sound-actions">
        <button type="button" class="sound-btn" data-sound-action="mute">MUTE</button>
        <button type="button" class="sound-btn" data-sound-action="reset">RESET</button>
        <button type="button" class="sound-btn" data-sound-action="close">CLOSE</button>
      </div>
      <div class="sound-help">Shortcut: M toggles mute</div>
    `

    this.root.appendChild(this.toggleButton)
    this.root.appendChild(this.panel)
    document.body.appendChild(this.root)

    this.sliders = {
      master: this.panel.querySelector<HTMLInputElement>('[data-sound-slider="master"]')!,
      music: this.panel.querySelector<HTMLInputElement>('[data-sound-slider="music"]')!,
      sfx: this.panel.querySelector<HTMLInputElement>('[data-sound-slider="sfx"]')!,
      vex: this.panel.querySelector<HTMLInputElement>('[data-sound-slider="vex"]')!,
    }

    this.values = {
      master: this.panel.querySelector<HTMLSpanElement>('[data-sound-value="master"]')!,
      music: this.panel.querySelector<HTMLSpanElement>('[data-sound-value="music"]')!,
      sfx: this.panel.querySelector<HTMLSpanElement>('[data-sound-value="sfx"]')!,
      vex: this.panel.querySelector<HTMLSpanElement>('[data-sound-value="vex"]')!,
    }

    this.channelMuteButtons = {
      music: this.panel.querySelector<HTMLButtonElement>('[data-sound-chan-mute="music"]')!,
      sfx: this.panel.querySelector<HTMLButtonElement>('[data-sound-chan-mute="sfx"]')!,
      vex: this.panel.querySelector<HTMLButtonElement>('[data-sound-chan-mute="vex"]')!,
    }

    this.muteButton = this.panel.querySelector<HTMLButtonElement>('[data-sound-action="mute"]')!

    this.toggleButton.addEventListener('click', () => {
      this.panel.classList.toggle('open')
    })

    const closeButton = this.panel.querySelector<HTMLButtonElement>('[data-sound-action="close"]')!
    closeButton.addEventListener('click', () => {
      this.panel.classList.remove('open')
    })

    this.muteButton.addEventListener('click', () => {
      audioManager.toggleMute()
      this.refresh()
    })

    const resetButton = this.panel.querySelector<HTMLButtonElement>('[data-sound-action="reset"]')!
    resetButton.addEventListener('click', () => {
      audioManager.resetSettings()
      this.refresh()
    })

    const channels: VolumeChannel[] = ['master', 'music', 'sfx', 'vex']
    for (const channel of channels) {
      this.sliders[channel].addEventListener('input', (event) => {
        const target = event.currentTarget as HTMLInputElement
        const value = Number(target.value) / 100
        audioManager.setVolume(channel, value)
        if (channel !== 'master' && value > 0 && audioManager.isChannelMuted(channel)) {
          audioManager.setChannelMuted(channel, false)
        }
        this.refresh()
      })
    }

    const mixChannels: MixChannel[] = ['music', 'sfx', 'vex']
    for (const channel of mixChannels) {
      this.channelMuteButtons[channel].addEventListener('click', () => {
        audioManager.toggleChannelMute(channel)
        this.refresh()
      })
    }

    this.keyHandler = (event: KeyboardEvent) => {
      const node = event.target as HTMLElement | null
      const tag = node?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || node?.isContentEditable) return

      if (event.key.toLowerCase() === 'm') {
        audioManager.toggleMute()
        this.refresh()
      }
    }

    window.addEventListener('keydown', this.keyHandler)
    this.refresh()
  }

  refresh(): void {
    const settings = audioManager.getSettings()
    this.syncSlider('master', settings)
    this.syncSlider('music', settings)
    this.syncSlider('sfx', settings)
    this.syncSlider('vex', settings)
    this.syncChannelMuteButton('music', settings.musicMuted)
    this.syncChannelMuteButton('sfx', settings.sfxMuted)
    this.syncChannelMuteButton('vex', settings.vexMuted)

    if (settings.muted) {
      this.toggleButton.textContent = 'SOUND (MUTED)'
      this.muteButton.textContent = 'UNMUTE'
      this.muteButton.classList.add('muted')
    } else {
      this.toggleButton.textContent = 'SOUND'
      this.muteButton.textContent = 'MUTE'
      this.muteButton.classList.remove('muted')
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler)
    this.root.remove()
  }

  private syncSlider(channel: VolumeChannel, settings: AudioSettings): void {
    const channelValue = settings[channel]
    const slider = this.sliders[channel]
    const valueText = this.values[channel]
    slider.value = String(Math.round(channelValue * 100))
    valueText.textContent = `${Math.round(channelValue * 100)}%`
  }

  private syncChannelMuteButton(channel: MixChannel, muted: boolean): void {
    const button = this.channelMuteButtons[channel]
    button.textContent = muted ? 'OFF' : 'ON'
    button.classList.toggle('muted', muted)
    button.setAttribute('aria-pressed', muted ? 'true' : 'false')
  }

  private sliderRow(channel: VolumeChannel, label: string): string {
    const trailing = channel === 'master'
      ? '<span class="sound-spacer" aria-hidden="true"></span>'
      : `<button type="button" class="sound-chan-btn" data-sound-chan-mute="${channel}">ON</button>`

    return `
      <div class="sound-row">
        <label for="sound-${channel}">${label}</label>
        <input id="sound-${channel}" data-sound-slider="${channel}" type="range" min="0" max="100" step="1" />
        <span class="sound-value" data-sound-value="${channel}">0%</span>
        ${trailing}
      </div>
    `
  }

  private injectStyle(): void {
    if (styleInjected) return
    styleInjected = true
    const style = document.createElement('style')
    style.textContent = STYLE
    document.head.appendChild(style)
  }
}

export function ensureSoundControls(): SoundControls {
  if (!singleton) {
    singleton = new SoundControls()
  } else {
    singleton.refresh()
  }
  return singleton
}

export function removeSoundControls(): void {
  singleton?.destroy()
  singleton = null
}
