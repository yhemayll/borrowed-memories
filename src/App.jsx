import { useEffect, useMemo, useState } from 'react'
import Room from './Room.jsx'
import { ELEMENTS, LIMITS } from './actions.js'
import { LABELS, createMind } from './mind.js'
import { sound } from './sound.js'

const SPEAKERS = { memory: 'The memory', mother: 'Mother', father: 'Father', grandmother: 'Grandmother', child: 'The child', doctor: 'The doctor' }
const NAMES = { ...LABELS, mother: 'Mother', father: 'Father', child: 'The child', grandmother: 'Grandmother', weather: 'The weather', knock: 'The knock at the door' }
const LOCAL_NOTE = 'AI intelligence runs locally. Open the project on localhost to experience the interactive memory system.'
const SAVE = 'borrowed-memories-fragments'

export default function App() {
  const [s, setS] = useState(null)
  const mind = useMemo(() => createMind(sound, setS), [])
  useEffect(() => setS(mind.get()), [mind])

  // One clock for the whole reconstruction: stillness, and when to ask the AI.
  useEffect(() => {
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      mind.tick((now - last) / 1000)
      last = now
    }, 250)
    return () => clearInterval(id)
  }, [mind])

  if (!s) return null
  return (
    <div className={`app phase-${s.phase}`}>
      <main className="scene">
        <Room s={s} onInspect={mind.inspect} onMusic={mind.setMusic} />
        {s.phase === 'awake' && s.inspect && <Inspect key={s.inspect.key} item={s.inspect} />}
        {s.phase === 'awake' && s.question && <Question key={s.question.key} q={s.question} onAnswer={mind.answer} onSkip={mind.skip} />}
        {s.caption && s.phase !== 'ending' && <Caption key={s.caption.key} caption={s.caption} />}
      </main>
      {s.phase !== 'intro' && s.ending !== 'sleep' && <Activity s={s} />}
      {s.phase === 'intro' && <Intro s={s} onWake={mind.wake} />}
      {s.phase === 'ending' && <Ending s={s} />}
    </div>
  )
}

function Intro({ s, onWake }) {
  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="title">
      <h1 id="title">Borrowed Memories</h1>
      <p className="lede">{s.attempt > 1 ? 'Another session. Some fragments stayed.' : 'A memory is trying to remember one winter evening. It needs you.'}</p>
      <button className="wake" onClick={onWake}>
        Begin the reconstruction
      </button>
      <p className="how">Click what you want to look at. Use the radio. When the memory asks, choose an answer. Nothing else is asked of you. Sound on.</p>
      <p className={`status ${s.online ? 'on' : ''}`}>
        {s.online == null ? 'Listening for the memory…' : s.online ? 'The memory is present: Claude Haiku, running on this computer.' : LOCAL_NOTE}
      </p>
    </div>
  )
}

function Inspect({ item }) {
  return (
    <aside className="inspect" aria-live="polite">
      <p className="label">{LABELS[item.id]}</p>
      <p>{item.text}</p>
    </aside>
  )
}

function Caption({ caption }) {
  return (
    <p className={`caption speaker-${caption.speaker}`} aria-live="polite">
      <span>{SPEAKERS[caption.speaker]}</span>
      {caption.line}
    </p>
  )
}

function Question({ q, onAnswer, onSkip }) {
  return (
    <div className="question" role="dialog" aria-labelledby="q-text">
      <p className="label">A fragment · {NAMES[q.element]}</p>
      <h2 id="q-text">{q.question}</h2>
      <div className="choices">
        <button onClick={() => onAnswer('a')}>{q.a_label}</button>
        <button onClick={() => onAnswer('b')}>{q.b_label}</button>
      </div>
      <button className="unsure" onClick={onSkip}>
        I'm not sure
      </button>
    </div>
  )
}

function Activity({ s }) {
  const [tab, setTab] = useState('events')
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches)
  const done = s.decisions.length
  return (
    <aside className={`activity ${open ? 'open' : ''}`}>
      <button className="activity-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Memory activity</span>
        <span className={`pulse ${s.busy ? 'thinking' : s.online ? 'on' : ''}`}>{s.online === false ? 'offline' : s.busy ? 'deciding' : 'observing'}</span>
      </button>
      {open && (
        <>
          <div className="meta">
            <span>Coherence {s.coherence}%</span>
            <span>Decision {done}/{LIMITS.cycles}</span>
            <span title="tokens used of this attempt's budget">{Math.round(s.tokens / 1000)}k / {LIMITS.tokens / 1000}k tokens</span>
          </div>
          <div className={`coherence ${s.coherence < 55 ? 'low' : ''}`} aria-hidden="true">
            <i style={{ width: `${s.coherence}%` }} />
          </div>
          <div className="tabs" role="tablist">
            {[['events', 'Decisions'], ['scene', 'Reconstruction']].map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>
          <div className="activity-body">
            {s.online === false && <p className="note">{LOCAL_NOTE}</p>}
            {tab === 'events' ? (
              <>
                {s.busy && <p className="note thinking">Comparing what you did with what it remembers…</p>}
                {!done && !s.busy && s.online && <p className="note">It is watching what you do. It will act when it has seen enough.</p>}
                {[...s.decisions].reverse().map((d) => (
                  <Decision key={d.n} d={d} />
                ))}
              </>
            ) : (
              <Scene els={s.els} />
            )}
          </div>
        </>
      )}
    </aside>
  )
}

function Decision({ d }) {
  const n = String(d.n).padStart(3, '0')
  if (d.failed)
    return (
      <article className="card failed">
        <h3>Memory event {n}</h3>
        <p>{d.result}</p>
      </article>
    )
  return (
    <article className={`card ${d.rejected ? 'failed' : ''}`}>
      <h3>
        Memory event {n} <span>· autonomous decision</span>
      </h3>
      <dl>
        <dt>Observed</dt>
        <dd>{d.observed}</dd>
        <dt>Decision</dt>
        <dd>{d.decision}</dd>
        <dt>Action</dt>
        <dd className="did">
          <code>{d.action}</code> {d.result}
        </dd>
        <dt>Reason</dt>
        <dd>{d.reason}</dd>
      </dl>
      <p className={`certainty u-${d.confidence === 'low' ? 'high' : 'low'}`}>confidence: {d.confidence}</p>
    </article>
  )
}

function Scene({ els, only }) {
  const ids = only ?? ELEMENTS
  return ids.map((id) => {
    const e = els[id]
    return (
      <div key={id} className={`el s-${e.status}`}>
        <b>{NAMES[id]}</b>
        <span className="pill">{e.status}</span>
        <small>
          {e.answer ? `You answered ${e.answer === 'a' ? 'yes' : 'no'}. ` : ''}
          {e.by === 'memory' ? 'Placed by the memory. ' : ''}
          {e.interp && `“${e.interp}” `}
          {e.status !== 'unknown' && `Confidence ${Math.round(e.conf * 100)}%.`}
        </small>
      </div>
    )
  })
}

function Ending({ s }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), s.ending === 'sleep' ? 600 : 2500)
    return () => clearTimeout(t)
  }, [s.ending])
  const fresh = () => {
    try {
      localStorage.removeItem(SAVE)
    } catch {
      /* nothing kept anyway */
    }
    location.reload()
  }
  const built = ELEMENTS.filter((id) => s.els[id].status === 'reconstructed')
  const yours = built.filter((id) => s.els[id].by === 'you').length
  const its = built.length - yours

  if (s.ending === 'sleep')
    return (
      <div className={`ending sleep ${shown ? 'shown' : ''}`} role="dialog" aria-modal="true" aria-labelledby="end-title">
        <div className="ending-card">
          <p className="eyebrow">Session ended</p>
          <h2 id="end-title">The memory could not hold together.</h2>
          <p className="lede">Some fragments will stay for the next attempt. Whether they are the right ones, nobody can say.</p>
          <button className="wake" onClick={() => location.reload()}>
            Try again tomorrow
          </button>
        </div>
      </div>
    )
  return (
    <div className={`ending remembered ${shown ? 'shown' : ''}`} role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="ending-card">
        <p className="eyebrow">The reconstruction holds · coherence {s.coherence}%</p>
        <h2 id="end-title">Did we remember it, or did we make it together?</h2>
        <p className="lede">
          {yours} {yours === 1 ? 'piece' : 'pieces'} came from your answers. {its} the memory placed by itself. It made {s.decisions.length} decisions nobody asked for.
        </p>
        <div className="ending-lists">
          <Scene els={s.els} only={built} />
        </div>
        <p className="how">
          <button className="wake" onClick={() => location.reload()}>
            Remember again
          </button>{' '}
          <button className="wake" onClick={fresh}>
            Forget everything
          </button>
        </p>
      </div>
    </div>
  )
}
