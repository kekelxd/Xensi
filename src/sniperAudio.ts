// Rifle shot synthesized with Web Audio: a noise crack, a low thump and the bolt being worked afterwards.
export class SniperAudio {
  private context: AudioContext | null = null
  private noise: AudioBuffer | null = null

  // Created lazily from the first click, which is the user gesture browsers require.
  private ensure() {
    if (!this.context) {
      try { this.context = new AudioContext() } catch { return null }
      const length = Math.round(this.context.sampleRate * .6)
      this.noise = this.context.createBuffer(1, length, this.context.sampleRate)
      const samples = this.noise.getChannelData(0)
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1
    }
    if (this.context.state === 'suspended') void this.context.resume()
    return this.context
  }

  shot() {
    const context = this.ensure()
    if (!context || !this.noise) return
    const t = context.currentTime
    const master = context.createGain()
    master.gain.value = .55
    master.connect(context.destination)

    const crack = context.createBufferSource()
    crack.buffer = this.noise
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'; filter.frequency.setValueAtTime(2600, t); filter.frequency.exponentialRampToValueAtTime(500, t + .35); filter.Q.value = .7
    const crackGain = context.createGain()
    crackGain.gain.setValueAtTime(1, t); crackGain.gain.exponentialRampToValueAtTime(.001, t + .38)
    crack.connect(filter); filter.connect(crackGain); crackGain.connect(master)
    crack.start(t); crack.stop(t + .4)

    const thump = context.createOscillator()
    thump.type = 'sine'; thump.frequency.setValueAtTime(130, t); thump.frequency.exponentialRampToValueAtTime(38, t + .25)
    const thumpGain = context.createGain()
    thumpGain.gain.setValueAtTime(.9, t); thumpGain.gain.exponentialRampToValueAtTime(.001, t + .3)
    thump.connect(thumpGain); thumpGain.connect(master)
    thump.start(t); thump.stop(t + .32)

    // Bolt action: two short metallic ticks while the rifle cycles.
    for (const delay of [.38, .52]) {
      const tick = context.createBufferSource()
      tick.buffer = this.noise
      const tickFilter = context.createBiquadFilter()
      tickFilter.type = 'highpass'; tickFilter.frequency.value = 3200
      const tickGain = context.createGain()
      tickGain.gain.setValueAtTime(.16, t + delay); tickGain.gain.exponentialRampToValueAtTime(.001, t + delay + .05)
      tick.connect(tickFilter); tickFilter.connect(tickGain); tickGain.connect(master)
      tick.start(t + delay); tick.stop(t + delay + .06)
    }
  }

  dispose() { void this.context?.close(); this.context = null; this.noise = null }
}
