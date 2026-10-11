// Adapted from Magic UI AnimatedGridPattern (MIT). See third-party/MagicUI-LICENSE.md.
import { useId } from 'react'

// Fixed SVG coordinates replace random state updates/ResizeObserver in the source.
// Three finite CSS pulses replace perpetual randomized state/paint updates.
export function AnimatedGridPattern() {
  const id = useId()
  return <svg className="xensi-ambient-grid" aria-hidden="true" width="100%" height="100%">
    <defs><pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse"><path d="M.5 64V.5H64" fill="none" /></pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${id})`} />
    {[['16%', '128'], ['72%', '256'], ['36%', '512']].map(([x,y], index) => <rect className="xensi-grid-cell" key={index} x={x} y={y} width="63" height="63" style={{ animationDelay: `${index * .08}s` }} />)}
  </svg>
}
