// The city kit in local metres from the kit centre: x to the east, y to the north.

const FILES = { kit: 'kit.json', buildings: 'buildings.geojson', graph: 'streets.graph.json' }

export function loadKit() {
  const load = ([key, file]) =>
    fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`data/${file}: ${r.status}`)
        return r.json()
      })
      .then((json) => [key, json])
  return Promise.all(Object.entries(FILES).map(load)).then(Object.fromEntries)
}

// Longitude and latitude in degrees to metres, flat around the kit centre.
// The kit is 2 km across, so the error of a flat projection is far below a metre.
export function makeProjection([lon0, lat0]) {
  const phi = (lat0 * Math.PI) / 180
  const mPerLat = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
  const mPerLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
  return ([lon, lat]) => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat]
}

// Turns the raw kit files into what the app uses: projected, with lookups ready.
export function prepare({ kit, buildings, graph }) {
  const project = makeProjection(kit.center)

  const nodeIndex = new Map(graph.nodes.map((n, i) => [n.id, i]))
  const nodes = graph.nodes.map((n) => {
    const [x, y] = project([n.lon, n.lat])
    return { id: n.id, x, y, links: [] }
  })

  const edges = graph.edges
    .filter((e) => e.walkable)
    .map((e) => ({ id: e.id, a: nodeIndex.get(e.from), b: nodeIndex.get(e.to), length: e.length, pts: e.coords.map(project) }))
  edges.forEach((e, i) => {
    nodes[e.a].links.push(i)
    nodes[e.b].links.push(i)
  })

  const houses = buildings.features.map((f) => {
    const rings = f.geometry.coordinates.map((r) => r.map(project))
    return { id: f.properties.id, use: f.properties.use ?? 'undefined', height: f.properties.height, rings, centre: centreOf(rings[0]) }
  })

  const [w, s, e, n] = kit.bbox
  const [x0, y0] = project([w, s])
  const [x1, y1] = project([e, n])

  return { kit, nodes, edges, buildings: houses, bounds: { x0, y0, x1, y1 } }
}

// The average of a ring's corners, without the repeated last point.
function centreOf(ring) {
  let x = 0, y = 0
  const n = ring.length - 1
  for (let i = 0; i < n; i++) {
    x += ring[i][0]
    y += ring[i][1]
  }
  return [x / n, y / n]
}
