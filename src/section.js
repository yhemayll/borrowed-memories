// What the city and the laboratory share during the reveal: its clock, and the section plane.
import { createContext, useContext } from 'react'
import * as THREE from 'three'

// { reveal, plane }: `reveal.current` holds `t`, the seconds since the reveal began (it runs back
// down on return), and `k`, how far each part has gone (see revealAt in lab.js).
// `plane` cuts away everything south of it.
export const RevealContext = createContext(null)
export const useReveal = () => useContext(RevealContext)

export const NO_CUT = 1e6 // a plane constant that keeps everything

// A closed mesh cut by the plane shows its inside, which is its back faces.
// Painting the back faces one flat colour makes the cut read as a solid section.
export function capped(material, cap) {
  const c = new THREE.Color(cap).convertLinearToSRGB() // the shader writes final screen colours
  material.side = THREE.DoubleSide
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      if (!gl_FrontFacing) gl_FragColor = vec4(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}, gl_FragColor.a);`,
    )
  }
  material.customProgramCacheKey = () => `capped-${cap}`
  return material
}
