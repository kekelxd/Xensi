import { ArrowRight, Gamepad2, Gauge, MonitorUp, Mouse } from 'lucide-react'
import { XensiPageHeader } from './design/Primitives'
import { useI18n } from './i18n'
import type { AppView } from './routes'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type DiagnosticDestination = Extract<AppView, 'polling' | 'buttons' | 'refresh-rate' | 'controller-drift'>

type Props = {
  onNavigate: (view: DiagnosticDestination) => void
}

const copy = {
  pt: {
    kicker: 'DIAGNÓSTICO DO SETUP',
    title: 'Quatro checagens. Um hub.',
    description: 'Escolha o teste certo para validar mouse, input, tela ou controle antes de entrar em partida.',
    open: 'Abrir diagnóstico',
    tools: [
      ['Polling Rate', 'Meça a frequência observada do mouse no navegador.'],
      ['Input Diagnostics', 'Confira mouse, teclado e gamepad em tempo real.'],
      ['Refresh Rate', 'Estime a taxa de atualização percebida pela tela.'],
      ['Drift do Controle', 'Analise o desvio dos analógicos em repouso.'],
    ],
  },
  en: {
    kicker: 'SETUP DIAGNOSTICS',
    title: 'Four checks. One hub.',
    description: 'Choose the right test to validate mouse, input, display, or controller before queueing.',
    open: 'Open diagnostic',
    tools: [
      ['Polling Rate', 'Measure the mouse rate observed by the browser.'],
      ['Input Diagnostics', 'Check mouse, keyboard, and gamepad input in real time.'],
      ['Refresh Rate', 'Estimate the display refresh cadence seen by the browser.'],
      ['Controller Drift', 'Analyze resting analog stick offset.'],
    ],
  },
  es: {
    kicker: 'DIAGNÓSTICO DEL SETUP',
    title: 'Cuatro chequeos. Un hub.',
    description: 'Elige la prueba correcta para validar mouse, entrada, pantalla o control antes de jugar.',
    open: 'Abrir diagnóstico',
    tools: [
      ['Polling Rate', 'Mide la frecuencia del mouse observada por el navegador.'],
      ['Input Diagnostics', 'Revisa mouse, teclado y gamepad en tiempo real.'],
      ['Refresh Rate', 'Estima la frecuencia de actualización percibida por la pantalla.'],
      ['Drift del Control', 'Analiza el desvío de los analógicos en reposo.'],
    ],
  },
} as const

const diagnostics: Array<{ view: DiagnosticDestination; icon: typeof Gauge }> = [
  { view: 'polling', icon: Gauge },
  { view: 'buttons', icon: Mouse },
  { view: 'refresh-rate', icon: MonitorUp },
  { view: 'controller-drift', icon: Gamepad2 },
]

export function DiagnosticLanding({ onNavigate }: Props) {
  const { locale } = useI18n()
  const current = copy[locale]

  return <section className="diagnostic-tool-workspace diagnostic-hub-workspace">
    <XensiPageHeader className="diagnostic-tool-heading diagnostic-hub-heading" title={current.title} description={current.description} />

    <div className="diagnostic-hub-grid" aria-label={current.kicker}>
      {diagnostics.map((diagnostic, index) => {
        const Icon = diagnostic.icon
        const [title, description] = current.tools[index]
        return <Card spotlight className="diagnostic-hub-card rounded-xl" key={diagnostic.view}>
          <span className="diagnostic-hub-icon"><Icon size={22} /></span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <Button variant="outline" className="group/open w-full justify-between" onClick={() => onNavigate(diagnostic.view)}>
            {current.open}
            <ArrowRight className="transition-transform group-hover/open:translate-x-0.5 motion-reduce:transition-none" />
          </Button>
        </Card>
      })}
    </div>
  </section>
}
