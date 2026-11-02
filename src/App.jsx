import { useEffect, useMemo, useRef, useState } from 'react'
import CityScene from './CityScene.jsx'
import Hud from './Hud.jsx'
import LabScene from './LabScene.jsx'
import OutbreakLayer from './OutbreakLayer.jsx'
import { loadKit, prepare } from './city.js'
import { LIFT_START } from './lab.js'
import { STAGES, WEEKS, infectedAt, simulate, stageAt } from './outbreak.js'
import { INFECTION_STOPS } from './palette.js'

const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'

const PLAY_WEEKS_PER_S = 0.2 // five seconds a week
const HUD_AFTER_MS = 4200 // the surveillance feed comes up once the section is open
const MUSIC_URL = `${import.meta.env.BASE_URL}music/final-countdown.wav`
const CLICK_URL = `${import.meta.env.BASE_URL}music/click.mp3`

const fmt = (n) => n.toLocaleString('en-GB')

export default function App() {
  const [city, setCity] = useState(null)
  const [error, setError] = useState(null)
  const [week, setWeek] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [intro, setIntro] = useState(true)
  const [discovery, setDiscovery] = useState(false)
  const [revealStart, setRevealStart] = useState(null) // when the underground reveal began, or null
  const [liftStart, setLiftStart] = useState(null) // when the lift last set off
  const [view, setView] = useState({ i: 0, n: 0 }) // the camera angle of the section
  const [hud, setHud] = useState(false)
  const lab = revealStart != null

  useEffect(() => {
    loadKit()
      .then((raw) => setCity(prepare(raw)))
      .catch((e) => setError(`The city kit didn't load (${e.message}).`))
  }, [])

  const sim = useMemo(() => city && simulate(city), [city])

  // Play: move the slider forward until the last week.
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame
    const step = (now) => {
      const dt = (now - last) / 1000
      last = now
      setWeek((w) => Math.min(w + dt * PLAY_WEEKS_PER_S, WEEKS))
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  // Reaching the last week reveals the discovery, once each time the slider arrives there.
  const atEnd = week >= WEEKS
  useEffect(() => {
    if (!atEnd) return setDiscovery(false)
    setPlaying(false)
    const t = setTimeout(() => setDiscovery(true), 1100) // let the map catch up first
    return () => clearTimeout(t)
  }, [atEnd])

  // The underground reveal: the section cuts through the city, the laboratory lights up, the lift goes down.
  const revealLab = () => {
    click()
    const now = performance.now()
    setDiscovery(false)
    setPlaying(false)
    setRevealStart(now)
    setLiftStart(now + LIFT_START * 1000)
    setView({ i: 0, n: 0 })
  }
  useEffect(() => {
    if (!lab) return setHud(false)
    const t = setTimeout(() => setHud(true), HUD_AFTER_MS)
    return () => clearTimeout(t)
  }, [lab])

  // Background music, looping once the simulation begins.
  const music = useRef(null)

  // A click sound for the main buttons, restarted on every press.
  const clickSound = useRef(null)
  const click = () => {
    const s = clickSound.current
    if (!s) return
    s.currentTime = 0
    s.play().catch(() => {})
  }

  const begin = () => {
    click()
    setIntro(false)
    setWeek(0)
    music.current?.play().catch(() => {})
  }

  const scrub = (w) => {
    setPlaying(false)
    setWeek(w)
  }

  const togglePlay = () => {
    if (!playing) click() // only when starting or resuming, not when pausing
    if (!playing && week >= WEEKS) setWeek(0)
    setPlaying(!playing)
  }

  const zero = sim?.sites[0]
  const look = (i) => {
    click()
    setView((v) => ({ i, n: v.n + 1 }))
  }

  return (
    <div className={`app${discovery || lab ? ' covered' : ''}${lab ? ' underground' : ''}`} style={{ '--threat': (intro ? 0 : week / WEEKS).toFixed(3) }}>
      <div className="scene">
        {city && sim ? (
          <CityScene city={city} spin={intro} revealStart={revealStart} view={view}>
            {!intro && <OutbreakLayer sim={sim} week={week} />}
            <LabScene bounds={city.bounds} site0={[zero.x, zero.y]} liftStart={liftStart} tags={hud && view.i !== 1} />
          </CityScene>
        ) : (
          <p className="loading">{error ?? 'Loading the city…'}</p>
        )}
      </div>
      <div className="atmosphere" aria-hidden="true" />

      {!intro && !lab && sim && (
        <>
          <Status week={week} sim={sim} onStory={() => setIntro(true)} onReveal={atEnd && !discovery ? revealLab : null} />
          <Timeline week={week} playing={playing} onScrub={scrub} onPlay={togglePlay} />
          <Legend />
        </>
      )}

      {intro && <Intro ready={!!sim} error={error} onBegin={begin} />}
      {discovery && !lab && <Discovery onReveal={revealLab} onStay={() => setDiscovery(false)} />}
      {lab && !hud && <Descent />}
      {lab && hud && (
        <Hud
          revealStart={revealStart}
          liftStart={liftStart}
          view={view.i}
          onView={look}
          onLift={() => {
            click()
            setLiftStart(performance.now())
          }}
          onReturn={() => {
            click()
            setRevealStart(null)
          }}
        />
      )}

      <audio ref={music} src={MUSIC_URL} loop preload="auto" />
      <audio ref={clickSound} src={CLICK_URL} preload="auto" />

      <p className="attribution">{ATTRIBUTION}</p>
    </div>
  )
}

function Intro({ ready, error, onBegin }) {
  return (
    <div className="modal intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="modal-card">
        <p className="eyebrow">An alternate-history simulation</p>
        <h1 id="intro-title">
          Weimar: Survival or the Next <span className="accent">Raccoon City?</span>
        </h1>
        <p className="subtitle">“Every city has secrets. Some should have stayed buried.”</p>
        <div className="story">
          <p>
            In this version of history, Umbrella Corporation never stayed in Raccoon City. Its subsidiaries spread quietly
            across Europe, buying warehouses, laboratories and leases under names nobody remembered.
          </p>
          <p>
            In Weimar, one of those names rented a small industrial unit at the south-western edge of the old town. The
            paperwork said cold storage for medical supplies. Below it, behind a door no inspector ever saw, Umbrella
            sealed off a research level of its own.
          </p>
          <p>
            For years the city noticed nothing: a few night deliveries, a hum under the pavement. Then, on a wet October
            night, a pressure seal failed.
          </p>
          <p>What follows are four weeks, street by street.</p>
        </div>
        <button className="primary" onClick={onBegin} disabled={!ready}>
          {ready ? 'Begin simulation' : error ? 'The city did not load' : 'Loading the city…'}
        </button>
        <p className="fiction">
          A work of fiction. Umbrella Corporation, the facility and the outbreak are invented. The buildings and streets
          are Weimar's real geometry from open data.
        </p>
      </div>
    </div>
  )
}

function Status({ week, sim, onStory, onReveal }) {
  const stage = stageAt(week)
  const infected = infectedAt(sim.roofTimes, week)
  const total = sim.roofs.length
  const day = Math.round(week * 7)

  return (
    <aside className="panel">
      <p className="eyebrow">Outbreak simulation · fiction</p>
      <div className="week">
        <span className="week-number">Week {stage.week}</span>
        <span className="day">Day {day}</span>
      </div>
      <h2 key={stage.week} className="stage-title">
        {stage.title}
      </h2>
      <p key={`t${stage.week}`} className="stage-text">
        {stage.text}
      </p>
      <dl className="stats">
        <div>
          <dt>Buildings infected</dt>
          <dd>
            {fmt(infected)} <span>of {fmt(total)}</span>
          </dd>
        </div>
        <div>
          <dt>Share of the model</dt>
          <dd>{Math.round((100 * infected) / total)}%</dd>
        </div>
      </dl>
      <div className="meter" aria-hidden="true">
        <div style={{ width: `${(100 * infected) / total}%` }} />
      </div>
      {onReveal && (
        <button className="primary small" onClick={onReveal}>
          Reveal underground lab
        </button>
      )}
      <button className="link" onClick={onStory}>
        Read the story again
      </button>
    </aside>
  )
}

function Timeline({ week, playing, onScrub, onPlay }) {
  return (
    <div className="timeline">
      <button className="play" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play the outbreak'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="track">
        <input
          type="range"
          min="0"
          max={WEEKS}
          step="0.01"
          value={week}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Week of the outbreak"
          aria-valuetext={`Week ${week.toFixed(1)}`}
          style={{ '--fill': `${(100 * week) / WEEKS}%` }}
        />
        <ol className="ticks">
          {STAGES.map((s) => (
            <li key={s.week} style={{ left: `${(100 * s.week) / WEEKS}%` }}>
              <button className={Math.floor(week + 1e-6) === s.week ? 'on' : ''} onClick={() => onScrub(s.week)}>
                <b>
                  <i>Week </i>
                  {s.week}
                </b>
                <span>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <details className="legend" open={window.matchMedia('(min-width: 641px)').matches}>
      <summary>Legend</summary>
      <div className="ramp" style={{ background: `linear-gradient(to right, ${INFECTION_STOPS.join(', ')})` }} />
      <div className="ramp-labels">
        <span>new case</span>
        <span>established</span>
      </div>
      <ul>
        <li>
          <span className="key glow" /> infection zone along the streets
        </li>
        <li>
          <span className="key beam" /> outbreak site
        </li>
        <li>
          <span className="key arc" /> spread from one site to the next
        </li>
        <li>
          <span className="key dash" /> quarantine perimeter
        </li>
      </ul>
      <p className="note">A fictional scenario. The markers are not real data.</p>
    </details>
  )
}

function Discovery({ onReveal, onStay }) {
  return (
    <div className="modal discovery" role="dialog" aria-modal="true" aria-labelledby="discovery-title">
      <div className="modal-card">
        <p className="eyebrow">Week 4 · Day 28</p>
        <h1 id="discovery-title">“The outbreak didn't begin here.”</h1>
        <p className="story">
          Evidence points to a concealed research complex beneath Weimar. The source of the outbreak may be closer than
          anyone imagined.
        </p>
        <button className="primary reveal" onClick={onReveal}>
          Reveal underground lab
        </button>
        <button className="link" onClick={onStay}>
          Stay on the surface
        </button>
      </div>
    </div>
  )
}

// Captions while the section opens, before the surveillance feed comes up.
function Descent() {
  return (
    <div className="descent" role="status">
      <p>Tracing the signal beneath the city</p>
      <p>Cutting a section through Weimar</p>
      <p>Sublevel complex detected</p>
    </div>
  )
}
