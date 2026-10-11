import { seededRandom, SPATIAL_HUNT_RULES, type Direction3 } from './spatialHunt'

export class SpatialAudio {
  readonly context = new AudioContext()
  readonly panner = this.context.createPanner()
  private readonly gain = this.context.createGain()
  private readonly buffer: AudioBuffer
  private readonly sources = new Set<AudioBufferSourceNode>()
  constructor() {
    this.panner.panningModel = 'HRTF'
    if (this.panner.panningModel !== 'HRTF') { void this.context.close(); throw new Error('HRTF unavailable') }
    this.panner.distanceModel = 'inverse'; this.panner.refDistance = 6; this.panner.rolloffFactor = 0
    this.gain.gain.value = SPATIAL_HUNT_RULES.gain
    this.panner.connect(this.gain); this.gain.connect(this.context.destination)
    const length = Math.round(this.context.sampleRate * SPATIAL_HUNT_RULES.pulseSeconds)
    this.buffer = this.context.createBuffer(1, length, this.context.sampleRate)
    const samples = this.buffer.getChannelData(0), random = seededRandom(0x58454e53)
    for (let i = 0; i < length; i++) samples[i] = (random() * 2 - 1) * Math.sin(Math.PI * i / (length - 1)) ** 2
    this.updateListener({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 })
  }
  resume() { return this.context.resume() }
  updateListener(forward: Direction3, up: Direction3) {
    const listener = this.context.listener
    if (listener.forwardX) {
      listener.positionX.value = 0; listener.positionY.value = SPATIAL_HUNT_RULES.eyeHeight; listener.positionZ.value = 0
      listener.forwardX.value = forward.x; listener.forwardY.value = forward.y; listener.forwardZ.value = forward.z
      listener.upX.value = up.x; listener.upY.value = up.y; listener.upZ.value = up.z
    } else {
      listener.setPosition(0, SPATIAL_HUNT_RULES.eyeHeight, 0)
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z)
    }
  }
  cue(direction: Direction3) {
    this.stop()
    this.panner.positionX.value = direction.x * SPATIAL_HUNT_RULES.sourceRadius
    this.panner.positionY.value = SPATIAL_HUNT_RULES.eyeHeight + direction.y * SPATIAL_HUNT_RULES.sourceRadius
    this.panner.positionZ.value = direction.z * SPATIAL_HUNT_RULES.sourceRadius
    const first = this.context.currentTime + .03
    for (let i = 0; i < SPATIAL_HUNT_RULES.pulseCount; i++) {
      const source = this.context.createBufferSource()
      source.buffer = this.buffer; source.connect(this.panner); this.sources.add(source)
      source.onended = () => { source.disconnect(); this.sources.delete(source) }
      source.start(first + i * SPATIAL_HUNT_RULES.pulseSpacingSeconds)
    }
    return first
  }
  stop() {
    for (const source of this.sources) { source.onended = null; source.stop(); source.disconnect() }
    this.sources.clear()
  }
  suspend() { this.stop(); return this.context.state === 'running' ? this.context.suspend() : Promise.resolve() }
  dispose() { this.stop(); this.panner.disconnect(); this.gain.disconnect(); void this.context.close().catch(() => {}) }
}
