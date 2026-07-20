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
// The developer (`superadmin`) and the shared door account (`tehnika`) default
// to English: the door account is shared by whoever is on the gate, and its
// scan overlay shows guest-readable English to the ticket holder being admitted.
// The secretary (`admin`) and reseller (`partner`) work in Croatian, as do
// unknown/missing roles — the safe default for the Croatian-speaking staff this
// panel is built for.
export function defaultLanguageForRole(role: string | null | undefined): AdminLang {
  return role === 'superadmin' || role === 'tehnika' ? 'en' : 'hr'
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
    nextShow: 'Next performance',
    upcomingShows: 'Following performances',
    seasonSummary: 'Season summary',
    revenueCollected: 'Revenue collected',
    partnerReceivable: 'Partner receivable',
    invoicedMonthly: '(invoiced monthly)', // #237 receivable sub-label
    ticketsSold: 'Tickets sold',
    seasonCapacity: 'Season capacity filled',
    remainingSeats: 'Remaining seats',
    sold: 'Sold',
    capacity: 'Capacity',
    pastShows: 'Past performances (reference)',
    noUpcomingShows: 'No upcoming performances scheduled.',
    noPastShows: 'No past performances yet.',
    newShow: '+ New performance',
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
    noShowTonight: 'No performance tonight.',
    // Partner month-to-date card (#241)
    mtdThisMonth: 'This month',
    mtdTicketsSold: 'Tickets sold',
    mtdOwed: 'You owe HGD',
    mtdCommission: 'Your commission',
    mtdLiveNote: 'Live so far this month. Same-day stornos still adjust it.',
    // Dashboard charts (#242)
    seasonTrajectory: 'Season trajectory',
    salesChannels: 'Sales channels',
    channelOnline: 'Online',
    channelInPerson: 'In person',
    channelPartner: 'Partners',
    noSalesYet: 'No sales yet.',
    // Comps on the dashboards (#322, ADR-0019): a count, never a money figure.
    compSold: 'Comp', // per-show seat-reconciliation column
    compsIssued: 'Comps issued', // season-level count figure
    // Partner sell form + recent-orders list (revamp)
    sellTickets: 'Sell tickets',
    showWord: 'Performance',
    adults: 'Adults',
    children: 'Children',
    total: 'Total',
    seatsLeft: 'seats left',
    soldOut: 'sold out',
    issueTickets: 'Issue tickets',
    issuing: 'Issuing…',
    enterCounts: 'Enter adult and child counts',
    noShowsToSell: 'No upcoming performances are available to sell right now.',
    notEnoughSeats: 'Not enough seats left for this performance.',
    saleFailed: 'Could not complete the sale.',
    saleDoneTitle: 'Sale completed',
    saleDonePdf: 'PDF opened in a new tab.',
    openPdfAgain: 'Open PDF again',
    // Comp (goodwill) ticket issue form (#318, ADR-0019)
    compTitle: 'Issue comp tickets',
    compAction: 'Issue comp tickets',
    compMember: 'Member',
    compMemberSearch: 'Search members',
    compMemberSelect: 'Select a member',
    compAddMember: '+ Add member',
    compNewMemberName: 'New member name',
    compSaveMember: 'Save member',
    compMemberRequired: 'Select or add a member.',
    compAddMemberFailed: 'Could not add the member.',
    compNoMembers: 'No members yet. Add one to attribute comps.',
    compHolderName: 'Holder name (optional)',
    compHolderHint: 'Defaults to the member. Printed on the slip.',
    compEmail: 'Email (optional)',
    compIssue: 'Issue comp tickets',
    compDoneTitle: 'Comp tickets issued',
    compFailed: 'Could not issue the comp tickets.',
    compEmailSent: 'Ticket email sent to',
    compEmailSkipped: 'No email entered — tickets not emailed.',
    compEmailFailed: 'Ticket email NOT sent to',
    compEmailFailedHint: 'open the order and use “Resend ticket email”.',
    recentSales: 'Recent orders',
    recentCancelNote: 'Tap an order to cancel individual tickets. You can cancel on the same day the order was made.',
    showMore: 'Show more',
    showLess: 'Show less',
    loadingMore: 'Loading…',
    pagePrev: 'Previous',
    pageNext: 'Next',
    earlierSales: 'Earlier',
    soldLabel: 'Sold',
    peopleLabel: 'People',
    downloadTickets: 'Download tickets',
    cancelSale: 'Cancel order',
    cancelTicketAction: 'Cancel ticket',
    cancelling: 'Cancelling…',
    cancelFailed: 'Could not cancel. Please try again.',
    orderCancelled: 'Order cancelled',
    ticketCancelled: 'Ticket cancelled',
    undo: 'Undo',
    undoSeatTaken: 'Could not undo, the seat was taken.',
    undoFailed: 'Could not undo. Please try again.',
    statusCancelled: 'cancelled',
    typeAdult: 'adult',
    typeChild: 'child',
    noOrdersYet: 'No orders yet.',
    statistics: 'Statistics',
    soldThisSeason: 'sold this season',
    yourSalesEmpty: 'No orders yet. Issued tickets will appear here.',
    monthlyStatement: 'Monthly statement',
    monthlyStatementDesc:
      'A monthly breakdown of orders, cancellations, and your commission. Pick a month and download the reconciliation.',
    stmtMonth: 'Month',
    stmtYear: 'Year',
    stmtDownload: 'Download statement',
    helpHeading: 'Need help?',
    helpContact: 'Contact admin@moreska.eu',
    mailSubject: 'Partner dashboard: help',
    // Promo codes reporting panel (#325, ADR-0018)
    promoCodes: 'Promo codes',
    promoCodesDesc: 'Top codes by tickets sold. Whole party per code, cancelled and refunded excluded.',
    promoCodeMember: 'Member',
    promoCodeTickets: 'Tickets sold',
    promoCodeRevenue: 'Revenue',
    noPromoCodes: 'No promo codes yet.',
    // Comps-per-member report (#323, ADR-0019)
    compsByMember: 'Comps by member',
    compsByMemberDesc: 'Comp tickets issued per member this season. Cancelled excluded.',
    compsMember: 'Member',
    compsAdult: 'Adult',
    compsChild: 'Child',
    compsTotal: 'Total',
    noComps: 'No comps issued yet.',
  },
  hr: {
    dashboard: 'Nadzorna ploča',
    doorScan: 'Skeniranje na ulazu',
    partnerDashboard: 'Partnerska ploča',
    signedInAs: 'Prijavljeni kao',
    // Secretary dashboard (#238)
    nextShow: 'Sljedeća izvedba',
    upcomingShows: 'Nadolazeće izvedbe',
    seasonSummary: 'Sažetak sezone',
    revenueCollected: 'Naplaćeni prihod',
    partnerReceivable: 'Potraživanje od partnera',
    invoicedMonthly: '(fakturirano mjesečno)', // #237 receivable sub-label
    ticketsSold: 'Prodane ulaznice',
    seasonCapacity: 'Popunjenost sezone',
    remainingSeats: 'Preostala mjesta',
    sold: 'Prodano',
    capacity: 'Kapacitet',
    pastShows: 'Prošle izvedbe (pregled)',
    noUpcomingShows: 'Nema zakazanih nadolazećih izvedbi.',
    noPastShows: 'Još nema prošlih izvedbi.',
    newShow: '+ Nova izvedba',
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
    noShowTonight: 'Nema izvedbe večeras.',
    // Partner month-to-date card (#241)
    mtdThisMonth: 'Ovaj mjesec',
    mtdTicketsSold: 'Prodanih ulaznica',
    mtdOwed: 'Za platiti HGD-u',
    mtdCommission: 'Vaša provizija',
    mtdLiveNote: 'Uživo za tekući mjesec. Storno isti dan još može promijeniti iznos.',
    // Dashboard charts (#242)
    seasonTrajectory: 'Kretanje sezone',
    salesChannels: 'Prodajni kanali',
    channelOnline: 'Online',
    channelInPerson: 'Na blagajni',
    channelPartner: 'Partneri',
    noSalesYet: 'Još nema prodaje.',
    // Comps on the dashboards (#322, ADR-0019): a count, never a money figure.
    compSold: 'Gratis', // per-show seat-reconciliation column
    compsIssued: 'Izdano gratis ulaznica', // season-level count figure
    // Partner sell form + recent-orders list (revamp)
    sellTickets: 'Prodaja ulaznica',
    showWord: 'Izvedba',
    adults: 'Odrasli',
    children: 'Djeca',
    total: 'Ukupno',
    seatsLeft: 'slobodnih mjesta',
    soldOut: 'rasprodano',
    issueTickets: 'Izdaj ulaznice',
    issuing: 'Izdavanje…',
    enterCounts: 'Unesite broj odraslih i djece',
    noShowsToSell: 'Trenutno nema nadolazećih izvedbi za prodaju.',
    notEnoughSeats: 'Nema dovoljno slobodnih mjesta za ovu izvedbu.',
    saleFailed: 'Prodaja nije dovršena.',
    saleDoneTitle: 'Prodaja dovršena',
    saleDonePdf: 'PDF se otvorio u novoj kartici.',
    openPdfAgain: 'Ponovno otvori PDF',
    // Comp (goodwill) ticket issue form (#318, ADR-0019)
    compTitle: 'Podijeli gratis ulaznice',
    compAction: 'Podijeli gratis ulaznice',
    compMember: 'Član',
    compMemberSearch: 'Pretraži članove',
    compMemberSelect: 'Odaberite člana',
    compAddMember: '+ Dodaj člana',
    compNewMemberName: 'Ime novog člana',
    compSaveMember: 'Spremi člana',
    compMemberRequired: 'Odaberite ili dodajte člana.',
    compAddMemberFailed: 'Dodavanje člana nije uspjelo.',
    compNoMembers: 'Još nema članova. Dodajte jednog za pripisivanje gratisa.',
    compHolderName: 'Ime vlasnika (nije obavezno)',
    compHolderHint: 'Zadano ime člana. Ispisuje se na ulaznici.',
    compEmail: 'Email (nije obavezno)',
    compIssue: 'Izdaj gratis ulaznice',
    compDoneTitle: 'Gratis ulaznice izdane',
    compFailed: 'Izdavanje gratis ulaznica nije uspjelo.',
    compEmailSent: 'Ulaznice poslane na',
    compEmailSkipped: 'Email nije upisan — ulaznice nisu poslane.',
    compEmailFailed: 'Ulaznice NISU poslane na',
    compEmailFailedHint: 'otvori narudžbu i klikni “Resend ticket email”.',
    recentSales: 'Nedavne narudžbe',
    recentCancelNote: 'Dodirnite narudžbu za otkazivanje pojedinih ulaznica. Otkazati možete isti dan kad je narudžba napravljena.',
    showMore: 'Prikaži više',
    showLess: 'Prikaži manje',
    loadingMore: 'Učitavanje…',
    pagePrev: 'Prethodna',
    pageNext: 'Sljedeća',
    earlierSales: 'Ranije',
    soldLabel: 'Prodano',
    peopleLabel: 'Osobe',
    downloadTickets: 'Preuzmi ulaznice',
    cancelSale: 'Otkaži narudžbu',
    cancelTicketAction: 'Otkaži ulaznicu',
    cancelling: 'Otkazivanje…',
    cancelFailed: 'Otkazivanje nije uspjelo. Pokušajte ponovno.',
    orderCancelled: 'Narudžba otkazana',
    ticketCancelled: 'Ulaznica otkazana',
    undo: 'Poništi',
    undoSeatTaken: 'Nije moguće poništiti, mjesto je zauzeto.',
    undoFailed: 'Poništavanje nije uspjelo. Pokušajte ponovno.',
    statusCancelled: 'otkazano',
    typeAdult: 'odrasli',
    typeChild: 'dijete',
    noOrdersYet: 'Još nema narudžbi.',
    statistics: 'Statistika',
    soldThisSeason: 'prodano ove sezone',
    yourSalesEmpty: 'Još nema narudžbi. Izdane ulaznice prikazat će se ovdje.',
    monthlyStatement: 'Mjesečni izvještaj',
    monthlyStatementDesc:
      'Mjesečni pregled narudžbi, otkazivanja i vaše provizije. Odaberite mjesec i preuzmite obračun.',
    stmtMonth: 'Mjesec',
    stmtYear: 'Godina',
    stmtDownload: 'Preuzmi izvještaj',
    helpHeading: 'Trebate pomoć?',
    helpContact: 'Kontaktirajte admin@moreska.eu',
    mailSubject: 'Partnerska ploča: pomoć',
    // Promo codes reporting panel (#325, ADR-0018)
    promoCodes: 'Promo kodovi',
    promoCodesDesc: 'Najkorišteniji kodovi po broju ulaznica. Cijela grupa po kodu, otkazane i vraćene isključene.',
    promoCodeMember: 'Član',
    promoCodeTickets: 'Prodano ulaznica',
    promoCodeRevenue: 'Prihod',
    noPromoCodes: 'Još nema promo kodova.',
    // Comps-per-member report (#323, ADR-0019)
    compsByMember: 'Besplatne po članu',
    compsByMemberDesc: 'Besplatne ulaznice izdane po članu ove sezone. Otkazane isključene.',
    compsMember: 'Član',
    compsAdult: 'Odrasli',
    compsChild: 'Djeca',
    compsTotal: 'Ukupno',
    noComps: 'Još nema izdanih besplatnih ulaznica.',
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
