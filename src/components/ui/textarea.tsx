import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea
    data-slot="textarea"
    className={cn('m-0 block min-h-28 w-full min-w-0 resize-y rounded-lg border border-solid border-input bg-black/30 px-3 py-2.5 font-sans text-[15px] font-medium leading-relaxed text-foreground shadow-none outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-subtle hover:border-foreground/35 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive', className)}
    {...props} />
}

export { Textarea }
