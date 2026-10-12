import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Native label (no @radix-ui/react-label needed): same API as shadcn's Label.
function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('m-0 flex select-none items-center gap-2 font-sans text-[13px] font-medium leading-none tracking-normal normal-case text-muted-foreground peer-disabled:opacity-50', className)} {...props} />
}

export { Label }
