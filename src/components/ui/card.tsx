import { useRef, type ComponentProps, type Ref } from 'react'
import { useSpotlight } from '@/design/useSpotlight'
import { cn } from '@/lib/utils'

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => { for (const ref of refs) { if (typeof ref === 'function') ref(node); else if (ref) ref.current = node } }
}

type CardProps = ComponentProps<'div'> & {
  /** Highlighted state: coral border and a tinted glow. */
  accent?: boolean
  /** Pointer-following light, reusing the global .xensi-surface-light styles. */
  spotlight?: boolean
}

function Card({ className, accent = false, spotlight = false, ref, children, ...props }: CardProps) {
  const local = useRef<HTMLDivElement>(null)
  useSpotlight(local, spotlight)
  return <div
    data-slot="card"
    ref={mergeRefs(local, ref)}
    className={cn('relative isolate flex min-w-0 flex-col rounded-xl border border-solid border-border bg-card/80 text-card-foreground backdrop-blur-sm', accent && 'border-primary/55 shadow-[0_18px_44px_-26px_rgba(255,64,85,.55)]', spotlight && 'xensi-spotlight-card', className)}
    {...props}>
    {spotlight && <span className="xensi-surface-light" aria-hidden="true" />}
    {children}
  </div>
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]', className)} {...props} />
}

function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('font-heading text-xl font-semibold leading-tight tracking-[-0.01em] text-foreground', className)} {...props} />
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-sm leading-normal text-muted-foreground', className)} {...props} />
}

function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center px-6 pb-6', className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
