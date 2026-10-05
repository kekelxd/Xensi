import { useEffect, useMemo, useRef, useState } from 'react'
import { getMetricValue, formatAnalysisValue, type AnalysisMetric } from './analysisMetrics'
import { getPresetChanges } from './analysisService'
import { useI18n } from './i18n'
import { ANALYSIS_COPY } from './analysisCopy'
import { AnalysisSessionContext } from './AnalysisSessionContext'
import { useSessionLabels } from './useSessionLabels'
import type { TrainingSession } from './trainingSession'

export function AnalysisChart({ sessions, metric, pb, onDetails }: { sessions: TrainingSession[]; metric: AnalysisMetric; pb: number | null; onDetails: (s: TrainingSession) => void }) {
  const { locale, t } = useI18n(), copy = ANALYSIS_COPY[locale], labels = useSessionLabels()
  const [active, setActive] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const right = width - 30
  const layout = useMemo(() => {
    const values = sessions.map(s => getMetricValue(s, metric)!), min = Math.min(...values, ...(pb === null ? [] : [pb])), max = Math.max(...values, ...(pb === null ? [] : [pb]))
    const scale = Math.max(1, max)
    let lo = min / scale, hi = max / scale
    if (hi === lo) { lo = Math.max(0, lo - .05); hi += .05; if (metric.unit === '%') hi = Math.min(100 / scale, hi) }
    const start = Date.parse(sessions[0].finishedAt), end = Date.parse(sessions.at(-1)!.finishedAt)
    const y = (value: number) => hi === lo ? 142 : 244 - (value / scale - lo) / (hi - lo) * 204
    const nodes = sessions.map(s => ({ session: s, x: start === end ? (76 + right) / 2 : 76 + (Date.parse(s.finishedAt) - start) / (end - start) * (right - 76), y: y(getMetricValue(s,metric)!) }))
    return { nodes, y, ticks: [0,1,2,3].map(i => ({ y: 244 - i / 3 * 204, value: (lo + (hi - lo)*i/3)*scale })) }
  }, [sessions,metric,pb,right])
  const markers = getPresetChanges(sessions), point = sessions.find(s => s.id === active)
  return <div className="analysis-v1-chart" ref={container} onMouseLeave={()=>setActive(null)}>
    <svg viewBox={`0 0 ${width} 292`} role="img" aria-label={`${copy.chart}: ${t(metric.label)}`}>
      {layout.ticks.map((tick,i) => <g key={i}><line className="av1-grid" x1="76" x2={right} y1={tick.y} y2={tick.y} /><text x="64" y={tick.y+4} textAnchor="end">{formatAnalysisValue(tick.value,metric,locale)}</text></g>)}
      {pb !== null && <g className="av1-pb"><line x1="76" x2={right} y1={layout.y(pb)} y2={layout.y(pb)} /><text x={right - 4} y={layout.y(pb)-7} textAnchor="end">PB {formatAnalysisValue(pb,metric,locale)}</text></g>}
      {markers.map(({previous,session}) => {
        const node = layout.nodes.find(n => n.session.id===session.id)!
        return <g className="av1-marker" key={session.id}><title>{copy.changed}: {previous.context!.sensitivity} → {session.context!.sensitivity} · {previous.context!.dpi} → {session.context!.dpi} DPI</title><line x1={node.x} x2={node.x} y1="30" y2="250" /></g>
      })}
      <polyline className="av1-line" points={layout.nodes.map(n=>`${n.x},${n.y}`).join(' ')} />
      {layout.nodes.map(n => <circle key={n.session.id} className="av1-point" data-session-id={n.session.id} cx={n.x} cy={n.y} r="5" tabIndex={0} role="button"
        aria-label={`${labels.date(n.session)} · ${labels.exerciseName(n.session)} · ${formatAnalysisValue(getMetricValue(n.session,metric),metric,locale)}`}
        onMouseEnter={()=>setActive(n.session.id)} onFocus={()=>setActive(n.session.id)} onBlur={()=>setActive(null)}
        onClick={()=>onDetails(n.session)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onDetails(n.session)}}} />)}
      <text x="76" y="281">{new Intl.DateTimeFormat(locale,{month:'short',day:'numeric'}).format(new Date(sessions[0].finishedAt))}</text>
      <text x={right} y="281" textAnchor="end">{new Intl.DateTimeFormat(locale,{month:'short',day:'numeric'}).format(new Date(sessions.at(-1)!.finishedAt))}</text>
    </svg>
    {point && <div className="analysis-chart-tooltip av1-tooltip" role="status"><b>{labels.date(point)}</b><strong>{labels.exerciseName(point)} · {formatAnalysisValue(getMetricValue(point,metric),metric,locale)}</strong><AnalysisSessionContext session={point} compact /></div>}
  </div>
}
