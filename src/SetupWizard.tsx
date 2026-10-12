import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function WizardStepper({ steps, current }: { steps: string[]; current: number }) {
  return <ol className="xensi-wizard-stepper m-0 grid list-none gap-2 p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={steps.join(', ')}>
    {steps.map((label, index) => {
      const number = index + 1
      const state = number < current ? 'complete' : number === current ? 'active' : 'future'
      return <li key={label} className={cn(state, 'flex min-w-0 items-center gap-2 border-0 border-b-2 border-solid pb-2.5 font-sans text-[13px] font-medium transition-colors duration-200', state === 'active' ? 'border-primary text-foreground' : state === 'complete' ? 'border-success/60 text-success' : 'border-border text-subtle')} aria-current={state === 'active' ? 'step' : undefined}>
        <i className={cn('grid size-5 flex-none place-content-center rounded-full border border-solid text-[11px] font-semibold not-italic', state === 'active' ? 'border-primary text-primary' : state === 'complete' ? 'border-success bg-success text-background' : 'border-input')}>{state === 'complete' ? <Check size={11} strokeWidth={3} /> : number}</i>
        <span className="truncate">{label}</span>
      </li>
    })}
  </ol>
}

export function WizardStepPanel({ step, direction, children }: { step: number; direction: 1 | -1; children: ReactNode }) {
  return <div key={step} className={`xensi-wizard-panel ${direction > 0 ? 'is-forward' : 'is-back'}`}>{children}</div>
}
