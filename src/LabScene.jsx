import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { LAB, LEVELS, accessRoutes, buildLab, liftY } from './lab.js'
import { LAB_COLORS as C } from './palette.js'
import { capped, useReveal } from './section.js'

// The fictional laboratory under the city, revealed by the section plane.
// It sits in the city's coordinates, so the shaft rises to a real spot in the centre of Weimar.
// `liftStart` is when the lift sets off (performance.now()); `tags` shows the level names.
export default function LabScene({ bounds, site0, liftStart, tags }) {
  const { reveal } = useReveal()
  const group = useRef()
  const lab = useMemo(() => buildLab(), [])
  useEffect(() => () => Object.values(lab).forEach((g) => g.dispose()), [lab])

  const mats = useMemo(() => {
    const glowing = (color, opacity) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    return {
      steel: capped(new THREE.MeshLambertMaterial({ color: C.steel, emissive: C.steelGlow }), C.steelCut),
      edges: new THREE.LineBasicMaterial({ color: C.wire, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      grid: new THREE.LineBasicMaterial({ color: C.grid, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      glow: glowing(C.light, 0.6),
      glass: glowing(C.light, 0.07),
      tanks: glowing(C.tank, 0.35),
      warn: glowing(C.warning, 1),
      cavern: new THREE.MeshBasicMaterial({ color: '#040c1d', side: THREE.BackSide }),
    }
  }, [])
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])

  // Fade the laboratory's light in with the reveal; blink the warnings.
  useFrame(({ clock }) => {
    const { k } = reveal.current
    group.current.visible = k.cut > 0
    const on = k.lab
    const blink = Math.sin(clock.elapsedTime * 5) > 0 ? 1 : 0.25
    mats.edges.opacity = 0.85 * on
    mats.grid.opacity = 0.3 * on
    mats.glow.opacity = 0.6 * on
    mats.glass.opacity = 0.07 * on
    mats.tanks.opacity = 0.35 * on
    mats.warn.opacity = blink * on
  })

  const center = [LAB.x, (LAB.ceiling + LAB.floor) / 2, (LAB.back + LAB.front) / 2]
  const size = [LAB.halfWidth * 2, LAB.ceiling - LAB.floor, LAB.front - LAB.back]

  return (
    <>
      <group ref={group} visible={false}>
        <mesh position={center} material={mats.cavern}>
          <boxGeometry args={size} />
        </mesh>
        <lineSegments geometry={lab.grid} material={mats.grid} />
        <mesh geometry={lab.solid} material={mats.steel} />
        <lineSegments geometry={lab.edges} material={mats.edges} renderOrder={4} />
        <mesh geometry={lab.glow} material={mats.glow} renderOrder={4} />
        <mesh geometry={lab.glass} material={mats.glass} renderOrder={4} />
        <mesh geometry={lab.tanks} material={mats.tanks} renderOrder={4} />
        <mesh geometry={lab.warn} material={mats.warn} renderOrder={4} />
        <Lift liftStart={liftStart} steel={mats.steel} edges={mats.edges} />
        <Routes site0={site0} tags={tags} />
        <Scan />
        {tags && <Tags />}
      </group>
      <SectionFace bounds={bounds} />
      <Lights />
    </>
  )
}

// The lift platform, its cage and the beam of light under it.
function Lift({ liftStart, steel, edges }) {
  const { reveal } = useReveal()
  const lift = useRef()
  const beam = useRef()
  const light = useRef()
  const platform = useMemo(() => new THREE.BoxGeometry(22, 2.5, 22), [])
  const outline = useMemo(() => new THREE.EdgesGeometry(platform), [platform])
  useEffect(() => () => [platform, outline].forEach((g) => g.dispose()), [platform, outline])

  useFrame(() => {
    const s = liftStart == null ? 0 : (performance.now() - liftStart) / 1000
    lift.current.position.y = liftY(s)
    const on = reveal.current.k.lab
    beam.current.material.opacity = 0.22 * on
    light.current.intensity = 3 * on
  })

  return (
    <group ref={lift} position={[LAB.x, 4, LAB.z]}>
      <mesh geometry={platform} material={steel} />
      <lineSegments geometry={outline} material={edges} />
      {[[-10, -10], [10, -10], [-10, 10], [10, 10]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 7, z]} material={steel}>
          <boxGeometry args={[1, 12, 1]} />
        </mesh>
      ))}
      <mesh ref={beam} position={[0, -22, 0]} renderOrder={5}>
        <cylinderGeometry args={[11, 4, 40, 16, 1, true]} />
        <meshBasicMaterial color={C.light} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <pointLight ref={light} color={C.light} decay={0} distance={110} intensity={0} />
    </group>
  )
}

// The tunnels: two up to concealed hatches in the city, one towards Site 0.
function Routes({ site0, tags }) {
  const routes = useMemo(
    () =>
      accessRoutes(site0).map((r) => {
        const curve = new THREE.CatmullRomCurve3(r.pts)
        return { ...r, tube: new THREE.TubeGeometry(curve, 60, 5, 10), core: new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)) }
      }),
    [site0],
  )
  useEffect(() => () => routes.forEach((r) => [r.tube, r.core].forEach((g) => g.dispose())), [routes])

  return routes.map((r) => {
    const end = r.pts[r.pts.length - 1]
    return (
      <group key={r.key}>
        <mesh geometry={r.tube} renderOrder={4}>
          <meshBasicMaterial color={C.light} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <line geometry={r.core}>
          <lineBasicMaterial color={C.wire} transparent opacity={0.8} />
        </line>
        {r.head && (
          <group position={end}>
            <mesh position={[0, 60, 0]} renderOrder={6}>
              <cylinderGeometry args={[1.2, 1.2, 120, 8, 1, true]} />
              <meshBasicMaterial color={C.light} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            {tags && (
              <Html position={[0, 128, 0]} center zIndexRange={[5, 0]}>
                <div className="lab-tag access">{r.label}</div>
              </Html>
            )}
          </group>
        )}
        {!r.head && tags && (
          <Html position={[LAB.x - 118, -112, LAB.cutZ]} center zIndexRange={[5, 0]}>
            <div className="lab-tag access">{r.label} →</div>
          </Html>
        )}
      </group>
    )
  })
}

// A thin sheet of light that scans down the cavern, again and again.
function Scan() {
  const { reveal } = useReveal()
  const mesh = useRef()
  const depth = LAB.ceiling - LAB.floor

  useFrame(({ clock }) => {
    mesh.current.position.y = LAB.ceiling - ((clock.elapsedTime * 30) % depth)
    mesh.current.material.opacity = 0.07 * reveal.current.k.lab
  })

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[LAB.x, LAB.ceiling, (LAB.back + LAB.front) / 2]} renderOrder={5}>
      <planeGeometry args={[LAB.halfWidth * 2, LAB.front - LAB.back]} />
      <meshBasicMaterial color={C.light} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  )
}

// The level names, on the cut face just west of the cavern, like notes on a section drawing.
function Tags() {
  return LEVELS.map((l) => (
    <Html key={l.code} position={[LAB.x - LAB.halfWidth - 12, l.y - 10, LAB.cutZ]} zIndexRange={[5, 0]}>
      <div className="lab-tag level">
        <b>{l.code}</b> {l.name} <span>{-l.y} m</span>
      </div>
    </Html>
  ))
}

// The cut face of the earth: navy, hatched like a section drawing, with the cavern open behind it.
// It rides on the section plane as it sweeps north.
function SectionFace({ bounds: { x0, x1 } }) {
  const { reveal, plane } = useReveal()
  const mesh = useRef()
  const margin = 400
  const bottom = LAB.floor - 40
  const hole = [LAB.x - LAB.halfWidth, LAB.x + LAB.halfWidth, LAB.floor, LAB.ceiling]

  const [solid, open] = useMemo(() => {
    const outline = () => new THREE.Shape([new THREE.Vector2(x0 - margin, 0), new THREE.Vector2(x1 + margin, 0), new THREE.Vector2(x1 + margin, bottom), new THREE.Vector2(x0 - margin, bottom)])
    const withHole = outline()
    const [hx0, hx1, hy0, hy1] = hole
    withHole.holes.push(new THREE.Path([new THREE.Vector2(hx0, hy1), new THREE.Vector2(hx0, hy0), new THREE.Vector2(hx1, hy0), new THREE.Vector2(hx1, hy1)]))
    return [new THREE.ShapeGeometry(outline()), new THREE.ShapeGeometry(withHole)]
  }, [x0, x1]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => [solid, open].forEach((g) => g.dispose()), [solid, open])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uEarth: { value: new THREE.Color(C.earth) },
          uLine: { value: new THREE.Color(C.wire) },
          uHole: { value: new THREE.Vector4(...hole) },
          uOn: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() {
            vP = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uEarth, uLine;
          uniform vec4 uHole;
          uniform float uOn;
          varying vec2 vP;
          void main() {
            float depth = -vP.y;
            // Strata: bands of slightly different shade, deeper ones darker.
            float band = floor(depth / 38.0);
            float shade = 0.82 + 0.18 * fract(sin(band * 12.9898) * 43758.5453) - depth * 0.0004;
            vec3 col = uEarth * shade;
            // Hatching at 45 degrees, as on a section drawing.
            float hatch = smoothstep(0.42, 0.5, abs(fract((vP.x + vP.y) / 9.0) - 0.5));
            col += uLine * hatch * 0.06;
            // Bright lines at the ground and around the cavern.
            float dx = max(uHole.x - vP.x, vP.x - uHole.y);
            float dy = max(uHole.z - vP.y, vP.y - uHole.w);
            float edge = max(dx, dy);
            float rim = (1.0 - smoothstep(0.0, 2.5, edge)) + (1.0 - smoothstep(0.0, 2.0, depth));
            col = mix(col, uLine, clamp(rim, 0.0, 1.0) * uOn);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const { k } = reveal.current
    mesh.current.visible = k.cut > 0
    mesh.current.position.z = plane.constant - 0.3 // just on the kept side of the plane
    mesh.current.geometry = plane.constant < LAB.front ? open : solid // the cavern opens once the plane reaches it
    material.uniforms.uOn.value = k.night
  })

  return <mesh ref={mesh} geometry={solid} material={material} visible={false} />
}

// Light in the cavern, and a red warning light on the research level. Always mounted, so
// switching them on doesn't recompile every material in the city.
function Lights() {
  const { reveal } = useReveal()
  const cyan = useRef()
  const red = useRef()

  useFrame(({ clock }) => {
    const on = reveal.current.k.lab
    cyan.current.intensity = 1.3 * on
    red.current.intensity = (Math.sin(clock.elapsedTime * 5) > 0 ? 1.4 : 0.2) * on
  })

  return (
    <>
      <pointLight ref={cyan} position={[LAB.x, -160, LAB.cutZ + 120]} color={C.light} decay={0} distance={900} intensity={0} />
      <pointLight ref={red} position={[LAB.x + 150, LEVELS[2].y - 20, LAB.z]} color={C.warning} decay={0} distance={260} intensity={0} />
    </>
  )
}
