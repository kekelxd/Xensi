import { Component, lazy, Suspense, type ReactNode } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { useI18n } from './i18n'

const SpatialHuntPage = lazy(() => import('./SpatialHuntPage'))
class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
export function SpatialHuntLoader({ onExit }: { onExit: () => void }) {
  const { t } = useI18n()
  return <Boundary fallback={<section role="alert"><p>{t('spatial.loadingFailed')}</p>
    <button className="icon-button" title={t('spatial.reload')} aria-label={t('spatial.reload')} onClick={() => window.location.reload()}><RefreshCw size={20}/></button>
    <button className="icon-button" title={t('spatial.exit')} aria-label={t('spatial.exit')} onClick={onExit}><ArrowLeft size={20}/></button>
  </section>}><Suspense fallback={<p role="status">{t('spatial.loading')}</p>}><SpatialHuntPage onExit={onExit}/></Suspense></Boundary>
}
