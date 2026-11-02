import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BACKGROUND, BUILDING, GROUND, LAB_COLORS, STREET } from './palette.js'
import { LAB, OVERVIEW, SCRIPT, VIEWS, clamp01, ease, revealAt } from './lab.js'
import { NO_CUT, RevealContext, capped, useReveal } from './section.js'

// The scene uses the city's local metres: x to the east, y up, and north towards -z.
// A point (x, y) of the plan sits at (x, height, -y) in the scene.

const STREET_Y = 1.2 // street lines float just above the ground
const RETURN_SPEED = 2 // on return, the reveal runs back this many times faster

// The city itself. Anything drawn with it, like the outbreak or the laboratory, comes in as `children`.
// `revealStart` is when the underground reveal began (performance.now()), or null on the surface.
// `view` picks a camera angle of the section: { i, n }, where a new `n` asks for an angle again.
export default function CityScene({ city, spin, revealStart, view, children }) {
  const { x0, y0, x1, y1 } = city.bounds
  const span = Math.max(x1 - x0, y1 - y0)
  // Where the camera starts: a little south of the centre, where the outbreak starts.
  const home = useMemo(() => ({ eye: [-0.3 * span, 0.75 * span, 0.62 * span], target: [0, 0, 0.1 * span] }), [span])

  const reveal = useRef({ t: 0, k: revealAt(0) })
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), NO_CUT), [])
  const shared = useMemo(() => ({ reveal, plane }), [plane])

  return (
    <Canvas
      camera={{ position: home.eye, fov: 40, near: 5, far: 20 * span }}
      dpr={[1, 2]}
      onCreated={({ gl }) => {
        gl.clippingPlanes = [plane]
      }}
    >
      <RevealContext.Provider value={shared}>
        <Clock revealStart={revealStart} startZ={-y0 + 60} />
        <Atmosphere span={span} />

        <Ground bounds={city.bounds} />
        <Buildings buildings={city.buildings} />
        <Streets edges={city.edges} />
        {children}

        <OrbitControls makeDefault target={home.target} enableDamping autoRotate={spin} autoRotateSpeed={0.35} />
        <Director home={home} span={span} active={revealStart != null} view={view} />
      </RevealContext.Provider>
    </Canvas>
  )
}

// Runs before everything else each frame: the reveal's time, its parts, and the section plane,
// which sweeps north from the city's south edge to cutZ.
function Clock({ revealStart, startZ }) {
  const { reveal, plane } = useReveal()

  useFrame((_, dt) => {
    const r = reveal.current
    if (revealStart != null) r.t = (performance.now() - revealStart) / 1000
    else r.t = Math.max(0, Math.min(r.t, SCRIPT.settle) - dt * RETURN_SPEED)
    r.k = revealAt(r.t)
    plane.constant = r.k.cut > 0 ? THREE.MathUtils.lerp(startZ, LAB.cutZ, r.k.cut) : NO_CUT
  }, -1)
  return null
}

// The night over the city turns to the navy and cyan of the laboratory feed.
function Atmosphere({ span }) {
  const { reveal } = useReveal()
  const hemi = useRef()
  const sun = useRef()
  const colors = useMemo(
    () => ({
      background: [new THREE.Color(BACKGROUND), new THREE.Color(LAB_COLORS.background)],
      sky: [new THREE.Color('#9aa6ba'), new THREE.Color('#6fb8e8')],
      sun: [new THREE.Color('#c9d3e8'), new THREE.Color('#7fd0ff')],
    }),
    [],
  )

  useFrame(({ scene }) => {
    const k = reveal.current.k.night
    scene.background.lerpColors(...colors.background, k)
    scene.fog.color.copy(scene.background)
    hemi.current.color.lerpColors(...colors.sky, k)
    sun.current.color.lerpColors(...colors.sun, k)
    sun.current.intensity = 1.4 - 0.6 * k
  })

  return (
    <>
      <color attach="background" args={[BACKGROUND]} />
      <fog attach="fog" args={[BACKGROUND, 1.1 * span, 3.2 * span]} />
      <hemisphereLight ref={hemi} args={['#9aa6ba', '#141619', 1.1]} />
      <directionalLight ref={sun} position={[-700, 1100, -500]} intensity={1.4} color="#c9d3e8" />
    </>
  )
}

// Moves the camera: the scripted reveal, the section's camera angles, and back home on return.
// In between the mouse orbits; under the city only in a limited range, so the section stays in view.
function Director({ home, span, active, view }) {
  const { reveal } = useReveal()
  const controls = useThree((s) => s.controls)
  const state = useRef({ mode: 'idle', active: false, n: view.n, from: null })
  const v = useMemo(() => ({ eye: new THREE.Vector3(), target: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() }), [])

  useFrame(({ camera }, dt) => {
    if (!controls) return
    const s = state.current
    const { t } = reveal.current

    if (active && !s.active) {
      s.mode = 'script'
      s.from = { eye: camera.position.clone(), target: controls.target.clone() }
    }
    if (!active && s.active) s.mode = 'return'
    s.active = active
    if (view.n !== s.n) {
      s.n = view.n
      if (s.mode === 'explore' || s.mode === 'preset') s.mode = 'preset'
    }

    if (s.mode === 'script') {
      // From wherever the camera was, up over the city centre, then down to the section.
      const [from, to, k] =
        t < SCRIPT.overview
          ? [s.from, OVERVIEW, ease(clamp01(t / SCRIPT.overview))]
          : [{ eye: v.a.set(...OVERVIEW.eye), target: v.b.set(...OVERVIEW.target) }, VIEWS[0], ease(clamp01((t - SCRIPT.overview) / (SCRIPT.settle - SCRIPT.overview)))]
      camera.position.lerpVectors(from.eye, v.eye.set(...to.eye), k)
      controls.target.lerpVectors(from.target, v.target.set(...to.target), k)
      if (t >= SCRIPT.settle) s.mode = 'explore'
    } else if (s.mode === 'preset' || s.mode === 'return') {
      const to = s.mode === 'preset' ? VIEWS[view.i] : home
      const k = 1 - Math.exp(-dt * 2)
      camera.position.lerp(v.eye.set(...to.eye), k)
      controls.target.lerp(v.target.set(...to.target), k)
      if (camera.position.distanceTo(v.eye) < 3) s.mode = s.mode === 'preset' ? 'explore' : 'idle'
    }

    // What the mouse may do.
    const lab = s.mode === 'explore'
    controls.enabled = s.mode === 'idle' || lab
    controls.enablePan = !lab
    controls.minAzimuthAngle = lab ? -1.25 : -Infinity
    controls.maxAzimuthAngle = lab ? 1.25 : Infinity
    controls.minPolarAngle = lab ? 0.15 : 0
    controls.maxPolarAngle = lab ? 1.65 : Math.PI * 0.47
    controls.minDistance = lab ? 120 : 60
    controls.maxDistance = lab ? 1.2 * span : 3 * span
    if (!controls.enabled) controls.update()
  })
  return null
}

function Ground({ bounds: { x0, y0, x1, y1 } }) {
  const { reveal } = useReveal()
  const mesh = useRef()
  const colors = useMemo(() => [new THREE.Color(GROUND), new THREE.Color(LAB_COLORS.ground)], [])
  const margin = 400

  useFrame(() => {
    const k = reveal.current.k.night
    const m = mesh.current.material
    m.color.lerpColors(...colors, k)
    m.opacity = 1 - 0.85 * k // the ground turns to glass over the laboratory
    mesh.current.renderOrder = k > 0 ? 9 : 0
  })

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0, -(y0 + y1) / 2]}>
      <planeGeometry args={[x1 - x0 + 2 * margin, y1 - y0 + 2 * margin]} />
      <meshLambertMaterial color={GROUND} transparent />
    </mesh>
  )
}

// All buildings in one mesh, so orbiting stays smooth. Under the reveal they turn into a pale blue ghost,
// and where the section cuts them their inside shows as a solid section colour.
function Buildings({ buildings }) {
  const { reveal } = useReveal()
  const mesh = useRef()
  const geometry = useMemo(() => mergeBuildings(buildings), [buildings])
  useEffect(() => () => geometry.dispose(), [geometry])
  const material = useMemo(() => capped(new THREE.MeshLambertMaterial({ color: BUILDING, transparent: true }), LAB_COLORS.buildingCut), [])
  useEffect(() => () => material.dispose(), [material])
  const colors = useMemo(() => [new THREE.Color(BUILDING), new THREE.Color(LAB_COLORS.building)], [])

  useFrame(() => {
    const k = reveal.current.k.night
    material.color.lerpColors(...colors, k)
    material.opacity = 1 - 0.6 * k
    mesh.current.renderOrder = k > 0 ? 10 : 0 // drawn after the laboratory's light, so it shows through
  })

  return <mesh ref={mesh} geometry={geometry} material={material} />
}

function mergeBuildings(buildings) {
  const parts = buildings.map((b) => {
    const g = new THREE.ExtrudeGeometry(toShape(b.rings), { depth: b.height, bevelEnabled: false })
    g.rotateX(-Math.PI / 2) // extrude upwards, with the plan's north towards -z
    g.deleteAttribute('uv')
    return g
  })
  const geometry = mergeGeometries(parts)
  parts.forEach((g) => g.dispose())
  return geometry
}

function Streets({ edges }) {
  const { reveal } = useReveal()
  const geometry = useMemo(() => {
    const pos = []
    for (const e of edges)
      for (let i = 1; i < e.pts.length; i++) {
        const [a, b] = [e.pts[i - 1], e.pts[i]]
        pos.push(a[0], STREET_Y, -a[1], b[0], STREET_Y, -b[1])
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return g
  }, [edges])
  useEffect(() => () => geometry.dispose(), [geometry])
  const material = useRef()
  const colors = useMemo(() => [new THREE.Color(STREET), new THREE.Color(LAB_COLORS.street)], [])

  useFrame(() => material.current.color.lerpColors(...colors, reveal.current.k.night))

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial ref={material} color={STREET} />
    </lineSegments>
  )
}

// A polygon's rings (outer first, then holes) as a three.js Shape.
function toShape(rings) {
  const path = (ring) => ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y))
  const shape = new THREE.Shape(path(rings[0]))
  for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(path(hole)))
  return shape
}
