// Short synthesized alert (no audio asset). Plays only while a XENSI tab is open; closed-tab pushes use the OS sound.
let ctx: AudioContext | null = null
const context = () => {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!ctx && Ctor) ctx = new Ctor()
  return ctx
}
// Browsers only allow audio after a user gesture; unlock on the first interaction.
export function armAlertSound() {
  const unlock = () => { void context()?.resume(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock)
  return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock) }
}
// 'request' = two quick rising pings; 'approved' = three-note "ready" arpeggio.
let last = 0
export function playAlert(kind: 'request' | 'approved') {
  const c = context()
  // The push message and the 20s poll can report the same event; play once.
  if (!c || c.state !== 'running' || Date.now() - last < 30000) return
  last = Date.now()
  const notes = kind === 'approved' ? [660, 880, 1320] : [880, 1175]
  notes.forEach((freq, i) => {
    const t = c.currentTime + i * 0.13
    const osc = c.createOscillator(), gain = c.createGain()
    osc.type = 'triangle'; osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
    osc.connect(gain).connect(c.destination); osc.start(t); osc.stop(t + 0.3)
  })
}
