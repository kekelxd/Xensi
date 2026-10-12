import type { ComponentProps, ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// Trimmed shadcn Field: label above, control, helper/error below (gap-2), no placeholder-as-label.
function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="field-group" className={cn('flex w-full flex-col gap-5', className)} {...props} />
}

function Field({ className, ...props }: ComponentProps<'div'>) {
  return <div role="group" data-slot="field" className={cn('grid w-full min-w-0 gap-2', className)} {...props} />
}

function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn('text-[13px] text-foreground/85', className)} {...props} />
}

function FieldDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p data-slot="field-description" className={cn('m-0 text-sm leading-normal text-muted-foreground', className)} {...props} />
}

/** Inline message under a control. role defaults to "alert"; pass role="status" for neutral progress like "checking…". */
function FieldError({ className, tone = 'error', role, ...props }: ComponentProps<'p'> & { tone?: 'error' | 'success' | 'neutral' }) {
  return <p
    data-slot="field-error"
    role={role ?? (tone === 'error' ? 'alert' : 'status')}
    className={cn('m-0 text-[13px] leading-snug', tone === 'error' ? 'text-destructive' : tone === 'success' ? 'text-success' : 'text-muted-foreground', className)}
    {...props} />
}

function FieldSeparator({ children, className, ...props }: ComponentProps<'div'> & { children?: ReactNode }) {
  if (!children) return <div data-slot="field-separator" role="separator" className={cn('h-px w-full bg-border', className)} {...props} />
  return <div data-slot="field-separator" className={cn('flex items-center gap-3 text-xs font-medium text-subtle', className)} {...props}>
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
    {children}
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
  </div>
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator }
