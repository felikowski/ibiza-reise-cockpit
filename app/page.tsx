"use client";

import { useMemo, useState } from "react";

type TabId =
  | "overview"
  | "plan"
  | "bookings"
  | "discover"
  | "budget"
  | "packing"
  | "documents";

const tabs: { id: TabId; label: string; symbol: string }[] = [
  { id: "overview", label: "Übersicht", symbol: "⌂" },
  { id: "plan", label: "Reiseplan", symbol: "◎" },
  { id: "bookings", label: "Buchungen", symbol: "◇" },
  { id: "discover", label: "Entdecken", symbol: "⌖" },
  { id: "budget", label: "Budget", symbol: "€" },
  { id: "packing", label: "Packen", symbol: "✓" },
  { id: "documents", label: "Dokumente", symbol: "▤" },
];

const days = [
  { day: "Sa", date: "12. Sep", title: "Ankommen & einchecken", note: "Flug, Mietwagen, Finca", tone: "sun" },
  { day: "So", date: "13. Sep", title: "Nordküste", note: "Cala Xarraca · Sunset", tone: "water" },
  { day: "Mo", date: "14. Sep", title: "Altstadt & Tapas", note: "Dalt Vila · La Marina", tone: "peach" },
  { day: "Di", date: "15. Sep", title: "Formentera", note: "Fähre · Roller · Strand", tone: "water" },
  { day: "Mi", date: "16. Sep", title: "Freier Tag", note: "Pool · Markt · spontan", tone: "sage" },
  { day: "Do", date: "17. Sep", title: "Beach Club", note: "Lunch · Cala Jondal", tone: "peach" },
  { day: "Fr", date: "18. Sep", title: "Es Vedrà", note: "Aussicht · Abschiedsessen", tone: "sun" },
  { day: "Sa", date: "19. Sep", title: "Heimreise", note: "Check-out · Rückflug", tone: "stone" },
];

const packingGroups = [
  {
    title: "Dokumente & Geld",
    items: ["Personalausweis", "Führerschein", "Kreditkarte", "Buchungsbestätigungen"],
  },
  {
    title: "Kleidung",
    items: ["Badesachen", "Leichte Abendkleidung", "Sandalen", "Sneaker", "Sonnenhut"],
  },
  {
    title: "Technik & Pflege",
    items: ["Ladegeräte", "Powerbank", "Sonnencreme SPF 50", "Reiseapotheke"],
  },
];

const initialPacked = new Set(["Personalausweis", "Kreditkarte", "Badesachen", "Ladegeräte"]);

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [packed, setPacked] = useState(initialPacked);
  const [copied, setCopied] = useState<string | null>(null);

  const totalItems = packingGroups.reduce((sum, group) => sum + group.items.length, 0);
  const packedPercent = Math.round((packed.size / totalItems) * 100);

  const togglePacked = (item: string) => {
    setPacked((current) => {
      const next = new Set(current);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const copyReference = async (reference: string) => {
    await navigator.clipboard?.writeText(reference);
    setCopied(reference);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const activeLabel = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label ?? "Übersicht",
    [activeTab],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveTab("overview")} aria-label="Zur Übersicht">
          <span className="brand-mark">IBZ</span>
          <span>
            <strong>Isla</strong>
            <small>Reise-Cockpit</small>
          </span>
        </button>

        <nav className="tabbar" aria-label="Reisebereiche">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "tab active" : "tab"}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <span className="tab-symbol" aria-hidden="true">{tab.symbol}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="travelers" aria-label="Zwei Reisende">
          <span className="avatar avatar-one">F</span>
          <span className="avatar avatar-two">+1</span>
        </div>
      </header>

      <div className="mobile-section-title">{activeLabel}</div>

      {activeTab === "overview" && <Overview onNavigate={setActiveTab} />}
      {activeTab === "plan" && <TravelPlan />}
      {activeTab === "bookings" && <Bookings copied={copied} onCopy={copyReference} />}
      {activeTab === "discover" && <Discover />}
      {activeTab === "budget" && <Budget />}
      {activeTab === "packing" && (
        <Packing
          packed={packed}
          percent={packedPercent}
          total={totalItems}
          onToggle={togglePacked}
        />
      )}
      {activeTab === "documents" && <Documents />}
    </main>
  );
}

function Overview({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  return (
    <section className="page page-overview">
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> DEINE REISE</div>
          <h1>Ibiza<br /><em>is calling.</em></h1>
          <p className="hero-dates">12.–19. September 2026 <span>·</span> 7 Nächte</p>
          <div className="hero-meta">
            <span>BER <b>→</b> IBZ</span>
            <span>2 Reisende</span>
            <span>Finca & Mietwagen</span>
          </div>
          <div className="sample-badge">Beispieldaten · frei anpassbar</div>
        </div>

        <div className="countdown-card">
          <span className="sun-disc" />
          <div className="countdown-label">Noch</div>
          <div className="countdown-number">41</div>
          <div className="countdown-days">Tage</div>
          <div className="countdown-rule" />
          <p>Vorfreude ist<br />die schönste Reisezeit.</p>
        </div>
      </div>

      <div className="content-grid">
        <section className="card next-card">
          <CardHeader kicker="Als Nächstes" title="Abflug nach Ibiza" action="Alle Buchungen" onAction={() => onNavigate("bookings")} />
          <div className="flight-row">
            <div><span className="time">08:25</span><span className="airport">Berlin · BER</span></div>
            <div className="flight-path"><span>EW 8540</span><div><i /><b>✦</b><i /></div><small>2 h 45 min</small></div>
            <div className="align-right"><span className="time">11:10</span><span className="airport">Ibiza · IBZ</span></div>
          </div>
          <div className="flight-footer">
            <span><b>12. Sep</b> · Terminal 1</span>
            <span className="status-dot">Bestätigt</span>
          </div>
        </section>

        <section className="card weather-card">
          <CardHeader kicker="Vor Ort" title="Sonne in Sicht" />
          <div className="weather-main">
            <div className="weather-icon"><span /></div>
            <div><strong>28°</strong><span>Gefühlt 29°</span></div>
          </div>
          <div className="forecast">
            {[['Sa','28°'],['So','29°'],['Mo','27°'],['Di','28°']].map(([day,temp], index) => (
              <div key={day}><span>{day}</span><i className={index === 2 ? "cloudy" : ""} /><b>{temp}</b></div>
            ))}
          </div>
        </section>

        <section className="card itinerary-card">
          <CardHeader kicker="Deine Woche" title="Sieben Tage Inselzeit" action="Ganzer Reiseplan" onAction={() => onNavigate("plan")} />
          <div className="mini-days">
            {days.slice(0, 5).map((item, index) => (
              <div className={index === 0 ? "mini-day current" : "mini-day"} key={item.date}>
                <div><span>{item.day}</span><b>{item.date.split(" ")[0]}</b></div>
                <i className={`day-dot ${item.tone}`} />
                <p><strong>{item.title}</strong><span>{item.note}</span></p>
              </div>
            ))}
          </div>
        </section>

        <section className="card prep-card">
          <CardHeader kicker="Gut vorbereitet" title="Alles im grünen Bereich" />
          <div className="readiness">
            <div className="readiness-ring"><span>78<small>%</small></span></div>
            <div className="readiness-list">
              <button onClick={() => onNavigate("bookings")}><i className="done">✓</i><span><b>Buchungen</b><small>4 von 4 bestätigt</small></span><em>›</em></button>
              <button onClick={() => onNavigate("documents")}><i className="done">✓</i><span><b>Dokumente</b><small>Alles griffbereit</small></span><em>›</em></button>
              <button onClick={() => onNavigate("packing")}><i className="open">4</i><span><b>Packliste</b><small>Noch 9 Dinge offen</small></span><em>›</em></button>
            </div>
          </div>
        </section>

        <section className="card budget-mini-card">
          <CardHeader kicker="Reisekasse" title="Budget im Blick" action="Details" onAction={() => onNavigate("budget")} />
          <div className="budget-total"><strong>2.184 €</strong><span>von 3.000 € verplant</span></div>
          <div className="progress"><span style={{ width: "73%" }} /></div>
          <div className="budget-labels"><span>73 % genutzt</span><b>816 € übrig</b></div>
        </section>

        <section className="card tip-card">
          <span className="tip-number">01</span>
          <div className="eyebrow light"><span /> INSIDER-TIPP</div>
          <blockquote>„Fahr zum Sonnenuntergang an den Aussichtspunkt bei Es Vedrà — und sei eine Stunde früher da.“</blockquote>
          <button onClick={() => onNavigate("discover")}>Ort ansehen <span>↗</span></button>
        </section>
      </div>
    </section>
  );
}

function TravelPlan() {
  const [selected, setSelected] = useState(0);
  const detail = days[selected];
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="REISEPLAN" title="Acht Tage, genau dein Tempo." copy="Alle Etappen auf einen Blick — mit genug Luft für spontane Inselmomente." />
      <div className="plan-layout">
        <div className="day-selector" role="tablist" aria-label="Reisetage">
          {days.map((item, index) => (
            <button key={item.date} className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} role="tab" aria-selected={selected === index}>
              <span>{item.day}</span><b>{item.date.split(" ")[0]}</b><small>{item.date.split(" ")[1]}</small>
            </button>
          ))}
        </div>
        <div className="card day-detail">
          <div className="day-detail-head">
            <div><span>{detail.date} · Tag {selected + 1}</span><h2>{detail.title}</h2><p>{detail.note}</p></div>
            <i className={`large-day-dot ${detail.tone}`} />
          </div>
          <div className="timeline">
            {(selected === 0
              ? [["05:55", "Am Flughafen", "BER · Terminal 1"], ["08:25", "Abflug nach Ibiza", "Eurowings EW 8540"], ["11:45", "Mietwagen übernehmen", "Centauro · Shuttle-Zone"], ["14:00", "Check-in in der Finca", "Santa Gertrudis"], ["19:30", "Willkommensdinner", "Tisch noch reservieren"]]
              : [["09:00", "Ruhiger Start", "Frühstück in der Finca"], ["11:00", detail.title, detail.note], ["14:00", "Lunch & Siesta", "Flexibler Zwischenstopp"], ["18:30", "Golden Hour", "Lieblingsplatz auswählen"], ["21:00", "Abendessen", "Optionen gespeichert"]]
            ).map(([time, title, note], index) => (
              <div className="timeline-row" key={`${time}-${title}`}><time>{time}</time><i className={index === 1 ? "accent" : ""} /><div><b>{title}</b><span>{note}</span></div>{index === 1 && <em>Highlight</em>}</div>
            ))}
          </div>
        </div>
        <aside className="card plan-note">
          <span className="note-icon">☼</span>
          <h3>Raum für Spontanes</h3>
          <p>Plane nie mehr als zwei feste Punkte pro Tag. Die schönsten Buchten liegen oft dazwischen.</p>
          <div><span>Reservierungen</span><b>2 offen</b></div>
          <div><span>Freie Zeit</span><b>3 halbe Tage</b></div>
        </aside>
      </div>
    </section>
  );
}

function Bookings({ copied, onCopy }: { copied: string | null; onCopy: (reference: string) => void }) {
  const bookings = [
    { type: "FLUG · HIN", title: "Berlin → Ibiza", date: "Sa, 12. Sep · 08:25–11:10", vendor: "Eurowings · EW 8540", ref: "IBZ7X2", accent: "coral" },
    { type: "UNTERKUNFT", title: "Finca Sa Font", date: "12.–19. Sep · 7 Nächte", vendor: "Santa Gertrudis · Frühstück inkl.", ref: "FS-21984", accent: "sage" },
    { type: "MIETWAGEN", title: "Kompakt SUV", date: "12. Sep, 11:45 – 19. Sep, 09:30", vendor: "Centauro · Vollkasko", ref: "CTR-8841", accent: "sun" },
    { type: "FLUG · ZURÜCK", title: "Ibiza → Berlin", date: "Sa, 19. Sep · 12:05–14:50", vendor: "Eurowings · EW 8541", ref: "IBZ7X2", accent: "blue" },
  ];
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="BUCHUNGEN" title="Alles bestätigt. Alles an einem Ort." copy="Flüge, Unterkunft und Mobilität — inklusive Referenzen für den schnellen Zugriff." />
      <div className="booking-summary"><span><i className="done">✓</i><b>4 von 4 bestätigt</b></span><p>Letzte Prüfung: heute</p></div>
      <div className="booking-grid">
        {bookings.map((booking) => (
          <article className="card booking-card" key={`${booking.type}-${booking.title}`}>
            <span className={`booking-accent ${booking.accent}`} />
            <div className="booking-type">{booking.type}<span className="status-dot">Bestätigt</span></div>
            <h2>{booking.title}</h2>
            <p>{booking.date}</p>
            <p className="booking-vendor">{booking.vendor}</p>
            <div className="reference"><span><small>Buchungsnummer</small><b>{booking.ref}</b></span><button onClick={() => onCopy(booking.ref)}>{copied === booking.ref ? "Kopiert ✓" : "Kopieren"}</button></div>
          </article>
        ))}
      </div>
      <div className="card booking-tip"><span>i</span><div><b>24 Stunden vorher</b><p>Online-Check-in öffnen, Bordkarten speichern und Abholzeit für den Mietwagen bestätigen.</p></div><time>11. Sep</time></div>
    </section>
  );
}

function Discover() {
  const [filter, setFilter] = useState("Alle");
  const places = [
    { name: "Es Vedrà", type: "Aussicht", area: "Südwesten", note: "Zum Sonnenuntergang", color: "lavender" },
    { name: "Cala Xarraca", type: "Strand", area: "Norden", note: "Klares Wasser · früh hin", color: "aqua" },
    { name: "Dalt Vila", type: "Kultur", area: "Ibiza-Stadt", note: "Abends durch die Gassen", color: "sand" },
    { name: "Mercat de Forada", type: "Essen", area: "Buscastell", note: "Samstags · lokal", color: "peach" },
    { name: "Ses Illetes", type: "Strand", area: "Formentera", note: "Fähre vorab buchen", color: "sky" },
    { name: "Santa Gertrudis", type: "Essen", area: "Inselmitte", note: "Cafés & kleine Läden", color: "sage" },
  ];
  const visible = filter === "Alle" ? places : places.filter((place) => place.type === filter);
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="ENTDECKEN" title="Orte, die nach Inselzeit schmecken." copy="Deine Merkliste für Buchten, Dörfer, gutes Essen und die besten Aussichten." />
      <div className="filter-row">{["Alle", "Strand", "Essen", "Aussicht", "Kultur"].map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "active" : ""}>{item}</button>)}</div>
      <div className="places-layout">
        <div className="map-card card" aria-label="Stilisierte Übersichtskarte von Ibiza">
          <div className="island-shape"><span className="pin pin-one">1</span><span className="pin pin-two">2</span><span className="pin pin-three">3</span><span className="pin pin-four">4</span></div>
          <div className="map-label north">N</div><div className="map-label ibiza">IBIZA</div><div className="map-label sea">Mittelmeer</div>
        </div>
        <div className="place-grid">
          {visible.map((place, index) => (
            <article className="card place-card" key={place.name}><span className={`place-color ${place.color}`}>{String(index + 1).padStart(2, "0")}</span><div><small>{place.type} · {place.area}</small><h2>{place.name}</h2><p>{place.note}</p></div><button aria-label={`${place.name} öffnen`}>↗</button></article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Budget() {
  const categories = [
    { name: "Unterkunft", amount: 980, percent: 82, color: "coral" },
    { name: "Flüge", amount: 486, percent: 100, color: "blue" },
    { name: "Mietwagen", amount: 318, percent: 80, color: "sun" },
    { name: "Essen & Trinken", amount: 240, percent: 32, color: "sage" },
    { name: "Erlebnisse", amount: 160, percent: 40, color: "lavender" },
  ];
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="BUDGET" title="Mehr Insel, weniger Kopfrechnen." copy="Geplante und bereits bezahlte Kosten, sauber nach Kategorien sortiert." />
      <div className="budget-dashboard">
        <div className="card big-budget">
          <span>Gesamtbudget</span><strong>3.000 €</strong><p>für 2 Personen · 8 Tage</p>
          <div className="big-progress"><i style={{ width: "73%" }} /></div>
          <div><span><b>2.184 €</b> verplant</span><span><b>816 €</b> verfügbar</span></div>
        </div>
        <div className="card daily-budget"><span>Freies Tagesbudget</span><strong>102 €</strong><p>pro Reisetag für euch beide</p><small>Auf Basis des Restbudgets</small></div>
        <div className="card category-budget">
          <CardHeader kicker="Kategorien" title="So verteilt sich die Reisekasse" />
          {categories.map((category) => <div className="category-row" key={category.name}><span>{category.name}</span><div><i className={category.color} style={{ width: `${category.percent}%` }} /></div><b>{category.amount} €</b></div>)}
        </div>
        <div className="card paid-list"><CardHeader kicker="Status" title="Schon bezahlt" />
          <div><span>Flüge</span><b>486 €</b><i>✓</i></div><div><span>Finca · Anzahlung</span><b>490 €</b><i>✓</i></div><div><span>Mietwagen · Reservierung</span><b>0 €</b><i className="open">vor Ort</i></div><footer><span>Bezahlt</span><strong>976 €</strong></footer>
        </div>
      </div>
    </section>
  );
}

function Packing({ packed, percent, total, onToggle }: { packed: Set<string>; percent: number; total: number; onToggle: (item: string) => void }) {
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="PACKLISTE" title="Leicht packen. Nichts vergessen." copy="Die wichtigsten Dinge für Sonne, Strand und entspannte Abende." />
      <div className="packing-head card"><div className="packing-ring" style={{ "--progress": `${percent * 3.6}deg` } as React.CSSProperties}><span>{percent}<small>%</small></span></div><div><span>Dein Fortschritt</span><h2>{packed.size} von {total} eingepackt</h2><p>{total - packed.size === 0 ? "Fertig — der Urlaub kann kommen." : `Noch ${total - packed.size} Dinge, dann bist du startklar.`}</p></div></div>
      <div className="packing-grid">
        {packingGroups.map((group) => (
          <section className="card packing-group" key={group.title}><h2>{group.title}</h2><div>{group.items.map((item) => <label key={item} className={packed.has(item) ? "packed" : ""}><input type="checkbox" checked={packed.has(item)} onChange={() => onToggle(item)} /><i>{packed.has(item) ? "✓" : ""}</i><span>{item}</span></label>)}</div></section>
        ))}
      </div>
    </section>
  );
}

function Documents() {
  const docs = [
    { title: "Personalausweis", meta: "Gültig bis 03/2031", status: "Geprüft", symbol: "ID" },
    { title: "Führerschein", meta: "Für Mietwagen benötigt", status: "Geprüft", symbol: "DL" },
    { title: "Reiseversicherung", meta: "Police EU-204984", status: "Gespeichert", symbol: "+" },
    { title: "Bordkarten", meta: "Verfügbar ab 11. Sep", status: "Ausstehend", symbol: "✦" },
  ];
  return (
    <section className="page inner-page">
      <PageIntro eyebrow="DOKUMENTE & INFOS" title="Wichtiges, wenn es darauf ankommt." copy="Dokumente, Kontakte und praktische Hinweise für unterwegs." />
      <div className="documents-layout">
        <div className="documents-grid">{docs.map((doc) => <article className="card document-card" key={doc.title}><span>{doc.symbol}</span><div><h2>{doc.title}</h2><p>{doc.meta}</p></div><i className={doc.status === "Ausstehend" ? "waiting" : ""}>{doc.status}</i></article>)}</div>
        <aside className="card emergency-card"><div className="eyebrow light"><span /> IM NOTFALL</div><h2>Gut zu wissen</h2><div><span>EU-Notruf</span><a href="tel:112">112</a></div><div><span>Deutsche Botschaft Madrid</span><a href="tel:+34915579000">+34 91 557 90 00</a></div><div><span>Unterkunft</span><a href="tel:+34971000000">+34 971 000 000</a></div><p>Medizinische Dokumente und Versicherungsnummern zusätzlich offline speichern.</p></aside>
        <div className="card practical-card"><CardHeader kicker="Kurz notiert" title="Vor Ort" /><div className="fact-grid"><span><small>Zeitzone</small><b>Wie Berlin</b></span><span><small>Währung</small><b>Euro (€)</b></span><span><small>Steckdose</small><b>Typ C / F</b></span><span><small>Sprache</small><b>Spanisch / Katalanisch</b></span></div></div>
      </div>
    </section>
  );
}

function CardHeader({ kicker, title, action, onAction }: { kicker: string; title: string; action?: string; onAction?: () => void }) {
  return <header className="card-header"><div><span>{kicker}</span><h2>{title}</h2></div>{action && <button onClick={onAction}>{action} <b>→</b></button>}</header>;
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header className="page-intro"><div className="eyebrow"><span /> {eyebrow}</div><h1>{title}</h1><p>{copy}</p><div className="sample-badge">Beispieldaten · frei anpassbar</div></header>;
}
