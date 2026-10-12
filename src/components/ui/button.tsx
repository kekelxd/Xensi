import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// XENSI buttons: 8px radius, coral primary, outline for secondary actions, sentence case.
const buttonVariants = cva(
  'relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border-0 font-sans font-semibold leading-none tracking-normal normal-case no-underline outline-none transition-[color,background-color,border-color,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_rgba(255,64,85,.7)] hover:bg-primary-hover',
        outline: 'border border-solid border-input bg-white/[.03] text-foreground hover:border-foreground/30 hover:bg-white/[.06]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
        destructive: 'bg-destructive text-[#1a0508] hover:bg-destructive/90',
        link: 'h-auto bg-transparent p-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 text-[15px] [&_svg]:size-4',
        sm: 'h-9 px-3.5 text-sm [&_svg]:size-3.5',
        lg: 'h-13 px-7 text-base [&_svg]:size-[18px]',
        icon: 'size-11 p-0 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({ className, variant, size, asChild = false, type, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" type={asChild ? type : (type ?? 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
