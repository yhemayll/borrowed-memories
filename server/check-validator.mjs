// node server/check-validator.mjs — feeds the checker bad AI answers; none may pass.
import { validateDecision } from '../src/actions.js'
const good = { observed: 'a', interpretation: 'b', decision: 'c', reason: 'd', action: 'reveal_memory_element', params: { element: 'samovar', as: 'reconstructed' }, confidence: 'low' }
const cases = {
  'valid decision': [good, true],
  'valid question': [{ ...good, action: 'ask_memory_question', params: { element: 'weather', question: 'Snow or rain?', a_label: 'Snow', b_label: 'Rain' } }, true],
  'not an object': ['rm -rf /', false],
  'null': [null, false],
  'unknown action': [{ ...good, action: 'delete_files' }, false],
  'unknown element': [{ ...good, params: { element: 'dog', as: 'reconstructed' } }, false],
  'bad status': [{ ...good, params: { element: 'samovar', as: 'certain' } }, false],
  'missing params': [{ ...good, params: undefined }, false],
  'question without answers': [{ ...good, action: 'ask_memory_question', params: { element: 'mother', question: 'Was she there?' } }, false],
  'empty voice line': [{ ...good, action: 'trigger_voice', params: { speaker: 'mother', line: '   ' } }, false],
}
let bad = 0
for (const [name, [input, expect]] of Object.entries(cases)) {
  const r = validateDecision(input)
  const pass = r.ok === expect && (r.ok || !r.decision || r.decision.action === 'wait')
  if (!pass) bad++
  console.log(pass ? 'ok  ' : 'FAIL', name, r.problems.join('; '))
}
const long = validateDecision({ ...good, reason: 'x'.repeat(5000) })
console.log(long.decision.reason.length <= 160 ? 'ok  ' : 'FAIL', 'long text is clipped to', long.decision.reason.length)
process.exit(bad)
