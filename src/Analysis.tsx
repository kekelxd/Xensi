import { XensiPageHeader } from './design/Primitives'
import { AnimatedMetric } from './design/AnimatedMetric'
import { MotionDialog, MotionDialogPanel } from './design/MotionSurfaces'
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
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const removalTrigger = useRef<HTMLButtonElement>(null)
  const cancelRemoval = () => { setConfirmRemoval(false); requestAnimationFrame(() => removalTrigger.current?.focus()) }
  const returnFocus = useRef<HTMLElement | null>(null)
  const closeDetails = () => { setConfirmRemoval(false); setDetails(null) }
  const openDetails = (session: TrainingSession) => { returnFocus.current = document.activeElement as HTMLElement; setConfirmRemoval(false); setDeleteError(false); setDetails(session) }
  const removeSession = async () => {
    if (!details || deleting) return
    setDeleting(true); setDeleteError(false)
    try { await getSessionRepository().remove(details); closeDetails() }
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
  const kicker = locale === 'en' ? 'Analysis · real sessions only' : locale === 'es' ? 'Análisis · solo sesiones reales' : 'Análise · só sessões reais'
  const heroValue = data && metric ? aggregateValue(data.current, metric) : null
  return <section className="analysis-workspace analysis-dashboard analysis-v1 xb-page xb-analysis">
    <XensiPageHeader kicker={kicker} title={copy.title} description={copy.subtitle} actions={<button className="xb-icon-btn" type="button" title={copy.refresh} aria-label={copy.refresh} onClick={refresh}><RefreshCw size={18}/></button>} />
    <div className="analysis-v1-filters xb-control-strip">
      <label>{copy.period}<select value={period} onChange={e=>setPeriod(e.target.value as AnalysisPeriod)}>{(['7d','30d','90d','all'] as const).map(p=><option key={p} value={p}>{copy[p]}</option>)}</select></label>
      <label>{copy.exercise}<select value={exercise} onChange={e=>{const v=e.target.value as typeof exercise;setExercise(v);setVariant(null);setMetricKey(v==='all'?null:SESSION_REGISTRY[v].primaryMetric)}}>
        <option value="all">{copy.allExercises}</option>{options.map(s=><option key={s.exerciseId} value={s.exerciseId}>{labels.exerciseName(s)}</option>)}{exercise!=='all'&&!options.some(s=>s.exerciseId===exercise)&&<option value={exercise}>{exercise}</option>}</select></label>
      {exercise!=='all'&&<><label className="av1-configuration">{copy.configuration}<select value={chosenVariant??''} onChange={e=>setVariant(e.target.value||null)}>
        {!chosenVariant&&<option value="">—</option>}{data?.variants.filter(v=>v.session.exerciseId===exercise).map(v=><option key={variantKey(v.session)} value={variantKey(v.session)}>{labels.configuration(v.session)}</option>)}</select></label>
        <label>{copy.metric}<select value={metric?.key??''} onChange={e=>setMetricKey(e.target.value as AnalysisMetricKey)}>{metrics.map(m=><option key={m.key} value={m.key}>{t(m.label)}</option>)}</select></label></>}
    </div>
    {state.status==='loading'?<p className="av1-state xb-state" role="status">{copy.loading}</p>:state.status==='error'?<p className="av1-state xb-state" role="alert">{copy.error}</p>:data&&<>
      {!data.total?<div className="av1-empty xb-empty"><span className="xb-empty-mark" aria-hidden="true">00</span><h2>{copy.empty}</h2><p>{copy.emptyText}</p>{onStartTraining&&<button className="xb-btn xb-btn-primary" onClick={onStartTraining}><Play size={15}/>{copy.train}</button>}</div>:<>
      <div className="analysis-v1-summary xb-scoreboard" aria-label={copy.title}>
        {metric&&<><div className="is-lead"><span>{copy[metric.aggregation]}</span><strong><AnimatedMetric value={heroValue} format={value => formatAnalysisValue(value,metric,locale)} /></strong><small>{t(metric.label)}</small></div>
        <div><span>{copy.primaryPB}</span><strong><AnimatedMetric value={pb?.value ?? null} format={value => primary ? formatAnalysisValue(value,primary,locale) : '—'} /></strong><small>{!pb?copy.noPB:primary?t(primary.label):''}</small></div>
        <div><span>{copy.variation}</span><strong><AnimatedMetric value={data.current.variation} format={value => formatAnalysisValue(value,{unit:'%',precision:1},locale)} /></strong></div></>}
        <div><span>{copy.count}</span><strong><AnimatedMetric value={data.total} format={value => new Intl.NumberFormat(locale).format(value ?? 0)} /></strong></div>
        {!metric&&<div><span>{copy.overview}</span><strong>{options.length}</strong></div>}
      </div>
      <div className="xb-analysis-grid">
        <section className="av1-section xb-panel xb-chart-panel"><h2>{copy.chart}{metric&&<small>{t(metric.label)}</small>}</h2>{metric?data.points.length?<AnalysisChart key={JSON.stringify(query)} sessions={data.points} metric={metric} pb={metric.key===primary?.key&&pb?pb.value:null} onDetails={openDetails}/>:<p className="av1-state xb-state">{copy.noMetric}</p>:<p className="av1-state xb-state">{copy.select}</p>}
          {data.pointCount>300&&<p className="av1-note">{copy.limited}</p>}
        </section>
        {metric&&<section className="av1-section av1-period xb-panel xb-versus-panel"><h2>{copy.comparison}</h2>{period==='all'?<p className="xb-state">{copy.noComparison}</p>:<>
          <div className="xb-versus-rows"><span className="is-current">{copy.current}<strong><AnimatedMetric value={aggregateValue(data.current,metric)} format={value => formatAnalysisValue(value,metric,locale)} /></strong><small>{data.current.count} {copy.count.toLowerCase()}</small></span>
          <span className="is-previous">{copy.previous}<strong>{formatAnalysisValue(aggregateValue(data.previous,metric),metric,locale)}</strong><small>{data.previous.count} {copy.count.toLowerCase()}</small></span>
          <span className={`xb-delta ${change===null||change===0?'':change>0?'positive':'negative'}`}>{change===null?copy.insufficient:`${change>0?'+':''}${formatAnalysisValue(change,{unit:'%',precision:1},locale)}`}</span></div></>}
        </section>}
      </div>
      </>}
      <PersonalBestPanel exercise={exercise==='all'?undefined:exercise} variant={exercise==='all'?undefined:chosenVariant??undefined}/>
      <section className="av1-section xb-panel xb-history"><h2>{copy.recent}</h2><div className="analysis-v1-recents">
        {data.recent.map((s,index)=>{const m=getAnalysisMetrics(s.exerciseId)[0];return <button key={s.id} type="button" onClick={()=>openDetails(s)}><i aria-hidden="true">{String(index+1).padStart(2,'0')}</i><span><b>{labels.exerciseName(s)}</b><small>{s.config!.spatial ? `${s.config!.spatial.roundCount} ${t('spatial.rounds')} · HRTF` : `${s.config!.durationSeconds}s · ${t(`difficulty.${s.config!.difficulty}`)}`}</small></span><strong>{formatAnalysisValue(getMetricValue(s,m),m,locale)}</strong><time dateTime={s.finishedAt}>{labels.date(s)}</time></button>})}
      </div></section>
    </>}
    <MotionDialog open={Boolean(shownDetails)} className="modal-backdrop" onClick={closeDetails} onKeyDown={e=>{if(e.key==='Escape'){if(confirmRemoval)cancelRemoval();else closeDetails()}}}>{shownDetails && (<MotionDialogPanel className="modal av1-details xb-modal" role="dialog" aria-modal="true" aria-label={copy.details} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
        if (e.key !== 'Tab') return
        const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }}>
        <button autoFocus className="modal-close xb-modal-close" title={t('common.close')} aria-label={t('common.close')} onClick={closeDetails}><X size={20}/></button>
        <h2>{labels.exerciseName(shownDetails)}</h2><p>{labels.date(shownDetails)} · {t('sessions.completed')}</p>
        <dl className="analysis-v1-context">{getAnalysisMetrics(shownDetails.exerciseId).map(m=><div key={m.key}><dt>{t(m.label)}</dt><dd>{formatAnalysisValue(getMetricValue(shownDetails,m),m,locale)}</dd></div>)}</dl>
        <AnalysisSessionContext session={shownDetails}/>
        {deleteError&&<p role="alert">{copy.deleteError}</p>}
        {confirmRemoval ? <div className="xensi-inline-confirmation" role="alertdialog" aria-labelledby="analysis-removal-title" aria-describedby="analysis-removal-description">
          <h3 id="analysis-removal-title">{copy.deleteSession}</h3><p id="analysis-removal-description">{copy.confirmDelete}</p>
          <div><button autoFocus className="secondary-button" disabled={deleting} onClick={cancelRemoval}>{t('common.cancel')}</button><button className="primary-button" disabled={deleting} onClick={()=>void removeSession()}><Trash2 size={16}/>{copy.deleteSession}</button></div>
        </div> : <button ref={removalTrigger} className="secondary-button" disabled={deleting} onClick={()=>setConfirmRemoval(true)}><Trash2 size={16}/>{copy.deleteSession}</button>}
      </MotionDialogPanel>)}</MotionDialog>
  </section>
}
