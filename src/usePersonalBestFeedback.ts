import { useEffect, useRef, useState } from 'react'
import { getPersonalBestService } from './personalBestService'
import type { PersonalBestResult } from './personalBests'
import type { TrainingSession } from './trainingSession'

export function usePersonalBestFeedback() {
  const request = useRef(0)
  const [result, setResult] = useState<PersonalBestResult | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => () => { request.current++ }, [])
  const reset = () => { request.current++; setResult(null); setUnavailable(false) }
  const evaluate = (session: TrainingSession) => {
    reset()
    const version = request.current
    void getPersonalBestService().compareSessionToPB(session).then(value => {
      if (version === request.current) setResult(value)
    }).catch(() => { if (version === request.current) setUnavailable(true) })
  }
  return { result, unavailable, reset, evaluate }
}
