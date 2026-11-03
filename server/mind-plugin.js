// The local backend: a Vite dev-server add-on that asks the Claude Code CLI for one decision.
// It exists only while `npm run dev` runs on this laptop; the published site never contains it.
// No API key: the CLI uses its own login. The model gets no tools and can only return JSON
// that matches DECISION_SCHEMA, which is then checked again by validateDecision.

import { spawn } from 'node:child_process'
import { ACTIONS, DECISION_SCHEMA, LIMITS, validateDecision } from '../src/actions.js'

const TIMEOUT_MS = 60000
const MAX_BODY = 16000

const SYSTEM = `You are a damaged MEMORY trying to reconstruct one childhood scene in a Soviet-era apartment, together with the person it belongs to. You do not know the true scene. You only have their answers, their behaviour and the evidence in the room; judge coherence and uncertainty, never claim to verify the past.

Your fragments (uncertain): a song, Katyusha; a blurry photograph taken that day; winter; tea; someone knocking at the front door; toys on a carpet (nevalyashka, matryoshka, a Cheburashka toy); a woman humming; a man behind a newspaper; an older woman arriving. Perhaps the song came from a television, not the radio.

Each turn you get the reconstruction state (element: status, the person's answer, your confidence), recent behaviour and your last decisions with their results. Choose ONE action. Decide yourself what to investigate, reveal, change or remove next, based on what they examine, return to, answer and contradict. Never follow a fixed order. You may act without being asked.

Rules:
- ask_memory_question: one short question about ONE element, in your intimate voice. Option A must mean the element WAS there (weather: snow; television: the song came from the TV). Option B means it was not (weather: rain). Labels are short first-person answers.
- Do not ask while a question is still open; do not ask about the same element twice in a row.
- Revealing or removing something against the person's answer creates a contradiction. Do it only if evidence justifies it, and say so.
- If coherence is low or contradictions pile up, either restore_scene or let it fall apart (destabilise_scene).
- Prefer actions that visibly or audibly change the room. Mix questions with autonomous changes, roughly half each.
- If "final" is true, make a last change that leaves open whether this memory was recovered or built together.
- English. Each text field one short sentence. "observed" names concrete behaviour, not hidden reasoning.

Actions and params:
${Object.entries(ACTIONS)
  .map(([a, p]) => `- ${a} ${Object.keys(p).length ? JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Array.isArray(v) ? v.join('|') : v]))) : '{}'}`)
  .join('\n')}`

function askClaude(context) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model', 'haiku',
      '--effort', 'low',
      '--safe-mode',
      '--tools', '',
      '--output-format', 'json',
      '--no-session-persistence',
      '--json-schema', JSON.stringify(DECISION_SCHEMA),
      '--system-prompt', SYSTEM,
      '--max-budget-usd', '0.05',
    ]
    // No shell: arguments go straight to the program, so nothing in them can run as a command.
    const child = spawn('claude', args, { shell: false, windowsHide: true, cwd: process.env.TEMP || process.cwd() })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('the CLI took too long'))
    }, TIMEOUT_MS)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new Error(`could not start the Claude CLI (${e.code ?? e.message})`))
    })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        resolve(JSON.parse(out))
      } catch {
        reject(new Error(`the CLI did not return JSON ${err.slice(0, 200)}`))
      }
    })
    child.stdin.end(`Current situation (JSON):\n${JSON.stringify(context)}\n\nDecide your one action now.`)
  })
}

const send = (res, code, body) => {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default function mindPlugin() {
  let busy = false
  return {
    name: 'borrowed-memories-mind',
    apply: 'serve', // never part of the build
    configureServer(server) {
      server.middlewares.use('/api/mind', (req, res) => {
        // Only this page may use it, so another website can't spend your Claude usage.
        const origin = req.headers.origin
        if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'wrong origin' })
        if (req.method === 'GET') return send(res, 200, { ok: true, limits: LIMITS })
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        if (busy) return send(res, 429, { error: 'already thinking' })

        let body = ''
        req.on('data', (d) => {
          body += d
          if (body.length > MAX_BODY) req.destroy()
        })
        req.on('end', async () => {
          let context
          try {
            context = JSON.parse(body)
          } catch {
            return send(res, 400, { error: 'bad JSON' })
          }
          busy = true
          try {
            const r = await askClaude(context)
            const raw = r.structured_output ?? (() => { try { return JSON.parse(r.result) } catch { return null } })()
            const size = JSON.stringify(raw ?? '').length
                        const checked = size > LIMITS.responseBytes ? { ok: false, problems: ['answer too long'], decision: null } : validateDecision(raw)
            const u = r.usage ?? {}
            const tokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0)
            send(res, 200, { ...checked, usage: { tokens, cost: r.total_cost_usd ?? 0, ms: r.duration_ms ?? 0 }, cliError: r.is_error ? String(r.result).slice(0, 200) : null })
          } catch (e) {
            send(res, 502, { error: e.message })
          } finally {
            busy = false
          }
        })
      })
    },
  }
}
