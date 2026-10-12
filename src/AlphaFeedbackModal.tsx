import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Bug, Check, Info, Lightbulb, MessageSquareText, Send } from 'lucide-react'
import {
  createAlphaFeedbackPayload,
  submitAlphaFeedback,
  type AlphaFeedbackReproducibility,
  type AlphaFeedbackType,
} from './feedbackService'
import { useI18n, type Locale } from './i18n'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const segment = 'font-medium text-muted-foreground aria-pressed:border-primary/60 aria-pressed:bg-primary/10 aria-pressed:text-foreground'

type AlphaFeedbackState = 'idle' | 'sending' | 'success' | 'error'

const feedbackCopy = {
  pt: {
    title: 'AJUDE A MELHORAR O XENSI',
    description: 'Envie um bug ou sugestão rápida para a Alpha.',
    type: 'Tipo',
    bug: 'Bug',
    suggestion: 'Sugestão',
    titleLabel: 'Título',
    titlePlaceholder: 'Resumo curto',
    messageLabel: 'Descrição',
    messagePlaceholder: 'Conte o que aconteceu ou o que você gostaria de ver.',
    reproducibility: 'Conseguiu reproduzir?',
    always: 'Sempre',
    sometimes: 'Às vezes',
    once: 'Uma vez',
    cancel: 'Cancelar',
    close: 'Fechar',
    submit: 'Enviar feedback',
    sending: 'Enviando...',
    success: 'Obrigado. Seu feedback foi registrado.',
    required: 'Preencha título e descrição para enviar.',
  },
  en: {
    title: 'HELP IMPROVE XENSI',
    description: 'Send a quick Alpha bug report or suggestion.',
    type: 'Type',
    bug: 'Bug',
    suggestion: 'Suggestion',
    titleLabel: 'Title',
    titlePlaceholder: 'Short summary',
    messageLabel: 'Description',
    messagePlaceholder: 'Tell us what happened or what you would like to see.',
    reproducibility: 'Could you reproduce it?',
    always: 'Always',
    sometimes: 'Sometimes',
    once: 'Once',
    cancel: 'Cancel',
    close: 'Close',
    submit: 'Send feedback',
    sending: 'Sending...',
    success: 'Thank you. Your feedback was registered.',
    required: 'Fill title and description before sending.',
  },
  es: {
    title: 'AYUDA A MEJORAR XENSI',
    description: 'Envía un bug o sugerencia rápida para la Alpha.',
    type: 'Tipo',
    bug: 'Bug',
    suggestion: 'Sugerencia',
    titleLabel: 'Título',
    titlePlaceholder: 'Resumen breve',
    messageLabel: 'Descripción',
    messagePlaceholder: 'Cuenta qué ocurrió o qué te gustaría ver.',
    reproducibility: '¿Pudiste reproducirlo?',
    always: 'Siempre',
    sometimes: 'A veces',
    once: 'Una vez',
    cancel: 'Cancelar',
    close: 'Cerrar',
    submit: 'Enviar feedback',
    sending: 'Enviando...',
    success: 'Gracias. Tu feedback fue registrado.',
    required: 'Completa título y descripción antes de enviar.',
  },
} satisfies Record<Locale, Record<string, string>>

type AlphaFeedbackModalProps = {
  open: boolean
  onClose: () => void
}

export function AlphaFeedbackModal({ open, onClose }: AlphaFeedbackModalProps) {
  const { locale } = useI18n()
  const text = feedbackCopy[locale]
  const titleRef = useRef<HTMLInputElement>(null)
  const formId = useId()
  const [type, setType] = useState<AlphaFeedbackType>('bug')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [reproducibility, setReproducibility] = useState<AlphaFeedbackReproducibility>('sometimes')
  const [state, setState] = useState<AlphaFeedbackState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const sending = state === 'sending'
  const locked = sending || state === 'success'

  useEffect(() => {
    if (!open) return
    setType('bug')
    setTitle('')
    setMessage('')
    setReproducibility('sometimes')
    setState('idle')
    setStatusMessage('')
  }, [open])


  const closeWhenSafe = () => {
    if (!sending) onClose()
  }

  const updateType = (nextType: AlphaFeedbackType) => {
    if (locked) return
    setType(nextType)
    setState('idle')
    setStatusMessage('')
  }

  const handleTextChange = (next: string, update: (value: string) => void) => {
    update(next)
    if (state === 'error') {
      setState('idle')
      setStatusMessage('')
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending || state === 'success') return
    if (!title.trim() || !message.trim()) {
      setState('error')
      setStatusMessage(text.required)
      return
    }

    setState('sending')
    setStatusMessage('')
    const payload = createAlphaFeedbackPayload({
      type,
      title,
      message,
      language: locale,
      reproducibility: type === 'bug' ? reproducibility : null,
    })
    const result = await submitAlphaFeedback(payload)
    if (result.ok) {
      setState('success')
      setStatusMessage(text.success)
    } else {
      setState('error')
      setStatusMessage(result.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) closeWhenSafe() }}>
      <DialogContent
        closeLabel={text.close}
        className="alpha-feedback-modal max-w-[520px]"
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus() }}
        onEscapeKeyDown={(event) => { if (sending) event.preventDefault() }}
        onInteractOutside={(event) => { if (sending) event.preventDefault() }}
      >
        <DialogHeader>
          <MessageSquareText size={20} className="text-primary" aria-hidden="true" />
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>

        <form className="alpha-feedback-form grid gap-5" onSubmit={handleSubmit}>
          <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
            <legend className="mb-2.5 p-0 text-[13px] font-medium text-muted-foreground">{text.type}</legend>
            <div className="grid grid-cols-2 gap-2">
              {([['bug', Bug, text.bug], ['suggestion', Lightbulb, text.suggestion]] as const).map(([value, Icon, label]) => (
                <Button key={value} type="button" variant="outline" size="sm" className={segment} onClick={() => updateType(value)} disabled={locked} aria-pressed={type === value}><Icon />{label}</Button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor={`${formId}-feedback-title`}>{text.titleLabel}</Label>
            <Input
              ref={titleRef}
              id={`${formId}-feedback-title`}
              value={title}
              onChange={(event) => handleTextChange(event.target.value, setTitle)}
              placeholder={text.titlePlaceholder}
              disabled={locked}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${formId}-feedback-message`}>{text.messageLabel}</Label>
            <Textarea
              id={`${formId}-feedback-message`}
              value={message}
              onChange={(event) => handleTextChange(event.target.value, setMessage)}
              placeholder={text.messagePlaceholder}
              disabled={locked}
              required
            />
          </div>

          {type === 'bug' && (
            <fieldset className="m-0 grid min-w-0 gap-2.5 border-0 p-0">
              <legend className="mb-2.5 p-0 text-[13px] font-medium text-muted-foreground">{text.reproducibility}</legend>
              <div className="grid grid-cols-3 gap-2">
                {([['always', text.always], ['sometimes', text.sometimes], ['once', text.once]] as const).map(([value, label]) => (
                  <Button key={value} type="button" variant="outline" size="sm" className={segment} onClick={() => setReproducibility(value)} disabled={locked} aria-pressed={reproducibility === value}>{label}</Button>
                ))}
              </div>
            </fieldset>
          )}

          {statusMessage && (
            <Alert variant={state === 'error' ? 'destructive' : 'success'} role={state === 'error' ? 'alert' : 'status'} aria-live={state === 'error' ? 'assertive' : 'polite'}>
              {state === 'error' ? <Info /> : <Check />}<span className="col-start-2">{statusMessage}</span>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeWhenSafe} disabled={sending}>{state === 'success' ? text.close : text.cancel}</Button>
            <Button type="submit" disabled={locked}><Send />{sending ? text.sending : text.submit}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
