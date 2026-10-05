import type { TrainingSession } from './trainingSession'
import { useSessionLabels } from './useSessionLabels'
export function AnalysisSessionContext({ session, compact = false }: { session: TrainingSession; compact?: boolean }) {
  const { fields } = useSessionLabels()
  return <dl className="analysis-v1-context">{fields(session, compact).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}
