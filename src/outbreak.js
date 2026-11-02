// The fictional outbreak: where it starts, how it jumps between sites, and when it reaches each place.
// It reads the city but never changes it. Everything is worked out once and is the same on every load,
// so the slider shows the same picture for the same week, going forward or backward.
//
// Time is in weeks from the containment breach (0) to the citywide crisis (4).

export const WEEKS = 4

// The stages shown on the timeline. Fiction, not history.
export const STAGES = [
  {
    week: 0,
    title: 'Containment breach',
    text: 'A pressure seal fails in a sealed level beneath an industrial unit at the south-western edge of the old town. Two night workers go home with a fever.',
  },
  {
    week: 1,
    title: 'First infections',
    text: 'A clinic nearby treats patients for fever and sudden aggression. A worker at the transit depot carries the infection into the centre. The incidents still look isolated.',
  },
  {
    week: 2,
    title: 'Spread through the streets',
    text: 'The infection follows the streets people walk every day: from the clinics to a school, a market hall and an event hall. Neighbouring blocks fill in.',
  },
  {
    week: 3,
    title: 'Containment overwhelmed',
    text: 'An emergency command post and a quarantine shelter open in the north. Amber perimeters close around the first sites, but the infection is already past them, and the shelter itself becomes a new source.',
  },
  {
    week: 4,
    title: 'Citywide crisis',
    text: 'Almost every street is reached. Only scattered buildings hold out. Signal traces converge on the industrial unit where it began, and on something beneath it.',
  },
]

// The sites, each on a real building of the kit, chosen by its use in buildings.geojson.
// `from` is the site that infected it, `week` when it ignites, `speed` how fast it spreads along the streets in metres a week.
export const SITES = [
  { key: 'zero', building: '17703', name: 'Site 0', label: 'Industrial unit', week: 0, from: null, speed: 200 },
  { key: 'clinic-s', building: '17655', name: 'Site 1', label: 'Southern clinic', week: 0.6, from: 'zero', speed: 230 },
  { key: 'depot', building: '20153', name: 'Site 2', label: 'Transit depot', week: 1.1, from: 'zero', speed: 260 },
  { key: 'clinic-c', building: '25415', name: 'Site 3', label: 'Central clinic', week: 1.5, from: 'depot', speed: 290 },
  { key: 'school', building: '21988', name: 'Site 4', label: 'School', week: 1.8, from: 'depot', speed: 300 },
  { key: 'market', building: '22096', name: 'Site 5', label: 'Market hall', week: 2.0, from: 'clinic-s', speed: 330 },
  { key: 'hall', building: '24976', name: 'Site 6', label: 'Event hall', week: 2.3, from: 'market', speed: 360 },
  { key: 'college', building: '14780', name: 'Site 7', label: 'College', week: 2.6, from: 'market', speed: 440 },
  { key: 'command', building: '23891', name: 'Site 8', label: 'Emergency command post', week: 2.8, from: 'clinic-c', speed: 520 },
  { key: 'shelter', building: '20167', name: 'Site 9', label: 'Quarantine shelter', week: 3.0, from: 'command', speed: 700 },
  { key: 'arena', building: '20335', name: 'Site 10', label: 'Arena', week: 3.1, from: 'hall', speed: 700 },
  { key: 'sports', building: '20798', name: 'Site 11', label: 'Sports hall', week: 3.2, from: 'school', speed: 720 },
  { key: 'clinic-n', building: '25331', name: 'Site 12', label: 'Northern clinic', week: 3.3, from: 'shelter', speed: 760 },
  { key: 'north', building: '22132', name: 'Site 13', label: 'Northern depot', week: 3.4, from: 'shelter', speed: 760 },
]

// Quarantine perimeters close around the first sites in week 3.
export const QUARANTINE = { from: 2.7, sites: ['zero', 'clinic-s', 'depot', 'clinic-c', 'school', 'market'] }

const HOLDOUT_SHARE = 0.05 // buildings the infection never reaches
const STREET_STEP_M = 12 // spacing of the dots along the streets
const HAZE_STEP_M = 34 // spacing of the glow on the ground
const NEVER = 1e6

export function simulate(city) {
  const { nodes, edges, buildings } = city
  const byId = new Map(buildings.map((b, i) => [b.id, i]))

  const sites = SITES.map((s) => {
    const b = buildings[byId.get(s.building)]
    const [x, y] = b.centre
    return { ...s, x, y, height: b.height, node: nearestNode(nodes, x, y) }
  })
  const siteByKey = new Map(sites.map((s) => [s.key, s]))
  const links = sites.filter((s) => s.from).map((s) => ({ from: siteByKey.get(s.from), to: s }))

  // Walking distance from each site to every street node.
  const reach = sites.map((s) => shortestPaths(nodes, edges, s.node))
  const arrival = (si, d) => sites[si].week + d / sites[si].speed

  // When the infection reaches each node, and from which site.
  const nodeTime = new Float64Array(nodes.length).fill(NEVER)
  const nodeSite = new Int16Array(nodes.length).fill(-1)
  nodes.forEach((_, n) =>
    sites.forEach((_, si) => {
      const t = arrival(si, reach[si][n])
      if (t < nodeTime[n]) [nodeTime[n], nodeSite[n]] = [t, si]
    }),
  )

  // One dot on each building's roof. It turns when the street in front of it does, a little later the farther it stands.
  const roofs = []
  buildings.forEach((b, i) => {
    const r = hash(i)
    let time = NEVER
    if (r >= HOLDOUT_SHARE) {
      const n = nearestNode(nodes, b.centre[0], b.centre[1])
      const si = nodeSite[n]
      if (si >= 0) time = nodeTime[n] + Math.hypot(nodes[n].x - b.centre[0], nodes[n].y - b.centre[1]) / sites[si].speed + 0.15 * r
    }
    const site = sites.find((s) => s.building === b.id)
    if (site) time = site.week - 0.15 // already glowing when the site ignites
    roofs.push({ x: b.centre[0], y: b.centre[1], z: b.height + 1.5, time, rand: hash(i + 7919) })
  })

  // Dots along the streets, and a wider glow on the ground below them.
  const streets = []
  const haze = []
  edges.forEach((e, ei) => {
    const along = (step, push) => {
      const length = polylineLength(e.pts)
      const count = Math.max(1, Math.round(length / step))
      for (let k = 0; k < count; k++) {
        const s = ((k + 0.5) / count) * length
        const [x, y] = pointAt(e.pts, s)
        const f = s / length // share of the edge from node a
        let time = NEVER
        sites.forEach((_, si) => {
          const d = Math.min(reach[si][e.a] + f * e.length, reach[si][e.b] + (1 - f) * e.length)
          time = Math.min(time, arrival(si, d))
        })
        push({ x, y, time, rand: hash(ei * 131 + k) })
      }
    }
    along(STREET_STEP_M, (p) => streets.push({ ...p, z: 1.5 }))
    along(HAZE_STEP_M, (p) => haze.push(p))
  })

  // Sorted times, to count what is infected at any week.
  const roofTimes = Float64Array.from(roofs.map((r) => r.time)).sort()

  return { sites, links, roofs, streets, haze, roofTimes }
}

// How many buildings are infected at `week`.
export function infectedAt(roofTimes, week) {
  let lo = 0, hi = roofTimes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (roofTimes[mid] <= week) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function stageAt(week) {
  return STAGES[Math.min(Math.floor(week + 1e-6), STAGES.length - 1)]
}

// A fixed number between 0 and 1 for each integer, the same on every load.
function hash(i) {
  let h = (i + 1) * 0x9e3779b1
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function nearestNode(nodes, x, y) {
  let best = -1, bestD = Infinity
  nodes.forEach((n, i) => {
    if (n.links.length === 0) return // not on a walkable edge
    const d = (n.x - x) ** 2 + (n.y - y) ** 2
    if (d < bestD) [best, bestD] = [i, d]
  })
  return best
}

// Walking distance in metres from the start to every node (Dijkstra).
function shortestPaths(nodes, edges, start) {
  const dist = new Float64Array(nodes.length).fill(Infinity)
  const done = new Uint8Array(nodes.length)
  dist[start] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0) break
    done[u] = 1
    for (const ei of nodes[u].links) {
      const e = edges[ei]
      const v = e.a === u ? e.b : e.a
      const d = dist[u] + e.length
      if (d < dist[v]) dist[v] = d
    }
  }
  return dist
}

function polylineLength(pts) {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return l
}

function pointAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (s <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(s / l, 1) : 0
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
    }
    s -= l
  }
  return pts[0]
}
