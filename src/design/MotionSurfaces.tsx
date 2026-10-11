import { AnimatePresence, motion, useIsPresent, type HTMLMotionProps } from 'motion/react'
import { forwardRef, type Ref } from 'react'
import { useXensiMotion } from './motion'

function DropdownSurface(props: HTMLMotionProps<'div'>) {
  const { dropdownVariants } = useXensiMotion()
  const present = useIsPresent()
  return <motion.div {...props} inert={!present} aria-hidden={!present || undefined} initial="closed" animate="open" exit="closed" variants={dropdownVariants} />
}

export function MotionDropdown({ open, ...props }: HTMLMotionProps<'div'> & { open: boolean }) {
  return <AnimatePresence>{open && <DropdownSurface {...props} />}</AnimatePresence>
}

function DialogBackdrop(props: HTMLMotionProps<'div'>) {
  const { fadeVariants } = useXensiMotion()
  const present = useIsPresent()
  return <motion.div {...props} inert={!present} aria-hidden={!present || undefined} initial="closed" animate="open" exit="closed" variants={fadeVariants} />
}

export function MotionDialog({ open, className = 'modal-backdrop', ...props }: HTMLMotionProps<'div'> & { open: boolean }) {
  return <AnimatePresence>{open && <DialogBackdrop {...props} className={`${className} xensi-motion-backdrop`} />}</AnimatePresence>
}

export function MotionDialogPanel(props: HTMLMotionProps<'section'> & { ref?: Ref<HTMLElement> }) {
  const { dialogVariants } = useXensiMotion()
  return <motion.section {...props} className={`${props.className ?? ''} xensi-motion-dialog`} variants={dialogVariants} />
}

export function ActiveIndicator() {
  const { indicator } = useXensiMotion()
  return <motion.span className="xensi-active-indicator" aria-hidden="true" layoutId="active-indicator" transition={indicator} />
}

// popLayout needs the DOM ref; exiting cards must stop accepting input immediately.
export const MotionExerciseCard = forwardRef<HTMLButtonElement, HTMLMotionProps<'button'>>(function MotionExerciseCard(props, ref) {
  const present = useIsPresent()
  return <motion.button {...props} ref={ref} inert={!present} aria-hidden={!present || undefined} />
})
