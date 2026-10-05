import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, X, Play, Trash2 } from 'lucide-react'
import { useI18n } from './i18n'
import type { AnalysisSection } from './AppNavigation'
import { CalibrationAnalysis } from './CalibrationAnalysis'
import { PersonalBestPanel } from './PersonalBestPanel'
import { usePersonalBests } from './personalBestService'
import { useAnalysis } from './useAnalysis'
import { getSessionRepository } from './sessionRepository'
import { aggregateValue, comparePeriods, variantKey, type AnalysisPeriod } from './analysisService'
import { formatAnalysisValue, getAnalysisMetrics, getMetricValue } from './analysisMetrics'
import { SESSION_REGISTRY, type AnalysisMetricKey, type TrainingSession } from './trainingSession'
import { ANALYSIS_COPY } from './analysisCopy'
import { AnalysisChart } from './AnalysisChart'
import { AnalysisSessionContext } from './AnalysisSessionContext'
import { useSessionLabels } from './useSessionLabels'

type Props = { section: AnalysisSection; onStartTraining?: () => void }
export function Analysis(props: Props) {
  return props.section === 'methodology' || props.section === 'calibration-history' ? <CalibrationAnalysis section={props.section} /> : <AnalysisDashboard {...props} />
}
function AnalysisDashboard({ onStartTraining }: Props) {
  const { locale, t } = useI18n(), copy = ANALYSIS_COPY[locale], labels = useSessionLabels()
  const [period,setPeriod] = useState<AnalysisPeriod>('30d')
  const [exercise,setExercise] = useState<TrainingSession['exerciseId']|'all'>('all')
  const [variant,setVariant] = useState<string|null>(null)
  const [metricKey,setMetricKey] = useState<AnalysisMetricKey|null>(null)
  const [revision,setRevision] = useState(0), [now,setNow] = useState(()=>Date.now())
  const [details,setDetails] = useState<TrainingSession|null>(null)
  const [deleting,setDeleting] = useState(false), [deleteError,setDeleteError] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openDetails = (session: TrainingSession) => { returnFocus.current = document.activeElement as HTMLElement; setDeleteError(false); setDetails(session) }
  const removeSession = async () => {
    if (!details || !window.confirm(copy.confirmDelete)) return
    setDeleting(true); setDeleteError(false)
    try { await getSessionRepository().remove(details); setDetails(null) }
    catch { setDeleteError(true) }
    finally { setDeleting(false) }
  }
  const query = useMemo(()=>({period,exercise,variant,metric:metricKey,now}),[period,exercise,variant,metricKey,now])
  const state = useAnalysis(query,revision), bests = usePersonalBests(), data = state.data
  const metrics = exercise === 'all' ? [] : getAnalysisMetrics(exercise)
  const metric = metrics.find(m=>m.key===metricKey) ?? metrics[0]
  const chosenVariant = variant ?? data?.selectedVariant ?? null
  const pb = data && bests.status==='ready' ? bests.items.find(b=>variantKey(b.session)===chosenVariant) : undefined
  const primary = exercise === 'all' ? null : getAnalysisMetrics(exercise)[0]
  const change = data && metric ? comparePeriods(data.current,data.previous,metric,period) : null
  const refresh = () => { setNow(Date.now()); setRevision(v=>v+1); void getSessionRepository().refresh() }
  const shownDetails = details && data?.recent.some(s=>s.id===details.id) || details && data?.points.some(s=>s.id===details.id) ? details : null
  const detailsId = shownDetails?.id
  useEffect(() => {
    if (!detailsId) return
    return () => { if (returnFocus.current?.isConnected) returnFocus.current.focus() }
  }, [detailsId])
  const options = [...new Map((data?.variants??[]).map(v=>[v.session.exerciseId,v.session])).values()]
  return <section className="analysis-workspace analysis-dashboard analysis-v1">
    <header><div><h1>{copy.title}</h1><p>{copy.subtitle}</p></div><button className="icon-button" type="button" title={copy.refresh} aria-label={copy.refresh} onClick={refresh}><RefreshCw size={18}/></button></header>
    <div className="analysis-v1-filters">
      <label>{copy.period}<select value={period} onChange={e=>setPeriod(e.target.value as AnalysisPeriod)}>{(['7d','30d','90d','all'] as const).map(p=><option key={p} value={p}>{copy[p]}</option>)}</select></label>
      <label>{copy.exercise}<select value={exercise} onChange={e=>{const v=e.target.value as typeof exercise;setExercise(v);setVariant(null);setMetricKey(v==='all'?null:SESSION_REGISTRY[v].primaryMetric)}}>
        <option value="all">{copy.allExercises}</option>{options.map(s=><option key={s.exerciseId} value={s.exerciseId}>{labels.exerciseName(s)}</option>)}{exercise!=='all'&&!options.some(s=>s.exerciseId===exercise)&&<option value={exercise}>{exercise}</option>}</select></label>
      {exercise!=='all'&&<><label className="av1-configuration">{copy.configuration}<select value={chosenVariant??''} onChange={e=>setVariant(e.target.value||null)}>
        {!chosenVariant&&<option value="">—</option>}{data?.variants.filter(v=>v.session.exerciseId===exercise).map(v=><option key={variantKey(v.session)} value={variantKey(v.session)}>{labels.configuration(v.session)}</option>)}</select></label>
        <label>{copy.metric}<select value={metric?.key??''} onChange={e=>setMetricKey(e.target.value as AnalysisMetricKey)}>{metrics.map(m=><option key={m.key} value={m.key}>{t(m.label)}</option>)}</select></label></>}
    </div>
    {state.status==='loading'?<p className="av1-state" role="status">{copy.loading}</p>:state.status==='error'?<p className="av1-state" role="alert">{copy.error}</p>:data&&<>
      {!data.total?<div className="av1-empty"><h2>{copy.empty}</h2><p>{copy.emptyText}</p>{onStartTraining&&<button className="primary-button" onClick={onStartTraining}><Play size={15}/>{copy.train}</button>}</div>:<>
      <div className="analysis-v1-summary" aria-label={copy.title}>
        {metric&&<><div><span>{copy[metric.aggregation]}</span><strong>{formatAnalysisValue(aggregateValue(data.current,metric),metric,locale)}</strong></div>
        <div><span>{copy.primaryPB}</span><strong>{pb&&primary?formatAnalysisValue(pb.value,primary,locale):'—'}</strong><small>{!pb?copy.noPB:primary?t(primary.label):''}</small></div>
        <div><span>{copy.variation}</span><strong>{data.current.variation===null?'—':formatAnalysisValue(data.current.variation,{unit:'%',precision:1},locale)}</strong></div></>}
        <div><span>{copy.count}</span><strong>{new Intl.NumberFormat(locale).format(data.total)}</strong></div>
        {!metric&&<div><span>{copy.overview}</span><strong>{options.length}</strong></div>}
      </div>
      <section className="av1-section"><h2>{copy.chart}{metric&&<small>{t(metric.label)}</small>}</h2>{metric?data.points.length?<AnalysisChart key={JSON.stringify(query)} sessions={data.points} metric={metric} pb={metric.key===primary?.key&&pb?pb.value:null} onDetails={openDetails}/>:<p className="av1-state">{copy.noMetric}</p>:<p className="av1-state">{copy.select}</p>}
        {data.pointCount>300&&<p className="av1-note">{copy.limited}</p>}
      </section>
      {metric&&<section className="av1-section av1-period"><h2>{copy.comparison}</h2>{period==='all'?<p>{copy.noComparison}</p>:<>
        <div><span>{copy.current}<strong>{formatAnalysisValue(aggregateValue(data.current,metric),metric,locale)}</strong><small>{data.current.count} {copy.count.toLowerCase()}</small></span>
        <span>{copy.previous}<strong>{formatAnalysisValue(aggregateValue(data.previous,metric),metric,locale)}</strong><small>{data.previous.count} {copy.count.toLowerCase()}</small></span>
        <span className={change===null||change===0?'':change>0?'positive':'negative'}>{change===null?copy.insufficient:`${change>0?'+':''}${formatAnalysisValue(change,{unit:'%',precision:1},locale)}`}</span></div></>}
      </section>}
      </>}
      <PersonalBestPanel exercise={exercise==='all'?undefined:exercise} variant={exercise==='all'?undefined:chosenVariant??undefined}/>
      <section className="av1-section"><h2>{copy.recent}</h2><div className="analysis-v1-recents">
        {data.recent.map(s=>{const m=getAnalysisMetrics(s.exerciseId)[0];return <button key={s.id} type="button" onClick={()=>openDetails(s)}><span><b>{labels.exerciseName(s)}</b><small>{s.config!.durationSeconds}s · {t(`difficulty.${s.config!.difficulty}`)}</small></span><strong>{formatAnalysisValue(getMetricValue(s,m),m,locale)}</strong><time dateTime={s.finishedAt}>{labels.date(s)}</time></button>})}
      </div></section>
    </>}
    {shownDetails&&<div className="modal-backdrop" onClick={()=>setDetails(null)} onKeyDown={e=>{if(e.key==='Escape')setDetails(null)}}>
      <section className="modal av1-details" role="dialog" aria-modal="true" aria-label={copy.details} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
        if (e.key !== 'Tab') return
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }}>
        <button autoFocus className="modal-close" title={t('common.close')} aria-label={t('common.close')} onClick={()=>setDetails(null)}><X size={20}/></button>
        <h2>{labels.exerciseName(shownDetails)}</h2><p>{labels.date(shownDetails)} · {t('sessions.completed')}</p>
        <dl className="analysis-v1-context">{getAnalysisMetrics(shownDetails.exerciseId).map(m=><div key={m.key}><dt>{t(m.label)}</dt><dd>{formatAnalysisValue(getMetricValue(shownDetails,m),m,locale)}</dd></div>)}</dl>
        <AnalysisSessionContext session={shownDetails}/>
        {deleteError&&<p role="alert">{copy.deleteError}</p>}
        <button className="secondary-button" disabled={deleting} onClick={()=>void removeSession()}><Trash2 size={16}/>{copy.deleteSession}</button>
      </section>
    </div>}
  </section>
}
