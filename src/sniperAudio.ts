// Bolt-action rifle shot synthesized with Web Audio, layered like a real recording:
// transient click, supersonic crack, muzzle blast, low boom, corridor reverb and the bolt being worked.
export class SniperAudio {
  private context: AudioContext | null = null
  private noise: AudioBuffer | null = null
  private bus: GainNode | null = null
  private reverb: GainNode | null = null

  // Created lazily from the first click, which is the user gesture browsers require.
  private ensure() {
    if (!this.context) {
      try { this.context = new AudioContext() } catch { return null }
      const context = this.context, rate = context.sampleRate
      this.noise = context.createBuffer(1, Math.round(rate * .8), rate)
      const samples = this.noise.getChannelData(0)
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

      // Stereo noise tail, ~1.4 s: a shot fired down a long concrete lane.
      const length = Math.round(rate * 1.4), impulse = context.createBuffer(2, length, rate)
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel)
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * .28)) * (1 - Math.exp(-i / (rate * .004)))
      }
      const convolver = context.createConvolver()
      convolver.buffer = impulse
      const compressor = context.createDynamicsCompressor()
      compressor.threshold.value = -14; compressor.ratio.value = 6; compressor.attack.value = .001; compressor.release.value = .18
      this.bus = context.createGain(); this.bus.gain.value = .8
      this.reverb = context.createGain(); this.reverb.gain.value = .5
      this.bus.connect(compressor)
      this.bus.connect(convolver); convolver.connect(this.reverb); this.reverb.connect(compressor)
      compressor.connect(context.destination)
    }
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  private burst(t: number, duration: number, type: BiquadFilterType, from: number, to: number, level: number, q = .8) {
    const context = this.context!
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
    source.buffer = this.noise
    filter.type = type; filter.Q.value = q
    filter.frequency.setValueAtTime(from, t); filter.frequency.exponentialRampToValueAtTime(to, t + duration)
    gain.gain.setValueAtTime(level, t); gain.gain.exponentialRampToValueAtTime(.0005, t + duration)
    source.connect(filter); filter.connect(gain); gain.connect(this.bus!)
    source.start(t, Math.random() * .2); source.stop(t + duration + .02)
  }

  private tone(t: number, duration: number, from: number, to: number, level: number, type: OscillatorType = 'sine') {
    const context = this.context!
    const oscillator = context.createOscillator(), gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, t); oscillator.frequency.exponentialRampToValueAtTime(to, t + duration)
    gain.gain.setValueAtTime(level, t); gain.gain.exponentialRampToValueAtTime(.0005, t + duration)
    oscillator.connect(gain); gain.connect(this.bus!)
    oscillator.start(t); oscillator.stop(t + duration + .02)
  }

  // One mechanical part of the bolt: a short resonant knock plus a metal tick.
  private metal(t: number, body: number, level: number) {
    this.tone(t, .07, body, body * .6, level * .9, 'triangle')
    this.burst(t, .05, 'bandpass', 3400, 2400, level, 3)
  }

  shot() {
    const context = this.ensure()
    if (!context || !this.noise || !this.bus) return
    const t = context.currentTime + .005
    this.burst(t, .012, 'highpass', 800, 800, 1.1, .5)             // initial transient
    this.burst(t, .09, 'highpass', 4800, 2200, .9, .6)             // supersonic crack
    this.burst(t, .32, 'lowpass', 3200, 380, 1.0, .9)              // muzzle blast
    this.burst(t + .015, .5, 'lowpass', 900, 120, .7, .7)          // body of the report
    this.tone(t, .45, 110, 32, 1.15)                               // boom
    this.tone(t, .2, 220, 70, .35, 'triangle')                     // punch
    // Bolt action after the recoil: lift, pull back, push forward, lock down.
    this.metal(t + .5, 520, .26)
    this.metal(t + .62, 380, .2)
    this.metal(t + .78, 430, .22)
    this.metal(t + .9, 600, .3)
  }

  dispose() { void this.context?.close(); this.context = null; this.noise = null; this.bus = null; this.reverb = null }
}
