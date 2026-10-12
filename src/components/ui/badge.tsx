import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Pills: status (success/primary), metadata chips (secondary) and neutral outline.
const badgeVariants = cva(
  'inline-flex w-fit flex-none items-center gap-1.5 whitespace-nowrap rounded-full border border-solid px-2.5 py-1 font-sans text-xs font-medium leading-tight tracking-normal normal-case [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-primary/40 bg-primary/15 text-primary',
        success: 'border-success/35 bg-success/10 text-success',
        secondary: 'rounded-md border-transparent bg-foreground/[.06] text-foreground',
        outline: 'border-input bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
