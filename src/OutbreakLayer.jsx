import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { QUARANTINE as QUARANTINE_SITES } from './outbreak.js'
import { INFECTION_STOPS, LINK, QUARANTINE } from './palette.js'
import { useReveal } from './section.js'

// The outbreak drawn over the city. It never touches the city's meshes.
// Every marker knows the week it turns; the shaders compare that with one shared week,
// so moving the slider costs nothing however many markers there are.
// During the underground reveal the markers step back, and the section plane cuts them with the city.

const ROOF_DOT_M = 7
const STREET_DOT_M = 4.5
const HAZE_M = 80
const EASE = 3.5 // how quickly the shown week catches up with the slider
const DIM = 0.4 // how much the markers fade under the reveal

export default function OutbreakLayer({ sim, week }) {
  const { reveal } = useReveal()
  const uniforms = useMemo(
    () => ({
      uWeek: { value: week },
      uClock: { value: 0 },
      uPx: { value: 1 },
      uDim: { value: 1 }, // the markers, fading back under the reveal
      uFade: { value: 1 }, // arcs, perimeters and beams, which leave altogether
      uC0: { value: new THREE.Color(INFECTION_STOPS[0]) },
      uC1: { value: new THREE.Color(INFECTION_STOPS[1]) },
      uC2: { value: new THREE.Color(INFECTION_STOPS[2]) },
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useFrame(({ camera, size, viewport, clock }, dt) => {
    const u = uniforms.uWeek
    u.value += (week - u.value) * (1 - Math.exp(-dt * EASE))
    if (Math.abs(week - u.value) < 1e-4) u.value = week
    uniforms.uClock.value = clock.elapsedTime
    uniforms.uDim.value = 1 - DIM * reveal.current.k.dim
    uniforms.uFade.value = 1 - reveal.current.k.dim
    // Pixels per metre at a distance of one metre, for dots sized in metres.
    uniforms.uPx.value = (size.height * viewport.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360))
  })

  return (
    <>
      <Haze points={sim.haze} uniforms={uniforms} />
      <Dots points={sim.roofs} size={ROOF_DOT_M} uniforms={uniforms} />
      <Dots points={sim.streets} size={STREET_DOT_M} uniforms={uniforms} />
      <Links links={sim.links} uniforms={uniforms} />
      {sim.sites
        .filter((s) => QUARANTINE_SITES.sites.includes(s.key))
        .map((s) => (
          <Perimeter key={s.key} site={s} uniforms={uniforms} />
        ))}
      {sim.sites.map((s) => (
        <Site key={s.key} site={s} uniforms={uniforms} shown={week >= s.week} />
      ))}
      <Signal site={sim.sites[0]} uniforms={uniforms} />
    </>
  )
}

// Shared shader pieces: when a marker turns, and its colour from faint to crimson.
const AGE = /* glsl */ `
  uniform float uWeek;
  uniform float uClock;
  attribute float aTime;
  attribute float aRand;
  varying float vK;
  varying float vAppear;
  // Returns false while the marker is still clean.
  bool age() {
    float a = uWeek - aTime;
    if (a < 0.0) return false;
    vAppear = smoothstep(0.0, 0.12, a); // fades in over about a day
    vK = smoothstep(0.0, 1.3, a);       // deepens to crimson over about nine days
    return true;
  }
`
const RAMP = /* glsl */ `
  uniform vec3 uC0, uC1, uC2;
  uniform float uDim;
  varying float vK;
  varying float vAppear;
  vec3 ramp(float k) { return k < 0.5 ? mix(uC0, uC1, k * 2.0) : mix(uC1, uC2, k * 2.0 - 1.0); }
`
const HIDE = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0);' // outside the view, so nothing is drawn

function Dots({ points, size, uniforms }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.z, -p.y]), 3))
    g.setAttribute('aTime', new THREE.Float32BufferAttribute(points.map((p) => p.time), 1))
    g.setAttribute('aRand', new THREE.Float32BufferAttribute(points.map((p) => p.rand), 1))
    return g
  }, [points])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uSize: { value: size } },
        transparent: true,
        depthWrite: false,
        clipping: true,
        vertexShader: /* glsl */ `
          ${AGE}
          #include <clipping_planes_pars_vertex>
          uniform float uPx;
          uniform float uSize;
          void main() {
            if (!age()) { ${HIDE} gl_PointSize = 0.0; return; }
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            #include <clipping_planes_vertex>
            vec4 mv = mvPosition;
            gl_Position = projectionMatrix * mv;
            float pulse = 1.0 + 0.15 * vK * sin(uClock * 2.0 + aRand * 6.2832);
            float metres = uSize * (0.55 + 0.6 * vK) * pulse;
            gl_PointSize = clamp(metres * uPx / -mv.z, 1.5, 18.0);
          }`,
        fragmentShader: /* glsl */ `
          ${RAMP}
          #include <clipping_planes_pars_fragment>
          void main() {
            #include <clipping_planes_fragment>
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float r = dot(p, p);
            if (r > 1.0) discard;
            float soft = 1.0 - smoothstep(0.35, 1.0, r);
            gl_FragColor = vec4(ramp(vK), vAppear * (0.35 + 0.65 * vK) * soft * uDim);
            #include <colorspace_fragment>
          }`,
      }),
    [uniforms, size],
  )
  useEffect(() => () => material.dispose(), [material])

  return <points geometry={geometry} material={material} renderOrder={12} /> // after the city, even when it is a ghost
}

// A wide, faint red glow on the ground under infected streets: the infection zones.
function Haze({ points, uniforms }) {
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1, 1)
    g.index = quad.index
    g.setAttribute('position', quad.attributes.position)
    g.setAttribute('aCentre', new THREE.InstancedBufferAttribute(new Float32Array(points.flatMap((p) => [p.x, -p.y])), 2))
    g.setAttribute('aTime', new THREE.InstancedBufferAttribute(new Float32Array(points.map((p) => p.time)), 1))
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(points.map((p) => p.rand)), 1))
    g.instanceCount = points.length
    return g
  }, [points])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, uSize: { value: HAZE_M } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        clipping: true,
        vertexShader: /* glsl */ `
          ${AGE}
          #include <clipping_planes_pars_vertex>
          attribute vec2 aCentre;
          uniform float uSize;
          varying vec2 vP;
          void main() {
            if (!age()) { ${HIDE} return; }
            float s = uSize * (0.5 + 0.7 * vK) * (0.85 + 0.3 * aRand);
            vP = position.xy * 2.0;
            vec4 mvPosition = modelViewMatrix * vec4(aCentre.x + position.x * s, 0.4, aCentre.y + position.y * s, 1.0);
            #include <clipping_planes_vertex>
            gl_Position = projectionMatrix * mvPosition;
          }`,
        fragmentShader: /* glsl */ `
          ${RAMP}
          varying vec2 vP;
          #include <clipping_planes_pars_fragment>
          void main() {
            #include <clipping_planes_fragment>
            float r = dot(vP, vP);
            if (r > 1.0) discard;
            float glow = exp(-r * 3.0) * (1.0 - r);
            gl_FragColor = vec4(ramp(vK) * glow * vAppear * (0.10 + 0.14 * vK) * uDim, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={11} />
}

// Arcs from each site to the site it infected, drawn out in the days before it ignites.
const ARC_STEPS = 40
const ARC_DRAW = 0.35 // weeks to draw an arc

function Links({ links, uniforms }) {
  const geometry = useMemo(() => {
    const pos = [], along = [], start = []
    for (const { from, to } of links) {
      const a = new THREE.Vector3(from.x, from.height + 2, -from.y)
      const b = new THREE.Vector3(to.x, to.height + 2, -to.y)
      const mid = a.clone().add(b).multiplyScalar(0.5)
      mid.y += 40 + 0.3 * a.distanceTo(b)
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
      const pts = curve.getPoints(ARC_STEPS)
      for (let i = 1; i < pts.length; i++)
        for (const k of [i - 1, i]) {
          pos.push(pts[k].x, pts[k].y, pts[k].z)
          along.push(k / ARC_STEPS)
          start.push(to.week - ARC_DRAW)
        }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1))
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(start, 1))
    return g
  }, [links])
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uWeek: uniforms.uWeek, uFade: uniforms.uFade, uColor: { value: new THREE.Color(LINK) } },
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          uniform float uWeek;
          attribute float aAlong;
          attribute float aStart;
          varying float vAlong;
          varying float vDrawn;
          varying float vAge;
          void main() {
            vAlong = aAlong;
            vDrawn = clamp((uWeek - aStart) / ${ARC_DRAW.toFixed(2)}, 0.0, 1.0);
            vAge = uWeek - aStart - ${ARC_DRAW.toFixed(2)};
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uFade;
          varying float vAlong;
          varying float vDrawn;
          varying float vAge;
          void main() {
            if (vDrawn <= 0.0 || vAlong > vDrawn) discard;
            // Bright while it travels, then settles to a faint trace.
            float settle = vAge > 0.0 ? mix(1.0, 0.35, smoothstep(0.0, 0.4, vAge)) : 1.0;
            float head = vAge > 0.0 ? 0.0 : smoothstep(vDrawn - 0.15, vDrawn, vAlong) * 0.6;
            gl_FragColor = vec4(uColor, settle * (0.55 + head) * uFade);
            #include <colorspace_fragment>
          }`,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])

  return <lineSegments geometry={geometry} material={material} renderOrder={4} />
}

// A dashed amber ring that closes around a site in week 3, then widens as the response falls behind.
function Perimeter({ site, uniforms }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uClock: uniforms.uClock, uColor: { value: new THREE.Color(QUARANTINE) }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          varying vec2 vP;
          void main() {
            vP = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uClock;
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec2 vP;
          void main() {
            float a = atan(vP.y, vP.x) / 6.2832;
            if (fract(a * 36.0 + uClock * 0.08) > 0.55) discard;
            gl_FragColor = vec4(uColor, uOpacity);
            #include <colorspace_fragment>
          }`,
      }),
    [uniforms],
  )
  useEffect(() => () => material.dispose(), [material])
  const mesh = useRef()

  useFrame(() => {
    const t = uniforms.uWeek.value - QUARANTINE_SITES.from
    const on = THREE.MathUtils.smoothstep(t, 0, 0.25) * uniforms.uFade.value
    material.uniforms.uOpacity.value = 0.85 * on
    mesh.current.visible = on > 0
    mesh.current.scale.setScalar(110 + 140 * Math.max(t, 0))
  })

  return (
    <mesh ref={mesh} position={[site.x, 2, -site.y]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={5}>
      <ringGeometry args={[0.99, 1, 128]} />
    </mesh>
  )
}

// A thin beam of light over each site once it has ignited, and its name.
function Site({ site, uniforms, shown }) {
  const beam = useRef()
  const top = site.height + 60

  useFrame(() => {
    const on = THREE.MathUtils.smoothstep(uniforms.uWeek.value - site.week, -0.05, 0.1) * uniforms.uFade.value
    beam.current.visible = on > 0
    beam.current.material.opacity = 0.55 * on
  })

  return (
    <group position={[site.x, 0, -site.y]}>
      <mesh ref={beam} position={[0, top / 2, 0]} renderOrder={6}>
        <cylinderGeometry args={[1.2, 1.2, top, 8, 1, true]} />
        <meshBasicMaterial color={LINK} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {shown && (
        <Html position={[0, top + 6, 0]} center zIndexRange={[5, 0]} className="site-label-wrap">
          <div className={site.key === 'zero' ? 'site-label zero' : 'site-label'}>
            <b>{site.name}</b> {site.label}
          </div>
        </Html>
      )}
    </group>
  )
}

// From late week 3, rings pulse out from Site 0: the signal from below ground.
function Signal({ site, uniforms }) {
  const rings = [useRef(), useRef(), useRef()]
  const from = 3.5

  useFrame(() => {
    const on = THREE.MathUtils.smoothstep(uniforms.uWeek.value, from, from + 0.3) * uniforms.uFade.value
    rings.forEach((r, i) => {
      const phase = (uniforms.uClock.value * 0.35 + i / rings.length) % 1
      r.current.visible = on > 0
      r.current.scale.setScalar(15 + 220 * phase)
      r.current.material.opacity = on * 0.7 * (1 - phase)
    })
  })

  return (
    <group position={[site.x, 1.6, -site.y]} rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map((r, i) => (
        <mesh key={i} ref={r} renderOrder={5}>
          <ringGeometry args={[0.94, 1, 96]} />
          <meshBasicMaterial color="#ff2340" transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}
