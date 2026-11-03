// The reconstruction. Everything lives here, in the page; Claude is stateless and only gets
// a compact summary when enough has happened. Kept apart:
//   world   – what the room actually shows (door, music, weather)
//   els     – each piece of the memory: status, your answer, evidence, interpretation, confidence
//   events  – what you did; decisions – what the AI chose, why, and what really happened

import { ELEMENTS, LIMITS, validateDecision } from './actions.js'

const API = `${import.meta.env?.BASE_URL ?? "/"}api/mind`
const MIN_GAP = 10 // seconds between decisions
const THRESHOLD = 3 // weight of events before the AI is asked
const IDLE = 20 // seconds of stillness that count as an event
const FAIL_AT = 35 // coherence at or below which the memory collapses
const CORE = ['mother', 'father', 'child', 'grandmother', 'television', 'tea_table', 'samovar']
const SAVE = 'borrowed-memories-fragments'

export const LABELS = {
  mother: 'A woman by the table', father: 'A man with a newspaper', child: 'A child on the carpet', grandmother: 'An older woman',
  nevalyashka: 'Nevalyashka', matryoshka: 'Matryoshka', cheburashka: 'Cheburashka', tea_table: 'The tea table', samovar: 'Samovar',
  floor_carpet: 'The carpet', wall_carpet: 'The wall carpet', television: 'The television', radio: 'The radio',
  weather: 'The window', knock: 'The front door', photograph: 'The photograph',
}
const CLEAR = {
  mother: 'She pours tea from a small kettle and looks to her right, towards the music. She is humming.',
  father: 'He reads a newspaper. Now and then he lowers it to look at the child.',
  child: 'A child on the carpet, surrounded by toys, not looking up.',
  grandmother: 'Snow on her coat and headscarf. She has brought something wrapped in paper.',
  nevalyashka: 'A roly-poly doll. Every time it falls, it rocks back up.',
  matryoshka: 'Painted nesting dolls. The smallest one is missing.',
  cheburashka: 'A soft toy with enormous ears, lying face down on the carpet.',
  tea_table: 'Glasses in metal holders, a plate of sweets and tangerines, a white cloth.',
  samovar: 'Brass, on the floor beside the table, quietly boiling.',
  floor_carpet: 'Red and blue medallions, worn pale where the child sits.',
  wall_carpet: 'A deep red carpet hung on the wall, as every family had.',
  television: 'A wooden-cased set. The song is coming from here.',
  radio: 'A valve radio. The dial glows when it is on.',
}
const BY_STATUS = {
  unknown: 'Only a shape. You cannot make it out.',
  suggested: 'Faint. It might have been here.',
  uncertain: 'It blurs whenever you look at it directly.',
  contradicted: "It doesn't fit with the rest. It shifts as you look.",
}
const PEOPLE = { mother: 'a woman pouring tea', father: 'a man with a newspaper', child: 'a child on the floor', grandmother: 'an older woman in a coat' }

export function describe(id, s) {
  const w = s.world
  if (id === 'photograph') {
    const seen = Object.keys(PEOPLE).filter((p) => s.els[p].status === 'reconstructed').map((p) => PEOPLE[p])
    return `A photograph taken that day, white light in the window. ${seen.length ? `You can make out ${seen.join(', ')}.` : 'Too blurred to make out anyone.'}`
  }
  if (id === 'weather') return { fog: 'Fog on the glass. You cannot see outside.', snow: 'Snow, falling slowly over the courtyard.', rain: 'Rain running down the glass.' }[w.weather]
  if (id === 'knock') return w.door === 'open' ? 'The front door stands open. Cold air from the stairwell.' : 'The front door of the apartment. Padded, with a small brass number.'
  const e = s.els[id]
  return e.status === 'reconstructed' ? CLEAR[id] : BY_STATUS[e.status] ?? ''
}

function loadFragments() {
  try {
    return JSON.parse(localStorage.getItem(SAVE) ?? '[]').filter((id) => ELEMENTS.includes(id))
  } catch {
    return []
  }
}

export function createMind(sound, onChange) {
  const fragments = loadFragments()
  const els = Object.fromEntries(ELEMENTS.map((id) => [id, { status: 'unknown', answer: null, by: null, evidence: [], interp: '', conf: 0 }]))
  const start = { radio: 'reconstructed', tea_table: 'suggested', floor_carpet: 'suggested', nevalyashka: 'suggested', matryoshka: 'suggested', cheburashka: 'suggested' }
  for (const [id, st] of Object.entries(start)) Object.assign(els[id], { status: st, conf: st === 'reconstructed' ? 0.6 : 0.3 })
  for (const id of fragments)
    if (els[id].status === 'unknown') Object.assign(els[id], { status: 'suggested', conf: 0.3, evidence: ['kept from a previous attempt (unreliable)'] })

  const s = {
    phase: 'intro', // intro → awake → fading → ending
    ending: null, // 'remembered' | 'sleep'
    attempt: fragments.length ? 2 : 1,
    online: null,
    busy: false,
    world: { door: 'closed', music: 'off', weather: 'fog' },
    els,
    strain: 0,
    coherence: 100,
    question: null,
    events: [],
    sentUpTo: 0,
    visits: {},
    idle: 0,
    decisions: [],
    caption: null,
    inspect: null,
    score: 0,
    triggers: [],
    sinceDecision: 0,
    tokens: 0,
    clockT: 0,
  }
  const emit = () => onChange({ ...s })

  const observe = (text, weight = 0, trigger) => {
    s.events.push({ t: Math.round(s.clockT), text })
    s.score += weight
    if (trigger) s.triggers.push(trigger)
  }
  const say = (speaker, line) => {
    s.caption = { speaker, line, key: Math.random() }
    sound.breath()
  }
  const coherence = () => {
    const n = (st) => ELEMENTS.filter((id) => els[id].status === st).length
    return Math.max(0, Math.min(100, 100 - 15 * n('contradicted') - 5 * n('uncertain') - s.strain))
  }
  // Every status change goes through here, so evidence and confidence stay with the element.
  const setStatus = (id, status, by, why) => {
    const e = els[id]
    e.status = status
    e.by = by
    e.conf = { reconstructed: by === 'you' ? 0.8 : 0.5, suggested: 0.3, uncertain: 0.2, contradicted: 0.1, removed: by === 'you' ? 0.7 : 0.4, unknown: 0 }[status]
    if (why) e.evidence = [...e.evidence, why].slice(-3)
  }
  // True when the AI would act against what you answered: that makes a contradiction.
  const against = (id, wantsPresent) => els[id].answer && (els[id].answer === 'a') !== wantsPresent

  function settle() {
    s.coherence = coherence()
    sound.distort(1 - s.coherence / 100)
    if (s.coherence <= FAIL_AT && s.phase === 'awake') collapse()
  }

  // ---------- what you do ----------

  function inspect(id) {
    if (s.phase !== 'awake') return
    const n = (s.visits[id] = (s.visits[id] ?? 0) + 1)
    s.idle = 0
    s.inspect = { id, text: describe(id, s), key: Math.random() }
    observe(`examined ${LABELS[id].toLowerCase()}${n > 1 ? ` (${n}x)` : ''}`, n >= 2 ? 2 : 1, n >= 2 ? `keeps returning to ${id}` : null)
    emit()
  }

  function setMusic(station) {
    if (s.phase !== 'awake' || s.world.music === station) return
    s.idle = 0
    s.world.music = station
    sound.radio(station, els.mother.status === 'reconstructed')
    if (station === 'katyusha') observe('put Katyusha on', 3, 'Katyusha playing')
    else observe(station === 'off' ? 'switched the music off' : 'tuned away to static', 2, `music ${station}`)
    emit()
  }

  function answer(choice) {
    const q = s.question
    if (!q || s.phase !== 'awake') return
    s.question = null
    s.idle = 0
    const e = els[q.element]
    const prev = e.answer
    e.answer = choice
    const yes = choice === 'a'
    observe(`answered "${yes ? q.a_label : q.b_label}" to "${q.question}"`, 3, `answer about ${q.element}`)
    if (prev && prev !== choice) {
      setStatus(q.element, 'contradicted', 'you', 'you answered differently before')
      s.strain += 10
    } else if (q.element === 'weather') {
      s.world.weather = yes ? 'snow' : 'rain'
      sound.weather(s.world.weather)
      setStatus('weather', 'reconstructed', 'you', `you remembered ${s.world.weather}`)
    } else if (yes) {
      setStatus(q.element, 'reconstructed', 'you', 'you remembered it')
      if (q.element === 'knock') sound.knock()
      if (q.element === 'mother') sound.hum(true)
    } else {
      setStatus(q.element, 'removed', 'you', 'you said it was not there')
      if (q.element === 'mother') sound.hum(false)
    }
    s.sinceDecision = Math.max(s.sinceDecision, MIN_GAP - 3) // let the memory respond soon
    settle()
    emit()
  }

  // "I'm not sure": closes the question without changing the scene. It adds no weight, so it never
  // triggers an AI call by itself; the AI only sees it with the next call that happens anyway.
  function skip() {
    const q = s.question
    if (!q || s.phase !== 'awake') return
    s.question = null
    s.idle = 0
    observe(`was not sure about "${q.question}" and skipped it`)
    emit()
  }

  // ---------- time ----------

  function tick(dt) {
    if (s.phase !== 'awake') return
    s.clockT += dt
    s.sinceDecision += dt
    s.idle += dt
    if (s.idle > IDLE) {
      s.idle = 0
      observe(s.question ? 'left the question unanswered' : `did nothing for ${IDLE} seconds`, s.question ? 1 : 3, 'stillness')
    }
    if (s.tokens >= LIMITS.tokens && !s.busy) return finish()
    if (s.online && !s.busy && !s.question && s.decisions.length < LIMITS.cycles && s.score >= THRESHOLD && s.sinceDecision >= MIN_GAP) decide()
    emit()
  }

  // ---------- the AI ----------

  function context() {
    const c = s.decisions.length
    const core = CORE.every((id) => els[id].status === 'reconstructed')
    const short = (e) => [e.status, e.answer && (e.answer === 'a' ? 'you:yes' : 'you:no'), e.by === 'memory' && 'by:memory', e.conf.toFixed(1)].filter(Boolean).join(' ')
    return {
      cycle: `${c + 1}/${LIMITS.cycles}`,
      final: c + 1 >= LIMITS.cycles || core || s.tokens > LIMITS.tokens * 0.8,
      attempt: s.attempt,
      coherence: s.coherence,
      trigger: [...new Set(s.triggers)].slice(-4),
      world: s.world,
      scene: Object.fromEntries(ELEMENTS.map((id) => [id, short(els[id])])),
      since_last: s.events.slice(s.sentUpTo).slice(-8).map((e) => `${e.t}s ${e.text}`),
      attention: s.visits,
      recent_decisions: s.decisions.slice(-3).map((d) => `${d.action}: ${String(d.result).slice(0, 110)}`),
    }
  }

  async function decide() {
    const ctx = context()
    s.busy = true
    s.sentUpTo = s.events.length
    s.score = 0
    s.triggers = []
    s.sinceDecision = 0
    emit()
    let reply
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctx) })
      reply = await r.json()
      if (!r.ok) throw new Error(reply.error ?? r.status)
    } catch (e) {
      s.busy = false
      s.decisions.push({ n: s.decisions.length + 1, failed: true, result: `The memory did not answer (${e.message}).` })
      if (s.decisions.filter((d) => d.failed).length >= 3) s.online = false
      return emit()
    }
    s.tokens += reply.usage?.tokens ?? 0
    const v = validateDecision(reply.decision ?? reply) // check again: never execute anything off the list
    const ok = v.ok && reply.ok !== false
    const d = v.decision ?? { action: 'wait', params: {}, observed: '', decision: '', reason: '', interpretation: '', confidence: 'low' }
    if (ok && d.params.element) els[d.params.element].interp = d.interpretation
    d.result = ok ? execute(d) : `Rejected and ignored (${(reply.problems?.length ? reply.problems : v.problems).join('; ')}).`
    d.n = s.decisions.length + 1
    d.rejected = !ok
    s.decisions.push(d)
    observe(`(result of your last action: ${d.result})`)
    s.busy = false
    settle()
    if (s.phase === 'awake' && (ctx.final || s.decisions.length >= LIMITS.cycles)) setTimeout(finish, s.question ? 30000 : 12000)
    emit()
  }

  // Executes one validated decision on the actual room and returns what really happened.
  function execute({ action, params: p }) {
    const w = s.world
    const L = (id) => LABELS[id]
    switch (action) {
      case 'wait':
        return 'Waited. Nothing changed.'
      case 'ask_memory_question':
        s.question = { ...p, key: Math.random() }
        sound.breath()
        return `Asked about ${p.element}: "${p.question}"`
      case 'reveal_memory_element': {
        if (p.element === 'weather') return 'The weather can only change through change_weather.'
        if (against(p.element, true)) {
          setStatus(p.element, 'contradicted', 'memory', 'restored although you said it was not there')
          return `Brought back ${L(p.element).toLowerCase()} against your answer: it is now contradicted.`
        }
        if (els[p.element].status === p.as) return `${L(p.element)} was already ${p.as}.`
        setStatus(p.element, p.as, 'memory', 'the memory put it here')
        sound.shift()
        return `${L(p.element)} is now ${p.as}${p.element === 'grandmother' && w.door !== 'open' ? ', waiting behind the closed door' : ''}.`
      }
      case 'remove_memory_element':
        if (against(p.element, false)) {
          setStatus(p.element, 'contradicted', 'memory', 'removed although you remembered it')
          return `Tried to remove ${L(p.element).toLowerCase()}, which you remembered: it is now contradicted.`
        }
        if (els[p.element].status === 'removed') return `${L(p.element)} was already gone.`
        setStatus(p.element, 'removed', 'memory', 'the memory let it go')
        if (p.element === 'mother') sound.hum(false)
        sound.shift()
        return `${L(p.element)} faded out of the scene.`
      case 'alter_memory_element':
        if (els[p.element].status === p.to) return `${L(p.element)} was already ${p.to}.`
        setStatus(p.element, p.to, 'memory', `the memory made it ${p.to}`)
        sound.shift()
        return `${L(p.element)} became ${p.to}.`
      case 'change_weather': {
        if (w.weather === p.weather) return `It was already ${p.weather} outside.`
        const was = els.weather.answer
        w.weather = p.weather
        sound.weather(p.weather)
        if (was && (was === 'a') !== (p.weather === 'snow')) {
          setStatus('weather', 'contradicted', 'memory', `changed to ${p.weather} against your answer`)
          return `Changed the window to ${p.weather}, against what you remembered.`
        }
        setStatus('weather', p.weather === 'fog' ? 'uncertain' : 'suggested', 'memory', `the memory chose ${p.weather}`)
        return `Outside the window: ${p.weather}.`
      }
      case 'change_radio':
        if (w.music === p.station) return `The music was already ${p.station}.`
        w.music = p.station
        sound.radio(p.station, els.mother.status === 'reconstructed')
        return p.station === 'off' ? 'Silenced the music.' : `Tuned to ${p.station === 'katyusha' ? 'Katyusha' : 'static'}.`
      case 'replace_radio_with_tv':
        if (els.radio.status === 'removed' && els.television.status === 'reconstructed') return 'The television was already there instead of the radio.'
        setStatus('radio', 'removed', 'memory', 'replaced by the television')
        if (against('television', true)) {
          setStatus('television', 'contradicted', 'memory', 'the memory chose the TV although you said radio')
          return 'Replaced the radio with a television against your answer: the television flickers, contradicted.'
        }
        setStatus('television', 'reconstructed', 'memory', 'the song came from the television')
        sound.shift()
        return 'The radio dissolved. A television stands in its place, playing the song.'
      case 'trigger_voice': {
        say(p.speaker, p.line)
        const gone = p.speaker !== 'memory' && ['removed', 'unknown'].includes(els[p.speaker].status)
        return `${p.speaker === 'memory' ? 'The memory' : `The ${p.speaker}'s voice`} said: "${p.line}"${gone ? ' (someone not in the scene)' : ''}`
      }
      case 'trigger_door_knock':
        sound.knock()
        if (against('knock', true)) {
          setStatus('knock', 'contradicted', 'memory', 'knocked although you said nobody knocked')
          return 'A knock at the front door, although you said there was none.'
        }
        if (els.knock.status !== 'reconstructed') setStatus('knock', 'suggested', 'memory', 'the memory heard a knock')
        return 'Three knocks at the front door.'
      case 'open_front_door':
        if (w.door === 'open') return 'The front door was already open.'
        w.door = 'open'
        sound.creak()
        return `The front door opened${['reconstructed', 'suggested', 'uncertain'].includes(els.grandmother.status) ? ' and someone is standing there' : ' onto an empty stairwell'}.`
      case 'reveal_grandmother': {
        const opened = w.door !== 'open'
        w.door = 'open'
        if (opened) sound.creak()
        if (against('grandmother', true) || els.knock.answer === 'b') {
          setStatus('grandmother', 'contradicted', 'memory', 'appeared although you rejected her or the knock')
          return 'Grandmother appeared in the doorway, against what you remembered: she flickers.'
        }
        setStatus('grandmother', 'reconstructed', 'memory', 'she arrived after the knock')
        return `${opened ? 'The front door opened. ' : ''}Grandmother stands in the doorway, snow on her coat.`
      }
      case 'destabilise_scene':
        s.strain += 15
        sound.shift()
        return 'The scene loosened: edges blur, the music warps.'
      case 'restore_scene':
        if (!s.strain) return 'The scene was already as stable as it could be.'
        s.strain = Math.max(0, s.strain - 15)
        sound.shift()
        return 'The scene steadied a little.'
    }
    return 'Nothing happened.'
  }

  // ---------- endings ----------

  function save() {
    try {
      localStorage.setItem(SAVE, JSON.stringify(ELEMENTS.filter((id) => els[id].status === 'reconstructed')))
    } catch {
      /* private window: nothing is kept */
    }
  }
  function collapse() {
    s.phase = 'fading'
    s.question = null
    say('doctor', "That's enough for today. Take your medication and get some sleep.")
    save()
    setTimeout(() => {
      sound.radio('off')
      sound.weather('fog')
      s.phase = 'ending'
      s.ending = 'sleep'
      emit()
    }, 7000)
  }
  function finish() {
    if (s.phase !== 'awake') return
    s.question = null
    save()
    s.phase = 'ending'
    s.ending = 'remembered'
    emit()
  }

  async function checkOnline() {
    try {
      const r = await fetch(API)
      s.online = r.ok && (await r.json()).ok === true
    } catch {
      s.online = false
    }
    emit()
  }

  function wake() {
    s.phase = 'awake'
    sound.start()
    say('memory', s.attempt > 1 ? 'Again. Some of it stayed with me. I am not sure the right parts did.' : 'There was a room. A song. I can almost see it. Help me put it back together.')
    setTimeout(() => {
      if (s.phase === 'awake' && s.world.music === 'off') say('memory', 'The radio. Try the radio.')
      emit()
    }, 9000)
    emit()
  }

  checkOnline()
  return { inspect, setMusic, answer, skip, tick, wake, get: () => ({ ...s }) }
}
