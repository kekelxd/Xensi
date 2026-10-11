import { useState } from 'react'
import { XensiSection } from './design/Primitives'
import { AlphaFeedbackModal } from './AlphaFeedbackModal'
import { useI18n, type TranslationKey } from './i18n'
import type { AppView } from './routes'

export type InstitutionalPageKind = Extract<AppView, 'about' | 'privacy' | 'terms' | 'contact'>

type ContentSection = {
  heading: TranslationKey
  paragraphs?: TranslationKey[]
  list?: TranslationKey[]
}

type PageContent = {
  title: TranslationKey
  intro?: TranslationKey
  updated?: TranslationKey
  sections: ContentSection[]
}

const pages: Record<InstitutionalPageKind, PageContent> = {
  about: {
    title: 'legal.about.title',
    intro: 'legal.about.intro',
    sections: [
      { heading: 'legal.about.whatTitle', paragraphs: ['legal.about.whatText'] },
      { heading: 'legal.about.accountTitle', paragraphs: ['legal.about.accountText'] },
      { heading: 'legal.about.alphaTitle', paragraphs: ['legal.about.alphaText'] },
      { heading: 'legal.about.methodTitle', paragraphs: ['legal.about.methodText'] },
    ],
  },
  privacy: {
    title: 'legal.privacy.title',
    intro: 'legal.privacy.intro',
    updated: 'legal.updated',
    sections: [
      { heading: 'legal.privacy.dataTitle', list: ['legal.privacy.dataEmail', 'legal.privacy.dataProfile', 'legal.privacy.dataSettings', 'legal.privacy.dataProgress', 'legal.privacy.dataFeedback', 'legal.privacy.dataTechnical'] },
      { heading: 'legal.privacy.purposeTitle', paragraphs: ['legal.privacy.purposeText'] },
      { heading: 'legal.privacy.guestTitle', paragraphs: ['legal.privacy.guestText'] },
      { heading: 'legal.privacy.processingTitle', paragraphs: ['legal.privacy.processingText'] },
      { heading: 'legal.privacy.retentionTitle', paragraphs: ['legal.privacy.retentionText'] },
      { heading: 'legal.privacy.rightsTitle', paragraphs: ['legal.privacy.rightsText'] },
      { heading: 'legal.privacy.contactTitle', paragraphs: ['legal.privacy.contactText'] },
    ],
  },
  terms: {
    title: 'legal.terms.title',
    intro: 'legal.terms.intro',
    updated: 'legal.updated',
    sections: [
      { heading: 'legal.terms.acceptanceTitle', paragraphs: ['legal.terms.acceptanceText'] },
      { heading: 'legal.terms.purposeTitle', paragraphs: ['legal.terms.purposeText'] },
      { heading: 'legal.terms.accountTitle', paragraphs: ['legal.terms.accountText'] },
      { heading: 'legal.terms.useTitle', paragraphs: ['legal.terms.useText'] },
      { heading: 'legal.terms.alphaTitle', paragraphs: ['legal.terms.alphaText'] },
      { heading: 'legal.terms.dataTitle', paragraphs: ['legal.terms.dataText'] },
      { heading: 'legal.terms.ipTitle', paragraphs: ['legal.terms.ipText'] },
      { heading: 'legal.terms.liabilityTitle', paragraphs: ['legal.terms.liabilityText'] },
      { heading: 'legal.terms.changesTitle', paragraphs: ['legal.terms.changesText'] },
      { heading: 'legal.terms.contactTitle', paragraphs: ['legal.terms.contactText'] },
    ],
  },
  contact: {
    title: 'legal.contact.title',
    intro: 'legal.contact.intro',
    sections: [
      { heading: 'legal.contact.generalTitle', paragraphs: ['legal.contact.generalText', 'legal.contact.pendingEmail'] },
      { heading: 'legal.contact.feedbackTitle', paragraphs: ['legal.contact.feedbackText'] },
    ],
  },
}

export function InstitutionalPage({ page }: { page: InstitutionalPageKind; onNavigate: (view: AppView) => void }) {
  const { t } = useI18n()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const content = pages[page]

  return <section className="content-page-workspace">
    <div className="content-page-shell">
      <article className="content-page" aria-labelledby="content-page-title">
        <header>
          <h1 id="content-page-title">{t(content.title)}</h1>
          {content.intro && <p>{t(content.intro)}</p>}
          {content.updated && <small>{t(content.updated)}</small>}
        </header>

        {content.sections.map((section) => <XensiSection key={section.heading}>
          <h2>{t(section.heading)}</h2>
          {section.paragraphs?.map((paragraph) => <p key={paragraph}>{t(paragraph)}</p>)}
          {section.list && <ul>
            {section.list.map((item) => <li key={item}>{t(item)}</li>)}
          </ul>}
          {page === 'contact' && section.heading === 'legal.contact.feedbackTitle' && <button type="button" onClick={() => setFeedbackOpen(true)}>
            {t('footer.feedback')}
          </button>}
        </XensiSection>)}
      </article>
    </div>
    <AlphaFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
  </section>
}
