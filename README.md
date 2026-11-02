# Weimar: Survival or the Next Raccoon City?

An alternate-history outbreak told on a 3D model of central Weimar. A cinematic introduction tells how a secret Umbrella Corporation facility came to sit beneath the old town. A timeline then follows a fictional viral outbreak through the real streets over four weeks, and ends with the discovery of an underground laboratory.

**This is fiction.** Umbrella Corporation, the facility, the sites' roles and the outbreak are invented. Only the buildings and streets are real, from open data. Nothing here makes a claim about Weimar's history.

Live site: https://yhemayll.github.io/latent-intuition/

## Run it

```
npm install     install the packages
npm run dev     start the app at http://localhost:5173
```

Drag to orbit, right-drag to pan, scroll to zoom. Move the slider, click a week, or press play.

## How the outbreak is built

- **Sites.** Fourteen outbreak sites stand on real buildings of the kit, chosen by their use in `buildings.geojson`: the kit's only industrial unit is Site 0, then clinics, a transit depot, a school, a market hall and so on. Their names and roles are fictional. Each site has a week when it ignites and the site that infected it, drawn as an arc.
- **Spread.** From each site the infection travels along the pedestrian network, faster for later sites as containment fails. A street point is infected at the earliest time any site reaches it. A building turns shortly after the street node nearest to it. About 5% of buildings never turn.
- **Markers.** A dot on each infected roof and every 12 m along infected streets, from faint red to crimson over about nine days, with a faint glow on the ground for the infection zones. Amber dashed rings are quarantine perimeters from week 3.
- **Deterministic.** Everything is worked out once from the data, with no randomness, so a week always looks the same, going forward or backward.
- **Separate from the city.** The outbreak (`src/outbreak.js`, `src/OutbreakLayer.jsx`) reads the city but never changes its geometry (`src/city.js`, `src/CityScene.jsx`).

## The underground laboratory

At week 4, "Reveal underground lab" opens a section through the city centre. The design follows the Hive of the Resident Evil films; the facility, its history and its levels are fiction.

- **Transition.** The infection steps back, the camera rises over the centre, and a vertical section plane sweeps north through the real buildings. The city turns into a pale blue ghost and the ground into glass, so the laboratory shows through from above.
- **Section.** Everything south of the plane is cut away. Where it cuts a building or the laboratory, the inside shows as a flat section colour; the earth's cut face is navy with section hatching, open where the cavern is.
- **Laboratory.** An inverted, stepped tower of octagonal tiers in five levels, B1 to B5, hanging on a glass shaft from the surface to 430 m below. A lift stops at each level. Lattice arms, bridges, tanks, two inclined access tunnels to hatches in the city, and an older tunnel towards Site 0.
- **Interface.** An Umbrella surveillance feed: facility status, a schematic with the lift's position, containment by level, the lift's depth and a mission time. Four camera angles; in between, the mouse orbits in a limited range so the section stays in view. "Return to the surface" runs the reveal back.
- **Infection.** The red markers stay on the city above, fainter, and are cut by the section with the buildings.
- **Code.** `src/lab.js` (layout, timing, geometry), `src/LabScene.jsx` (the laboratory and the cut face), `src/section.js` (the shared plane and clock), `src/Hud.jsx` (the interface). The laboratory never changes the city's geometry.

## Data sources

All data is in `public/data/`; `SOURCES.md` there describes every file and field.

| Data | Source | Licence |
| --- | --- | --- |
| Building footprints and heights | 3D building models LoD2 of Thuringia, © GDI-Th; floors and uses added by Egor Gaydukov | dl-de/by-2-0 |
| Pedestrian network | Egor Gaydukov, InfAU, Bauhaus-Universität Weimar | |
| Census grid, 100 m (in the kit, not used by the outbreak) | Zensus 2022, © Statistische Ämter des Bundes und der Länder | dl-de/by-2-0 |

Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5.
2. I decided:
3. The agent did: read the city kit, then wrote the 3D view, the walking and resident calculations, the panel and this README, and tested the calculations against the data.
4. I checked:
