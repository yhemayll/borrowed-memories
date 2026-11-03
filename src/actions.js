// The only things the AI may do, and the checker every answer passes through.
// Shared by the page (before executing) and the local backend (before replying).

export const LIMITS = {
  cycles: 16, // AI decisions per reconstruction attempt
  tokens: 140000, // input + output tokens per attempt, as reported by the CLI
  text: 160, // longest string the AI may write in any field
  responseBytes: 4000, // longest raw answer the backend accepts
}

// The pieces of the memory. 'weather' and 'knock' are pieces too.
export const ELEMENTS = ['mother', 'father', 'child', 'grandmother', 'nevalyashka', 'matryoshka', 'cheburashka', 'tea_table', 'samovar', 'floor_carpet', 'wall_carpet', 'television', 'radio', 'weather', 'knock']

// action → its params, each with allowed values ('text' = free text)
export const ACTIONS = {
  wait: {},
  ask_memory_question: { element: ELEMENTS, question: 'text', a_label: 'text', b_label: 'text' },
  reveal_memory_element: { element: ELEMENTS, as: ['suggested', 'reconstructed'] },
  remove_memory_element: { element: ELEMENTS },
  alter_memory_element: { element: ELEMENTS, to: ['suggested', 'uncertain', 'contradicted'] },
  change_weather: { weather: ['snow', 'rain', 'fog'] },
  change_radio: { station: ['katyusha', 'static', 'off'] },
  replace_radio_with_tv: {},
  trigger_voice: { speaker: ['memory', 'mother', 'father', 'grandmother', 'child'], line: 'text' },
  trigger_door_knock: {},
  open_front_door: {},
  reveal_grandmother: {},
  destabilise_scene: {},
  restore_scene: {},
}

const str = (max) => ({ type: 'string', maxLength: max })
const allParams = {}
for (const spec of Object.values(ACTIONS))
  for (const [k, v] of Object.entries(spec)) allParams[k] = Array.isArray(v) ? { type: 'string', enum: v } : str(LIMITS.text)

// The JSON schema handed to the CLI with --json-schema.
export const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['observed', 'interpretation', 'decision', 'reason', 'action', 'params', 'confidence'],
  properties: {
    observed: str(LIMITS.text),
    interpretation: str(LIMITS.text),
    decision: str(LIMITS.text),
    reason: str(LIMITS.text),
    action: { type: 'string', enum: Object.keys(ACTIONS) },
    params: { type: 'object', additionalProperties: false, properties: allParams },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
}

const clip = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.text)

// Returns { ok, decision, problems }. A failing decision becomes a harmless 'wait'.
export function validateDecision(raw) {
  const problems = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: ['not an object'], decision: null }
  const d = {
    observed: clip(raw.observed),
    interpretation: clip(raw.interpretation),
    decision: clip(raw.decision),
    reason: clip(raw.reason),
    confidence: ['low', 'medium', 'high'].includes(raw.confidence) ? raw.confidence : 'low',
    action: raw.action,
    params: {},
  }
  const spec = ACTIONS[raw.action]
  if (!spec) problems.push(`unknown action "${String(raw.action).slice(0, 40)}"`)
  else {
    const p = raw.params && typeof raw.params === 'object' ? raw.params : {}
    for (const [k, allowed] of Object.entries(spec)) {
      const v = p[k]
      if (allowed === 'text') {
        if (!clip(v)) problems.push(`${k} is empty`)
        else d.params[k] = clip(v)
      } else if (!allowed.includes(v)) problems.push(`${k} "${String(v).slice(0, 20)}" not allowed`)
      else d.params[k] = v
    }
  }
  if (problems.length) return { ok: false, problems, decision: { ...d, action: 'wait', params: {} } }
  return { ok: true, problems, decision: d }
}
