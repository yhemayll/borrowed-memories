// The fictional Umbrella laboratory under the city centre, and the timing of its reveal.
// Scene coordinates, like CityScene: x to the east, y up (0 is the ground), north towards -z.
// The design follows "The Hive": an inverted, stepped tower of octagonal tiers hanging on a central shaft.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The cavern. The section plane cuts the city east to west at z = cutZ and keeps what lies north of it.
// It passes through the hollow core of the tower, so the lift in the shaft stays in view.
export const LAB = {
  x: 0, // the central shaft, under the city centre
  z: -20,
  cutZ: 8, // the plan's y = -8
  ceiling: -40,
  floor: -430,
  halfWidth: 300,
  back: -270, // north wall
  front: 140, // south wall, beyond the cut
  shaftR: 14,
  coreR: 36, // the hollow core of the tower around the shaft
}

const TIER_STEP = 15 // metres from one tier to the next
const TIER_SLAB = 4

// The research levels, from the top. Each is a run of tiers; `y` is its top, `r` its widest tier.
export const LEVELS = [
  { code: 'B1', name: 'Intake and decontamination', y: -60, tiers: 4, r: 215, status: 'Breached' },
  { code: 'B2', name: 'Cold storage', y: -120, tiers: 4, r: 183, status: 'Breached' },
  { code: 'B3', name: 'Viral research', y: -180, tiers: 4, r: 151, status: 'Lockdown failed' },
  { code: 'B4', name: 'Specimen vault', y: -240, tiers: 4, r: 119, status: 'Seal failing' },
  { code: 'B5', name: 'Primary containment', y: -330, tiers: 4, r: 110, status: 'No signal' },
]

// Camera angles for the section, as [eye, target].
export const VIEWS = [
  { key: 'section', label: 'Section', cam: 'CAM 01', eye: [-400, 200, 880], target: [0, -190, -40] },
  { key: 'aerial', label: 'Aerial', cam: 'CAM 02', eye: [160, 980, 420], target: [0, -180, -60] },
  { key: 'shaft', label: 'Shaft', cam: 'CAM 03', eye: [130, -170, 230], target: [0, -250, -30] },
  { key: 'surface', label: 'Surface link', cam: 'CAM 04', eye: [-240, 90, 340], target: [0, -60, -20] },
]

// Over the city centre, high up: where the camera passes before it settles on the section.
export const OVERVIEW = { eye: [-260, 1000, 950], target: [0, 0, 0] }

// The reveal, in seconds from the click.
export const SCRIPT = { overview: 3, settle: 7.5 }
export const LIFT_START = 6 // the lift sets off
const LEG_S = 3 // seconds from one stop to the next, pause included
const MOVE_S = 2.2

export const clamp01 = (x) => Math.min(Math.max(x, 0), 1)
export const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b)
export const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

// How far each part of the reveal has gone at `t` seconds, from 0 to 1.
export function revealAt(t) {
  return {
    dim: smooth(0.2, 2.5, t), // the infection steps back
    cut: ease(clamp01((t - 1.2) / 3.3)), // the section plane sweeps north to cutZ
    night: smooth(1.2, 4.5, t), // the colours turn to navy and cyan, the city to a ghost
    lab: smooth(3.2, 5.5, t), // the laboratory lights come up
  }
}

// The lift stops at the surface and at each level.
const STOPS = [4, ...LEVELS.map((l) => l.y + 2)]

// The height of the lift platform `s` seconds after it sets off.
export function liftY(s) {
  if (s <= 0) return STOPS[0]
  const leg = Math.floor(s / LEG_S)
  if (leg >= STOPS.length - 1) return STOPS[STOPS.length - 1]
  const k = ease(clamp01((s - leg * LEG_S) / MOVE_S))
  return THREE.MathUtils.lerp(STOPS[leg], STOPS[leg + 1], k)
}

// Where the lift is, in words: a level, the shaft above them, or between two.
export function liftWhere(s) {
  const y = liftY(s)
  const level = LEVELS.find((l) => Math.abs(l.y + 2 - y) < 1)
  if (level) return level.code
  return y > LEVELS[0].y ? 'Shaft' : 'Moving'
}

export const LIFT_TOTAL_S = (STOPS.length - 1) * LEG_S

// --- Geometry. All built once, merged into few meshes. ---

const { x: LX, z: LZ } = LAB

// Collects plain geometries (no index, no uv) so they can be merged.
function collector() {
  const parts = []
  const add = (g, { x = 0, y = 0, z = 0, ry = 0 } = {}) => {
    g.deleteAttribute('uv')
    if (ry) g.rotateY(ry)
    g.translate(x, y, z)
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  return { add, merge: () => mergeGeometries(parts) }
}

// A box standing on y = 0.
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0)

// The corners of an octagon of radius r, flat side to the south.
const octagon = (r) => Array.from({ length: 8 }, (_, k) => ((k + 0.5) / 8) * Math.PI * 2).map((a) => [Math.cos(a) * r, Math.sin(a) * r])

// A flat octagonal tier with a hollow core, its top at y = 0.
function tier(r) {
  const shape = new THREE.Shape(octagon(r).map(([x, y]) => new THREE.Vector2(x, y)))
  shape.holes.push(new THREE.Path(octagon(LAB.coreR).map(([x, y]) => new THREE.Vector2(x, y)).reverse()))
  const g = new THREE.ExtrudeGeometry(shape, { depth: TIER_SLAB, bevelEnabled: false })
  g.rotateX(Math.PI / 2) // lie flat, hanging down from y = 0
  return g
}

// An open octagonal band of light, standing on y = 0.
const band = (r, h) => new THREE.CylinderGeometry(r, r, h, 8, 1, true).rotateY(Math.PI / 8).translate(0, h / 2, 0)

export function buildLab() {
  const solid = collector() // dark steel
  const glow = collector() // cyan light: windows and light strips
  const tanks = collector() // translucent specimen tanks
  const warn = collector() // red warning lights

  // The tower: each level a run of tiers, narrowing with depth.
  LEVELS.forEach((level, i) => {
    for (let k = 0; k < level.tiers; k++) {
      const y = level.y - k * TIER_STEP
      const r = level.r - k * 8
      solid.add(tier(r), { x: LX, y, z: LZ })
      glow.add(band(r - 5, TIER_STEP - TIER_SLAB - 3), { x: LX, y: y - TIER_STEP + 1.5, z: LZ }) // a row of lit windows
      // Fins at the corners, down to the next tier.
      for (const [cx, cz] of octagon(r - 3)) solid.add(box(2, TIER_STEP, 2), { x: LX + cx, y: y - TIER_STEP, z: LZ + cz })
      if (k === 0) for (const [cx, cz] of octagon(r + 1)) warn.add(new THREE.BoxGeometry(3, 3, 3), { x: LX + cx, y: y + 1.5, z: LZ + cz })
    }

    // Bridges to the walls on some levels.
    const reach = LAB.halfWidth - level.r + 10
    if (i === 0 || i === 2) {
      solid.add(box(reach, 3, 9), { x: LX + level.r - 10 + reach / 2, y: level.y - 3, z: LZ + 30 })
      solid.add(box(reach, 3, 9), { x: LX - level.r + 10 - reach / 2, y: level.y - 3, z: LZ - 30 })
    }
    if (i === 1 || i === 3) {
      const back = LZ - LAB.back - level.r + 10
      solid.add(box(9, 3, back), { x: LX - 25, y: level.y - 3, z: LZ - level.r + 10 - back / 2 })
    }
  })

  // Cables from the top tier to the ceiling.
  for (const [cx, cz] of octagon(LEVELS[0].r - 6)) solid.add(box(1.4, LAB.ceiling - LEVELS[0].y, 1.4), { x: LX + cx, y: LEVELS[0].y, z: LZ + cz })

  // Lattice arms under the ceiling, from the shaft out to the walls.
  for (const a of [0.35, 1.95, 3.55, 5.15, 4.35]) {
    const length = 280
    const at = (d) => ({ x: LX + Math.cos(a) * d, z: LZ - Math.sin(a) * d, ry: a })
    solid.add(box(length, 3, 3), { ...at(length / 2), y: LAB.ceiling - 6 })
    solid.add(box(length, 3, 3), { ...at(length / 2), y: LAB.ceiling - 18 })
    for (let d = 20; d < length; d += 20) solid.add(box(2, 12, 2), { ...at(d), y: LAB.ceiling - 18 })
  }

  // The machine hall on the floor, ringed with specimen tanks.
  solid.add(new THREE.CylinderGeometry(90, 105, 20, 8).rotateY(Math.PI / 8), { x: LX, y: LAB.floor + 10, z: LZ })
  glow.add(band(91, 1.5), { x: LX, y: LAB.floor + 18, z: LZ })
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2
    const [x, z] = [LX + Math.cos(a) * 160, LZ + Math.sin(a) * 160]
    tanks.add(new THREE.CylinderGeometry(7, 7, 26, 16), { x, y: LAB.floor + 15, z })
    solid.add(new THREE.CylinderGeometry(9, 9, 2, 16), { x, y: LAB.floor + 1, z })
    solid.add(new THREE.CylinderGeometry(9, 9, 2, 16), { x, y: LAB.floor + 28, z })
  }

  // The shaft: four rails from the floor to the surface, with a frame every 30 m.
  const s = LAB.shaftR - 1
  for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) solid.add(box(2.4, -LAB.floor + 6, 2.4), { x: LX + dx, y: LAB.floor, z: LZ + dz })
  for (let y = LAB.floor + 20; y < 0; y += 30) {
    solid.add(box(2 * s, 1.5, 1.5), { x: LX, y, z: LZ - s })
    solid.add(box(2 * s, 1.5, 1.5), { x: LX, y, z: LZ + s })
    solid.add(box(1.5, 1.5, 2 * s), { x: LX - s, y, z: LZ })
    solid.add(box(1.5, 1.5, 2 * s), { x: LX + s, y, z: LZ })
  }
  const glass = new THREE.BoxGeometry(2 * s, -LAB.floor, 2 * s).translate(LX, LAB.floor / 2, LZ) // the glass of the shaft

  // The shaft head at the surface, hidden among the buildings.
  solid.add(box(34, 5, 3), { x: LX, y: 0, z: LZ - 17 })
  solid.add(box(34, 5, 3), { x: LX, y: 0, z: LZ + 17 })
  solid.add(box(3, 5, 34), { x: LX - 17, y: 0, z: LZ })
  solid.add(box(3, 5, 34), { x: LX + 17, y: 0, z: LZ })

  const solidGeometry = solid.merge()
  return {
    solid: solidGeometry,
    edges: new THREE.EdgesGeometry(solidGeometry, 30),
    glow: glow.merge(),
    glass,
    tanks: tanks.merge(),
    warn: warn.merge(),
    grid: cavernGrid(),
  }
}

// Grid lines on the cavern's walls and floor: the wireframe of the excavation.
function cavernGrid() {
  const { floor, ceiling, halfWidth: w, back, front } = LAB
  const pos = []
  const line = (a, b) => pos.push(...a, ...b)
  for (let x = -w; x <= w; x += 30) {
    line([LX + x, floor, back], [LX + x, ceiling, back])
    line([LX + x, floor, back], [LX + x, floor, front])
  }
  for (let y = floor; y <= ceiling; y += 30) {
    line([LX - w, y, back], [LX + w, y, back])
    line([LX - w, y, back], [LX - w, y, front])
    line([LX + w, y, back], [LX + w, y, front])
  }
  for (let z = back; z <= front; z += 30) {
    line([LX - w, floor, z], [LX + w, floor, z])
    line([LX - w, floor, z], [LX - w, ceiling, z])
    line([LX + w, floor, z], [LX + w, ceiling, z])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

// The concealed ways in: two inclined tunnels to the surface,
// and an older tunnel towards Site 0, which the section cuts through.
export function accessRoutes(site0) {
  const v = (x, y, z) => new THREE.Vector3(LX + x, y, LZ + z)
  return [
    { key: 'a', label: 'Access A', head: true, pts: [v(120, -62, -110), v(230, -50, -200), v(310, -20, -290), v(340, 2, -320)] },
    { key: 'b', label: 'Access B', head: true, pts: [v(-120, -62, -110), v(-240, -48, -180), v(-340, -15, -240), v(-360, 2, -260)] },
    {
      key: 'site0',
      label: 'Tunnel to Site 0',
      head: false,
      pts: [v(-100, -120, -20), v(-150, -118, 60), new THREE.Vector3(site0[0] * 0.6, -70, -site0[1] * 0.6), new THREE.Vector3(site0[0], 2, -site0[1])],
    },
  ]
}
