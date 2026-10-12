import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Inline notices. Defaults to role="status" (polite); pass role="alert" only for errors that need interruption.
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border border-solid px-4 py-3 font-sans text-sm leading-relaxed has-[>svg]:grid-cols-[16px_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-[3px]',
  {
    variants: {
      variant: {
        default: 'border-border bg-card/80 text-foreground [&>svg]:text-muted-foreground',
        success: 'border-success/25 bg-success/[.06] text-foreground [&>svg]:text-success',
        warning: 'border-warning/30 bg-warning/[.07] text-foreground [&>svg]:text-warning',
        destructive: 'border-destructive/35 bg-destructive/[.07] text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Alert({ className, variant, role = 'status', ...props }: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role={role} className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 font-semibold leading-snug', className)} {...props} />
}

function AlertDescription({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground', className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }
