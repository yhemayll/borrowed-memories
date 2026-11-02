import { useEffect, useState } from 'react'
import { LAB, LEVELS, LIFT_TOTAL_S, VIEWS, liftWhere, liftY } from './lab.js'

// The Umbrella surveillance feed over the laboratory reveal. It reads the same clock as the 3D scene.

const MISSION_OFFSET_S = 2 * 3600 + 31 * 60 + 12 // the feed has been running a while already

export default function Hud({ revealStart, liftStart, view, onView, onLift, onReturn }) {
  const now = useNow(100)
  const s = (now - liftStart) / 1000
  const depth = Math.max(0, -liftY(s))
  const where = liftWhere(s)
  const moving = s > 0 && s < LIFT_TOTAL_S && !LEVELS.some((l) => l.code === where)
  const mission = clock(MISSION_OFFSET_S + (now - revealStart) / 1000)

  return (
    <div className="hud">
      <div className="hud-scan" aria-hidden="true" />
      <div className="hud-frame" aria-hidden="true">
        <i /> <i /> <i /> <i />
      </div>

      <header className="hud-top">
        <div className="hud-feed">
          <span className="rec" /> {VIEWS[view].cam} · {VIEWS[view].label.toUpperCase()}
          <span className="hud-dim"> · security feed</span>
        </div>
        <div className="hud-status">
          Facility status <b>Containment failure</b>
        </div>
      </header>

      <div className="hud-brand">
        <UmbrellaLogo size={34} />
        <div>
          <b>Umbrella</b>
          <span>Corporation</span>
        </div>
      </div>

      <aside className="hud-side">
        <section className="hud-box">
          <h3>Facility schematic</h3>
          <Schematic liftY={liftY(s)} where={where} />
          <div className="hud-title">
            <span>Sublevel complex W-4</span>
            <b>The Hive</b>
          </div>
        </section>
        <section className="hud-box">
          <h3>Containment</h3>
          <ul className="containment">
            {LEVELS.map((l) => (
              <li key={l.code} className={where === l.code ? 'here' : ''}>
                <b>{l.code}</b>
                <span>{l.name}</span>
                <em className={l.status === 'No signal' ? 'grey' : l.status.startsWith('Breached') ? 'red' : 'amber'}>{l.status}</em>
              </li>
            ))}
          </ul>
          <div className="gauges">
            <Gauge label="Seals" value={0.18 + 0.04 * Math.sin(now / 900)} />
            <Gauge label="Power" value={0.64 + 0.03 * Math.sin(now / 1300)} />
            <Gauge label="Air" value={0.31 + 0.05 * Math.sin(now / 700)} />
          </div>
        </section>
      </aside>

      <details className="hud-record" open>
        <summary>Facility record · fiction</summary>
        <p>
          In this alternate history, the first chambers under the city were dug decades ago for a secret research
          programme. Its files were sealed and forgotten.
        </p>
        <p>
          Umbrella Corporation acquired the site through a front company and drove it five levels deeper. The
          industrial unit at Site 0 was only ever a service entrance.
        </p>
      </details>

      <footer className="hud-bottom">
        <div className="hud-depth">
          <div className="bar" aria-hidden="true">
            <div style={{ height: `${(100 * depth) / -LAB.floor}%` }} />
          </div>
          <div>
            <span className="hud-dim">Lift depth</span>
            <b>{Math.round(depth)} m</b>
            <span className={moving ? 'hud-live' : 'hud-dim'}>{moving ? '▼ Descending' : where === 'Shaft' ? 'At the surface' : `Stopped at ${where}`}</span>
          </div>
        </div>

        <nav className="hud-views" aria-label="Camera angle">
          {VIEWS.map((v, i) => (
            <button key={v.key} className={i === view ? 'on' : ''} onClick={() => onView(i)}>
              {v.label}
            </button>
          ))}
          <button onClick={onLift}>Run lift</button>
          <button className="surface" onClick={onReturn}>
            Return to the surface
          </button>
        </nav>

        <div className="hud-mission">
          <span className="hud-dim">Mission time</span>
          <b>{mission}</b>
        </div>
      </footer>
    </div>
  )
}

// A side elevation of the tower, with the lift on its way down.
function Schematic({ liftY, where }) {
  const sx = (x) => 100 + x / 3.2
  const sy = (y) => 8 + (-y / -LAB.floor) * 236
  return (
    <svg className="schematic" viewBox="0 0 200 250" aria-label="Schematic of the laboratory">
      <line x1="0" x2="200" y1={sy(0)} y2={sy(0)} className="ground" />
      <rect x={sx(-LAB.halfWidth)} y={sy(LAB.ceiling)} width={(2 * LAB.halfWidth) / 3.2} height={sy(LAB.floor) - sy(LAB.ceiling)} className="cavern" />
      {LEVELS.map((l) =>
        Array.from({ length: l.tiers }, (_, k) => {
          const r = l.r - k * 8
          return (
            <rect
              key={`${l.code}${k}`}
              x={sx(-r)}
              y={sy(l.y - k * 15)}
              width={(2 * r) / 3.2}
              height="2.4"
              className={where === l.code ? 'tier here' : 'tier'}
            />
          )
        }),
      )}
      <line x1="100" x2="100" y1={sy(0)} y2={sy(LAB.floor)} className="shaft" />
      <rect x="96" y={sy(liftY) - 2} width="8" height="4" className="lift" />
      {LEVELS.map((l) => (
        <text key={l.code} x="2" y={sy(l.y) + 3}>
          {l.code}
        </text>
      ))}
    </svg>
  )
}

function Gauge({ label, value }) {
  const c = 2 * Math.PI * 15
  return (
    <div className="gauge">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="15" className="track" />
        <circle cx="20" cy="20" r="15" className="value" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <span>{Math.round(value * 100)}%</span>
      <em>{label}</em>
    </div>
  )
}

// The Umbrella emblem: eight wedges, red and white.
export function UmbrellaLogo({ size = 32 }) {
  const wedges = Array.from({ length: 8 }, (_, k) => {
    const a0 = ((k - 0.5) / 8) * Math.PI * 2 - Math.PI / 2
    const a1 = ((k + 0.5) / 8) * Math.PI * 2 - Math.PI / 2
    const p = (a) => `${(20 + 19 * Math.cos(a)).toFixed(2)},${(20 + 19 * Math.sin(a)).toFixed(2)}`
    return <polygon key={k} points={`20,20 ${p(a0)} ${p(a1)}`} fill={k % 2 ? '#f2f2f2' : '#d4001c'} />
  })
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="Umbrella Corporation">
      {wedges}
    </svg>
  )
}

function useNow(ms) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function clock(seconds) {
  const s = Math.floor(seconds)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
}
