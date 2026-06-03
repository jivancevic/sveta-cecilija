// The public enquiry forms (Contact + ServiceEnquiryForm) collect a free-ish
// "enquiry" string: the contact form sends the *localized* select label
// ("General" / "Općenito", "Private Moreška" / "Privatna moreška", …), while
// the service pages send a stable slug ("private-moreska" / "moreska-experience").
// The ContactSubmissions collection stores a fixed enum, so this is the single
// place that maps any of those raw inputs onto that enum. Pure + tested so the
// mapping can't drift silently between the two form surfaces and the collection.

export const ENQUIRY_TYPES = ['general', 'private-moreska', 'moreska-experience', 'other'] as const
export type EnquiryType = (typeof ENQUIRY_TYPES)[number]

// Normalized (lowercased, trimmed) raw value → enum. Covers the service slugs,
// the EN labels, and the HR labels from src/messages/{en,hr}.json. "Press" has
// no dedicated enum and folds into 'other'. Anything unrecognised → 'general'
// (a real enquiry must never be dropped just because its label changed).
const LOOKUP: Record<string, EnquiryType> = {
  // Stable slugs (service pages pass these).
  general: 'general',
  'private-moreska': 'private-moreska',
  'moreska-experience': 'moreska-experience',
  other: 'other',
  // EN contact-form labels.
  'private moreška': 'private-moreska',
  'moreška experience': 'moreska-experience',
  press: 'other',
  // HR contact-form labels.
  općenito: 'general',
  'privatna moreška': 'private-moreska',
  'moreška iskustvo': 'moreska-experience',
  tisak: 'other',
  ostalo: 'other',
}

export function toEnquiryType(raw: string | null | undefined): EnquiryType {
  const key = (raw ?? '').trim().toLowerCase()
  return LOOKUP[key] ?? 'general'
}
