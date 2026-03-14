export type AudioChannel = 'master' | 'music' | 'sfx' | 'vex'
type MixChannel = Exclude<AudioChannel, 'master'>

export type AudioSettings = {
  master: number
  music: number
  sfx: number
  vex: number
  muted: boolean
  musicMuted: boolean
  sfxMuted: boolean
  vexMuted: boolean
}

export type SfxId =
  | 'move'
  | 'rotate'
  | 'hold'
  | 'hardDrop'
  | 'lock'
  | 'lineClear'
  | 'levelClear'
  | 'fail'
  | 'shopOpen'
  | 'uiClick'
  | 'quicksand'
  | 'amnesia'
  | 'corruption'
  | 'risingWarn'
  | 'risingImpact'
  | 'blackout'
  | 'fog'
  | 'tremor'
  | 'leadFingers'
  | 'whiplash'
  | 'mirage'
  | 'jinxed'
  | 'pressure'

type SfxOptions = {
  linesCleared?: number
  rank?: number
}

const STORAGE_KEY = 'vextris.audio.v1'
const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.85,
  music: 0.35,
  sfx: 0.72,
  vex: 0.80,
  muted: false,
  musicMuted: false,
  sfxMuted: false,
  vexMuted: false,
}

const VEX_SFX = new Set<SfxId>([
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
])

const COOLDOWN_MS: Record<SfxId, number> = {
  move: 45,
  rotate: 75,
  hold: 90,
  hardDrop: 120,
  lock: 70,
  lineClear: 100,
  levelClear: 400,
  fail: 350,
  shopOpen: 220,
  uiClick: 80,
  quicksand: 180,
  amnesia: 260,
  corruption: 200,
  risingWarn: 600,
  risingImpact: 220,
  blackout: 1200,
  fog: 900,
  tremor: 520,
}

// Final per-event gain trims applied after the channel fader.
const SYNTH_EVENT_GAIN: Record<SfxId, number> = {
  move: 0.46,
  rotate: 0.52,
  hold: 0.58,
  hardDrop: 0.78,
  lock: 0.52,
  lineClear: 0.88,
  levelClear: 0.94,
  fail: 0.86,
  shopOpen: 0.64,
  uiClick: 0.42,

  // Vex-related cues are louder by default so they are audible during gameplay.
  quicksand: 1.0,
  amnesia: 1.0,
  corruption: 1.0,
  risingWarn: 1.0,
  risingImpact: 1.0,
  blackout: 1.0,
  fog: 1.0,
  tremor: 1.0,
  leadFingers: 0.9,
  whiplash: 1.0,
  mirage: 0.7,
  jinxed: 0.8,
  pressure: 0.9,
}

// Selected high-impact cues now prefer file assets, with synth fallback.
const SAMPLE_SFX_URL: Partial<Record<SfxId, string>> = {
  uiClick: 'audio/sfx/ui-click.wav',
  shopOpen: 'audio/sfx/shop-open.wav',
  lineClear: 'audio/sfx/line-clear.wav',
  levelClear: 'audio/sfx/level-clear.wav',
  fail: 'audio/sfx/fail.wav',
  risingImpact: 'audio/sfx/rising-impact.wav',
}

const SAMPLE_EVENT_GAIN: Partial<Record<SfxId, number>> = {
  uiClick: 0.85,
  shopOpen: 0.78,
  lineClear: 0.72,
  levelClear: 0.88,
  fail: 0.90,
  risingImpact: 0.92,
}

export class AudioManager {
  private settings: AudioSettings = { ...DEFAULT_SETTINGS }
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private vexGain: GainNode | null = null
  private bgmAudio?: HTMLAudioElement
  private bgmSource?: MediaElementAudioSourceNode
  private bgmUrl?: string
  private pendingBgmStart = false
  private bgmSynthNodes: AudioNode[] = []
  private bgmSynthInterval?: number
  private lastPlayedAt = new Map<SfxId, number>()
  private sampleBuffers = new Map<SfxId, AudioBuffer>()
  private sampleLoadPromises = new Map<SfxId, Promise<void>>()
  private unlockBound = false
  private isStartingBgm = false

  constructor() {
    this.settings = this.loadSettings()
  }

  init(): void {
    this.ensureAudioGraph()
    this.applySettingsToGraph()

    // Expose for debugging/inspection in browser console.
    if (typeof window !== 'undefined') {
      ;(window as any).__vextrisAudioManager = this
    }

    // Ensure music is audible by default (in case a previous session stored a muted state).
    if (!this.settings.muted && !this.settings.musicMuted && this.settings.music < 0.08) {
      this.settings.music = 0.6
      this.persistSettings()
      this.applySettingsToGraph()
    }

    this.applySettingsToBgm()
    this.preloadConfiguredSamples()
    this.bindUnlockListeners()
  }

  private finishStartBgm() {
    this.isStartingBgm = false
  }

  unlock(): void {
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined)
    }

    // Retry BGM when the user interacts, in case autoplay was blocked.
<<<<<<< HEAD
    if (this.bgmAudio && this.bgmAudio.paused) {
      const playPromise = this.bgmAudio.play()
      if (playPromise && typeof playPromise.then === 'function') {
        void playPromise.catch(() => undefined)
      }
    } else if (!this.bgmAudio && this.bgmUrl && !this.isStartingBgm) {
      // If we never successfully created the audio element, try again.
      this.startBgm(this.bgmUrl)
=======
    if (this.bgmUrl) {
      this.pendingBgmStart = true
      this.tryPlayBgmNow()
    }
  }

  private tryPlayBgmNow(): void {
    if (!this.pendingBgmStart || !this.bgmAudio) return

    // If the audio is already playing, nothing to do.
    if (!this.bgmAudio.paused) {
      this.pendingBgmStart = false
      return
    }

    const playPromise = this.bgmAudio.play()
    if (playPromise && typeof playPromise.then === 'function') {
      void playPromise
        .then(() => {
          this.pendingBgmStart = false
        })
            if (this.bgmUrl) {
              this.pendingBgmStart = true
              this.tryPlayBgmNow()
            }
          }

          private tryPlayBgmNow(): void {
            if (!this.pendingBgmStart || !this.bgmAudio) return

            // If the audio is already playing, nothing to do.
            if (!this.bgmAudio.paused) {
              this.pendingBgmStart = false
              return
            }

            const playPromise = this.bgmAudio.play()
            if (playPromise && typeof playPromise.then === 'function') {
              void playPromise
                .then(() => {
                  this.pendingBgmStart = false
                })
                .catch(() => {
                  // Keep pending so we can retry on the next user interaction.
                  this.pendingBgmStart = true
                })
            } else {
              this.pendingBgmStart = false
            }
          }
          // Fallback to a simple synth-based BGM when the file is missing or fails to load.
          this.startBgmSynth()
        })
        this.bgmAudio = audio
        this.attachBgmToGraph(audio)
      }

      this.applySettingsToBgm()
      const playPromise = this.bgmAudio.play()
      if (playPromise && typeof playPromise.then === 'function') {
        void playPromise.catch(() => {
          // Keep the audio element around to retry on the next user interaction.
        })
      }
    } finally {
      this.finishStartBgm()
    }
=======
    this.applySettingsToBgm()

    // If the audio context is suspended, the play attempt will likely be blocked.
    // Mark that we want BGM so we can retry after an unlocked gesture.
    this.pendingBgmStart = true
    this.tryPlayBgmNow()
>>>>>>> 70080c8 (Fix BGM startup recursion and use public asset path for BGM)
  }

  stopBgm(): void {
        this.bgmUrl = url
        this.stopBgm()
        this.init()

        if (url === 'synth') {
          this.startBgmSynth()
          return
        }

        this.applySettingsToBgm()

        // If the audio context is suspended, the play attempt will likely be blocked.
        // Mark that we want BGM so we can retry after an unlocked gesture.
        this.pendingBgmStart = true
        this.tryPlayBgmNow()
  isChannelMuted(channel: MixChannel): boolean {
    if (channel === 'music') return this.settings.musicMuted
    if (channel === 'sfx') return this.settings.sfxMuted
    return this.settings.vexMuted
  }

  resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS }
    this.persistSettings()
    this.applySettingsToGraph()
    this.applySettingsToBgm()
  }

  toggleMute(): void {
    this.setMuted(!this.settings.muted)
  }

  getSettings(): AudioSettings {
    return { ...this.settings }
  }

  playSfx(id: SfxId, options: SfxOptions = {}): void {
    if (this.settings.muted) return
    if (this.isSfxBlockedByChannelMute(id)) return

    const now = performance.now()
    const lastPlayed = this.lastPlayedAt.get(id) ?? -Infinity
    if (now - lastPlayed < COOLDOWN_MS[id]) return
    this.lastPlayedAt.set(id, now)

    const ctx = this.ensureAudioGraph()
    if (!ctx) return

    const target = VEX_SFX.has(id) ? this.vexGain : this.sfxGain
    if (!target) return

    this.unlock()

    const linesCleared = Math.max(1, Math.min(4, Math.floor(options.linesCleared ?? 1)))
    const rank = Math.max(1, Math.min(10, Math.floor(options.rank ?? 1)))

    if (id === 'lineClear') {
      if (this.tryPlaySample(id, target, options)) {
        this.playLineClearAccent(target, linesCleared)
        return
      }
    } else if (this.tryPlaySample(id, target, options)) {
      return
    }
    const eventGain = this.createEventGain(target, SYNTH_EVENT_GAIN[id] ?? 1)

    switch (id) {
      case 'move':
        this.tone(eventGain, 180, 150, 0.045, 0.042, 'triangle')
        break
      case 'rotate':
        this.tone(eventGain, 280, 500, 0.066, 0.058, 'square')
        break
      case 'hold':
        this.tone(eventGain, 220, 340, 0.078, 0.056, 'sine')
        break
      case 'hardDrop':
        this.tone(eventGain, 250, 85, 0.09, 0.074, 'triangle')
        this.noise(eventGain, 0.04, 0.022, 500)
        break
      case 'lock':
        this.tone(eventGain, 148, 108, 0.048, 0.045, 'square')
        break
      case 'lineClear': {
        const base = 288 + (linesCleared - 1) * 38
        this.tone(eventGain, base, base * 1.16, 0.09, 0.038 + linesCleared * 0.014, 'triangle')
        this.tone(eventGain, base * 1.23, base * 1.45, 0.11, 0.024 + linesCleared * 0.01, 'sine', 0.017)
        this.tone(eventGain, base * 0.74, base * 0.60, 0.1, 0.012 + linesCleared * 0.006, 'square', 0.012)
        this.playLineClearAccent(eventGain, linesCleared)
        break
      }
      case 'levelClear':
        this.tone(eventGain, 360, 520, 0.14, 0.076, 'triangle')
        this.tone(eventGain, 520, 680, 0.12, 0.058, 'sine', 0.09)
        this.tone(eventGain, 680, 860, 0.11, 0.052, 'sine', 0.18)
        break
      case 'fail':
        this.tone(eventGain, 260, 78, 0.35, 0.085, 'sawtooth')
        this.noise(eventGain, 0.18, 0.028, 170)
        break
      case 'shopOpen':
        this.tone(eventGain, 260, 300, 0.16, 0.056, 'sine')
        this.tone(eventGain, 390, 450, 0.16, 0.035, 'sine')
        break
      case 'uiClick':
        this.tone(eventGain, 390, 300, 0.04, 0.03, 'square')
        break
      case 'quicksand': {
        const amp = 0.018 + rank * 0.0018
        this.noise(eventGain, 0.14, amp * 1.1, 300)
        this.tone(eventGain, 130, 90, 0.14, amp * 0.9, 'triangle')
        this.tone(eventGain, 180, 120, 0.12, amp * 0.6, 'sine', 0.03)
        break
      }
      case 'amnesia': {
        const amp = 0.025 + rank * 0.0019
        this.tone(eventGain, 640, 300, 0.06, amp, 'square')
        this.tone(eventGain, 520, 280, 0.05, amp * 0.72, 'triangle', 0.02)
        this.noise(eventGain, 0.05, amp * 0.45, 900)
        break
      }
      case 'corruption': {
        const amp = 0.024 + rank * 0.0018
        this.tone(eventGain, 180, 540, 0.04, amp, 'sawtooth')
        this.tone(eventGain, 520, 260, 0.05, amp * 0.78, 'square', 0.03)
        this.noise(eventGain, 0.08, amp * 0.5, 780)
        break
      }
      case 'risingWarn':
        this.tone(eventGain, 110, 62, 0.28, 0.042, 'triangle')
        this.tone(eventGain, 140, 80, 0.22, 0.03, 'sine', 0.06)
        break
      case 'risingImpact':
        this.tone(eventGain, 90, 44, 0.22, 0.08, 'sine')
        this.tone(eventGain, 140, 90, 0.16, 0.055, 'triangle', 0.02)
        this.noise(eventGain, 0.11, 0.042, 200)
        break
      case 'blackout': {
        const amp = 0.026 + rank * 0.0024
        this.tone(eventGain, 80, 50, 0.38, amp, 'sawtooth')
        this.noise(eventGain, 0.16, amp * 0.85, 320)
        break
      }
      case 'fog': {
        const amp = 0.018 + rank * 0.0022
        this.noise(eventGain, 0.38, amp, 760)
        this.tone(eventGain, 120, 88, 0.28, amp * 0.75, 'sine')
        break
      }
      case 'tremor': {
        const amp = 0.018 + rank * 0.0016
        this.tone(eventGain, 82, 58, 0.16, amp, 'triangle')
        this.noise(eventGain, 0.1, amp * 0.8, 260)
        this.tone(eventGain, 68, 42, 0.12, amp * 0.6, 'square', 0.02)
        break
      }
      case 'leadFingers': {
        const amp = 0.022 + rank * 0.002
        // Add a slightly heavier, metallic click for sluggish movement
        this.tone(eventGain, 180, 140, 0.08, amp, 'triangle')
        this.noise(eventGain, 0.03, amp * 0.75, 220)
        break
      }
      case 'whiplash': {
        const amp = 0.038 + rank * 0.0025
        // A sharp snap to reinforce the blackout pulse
        this.noise(eventGain, 0.04, amp * 0.9, 300)
        this.tone(eventGain, 220, 140, 0.1, amp, 'square')
        break
      }
      case 'mirage': {
        const amp = 0.019 + rank * 0.0018
        this.tone(eventGain, 520, 660, 0.12, amp, 'sine')
        this.tone(eventGain, 720, 880, 0.09, amp * 0.7, 'triangle', 0.04)
        break
      }
      case 'jinxed': {
        const amp = 0.022 + rank * 0.002
        this.noise(eventGain, 0.05, amp * 0.8, 950)
        this.tone(eventGain, 420, 360, 0.1, amp, 'sawtooth')
        break
      }
      case 'pressure': {
        const amp = 0.026 + rank * 0.002
        this.tone(eventGain, 720, 520, 0.07, amp, 'square')
        this.noise(eventGain, 0.06, amp * 0.7, 420)
        break
      }
    }
  }

  private isSfxBlockedByChannelMute(id: SfxId): boolean {
    return VEX_SFX.has(id) ? this.settings.vexMuted : this.settings.sfxMuted
  }

  private createEventGain(destination: GainNode, gainValue: number): GainNode {
    if (!this.context) return destination
    const eventGain = this.context.createGain()
    eventGain.gain.value = Math.max(0.0001, gainValue)
    eventGain.connect(destination)
    return eventGain
  }

  private tryPlaySample(id: SfxId, destination: GainNode, options: SfxOptions): boolean {
    if (!this.context) return false
    const url = SAMPLE_SFX_URL[id]
    if (!url) return false

    const sampleBuffer = this.sampleBuffers.get(id)
    if (!sampleBuffer) {
      this.preloadSample(id, url)
      return false
    }

    const source = this.context.createBufferSource()
    source.buffer = sampleBuffer
    source.playbackRate.value = this.getSamplePlaybackRate(id, options)
    source.connect(this.createEventGain(destination, SAMPLE_EVENT_GAIN[id] ?? 1))
    source.start()
    return true
  }

  private getSamplePlaybackRate(id: SfxId, options: SfxOptions): number {
    if (id === 'lineClear') {
      const linesCleared = Math.max(1, Math.min(4, Math.floor(options.linesCleared ?? 1)))
      const rates = [1, 0.94, 1.02, 1.1, 1.18]
      return rates[linesCleared]
    }

    return 1
  }

  private playLineClearAccent(destination: GainNode, linesCleared: number): void {
    const clampedLines = Math.max(1, Math.min(4, linesCleared))
    const accentGain = this.createEventGain(destination, 0.2 + clampedLines * 0.04)

    if (clampedLines === 1) {
      this.tone(accentGain, 590, 710, 0.08, 0.012, 'sine', 0.02)
      return
    }

    if (clampedLines === 2) {
      this.tone(accentGain, 370, 460, 0.14, 0.015, 'triangle', 0.01)
      this.tone(accentGain, 494, 590, 0.14, 0.014, 'sine', 0.03)
      return
    }

    if (clampedLines === 3) {
      this.tone(accentGain, 330, 480, 0.17, 0.017, 'triangle', 0.01)
      this.tone(accentGain, 495, 640, 0.16, 0.016, 'sine', 0.04)
      this.tone(accentGain, 740, 860, 0.12, 0.013, 'sine', 0.07)
      return
    }

    this.tone(accentGain, 220, 320, 0.2, 0.017, 'triangle', 0.0)
    this.tone(accentGain, 330, 520, 0.22, 0.02, 'sine', 0.03)
    this.tone(accentGain, 495, 700, 0.2, 0.019, 'sine', 0.05)
    this.tone(accentGain, 740, 930, 0.17, 0.015, 'triangle', 0.08)
    this.noise(accentGain, 0.07, 0.010, 480)
  }

  private preloadConfiguredSamples(): void {
    for (const [id, url] of Object.entries(SAMPLE_SFX_URL) as Array<[SfxId, string]>) {
      this.preloadSample(id, url)
    }
  }

  private preloadSample(id: SfxId, url: string): void {
    if (!this.context) return
    if (this.sampleBuffers.has(id) || this.sampleLoadPromises.has(id)) return

    const ctx = this.context
    const loadPromise = (async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) return
        const arrayBuffer = await response.arrayBuffer()
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
        this.sampleBuffers.set(id, decoded)
      } catch {
        // Keep synth fallback for unsupported or missing sample assets.
      } finally {
        this.sampleLoadPromises.delete(id)
      }
    })()

    this.sampleLoadPromises.set(id, loadPromise)
  }

  private tone(
    destination: GainNode,
    startFreq: number,
    endFreq: number,
    duration: number,
    amplitude: number,
    wave: OscillatorType,
    delaySec = 0,
  ): void {
    if (!this.context) return

    const startAt = this.context.currentTime + delaySec
    const attack = Math.min(0.02, duration * 0.35)
    const stopAt = startAt + duration

    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()

    oscillator.type = wave
    oscillator.frequency.setValueAtTime(Math.max(20, startFreq), startAt)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), stopAt)

    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), startAt + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)

    oscillator.connect(gain)
    gain.connect(destination)

    oscillator.start(startAt)
    oscillator.stop(stopAt + 0.02)
  }

  private noise(destination: GainNode, duration: number, amplitude: number, highpassHz: number): void {
    if (!this.context) return

    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < frameCount; index++) {
      channel[index] = (Math.random() * 2 - 1) * 0.7
    }

    const source = this.context.createBufferSource()
    source.buffer = buffer

    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = highpassHz

    const gain = this.context.createGain()
    const startAt = this.context.currentTime
    const stopAt = startAt + duration

    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, amplitude), startAt + Math.min(0.03, duration * 0.4))
    gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(destination)

    source.start(startAt)
    source.stop(stopAt + 0.02)
  }

  private ensureAudioGraph(): AudioContext | null {
    if (this.context) return this.context
    if (typeof window === 'undefined') return null

    const webkit = window as unknown as { webkitAudioContext?: typeof AudioContext }
    const AudioCtor = window.AudioContext ?? webkit.webkitAudioContext
    if (!AudioCtor) return null

    const ctx = new AudioCtor()
    const master = ctx.createGain()
    const music = ctx.createGain()
    const sfx = ctx.createGain()
    const vex = ctx.createGain()

    music.connect(master)
    sfx.connect(master)
    vex.connect(master)
    master.connect(ctx.destination)

    this.context = ctx
    this.masterGain = master
    this.musicGain = music
    this.sfxGain = sfx
    this.vexGain = vex

    // Expose for debugging/inspection in browser console.
    if (typeof window !== 'undefined') {
      ;(window as any).__vextrisAudioContext = ctx
    }

    return ctx
  }

  private attachBgmToGraph(audio: HTMLAudioElement): void {
    if (!this.context || !this.musicGain) {
      return
    }

    try {
      this.bgmSource = this.context.createMediaElementSource(audio)
      this.bgmSource.connect(this.musicGain)
      audio.volume = 1
    } catch {
      this.bgmSource = undefined
    }
  }

  private startBgmSynth(): void {
    if (!this.context || !this.musicGain) return

    this.stopBgm()

    const ctx = this.context
    const destination = this.musicGain
    if (!destination) return

    // Simple sustained two-oscillator backing to ensure BGM is clearly audible.
    const masterGain = ctx.createGain()
    masterGain.gain.value = 0.25
    masterGain.connect(destination)
    this.bgmSynthNodes.push(masterGain)

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(110, ctx.currentTime)
    osc1.connect(masterGain)
    osc1.start()
    this.bgmSynthNodes.push(osc1)

    const osc2 = ctx.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(220, ctx.currentTime)
    osc2.connect(masterGain)
    osc2.start()
    this.bgmSynthNodes.push(osc2)

    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.setValueAtTime(0.18, ctx.currentTime)
    lfoGain.gain.value = 8
    lfo.connect(lfoGain)
    lfoGain.connect(osc1.frequency)
    lfo.start()
    this.bgmSynthNodes.push(lfo, lfoGain)
  }

  private bindUnlockListeners(): void {
    if (this.unlockBound || typeof window === 'undefined') return
    this.unlockBound = true

    const unlock = () => this.unlock()
    window.addEventListener('pointerdown', unlock, { once: true, passive: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('touchstart', unlock, { once: true, passive: true })
  }

  private applySettingsToGraph(): void {
    if (!this.masterGain || !this.musicGain || !this.sfxGain || !this.vexGain) return

    this.masterGain.gain.value = this.settings.muted ? 0 : this.settings.master
    this.musicGain.gain.value = this.settings.musicMuted ? 0 : this.settings.music
    this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfx
    this.vexGain.gain.value = this.settings.vexMuted ? 0 : this.settings.vex
  }

  private applySettingsToBgm(): void {
    if (!this.bgmAudio) return
    if (this.bgmSource) {
      this.bgmAudio.volume = 1
      return
    }

    const effectiveMusic = this.settings.musicMuted ? 0 : this.settings.music
    this.bgmAudio.volume = this.settings.muted ? 0 : this.settings.master * effectiveMusic
  }

  private loadSettings(): AudioSettings {
    if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return { ...DEFAULT_SETTINGS }
      const parsed = JSON.parse(raw) as Partial<AudioSettings>
      return {
        master: this.clamp01(parsed.master ?? DEFAULT_SETTINGS.master),
        music: this.clamp01(parsed.music ?? DEFAULT_SETTINGS.music),
        sfx: this.clamp01(parsed.sfx ?? DEFAULT_SETTINGS.sfx),
        vex: this.clamp01(parsed.vex ?? DEFAULT_SETTINGS.vex),
        muted: Boolean(parsed.muted),
        musicMuted: Boolean(parsed.musicMuted),
        sfxMuted: Boolean(parsed.sfxMuted),
        vexMuted: Boolean(parsed.vexMuted),
      }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  private persistSettings(): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings))
    } catch {
      // Ignore quota/storage errors.
    }
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
  }
}

export const audioManager = new AudioManager()
