import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn('fixed inset-0 z-[1000] bg-[rgba(4,5,8,.78)] backdrop-blur-[6px]', className)} {...props} />
}

function DialogContent({ className, children, closeLabel = 'Fechar', showCloseButton = true, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { closeLabel?: string; showCloseButton?: boolean }) {
  return <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn('fixed top-1/2 left-1/2 z-[1001] grid max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-xl border border-solid border-border bg-popover p-6 font-sans text-popover-foreground shadow-[0_32px_80px_-24px_rgba(8,4,6,.8)] outline-none sm:p-8', className)}
      {...props}>
      {children}
      {showCloseButton && <DialogPrimitive.Close data-slot="dialog-close" aria-label={closeLabel} className="absolute top-4 right-4 grid size-9 cursor-pointer place-items-center rounded-lg border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none [&_svg]:size-[18px]">
        <X aria-hidden="true" />
      </DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </DialogPortal>
}

function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('grid gap-2 pr-8 text-left', className)} {...props} />
}

function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end', className)} {...props} />
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('m-0 font-heading text-2xl font-semibold leading-tight tracking-[-0.01em] normal-case text-foreground', className)} {...props} />
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('m-0 text-sm leading-relaxed text-muted-foreground', className)} {...props} />
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
