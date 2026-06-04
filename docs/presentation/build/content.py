# -*- coding: utf-8 -*-
"""Shared content model for the board deck (PPTX + internal PDF).
Croatian copy. 'moreška' is lowercase (common noun). No em-dashes in slide copy.
Each slide: a dict with a `layout` and fields. `notes` = spoken talking points (Croatian),
used both in the PPTX notes pane and the internal companion PDF.
"""

PRESENTER = "Josip Ivančević"
OCCASION = "Sjednica Upravnog odbora HGD Sveta Cecilija · 2026."

SLIDES = [
    {
        "layout": "title",
        "bg": "title.png",
        "eyebrow": "HGD SVETA CECILIJA · KORČULA · OD 1883.",
        "title": "Digitalna obnova",
        "subtitle": "Kako je naše društvo, staro 143 godine, zakoračilo u digitalno doba",
        "footer": f"{PRESENTER}   ·   {OCCASION}",
        "notes": (
            "Pozdrav i zahvala na vremenu. Danas vam u dvadesetak minuta želim pokazati "
            "što smo sve napravili da naše društvo, staro 143 godine, dobije moderno digitalno lice. "
            "Neću ulaziti u tehničke detalje, nego ću vam pokazati kako su stvari izgledale prije i kako izgledaju sada. "
            "Vodit ću vas kroz cijelu priču: gdje smo bili, što smo izgradili i što to znači za društvo."
        ),
    },
    {
        "layout": "statement",
        "bg": "tradicija.png",
        "eyebrow": "NAŠA PRIČA",
        "title": "143 godine tradicije",
        "subtitle": (
            "moreška, klapsko pjevanje, puhački orkestar i zbor njegujemo od 1883. "
            "Tradicija nam je živa. Naša prisutnost na internetu dugo to nije pratila."
        ),
        "notes": (
            "Krenimo od onoga tko smo. Naše društvo postoji od 1883. i okuplja moreška, klapu, puhački orkestar i zbor. "
            "Tradicija je živa i prepoznatljiva. Ali ono što gost danas prvo vidi nije pozornica, nego internet: Google, "
            "društvene mreže, mobitel u ruci. A upravo tu smo godinama zaostajali. Cilj ove obnove bio je da nas na internetu "
            "vide jednako snažno kao i uživo."
        ),
    },
    {
        "layout": "divider",
        "bg": "div-bili.png",
        "kicker": "PRVI DIO",
        "title": "Gdje smo bili",
    },
    {
        "layout": "points-image",
        "bg": "plain1.png",
        "eyebrow": "STANJE PRIJE",
        "title": "Tri problema",
        "image": "old-home.png",
        "image_label": "Stara stranica",
        "points": [
            ("Nevidljivi na internetu", "Gostima koji su tražili što raditi na Korčuli teško nas je bilo pronaći."),
            ("Ovisni o drugima", "Stranicom i nalozima upravljao je vanjski izvođač. Sami nismo mogli ništa promijeniti."),
            ("Bez prave online prodaje", "Ulaznice su se kupovale uglavnom gotovinom na ulazu, uz redove i nesigurnost koliko će ljudi doći."),
        ],
        "notes": (
            "Prije obnove imali smo tri velika problema. Prvo, bili smo gotovo nevidljivi na internetu, turist koji traži "
            "'što raditi na Korčuli' teško bi došao do nas. Drugo, bili smo ovisni o vanjskom izvođaču: za svaku sitnu izmjenu "
            "trebalo je nekoga zvati, a naloge nismo držali u svojim rukama. I treće, nismo mogli ozbiljno prodavati online, "
            "ulaznice su se uglavnom plaćale gotovinom na ulazu, što znači redove i nikad sigurnu sliku koliko će ljudi doći. "
            "Ovo desno je naša stara stranica."
        ),
    },
    {
        "layout": "compare",
        "bg": "plain2.png",
        "eyebrow": "PROMJENA",
        "title": "Prije i poslije",
        "left": "old-home.png",
        "left_label": "PRIJE",
        "right": "new-home.png",
        "right_label": "POSLIJE",
        "notes": (
            "Evo najjednostavnije usporedbe. Lijevo je stara stranica, desno nova. Mislim da slika govori sama za sebe: "
            "od blijede, generičke stranice došli smo do modernog, dostojanstvenog lica koje je dostojno naše tradicije. "
            "I, što je najvažnije, ova nova stranica je u potpunosti naša."
        ),
    },
    {
        "layout": "divider",
        "bg": "div-novi.png",
        "kicker": "DRUGI DIO",
        "title": "Novi dom: moreska.eu",
    },
    {
        "layout": "showcase",
        "bg": "plain2.png",
        "eyebrow": "NAŠA NOVA STRANICA",
        "title": "Moderna, lijepa i naša",
        "image": "new-home.png",
        "points": [
            "Na hrvatskom i engleskom jeziku.",
            "Jednako dobro radi na mobitelu i računalu.",
            "Priča priču o moreški, našim sekcijama i nastupima.",
        ],
        "notes": (
            "Ovo je naš novi dom na adresi moreska.eu. Stranica je na hrvatskom i engleskom, automatski se prilagođava "
            "mobitelu, a najveći dio posjeta i dolazi s mobitela. Osim prodaje ulaznica, ona priča priču o moreški, o našim "
            "sekcijama, o povijesti. To je sada naša izlozna, otvorena cijelom svijetu 24 sata dnevno."
        ),
    },
    {
        "layout": "showcase2",
        "bg": "plain1.png",
        "eyebrow": "ULAZNICE ONLINE",
        "title": "Kupnja u nekoliko klikova",
        "image_a": "new-tickets.png",
        "image_b": "new-checkout.png",
        "points": [
            "Ulaznice se kupuju 0 do 24, s bilo kojeg mobitela.",
            "Plaćanje karticom, putem Apple Paya ili Google Paya.",
            "Cijena ostaje ista: 20 € odrasli, 10 € djeca.",
        ],
        "notes": (
            "Srce svega je online prodaja ulaznica. Gost odabere predstavu, broj ulaznica i plati, sve u nekoliko klikova, "
            "u bilo koje doba dana ili noći. Plaća se karticom, ali i Apple Payem ili Google Payem, dakle otiskom prsta na "
            "mobitelu. Cijene smo zadržali iste: 20 eura odrasli, 10 eura djeca. Novac sjeda izravno društvu."
        ),
    },
    {
        "layout": "qr",
        "bg": "plain2.png",
        "eyebrow": "ULAZNICA = QR KOD",
        "title": "Od kupnje do ulaza",
        "image": "qr.png",
        "steps": [
            ("1", "Gost kupi ulaznicu i odmah dobije QR kod e-mailom."),
            ("2", "Na ulazu QR kod skeniramo običnim mobitelom."),
            ("3", "Bez papira, bez redova, bez dvostrukog ulaska."),
        ],
        "notes": (
            "Nakon kupnje gost odmah e-mailom dobije ulaznicu, a ulaznica je zapravo QR kod. Na ulazu naš čovjek običnim "
            "mobitelom skenira taj kod i u sekundi vidi je li ulaznica ispravna. Nema papira, nema dugih redova, a sustav "
            "sam spriječi da ista ulaznica uđe dva puta. Jednostavno za gosta i za nas."
        ),
    },
    {
        "layout": "divider",
        "bg": "div-partneri.png",
        "kicker": "TREĆI DIO",
        "title": "Prodaja posvuda",
    },
    {
        "layout": "channels",
        "bg": "plain1.png",
        "eyebrow": "PARTNERSKA PRODAJA",
        "title": "Agencije prodaju za nas",
        "channels": [
            ("Online", "Web stranica,\nizravno gostima"),
            ("Blagajna", "Prodaja\nuživo na ulazu"),
            ("Partneri", "Turističke agencije\ni preprodavači"),
        ],
        "points": [
            "Turističke agencije i partneri mogu prodavati naše ulaznice.",
            "Svaki partner vidi samo svoju prodaju i proviziju.",
            "Novi izvor prihoda, bez dodatnog posla za nas.",
        ],
        "notes": (
            "Ulaznice se sada ne prodaju samo na našoj stranici i na blagajni, nego i preko partnera. Turistička agencija "
            "može prodati našu predstavu svom gostu, a svaki partner kroz svoj pristup vidi samo svoju prodaju i svoju "
            "proviziju, ništa tuđe. Za nas je to novi izvor prihoda bez dodatnog posla, jer sve teče kroz isti sustav."
        ),
    },
    {
        "layout": "divider",
        "bg": "div-vidljivi.png",
        "kicker": "ČETVRTI DIO",
        "title": "Ponovno vidljivi",
    },
    {
        "layout": "points",
        "bg": "plain2.png",
        "eyebrow": "PRISUTNOST NA INTERNETU",
        "title": "Da nas opet pronađu",
        "points": [
            ("Google", "Naš profil na Google kartama i u pretrazi vraćen je pod našu kontrolu."),
            ("Facebook i Instagram", "Pokrenut je povrat naše stranice i postavljen poslovni račun."),
            ("Google pretraga", "Stranica je posložena tako da se pojavljujemo kad netko traži moreška Korčula."),
        ],
        "notes": (
            "Paralelno smo radili na tome da nas se opet pronađe. Vratili smo pod našu kontrolu Google profil, onaj koji se "
            "pokaže na Google kartama i u pretrazi. Pokrenuli smo i povrat naše Facebook stranice te uredili poslovne račune. "
            "I samu stranicu smo posložili tako da se pojavljujemo visoko kad netko upiše moreška ili Korčula. Ukratko, opet "
            "postojimo tamo gdje gosti traže."
        ),
    },
    {
        "layout": "divider",
        "bg": "div-temelji.png",
        "kicker": "PETI DIO",
        "title": "Temelji",
    },
    {
        "layout": "showcase",
        "bg": "plain1.png",
        "eyebrow": "VLASTITI ALATI I BROJEVI",
        "title": "Sve na jednom mjestu",
        "image": "admin-op.png",
        "points": [
            "Vlastiti e-mail (@moreska.eu), ne ovisimo o tuđim adresama.",
            "Nadzorna ploča: prodaja i popunjenost u stvarnom vremenu.",
            "Sigurna naplata, novac sjeda izravno društvu.",
        ],
        "notes": (
            "Ispod svega leže temelji koje gost ne vidi, ali nama mijenjaju život. Imamo vlastiti e-mail na moreska.eu, više "
            "ne ovisimo o privatnim adresama. Imamo nadzornu ploču na kojoj u svakom trenutku vidimo koliko je ulaznica "
            "prodano i koliko je dvorana puna, ovo je snimka s početka sezone. I imamo sigurnu naplatu preko provjerenog "
            "svjetskog sustava, pri čemu novac sjeda izravno društvu. Prvi put donosimo odluke na temelju brojeva, a ne osjećaja."
        ),
    },
    {
        "layout": "recap",
        "bg": "recap.png",
        "eyebrow": "GDJE SMO SADA",
        "title": "Sve je sada naše",
        "items": [
            "Vlastita, moderna internetska stranica",
            "Prodaja ulaznica 0 do 24",
            "QR ulaznice i skeniranje na ulazu",
            "Partnerska prodaja preko agencija",
            "Ponovno vidljivi na Googleu i mrežama",
            "Vlastiti e-mail i brojevi u stvarnom vremenu",
        ],
        "notes": (
            "Da sažmem. Društvo danas ima vlastitu modernu stranicu, prodaju ulaznica koja radi danonoćno, QR ulaznice i "
            "skeniranje na ulazu, prodaju preko partnerskih agencija, vraćenu vidljivost na Googleu i društvenim mrežama te "
            "vlastiti e-mail i brojeve u stvarnom vremenu. Ono najvažnije u svemu: sve ovo je sada naše i pod našom kontrolom."
        ),
    },
    {
        "layout": "closing",
        "bg": "closing.png",
        "eyebrow": "ŠTO DALJE",
        "title": "Temelj za budućnost",
        "subtitle": "Društvo sada ima moderne temelje na kojima možemo graditi, sezonu za sezonom.",
        "footer": "Hvala na pažnji.   ·   moreska.eu",
        "notes": (
            "Na kraju, ovo nije završetak nego početak. Postavili smo temelje na kojima sada možemo mirno graditi, sezonu za "
            "sezonom: više gostiju, bolja organizacija, jasniji uvid u to kako stojimo. Hvala vam na pažnji i na podršci. "
            "Rado ću odgovoriti na sva pitanja."
        ),
    },
]
