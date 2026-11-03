// The living room, drawn with HTML and CSS. Every piece takes its look from its status in the
// reconstruction: unknown = silhouette, suggested = faint, reconstructed = clear,
// uncertain = blurred, contradicted = distorted, removed = gone.
import './room.css'

const KEYS = [['katyusha', 'Katyusha'], ['static', 'Static'], ['off', 'Off']]

// `fixed` pieces (the front door, the window) are part of the apartment: always clear, only what they show is uncertain.
function Piece({ id, els, onInspect, className = '', label, fixed, children }) {
  const st = fixed ? 'reconstructed' : els[id].status
  return (
    <button className={`piece ${id} ${className} st-${st}`} aria-label={label ?? id.replace('_', ' ')} onClick={() => onInspect(id)} tabIndex={st === 'removed' ? -1 : 0}>
      {children}
    </button>
  )
}

function Person({ kind }) {
  return (
    <span className={`person p-${kind}`} aria-hidden="true">
      <i className="chair" />
      <i className="body" />
      <i className="head" />
      <i className="prop" />
    </span>
  )
}

function Keys({ music, onMusic }) {
  return (
    <span className="keys" role="radiogroup" aria-label="Music">
      {KEYS.map(([k, label]) => (
        <button key={k} role="radio" aria-checked={music === k} className={music === k ? 'down' : ''} onClick={() => onMusic(k)}>
          {label}
        </button>
      ))}
    </span>
  )
}

export default function Room({ s, onInspect, onMusic }) {
  const { els, world: w } = s
  const p = { els, onInspect }
  const clear = Object.values(els).filter((e) => e.status === 'reconstructed').length / Object.keys(els).length
  const tvPlays = els.radio.status === 'removed' && els.television.status !== 'removed'
  const music = w.music !== 'off'

  return (
    <div
      className={`room weather-${w.weather} ${music ? 'music-on' : ''} phase-${s.phase}`}
      style={{ '--clarity': clear.toFixed(2), '--loss': (1 - s.coherence / 100).toFixed(2) }}
    >
      <div className="wall" />
      <div className="floor" />
      <div className="skirting" />
      <div className="lamp" aria-hidden="true"><i className="cord" /><i className="shade" /></div>

      <Piece id="knock" {...p} fixed className={`front-door door-${w.door}`} label="Front door">
        <span className="stair" />
        <span className="leaf"><i className="quilt" /><i className="handle" /><i className="number" /></span>
      </Piece>
      {w.door === 'open' && (
        <Piece id="grandmother" {...p} label="Grandmother">
          <Person kind="grandma" />
        </Piece>
      )}

      <Piece id="weather" {...p} fixed className="window" label="Window">
        <span className="outside"><i className="snow" /><i className="rain" /><i className="blocks" /></span>
        <span className="frame" />
      </Piece>

      <Piece id="wall_carpet" {...p} label="Wall carpet"><span className="weave" /></Piece>

      <button className="piece photograph" aria-label="Photograph" onClick={() => onInspect('photograph')} style={{ '--photo-blur': `${(1 - clear) * 3 + (1 - s.coherence / 100) * 4}px` }}>
        <span className="print">
          {['father', 'mother', 'child', 'grandmother'].map((k) => (
            <i key={k} className={`f f-${k} st-${els[k].status}`} />
          ))}
        </span>
      </button>

      <div className="sideboard" aria-hidden="true"><i /><i /></div>
      <Piece id="television" {...p} label="Television">
        <span className="screen"><i className="glow" /></span>
      </Piece>
      <Piece id="radio" {...p} label="Radio">
        <span className="cloth" />
        <span className="dial"><i className="needle" style={{ left: `${15 + KEYS.findIndex(([k]) => k === w.music) * 32}%` }} /></span>
      </Piece>
      <div className={`controls ${tvPlays ? 'on-tv' : 'on-radio'}`}>
        <Keys music={w.music} onMusic={onMusic} />
      </div>

      <Piece id="floor_carpet" {...p} label="Carpet"><span className="weave" /></Piece>
      <Piece id="father" {...p} label="Father"><Person kind="father" /></Piece>
      <Piece id="tea_table" {...p} label="Tea table">
        <i className="cloth" /><i className="leg a" /><i className="leg b" />
        <i className="glass g1" /><i className="glass g2" /><i className="kettle" /><i className="plate" />
      </Piece>
      <Piece id="mother" {...p} label="Mother"><Person kind="mother" /></Piece>
      <Piece id="samovar" {...p} label="Samovar"><i className="body" /><i className="top" /><i className="tap" /><i className="steam" /></Piece>
      <Piece id="child" {...p} label="Child"><Person kind="child" /></Piece>
      <Piece id="nevalyashka" {...p} label="Nevalyashka"><i className="b" /><i className="h" /></Piece>
      <Piece id="matryoshka" {...p} label="Matryoshka"><i className="m1" /><i className="m2" /></Piece>
      <Piece id="cheburashka" {...p} label="Cheburashka"><i className="ear l" /><i className="ear r" /><i className="b" /></Piece>

      <div className="light" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
    </div>
  )
}
