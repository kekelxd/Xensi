import { useEffect, useState } from 'react'
import { useSessionState } from './sessionRepository'
import { buildAnalysis, type AnalysisData, type AnalysisQuery } from './analysisService'
import { fetchAnalysis } from './analysisCloud'
export function useAnalysis(query: AnalysisQuery, revision: number) {
  const source = useSessionState()
  const key = JSON.stringify([source.userId, query, revision])
  const [state, setState] = useState<{ key: string; source: typeof source; status: 'ready' | 'error'; data?: AnalysisData } | null>(null)
  useEffect(() => {
    let alive = true
    if (source.status !== 'ready') return
    const load = async () => {
      try {
        if (source.error) throw new Error('History unavailable')
        const requestQuery = { ...query, now: Math.max(query.now, Date.now()) }
        const data = source.userId ? await fetchAnalysis(source.userId, requestQuery) : buildAnalysis(source.items, null, requestQuery)
        if (alive) setState({ key, source, status: 'ready', data })
      } catch { if (alive) setState({ key, source, status: 'error' }) }
    }
    void load()
    return () => { alive = false }
  }, [source, key, query])
  if (source.status !== 'ready' || state?.key !== key || state.source !== source) return { status: 'loading' as const, data: undefined }
  return { status: state.status, data: state.data }
}
