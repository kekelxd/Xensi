import { MotionDialog, MotionDialogPanel } from './design/MotionSurfaces'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Bug, Lightbulb, MessageSquareText, Send, X } from 'lucide-react'
import {
  createAlphaFeedbackPayload,
  submitAlphaFeedback,
  type AlphaFeedbackReproducibility,
  type AlphaFeedbackType,
} from './feedbackService'
import { useI18n, type Locale } from './i18n'
import { useDialogFocus } from './useDialogFocus'

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
  const dialogRef = useRef<HTMLElement>(null)
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

  useDialogFocus(dialogRef, open)

  useEffect(() => {
    if (!open) return
    setType('bug')
    setTitle('')
    setMessage('')
    setReproducibility('sometimes')
    setState('idle')
    setStatusMessage('')
    window.setTimeout(() => titleRef.current?.focus(), 0)
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

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') closeWhenSafe()
  }

  return (
    <MotionDialog open={open} className="modal-backdrop alpha-feedback-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWhenSafe() }}>
      <MotionDialogPanel
        ref={dialogRef}
        className="modal alpha-feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        aria-describedby={`${formId}-description`}
        onKeyDown={handleDialogKeyDown}
      >
        <button type="button" className="modal-close alpha-feedback-close" onClick={closeWhenSafe} disabled={sending} aria-label={text.close}><X size={17} /></button>
        <MessageSquareText size={20} className="modal-icon alpha-feedback-icon" />
        <h2 id={`${formId}-title`}>{text.title}</h2>
        <p id={`${formId}-description`}>{text.description}</p>

        <form className="alpha-feedback-form" onSubmit={handleSubmit}>
          <fieldset className="alpha-feedback-group">
            <legend>{text.type}</legend>
            <div className="alpha-feedback-segments">
              <button type="button" onClick={() => updateType('bug')} disabled={locked} aria-pressed={type === 'bug'}><Bug size={14} />{text.bug}</button>
              <button type="button" onClick={() => updateType('suggestion')} disabled={locked} aria-pressed={type === 'suggestion'}><Lightbulb size={14} />{text.suggestion}</button>
            </div>
          </fieldset>

          <label className="alpha-feedback-field" htmlFor={`${formId}-feedback-title`}>
            <span>{text.titleLabel}</span>
            <input
              ref={titleRef}
              id={`${formId}-feedback-title`}
              value={title}
              onChange={(event) => handleTextChange(event.target.value, setTitle)}
              placeholder={text.titlePlaceholder}
              disabled={locked}
              required
            />
          </label>

          <label className="alpha-feedback-field" htmlFor={`${formId}-feedback-message`}>
            <span>{text.messageLabel}</span>
            <textarea
              id={`${formId}-feedback-message`}
              value={message}
              onChange={(event) => handleTextChange(event.target.value, setMessage)}
              placeholder={text.messagePlaceholder}
              disabled={locked}
              required
            />
          </label>

          {type === 'bug' && (
            <fieldset className="alpha-feedback-group">
              <legend>{text.reproducibility}</legend>
              <div className="alpha-feedback-segments is-compact">
                <button type="button" onClick={() => setReproducibility('always')} disabled={locked} aria-pressed={reproducibility === 'always'}>{text.always}</button>
                <button type="button" onClick={() => setReproducibility('sometimes')} disabled={locked} aria-pressed={reproducibility === 'sometimes'}>{text.sometimes}</button>
                <button type="button" onClick={() => setReproducibility('once')} disabled={locked} aria-pressed={reproducibility === 'once'}>{text.once}</button>
              </div>
            </fieldset>
          )}

          {statusMessage && (
            <p className={`alpha-feedback-status is-${state}`} role={state === 'error' ? 'alert' : 'status'} aria-live={state === 'error' ? 'assertive' : 'polite'}>
              {statusMessage}
            </p>
          )}

          <footer className="alpha-feedback-actions">
            <button type="button" className="secondary-button" onClick={closeWhenSafe} disabled={sending}>{state === 'success' ? text.close : text.cancel}</button>
            <button type="submit" className="primary-button" disabled={locked}><Send size={14} />{sending ? text.sending : text.submit}</button>
          </footer>
        </form>
      </MotionDialogPanel>
    </MotionDialog>
  )
}
