// Colours for the city at night and the outbreak on top of it. Keep these in step with index.css.

export const BACKGROUND = '#07080b'
export const GROUND = '#111318'
export const STREET = '#2f343d'
export const BUILDING = '#454b55'

// Infection, from a new case (faint red) to an established one (intense crimson).
export const INFECTION_STOPS = ['#ff8c8c', '#e0213d', '#b0001e']

export const LINK = '#ff4d5e' // a jump from one site to the next
export const QUARANTINE = '#e3a33b' // quarantine perimeters

// The underground reveal: a navy and cyan surveillance feed, after the reference image of the Hive.
export const LAB_COLORS = {
  background: '#06142b',
  ground: '#123457',
  street: '#3f86b8',
  building: '#5f93bf', // the city above turns into a pale blue ghost
  buildingCut: '#9fdcff', // where the section cuts a building
  steel: '#15263f',
  steelGlow: '#16355e',
  steelCut: '#7fe3ff', // where the section cuts the laboratory
  earth: '#0a1b35',
  wire: '#5fd8ff', // wireframe edges
  light: '#38c8ff', // windows and light strips
  grid: '#2a7fbf',
  tank: '#6ff3e6',
  warning: '#ff2340',
}
