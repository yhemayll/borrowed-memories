// node server/check-mind.mjs — runs the reconstruction offline with made-up AI answers (no tokens):
// checks answers change the scene, acting against an answer creates a contradiction,
// low coherence ends in the doctor's "sleep" ending, and running out of budget ends in "remembered".
import { createMind } from '../src/mind.js'

const quiet = new Proxy({}, { get: () => () => {} }) // a silent sound engine
const reply = (action, params = {}, tokens = 5000) => ({ ok: true, decision: { observed: 'o', interpretation: 'i', decision: 'd', reason: 'r', action, params, confidence: 'low' }, usage: { tokens } })
let queue = []
globalThis.fetch = async (_, opt) => ({ ok: true, json: async () => (opt?.method === 'POST' ? queue.shift() : { ok: true }) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const check = (ok, name) => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name) }

async function step(m, decision) {
  queue.push(decision)
  m.inspect('photograph'); m.inspect('photograph') // enough weight to ask the AI
  m.tick(11)
  await wait(20)
}

// 1. A coherent reconstruction that ends when the budget runs out.
let m = createMind(quiet, () => {})
await wait(10)
m.wake()
await step(m, reply('ask_memory_question', { element: 'mother', question: 'Was she there?', a_label: 'Yes', b_label: 'No' }))
check(m.get().question?.element === 'mother', 'the AI can ask a question')
m.answer('a')
check(m.get().els.mother.status === 'reconstructed' && m.get().els.mother.by === 'you', 'answering yes reconstructs the mother')
await step(m, reply('reveal_grandmother', {}, 999999))
check(m.get().world.door === 'open' && m.get().els.grandmother.status === 'reconstructed', 'the AI opens the door and reveals grandmother')
m.tick(1)
check(m.get().phase === 'ending' && m.get().ending === 'remembered', 'out of budget: the "remembered" ending')

// 2. A reconstruction that falls apart.
m = createMind(quiet, () => {})
await wait(10)
m.wake()
await step(m, reply('ask_memory_question', { element: 'knock', question: 'Did someone knock?', a_label: 'Yes', b_label: 'No' }))
m.answer('b')
check(m.get().els.knock.status === 'removed', 'answering no removes the knock')
await step(m, reply('trigger_door_knock'))
check(m.get().els.knock.status === 'contradicted', 'knocking against your answer is a contradiction')
await step(m, reply('reveal_grandmother'))
check(m.get().els.grandmother.status === 'contradicted', 'grandmother after a rejected knock is a contradiction')
await step(m, reply("destabilise_scene"))
await step(m, reply("destabilise_scene"))
await step(m, reply('destabilise_scene'))
check(m.get().coherence <= 35 && m.get().phase === 'fading', `coherence ${m.get().coherence}%: the doctor interrupts`)
await wait(7200)
check(m.get().ending === 'sleep', 'the "sleep" ending follows')

// 3. "I'm not sure" closes the question, changes nothing and calls nobody.
m = createMind(quiet, () => {})
await wait(10)
m.wake()
await step(m, reply('ask_memory_question', { element: 'samovar', question: 'Was the samovar there?', a_label: 'Yes', b_label: 'No' }))
const calls = m.get().decisions.length
const status = m.get().els.samovar.status
m.skip()
m.tick(5) // shorter than the 20 s of stillness that would wake the AI on its own
await wait(20)
check(!m.get().question && m.get().els.samovar.status === status && m.get().decisions.length === calls, "I'm not sure: question gone, scene unchanged, no AI call")

// 4. A malformed answer changes nothing.
m = createMind(quiet, () => {})
await wait(10)
m.wake()
const before = JSON.stringify(m.get().els)
await step(m, { ok: false, problems: ['unknown action'], decision: { action: 'format_disk' } })
check(JSON.stringify(m.get().els) === before && m.get().decisions[0].rejected, 'a rejected answer leaves the scene untouched')
process.exit(fails)
