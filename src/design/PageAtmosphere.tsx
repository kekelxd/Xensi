import { motion, useReducedMotion } from 'motion/react'
import type { Atmosphere } from './ambientThemes'
import { xensiMotion } from './motion'

// Each path represents the tool's geometry; it is decoration, never telemetry.
const geometry: Partial<Record<Atmosphere, string[]>> = {
  train: ['M720 90h250v250H720z M845 55v320 M685 215h320', 'M790 160h110v110H790z'],
  calibrate: ['M720 340a190 190 0 0 1 380 0 M765 340a145 145 0 0 1 290 0', 'M800 280Q940 130 1070 230 M905 190l18 15-18 18'],
  convert: ['M725 140h100l65 65h180 M725 290h100l65-65h180', 'M725 140v150 M1070 205v20'],
  diagnostics: ['M660 220h80l28-60 38 115 35-75 40 20h170', 'M720 100v250 M820 100v250 M920 100v250 M1020 100v250'],
  analysis: ['M660 300C780 300 745 190 860 220S975 100 1100 150', 'M660 350C790 350 820 300 920 300S1000 260 1100 260'],
  profile: ['M900 85a150 150 0 1 1-1 0 M900 120a115 115 0 1 1-1 0', 'M850 225h100 M900 175v100'],
}
export function PageAtmosphere({ atmosphere, paused }: { atmosphere: Atmosphere; paused: boolean }) {
  const reduced = useReducedMotion()
  return <svg className="xensi-page-atmosphere" viewBox="0 0 1280 420" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
    {Object.entries(geometry).map(([name, paths]) => <motion.g key={name} initial={false} animate={{ opacity: !paused && name === atmosphere ? 1 : 0, y: name === atmosphere ? 0 : 10 }} transition={{ duration: reduced || paused ? 0 : xensiMotion.durations.reveal, ease: xensiMotion.easings.easeOut }}>
      {paths.map((path, index) => <path key={index} d={path} className={index ? 'xensi-atmosphere-secondary' : undefined} />)}
    </motion.g>)}
  </svg>
}
