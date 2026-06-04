// Admin-panel localization foundation (issue #234, ADR-0015).
//
// Payload's own chrome (sidebar, tables, forms) is localized natively once
// `i18n.supportedLanguages` lists `en` + `hr` in payload.config.ts. The active
// chrome language is driven by the `payload-lng` cookie (set by the native
// account-settings language selector) → Accept-Language → fallbackLanguage.
//
// This module is the *custom* side of that story: the role-based default a new
// login is seeded with, and the small HR/EN string map the custom dashboard
// renders from. Every later dashboard slice reuses `adminT` so its copy tracks
// the same active language as the Payload chrome.

export type AdminLang = 'en' | 'hr'

// The languages we ship in the admin. Mirror this in `i18n.supportedLanguages`.
export const ADMIN_LANGS: readonly AdminLang[] = ['en', 'hr'] as const

// Role-based default language for a freshly created / first-logging-in user.
// The secretary (`admin`), shared door account (`tehnika`) and reseller
// (`partner`) work in Croatian; only the developer (`superadmin`) defaults to
// English. Unknown/missing roles get Croatian — the safe default for the
// Croatian-speaking staff this panel is built for.
export function defaultLanguageForRole(role: string | null | undefined): AdminLang {
  return role === 'superadmin' ? 'en' : 'hr'
}

// Narrow an arbitrary string (cookie value, header) to a supported admin
// language, or null if it isn't one of ours.
export function normalizeAdminLang(value: string | null | undefined): AdminLang | null {
  return value === 'en' || value === 'hr' ? value : null
}

// Resolve the active admin language for the custom dashboard. An explicit saved
// choice (the `payload-lng` cookie, written by the native selector) always wins;
// otherwise fall back to the role-based default. This mirrors how Payload's own
// chrome resolves language, so switching in account settings flips both.
export function resolveAdminLang({
  cookieLang,
  role,
}: {
  cookieLang?: string | null
  role?: string | null
}): AdminLang {
  return normalizeAdminLang(cookieLang) ?? defaultLanguageForRole(role)
}

// Cookie that drives the Payload admin chrome language. Payload derives it from
// `${cookiePrefix || 'payload'}-lng`; we don't set a custom cookiePrefix, so it
// is `payload-lng`. Kept here as the single source of truth for the name.
export const ADMIN_LANG_COOKIE = 'payload-lng'

// Decide what (if anything) to seed the language cookie to on login. A valid
// saved choice is left untouched (it always wins); only when no usable choice is
// present do we seed the role-based default. Returns null = leave the cookie be.
// The afterLogin hook does the actual cookie write; this keeps the decision pure
// and unit-testable.
export function seedAdminLangCookie({
  existing,
  role,
}: {
  existing?: string | null
  role?: string | null
}): AdminLang | null {
  if (normalizeAdminLang(existing)) return null
  return defaultLanguageForRole(role)
}

// HR/EN copy for the custom dashboard. Keep the two maps structurally identical
// (a test enforces it) — add a key to both whenever a dashboard string needs to
// localize. Keys stay stable; only the values differ per language.
export const dashboardStrings = {
  en: {
    dashboard: 'Dashboard',
    doorScan: 'Door scan',
    partnerDashboard: 'Partner dashboard',
    signedInAs: 'Signed in as',
    // Secretary dashboard (#238)
    nextShow: 'Next show',
    upcomingShows: 'Following shows',
    seasonSummary: 'Season summary',
    revenueCollected: 'Revenue collected',
    partnerReceivable: 'Partner receivable',
    invoicedMonthly: '(invoiced monthly)', // #237 receivable sub-label
    ticketsSold: 'Tickets sold',
    seasonCapacity: 'Season capacity filled',
    remainingSeats: 'Remaining seats',
    sold: 'Sold',
    capacity: 'Capacity',
    pastShows: 'Past shows (reference)',
    noUpcomingShows: 'No upcoming shows scheduled.',
    noPastShows: 'No past shows yet.',
    newShow: '+ New show',
    findOrder: 'Find order',
    // Inline per-show in-person sale control (#243)
    addSale: '+ Sale',
    addSaleHeading: 'In-person sale',
    addSaleHint: 'Tickets sold at the door. Adds to the total.',
    addSaleCount: 'Tickets',
    add: 'Add',
    adding: 'Adding…',
    cancel: 'Cancel',
    saleErrorPositive: 'Enter a positive whole number.',
    saleErrorGeneric: 'Could not record the sale.',
    saleErrorNetwork: 'Network error. Please try again.',
    inquiries: 'Inquiries',
    inquiriesNone: 'No new inquiries',
    cancelled: 'Cancelled',
    // Tehnika door dashboard (#240)
    scanTicket: 'Scan a ticket',
    admittedLabel: 'admitted', // reads "X / Y admitted"
    noShowTonight: 'No show tonight.',
    // Partner month-to-date card (#241)
    mtdThisMonth: 'This month',
    mtdTicketsSold: 'Tickets sold',
    mtdOwed: 'You owe HGD',
    mtdCommission: 'Your commission',
    mtdNetOfCancelled: 'net of cancelled',
    mtdLiveNote: 'Live so far this month. Same-day stornos still adjust it.',
    // Dashboard charts (#242)
    seasonTrajectory: 'Season trajectory',
    salesChannels: 'Sales channels',
    channelOnline: 'Online',
    channelInPerson: 'In person',
    channelPartner: 'Partners',
    noSalesYet: 'No sales yet.',
    // Partner sell form + merged recent-sales (revamp)
    sellTickets: 'Sell tickets',
    showWord: 'Show',
    adults: 'Adults',
    children: 'Children',
    total: 'Total',
    seatsLeft: 'seats left',
    soldOut: 'sold out',
    issueTickets: 'Issue tickets',
    issuing: 'Issuing…',
    enterCounts: 'Enter adult and child counts',
    noShowsToSell: 'No upcoming shows are available to sell right now.',
    notEnoughSeats: 'Not enough seats left for this show.',
    saleFailed: 'Could not complete the sale.',
    saleDoneTitle: 'Sale completed',
    saleDonePdf: 'PDF opened in a new tab.',
    openPdfAgain: 'Open PDF again',
    recentSales: 'Recent sales',
    recentCancelNote: 'You can cancel a ticket or a whole sale on the same day it was made.',
    showMore: 'Show more',
    loadingMore: 'Loading…',
    earlierSales: 'Earlier',
    cancelSale: 'Cancel sale',
    cancelTicketAction: 'Cancel',
    cancelling: 'Cancelling…',
    confirmSure: 'Sure?',
    confirmYes: 'Yes',
    confirmNo: 'No',
    cancelFailed: 'Could not cancel. Please try again.',
    statusCancelled: 'cancelled',
    typeAdult: 'adult',
    typeChild: 'child',
    yourSales: 'Your sales',
    soldThisSeason: 'sold this season',
    yourSalesEmpty: 'No sales yet. Issued tickets will appear here.',
    monthlyStatement: 'Monthly statement',
    monthlyStatementDesc:
      'A monthly breakdown of sales, cancellations, and your commission. Pick a month and download the reconciliation.',
    stmtMonth: 'Month',
    stmtYear: 'Year',
    stmtDownload: 'Download statement',
  },
  hr: {
    dashboard: 'Nadzorna ploča',
    doorScan: 'Skeniranje na ulazu',
    partnerDashboard: 'Partnerska ploča',
    signedInAs: 'Prijavljeni kao',
    // Secretary dashboard (#238)
    nextShow: 'Sljedeća predstava',
    upcomingShows: 'Nadolazeće predstave',
    seasonSummary: 'Sažetak sezone',
    revenueCollected: 'Naplaćeni prihod',
    partnerReceivable: 'Potraživanje od partnera',
    invoicedMonthly: '(fakturirano mjesečno)', // #237 receivable sub-label
    ticketsSold: 'Prodane ulaznice',
    seasonCapacity: 'Popunjenost sezone',
    remainingSeats: 'Preostala mjesta',
    sold: 'Prodano',
    capacity: 'Kapacitet',
    pastShows: 'Prošle predstave (pregled)',
    noUpcomingShows: 'Nema zakazanih nadolazećih predstava.',
    noPastShows: 'Još nema prošlih predstava.',
    newShow: '+ Nova predstava',
    findOrder: 'Pronađi narudžbu',
    // Inline per-show in-person sale control (#243)
    addSale: '+ Prodaja',
    addSaleHeading: 'Prodaja na blagajni',
    addSaleHint: 'Ulaznice prodane na ulazu. Dodaje se na ukupno.',
    addSaleCount: 'Ulaznice',
    add: 'Dodaj',
    adding: 'Dodajem…',
    cancel: 'Odustani',
    saleErrorPositive: 'Unesite pozitivan cijeli broj.',
    saleErrorGeneric: 'Prodaja nije zabilježena.',
    saleErrorNetwork: 'Greška u mreži. Pokušajte ponovno.',
    inquiries: 'Upiti',
    inquiriesNone: 'Nema novih upita',
    cancelled: 'Otkazano',
    // Tehnika door dashboard (#240)
    scanTicket: 'Skeniraj kartu',
    admittedLabel: 'ušlo', // reads "X / Y ušlo"
    noShowTonight: 'Nema predstave večeras.',
    // Partner month-to-date card (#241)
    mtdThisMonth: 'Ovaj mjesec',
    mtdTicketsSold: 'Prodanih ulaznica',
    mtdOwed: 'Za platiti HGD-u',
    mtdCommission: 'Vaša provizija',
    mtdNetOfCancelled: 'bez storniranih',
    mtdLiveNote: 'Uživo za tekući mjesec. Storno isti dan još može promijeniti iznos.',
    // Dashboard charts (#242)
    seasonTrajectory: 'Kretanje sezone',
    salesChannels: 'Prodajni kanali',
    channelOnline: 'Online',
    channelInPerson: 'Na blagajni',
    channelPartner: 'Partneri',
    noSalesYet: 'Još nema prodaje.',
    // Partner sell form + merged recent-sales (revamp)
    sellTickets: 'Prodaja ulaznica',
    showWord: 'Predstava',
    adults: 'Odrasli',
    children: 'Djeca',
    total: 'Ukupno',
    seatsLeft: 'slobodnih mjesta',
    soldOut: 'rasprodano',
    issueTickets: 'Izdaj ulaznice',
    issuing: 'Izdavanje…',
    enterCounts: 'Unesite broj odraslih i djece',
    noShowsToSell: 'Trenutno nema nadolazećih predstava za prodaju.',
    notEnoughSeats: 'Nema dovoljno slobodnih mjesta za ovu predstavu.',
    saleFailed: 'Prodaja nije dovršena.',
    saleDoneTitle: 'Prodaja dovršena',
    saleDonePdf: 'PDF se otvorio u novoj kartici.',
    openPdfAgain: 'Ponovno otvori PDF',
    recentSales: 'Nedavne prodaje',
    recentCancelNote: 'Ulaznicu ili cijelu prodaju možete otkazati isti dan kad je napravljena.',
    showMore: 'Prikaži više',
    loadingMore: 'Učitavanje…',
    earlierSales: 'Ranije',
    cancelSale: 'Otkaži prodaju',
    cancelTicketAction: 'Otkaži',
    cancelling: 'Otkazivanje…',
    confirmSure: 'Sigurno?',
    confirmYes: 'Da',
    confirmNo: 'Ne',
    cancelFailed: 'Otkazivanje nije uspjelo. Pokušajte ponovno.',
    statusCancelled: 'otkazano',
    typeAdult: 'odrasli',
    typeChild: 'dijete',
    yourSales: 'Vaše prodaje',
    soldThisSeason: 'prodano ove sezone',
    yourSalesEmpty: 'Još nema prodaje. Izdane ulaznice prikazat će se ovdje.',
    monthlyStatement: 'Mjesečni izvještaj',
    monthlyStatementDesc:
      'Mjesečni pregled prodaje, otkazivanja i vaše provizije. Odaberite mjesec i preuzmite obračun.',
    stmtMonth: 'Mjesec',
    stmtYear: 'Godina',
    stmtDownload: 'Preuzmi izvještaj',
  },
} as const

export type DashboardStringKey = keyof (typeof dashboardStrings)['en']

// Look up a dashboard string for the active language, falling back to the
// English copy if the key is somehow absent in the target language.
export function adminT(
  lang: AdminLang,
  key: DashboardStringKey,
  strings: typeof dashboardStrings = dashboardStrings,
): string {
  return strings[lang][key] ?? strings.en[key]
}
