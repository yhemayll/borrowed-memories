// All sound is made in the browser with Web Audio: no files, no copyrighted recordings.
// "Katyusha" is a short ORIGINAL placeholder march in a similar mood, not the real song,
// which is still under copyright. A licensed recording could replace it later.

let ctx, master, radioBus, hiss, hissGain, speakerLo, timer, station = 'off'

// [semitones from the root, beats]; null = rest
const STATIONS = {
  katyusha: { bpm: 116, root: 220, wave: 'square', beat: 2, notes: [[0, 1], [2, 0.5], [3, 1.5], [0, 0.5], [3, 0.5], [3, 0.5], [2, 0.5], [0, 0.5], [2, 1], [-5, 1], [2, 1], [3, 0.5], [5, 1.5], [2, 0.5], [5, 0.5], [5, 0.5], [3, 0.5], [2, 0.5], [0, 2]] },
}
let humming = false // the mother hums along, in the room rather than through the speaker
let wobble = 0 // how far the music drifts out of tune as the memory loses coherence
let weatherNode = null

function noiseBuffer(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function env(node, t, peak, attack, release) {
  node.gain.setValueAtTime(0.0001, t)
  node.gain.exponentialRampToValueAtTime(peak, t + attack)
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + release)
}

function tone(freq, t, dur, { wave = 'sine', gain = 0.15, to = master, attack = 0.02 } = {}) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = wave
  o.frequency.value = freq
  o.detune.value = (Math.random() - 0.5) * wobble
  env(g, t, gain, attack, dur)
  o.connect(g).connect(to)
  o.start(t)
  o.stop(t + attack + dur + 0.05)
  return o
}

function noise(t, dur, { freq = 800, q = 1, gain = 0.2, type = 'bandpass', to = master, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(Math.max(0.2, dur + attack + 0.1))
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  env(g, t, gain, attack, dur)
  src.connect(f).connect(g).connect(to)
  src.start(t)
  return { src, f, g }
}

// A small sequencer that schedules the current station a little ahead of time.
function play(name) {
  clearInterval(timer)
  const s = STATIONS[name]
  if (!s) return
  const spb = 60 / s.bpm
  let i = 0
  let at = ctx.currentTime + 0.4
  let bar = 0
  timer = setInterval(() => {
    while (at < ctx.currentTime + 0.5) {
      const [semi, beats] = s.notes[i % s.notes.length]
      const dur = beats * spb
      if (semi != null) tone(s.root * 2 ** (semi / 12), at, dur * 0.85, { wave: s.wave, gain: s.wave === 'square' ? 0.05 : 0.12, to: radioBus })
      if (semi != null && humming) tone((s.root / 2) * 2 ** (semi / 12), at, dur * 0.9, { gain: 0.035, attack: 0.08 })
      // A soft accompaniment on the first beat of each bar.
      if (bar % s.beat < 1e-6) tone(s.root / 2, at, spb * 0.9, { wave: 'sine', gain: 0.09, to: radioBus })
      bar += beats
      at += dur
      i++
    }
  }, 120)
}

export const sound = {
  start() {
    if (ctx) return
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = 0.8
    master.connect(ctx.destination)
    // The radio's own small, boxy speaker.
    const lo = (speakerLo = ctx.createBiquadFilter())
    lo.type = 'lowpass'
    lo.frequency.value = 2600
    const hi = ctx.createBiquadFilter()
    hi.type = 'highpass'
    hi.frequency.value = 220
    radioBus = ctx.createGain()
    radioBus.gain.value = 0
    radioBus.connect(hi).connect(lo).connect(master)
    // Tape and valve hiss, looping.
    hiss = ctx.createBufferSource()
    hiss.buffer = noiseBuffer(3)
    hiss.loop = true
    const hf = ctx.createBiquadFilter()
    hf.type = 'bandpass'
    hf.frequency.value = 3000
    const hg = (hissGain = ctx.createGain())
    hg.gain.value = 0.05
    hiss.connect(hf).connect(hg).connect(radioBus)
    hiss.start()
    // The room tone: a faint low hum of the building.
    const hum = ctx.createOscillator()
    const humG = ctx.createGain()
    hum.frequency.value = 50
    humG.gain.value = 0.012
    hum.connect(humG).connect(master)
    hum.start()
  },

  radio(next, hum = humming) {
    humming = hum
    if (!ctx || next === station) return
    station = next
    const t = ctx.currentTime
    radioBus.gain.cancelScheduledValues(t)
    radioBus.gain.setTargetAtTime(0, t, 0.08)
    noise(t, 0.35, { freq: 1800, q: 0.6, gain: 0.08 }) // the sweep between stations
    hissGain.gain.setTargetAtTime(next === 'static' ? 0.35 : 0.05, t, 0.2)
    clearInterval(timer)
    if (next === 'off') return
    if (next === 'katyusha') play(next)
    radioBus.gain.setTargetAtTime(0.9, t + 0.35, 0.3)
  },
  hum(on) {
    humming = on
  },
  // 0 = coherent, 1 = falling apart: the music drifts out of tune and goes muffled.
  distort(level) {
    wobble = Math.max(0, level) * 120
    if (speakerLo) speakerLo.frequency.setTargetAtTime(2600 - level * 1900, ctx.currentTime, 1)
  },
  weather(kind) {
    if (!ctx) return
    if (weatherNode) {
      weatherNode.g.gain.setTargetAtTime(0, ctx.currentTime, 1)
      weatherNode.src.stop(ctx.currentTime + 4)
      weatherNode = null
    }
    if (kind !== 'rain' && kind !== 'snow') return
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer(4)
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = kind === 'rain' ? 'highpass' : 'bandpass'
    f.frequency.value = kind === 'rain' ? 2200 : 400
    f.Q.value = kind === 'rain' ? 0.5 : 0.4
    const g = ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(kind === 'rain' ? 0.06 : 0.035, ctx.currentTime, 2)
    src.connect(f).connect(g).connect(master)
    src.start()
    weatherNode = { src, g }
  },

  knock() {
    if (!ctx) return
    const t = ctx.currentTime
    ;[0, 0.32, 0.64].forEach((d) => noise(t + d, 0.12, { type: 'lowpass', freq: 220, q: 2, gain: 0.5 }))
  },
  rattle() {
    if (!ctx) return
    const t = ctx.currentTime
    for (let i = 0; i < 4; i++) noise(t + i * 0.07, 0.05, { freq: 2400, q: 4, gain: 0.25 })
  },
  creak() {
    if (!ctx) return
    const t = ctx.currentTime
    const o = tone(90, t, 1.4, { wave: 'sawtooth', gain: 0.03, attack: 0.2 })
    o.frequency.linearRampToValueAtTime(140, t + 1.4)
  },
  lock() {
    if (!ctx) return
    const t = ctx.currentTime
    noise(t, 0.06, { freq: 3000, q: 6, gain: 0.3 })
    noise(t + 0.12, 0.08, { freq: 1500, q: 6, gain: 0.3 })
  },
  thud() {
    if (!ctx) return
    noise(ctx.currentTime, 0.3, { type: 'lowpass', freq: 160, gain: 0.5 })
  },
  shift() {
    if (!ctx) return
    const t = ctx.currentTime
    const o = tone(110, t, 2.5, { wave: 'sine', gain: 0.06, attack: 0.8 })
    o.frequency.exponentialRampToValueAtTime(70, t + 3)
  },
  breath() {
    if (!ctx) return
    noise(ctx.currentTime, 0.9, { freq: 700, q: 0.7, gain: 0.03, attack: 0.4 })
  },
}
