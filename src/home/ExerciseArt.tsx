import type { WarmupExercise } from '../warmupConfig'

// Pure CSS mechanic previews. Animations only play while the card is hovered or focused
// (see .xl-ex-card:is(:hover, :focus-within) in landing.css), so idle cost is zero.
export function ExerciseArt({ id }: { id: WarmupExercise }) {
  return <div className={`xl-art xl-art-${id}`} aria-hidden="true">
    <span className="xl-art-grid" />
    {id === 'gridshot' && <>{Array.from({ length: 9 }, (_, index) => <i key={index} className="xl-art-cell" style={{ ['--i' as string]: index }} />)}</>}
    {id === 'spatial_hunt' && <><span className="xl-art-ring" /><span className="xl-art-ring" /><span className="xl-art-ring" /><span className="xl-art-source" /></>}
    {id === 'sniper-reaction' && <><span className="xl-art-scope" /><span className="xl-art-dot xl-art-runner" /></>}
    {id !== 'gridshot' && id !== 'spatial_hunt' && id !== 'sniper-reaction' && <><span className="xl-art-dot xl-art-a" /><span className="xl-art-dot xl-art-b" /></>}
    <span className="xl-art-cross" />
  </div>
}
