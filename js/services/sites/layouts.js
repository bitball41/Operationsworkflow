/**
 * Real website layouts. Each layout returns the three files that make up a
 * demo bundle, so previews and published sites are the same HTML/CSS/JS the
 * client eventually receives — not an approximation drawn in the dashboard.
 */
import { escapeHtml } from "../../core/utils.js";

function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "#contact";
}

function ratingBlock(site) {
  if (!site.rating) return "";
  return `<p class="rating"><span aria-hidden="true">★★★★★</span> ${escapeHtml(String(site.rating))} on Google${site.ratingCount ? ` · ${escapeHtml(String(site.ratingCount))} reviews` : ""}</p>`;
}

function serviceCards(site) {
  return site.services.map((service, index) => `
        <article class="service">
          <span class="service__n">${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(service.title)}</h3>
          <p>${escapeHtml(service.text)}</p>
        </article>`).join("");
}

function contactRows(site) {
  return [
    site.phone ? `<li><span>Phone</span><a href="${telHref(site.phone)}">${escapeHtml(site.phone)}</a></li>` : "",
    site.email ? `<li><span>Email</span><a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a></li>` : "",
    site.address ? `<li><span>Address</span><p>${escapeHtml(site.address)}</p></li>` : "",
    site.hours ? `<li><span>Hours</span><p>${escapeHtml(site.hours)}</p></li>` : "",
  ].filter(Boolean).join("");
}

const SHARED_JS = `// Small progressive enhancements. No dependencies.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-nav-toggle]');
  if (trigger) {
    document.body.classList.toggle('nav-open');
    return;
  }
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && anchor.getAttribute('href').length > 1) {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.body.classList.remove('nav-open');
    }
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-quote-form]');
  if (!form) return;
  // No backend yet: confirm locally instead of losing the enquiry silently.
  event.preventDefault();
  form.reset();
  const thanks = form.querySelector('.thanks');
  if (thanks) thanks.hidden = false;
});

const year = document.querySelector('[data-year]');
if (year) year.textContent = new Date().getFullYear();

// Reveal animation is opt-in from script, so the page is fully visible
// without JavaScript.
const revealables = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && revealables.length) {
  document.documentElement.classList.add('js-reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '-40px' });
  revealables.forEach((node) => observer.observe(node));
} else {
  revealables.forEach((node) => node.classList.add('is-visible'));
}
`;

const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: var(--font); color: var(--ink); background: var(--paper); line-height: 1.6; }
h1, h2, h3, p { margin: 0; }
img { max-width: 100%; display: block; }
a { color: inherit; }
.wrap { width: min(1120px, 100% - 48px); margin: 0 auto; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 22px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 1rem; }
.btn--primary { background: var(--accent); color: var(--accent-ink); }
.btn--primary:hover { filter: brightness(1.07); }
.btn--ghost { border: 1.5px solid currentColor; }
.site-head { position: sticky; top: 0; z-index: 10; background: var(--paper); border-bottom: 1px solid var(--hairline); }
.site-head .wrap { display: flex; align-items: center; gap: 20px; min-height: 74px; }
.brand { font-weight: 800; font-size: 1.12rem; letter-spacing: -0.02em; }
.brand span { display: block; font-size: 0.7rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
.site-nav { margin-left: auto; display: flex; align-items: center; gap: 26px; font-weight: 600; font-size: 0.95rem; }
.site-nav a { text-decoration: none; }
.nav-toggle { display: none; margin-left: auto; background: none; border: 1.5px solid var(--hairline); border-radius: 8px; padding: 9px 12px; font: inherit; font-weight: 700; }
section { padding: 84px 0; }
.eyebrow { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent-deep); }
h2 { font-size: clamp(1.7rem, 3.6vw, 2.5rem); letter-spacing: -0.025em; line-height: 1.15; }
.lede { color: var(--muted); font-size: 1.05rem; max-width: 58ch; margin-top: 14px; }
.rating { color: var(--muted); font-weight: 600; font-size: 0.95rem; }
.rating span { color: var(--accent-deep); letter-spacing: 2px; }
.services { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 40px; }
.service { padding: 26px; border: 1px solid var(--hairline); border-radius: 14px; background: var(--card); }
.service__n { font-size: 0.78rem; font-weight: 700; color: var(--accent-deep); letter-spacing: 0.1em; }
.service h3 { margin: 10px 0 8px; font-size: 1.16rem; letter-spacing: -0.01em; }
.service p { color: var(--muted); font-size: 0.97rem; }
.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 46px; align-items: center; }
.points { margin-top: 22px; display: grid; gap: 12px; }
.points li { display: flex; gap: 11px; font-weight: 600; }
.points li::before { content: "✓"; color: var(--accent-deep); font-weight: 800; }
.contact { background: var(--band); }
.contact ul { list-style: none; margin: 26px 0 0; padding: 0; display: grid; gap: 18px; }
.contact li span { display: block; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; }
.contact li a, .contact li p { font-size: 1.06rem; font-weight: 600; text-decoration: none; }
.cta-band { background: var(--accent); color: var(--accent-ink); text-align: center; }
.cta-band h2 { color: inherit; }
.cta-band p { opacity: 0.88; margin-top: 12px; }
.cta-band .btn { margin-top: 26px; background: var(--accent-ink); color: var(--accent); }
.site-foot { padding: 30px 0; border-top: 1px solid var(--hairline); color: var(--muted); font-size: 0.9rem; }
.site-foot .wrap { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; }
.js-reveal [data-reveal] { opacity: 0; transform: translateY(14px); transition: opacity .5s ease, transform .5s ease; }
.js-reveal [data-reveal].is-visible { opacity: 1; transform: none; }
@media (max-width: 820px) {
  .wrap { width: min(1120px, 100% - 32px); }
  section { padding: 60px 0; }
  .nav-toggle { display: block; }
  .site-nav { position: fixed; inset: 74px 0 auto; flex-direction: column; align-items: stretch; gap: 0; background: var(--paper); border-bottom: 1px solid var(--hairline); padding: 8px 16px 18px; display: none; }
  body.nav-open .site-nav { display: flex; }
  .site-nav a { padding: 13px 0; border-bottom: 1px solid var(--hairline); }
  .site-nav .btn { margin-top: 14px; }
}
@media (prefers-reduced-motion: reduce) { .js-reveal [data-reveal] { opacity: 1; transform: none; transition: none; } }
`;

function shell({ site, theme, bodyClass = "", head = "", sections }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(site.business)}${site.city ? ` · ${escapeHtml(site.city)}` : ""}</title>
<meta name="description" content="${escapeHtml(site.subheadline)}">
<link rel="stylesheet" href="style.css">
${head}</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="#top">${escapeHtml(site.business)}<span>${escapeHtml(site.category)}</span></a>
    <button class="nav-toggle" type="button" data-nav-toggle>Menu</button>
    <nav class="site-nav">
      <a href="#services">Services</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
      <a class="btn btn--primary" href="${telHref(site.phone)}">${escapeHtml(site.cta)}</a>
    </nav>
  </div>
</header>
<main id="top">
${sections}
</main>
<footer class="site-foot">
  <div class="wrap">
    <span>© <span data-year>2026</span> ${escapeHtml(site.business)}</span>
    <span>${escapeHtml([site.city, site.region].filter(Boolean).join(", "))}${site.phone ? ` · ${escapeHtml(site.phone)}` : ""}</span>
  </div>
</footer>
<script src="script.js"></script>
</body>
</html>
`;
}

function themeCss(theme) {
  return `:root {
  /* The site owns its light design: stops browsers from auto-inverting it. */
  color-scheme: light;
  --accent: ${theme.accent};
  --accent-deep: ${theme.accentDeep};
  --accent-ink: ${theme.accentInk};
  --ink: ${theme.ink};
  --muted: ${theme.muted};
  --paper: ${theme.paper};
  --card: ${theme.card};
  --band: ${theme.band};
  --hairline: ${theme.hairline};
  --hero: ${theme.hero};
  --font: ${theme.font};
}
`;
}

/* Split hero with a photo panel. Reads as an established local company. */
function servicePro(site, theme) {
  const sections = `  <section class="hero">
    <div class="wrap split">
      <div>
        <p class="eyebrow">${escapeHtml(site.eyebrow)}</p>
        <h1>${escapeHtml(site.headline)}</h1>
        <p class="lede">${escapeHtml(site.subheadline)}</p>
        <div class="hero__actions">
          <a class="btn btn--primary" href="${telHref(site.phone)}">${escapeHtml(site.cta)}</a>
          <a class="btn btn--ghost" href="#services">See services</a>
        </div>
        ${ratingBlock(site)}
      </div>
      <div class="hero__panel" role="img" aria-label="${escapeHtml(site.category)} work in ${escapeHtml(site.city || "the local area")}">
        <div class="hero__badge"><strong>${escapeHtml(site.badgeValue)}</strong><span>${escapeHtml(site.badgeLabel)}</span></div>
      </div>
    </div>
  </section>

  <section id="services">
    <div class="wrap">
      <p class="eyebrow">What we do</p>
      <h2>${escapeHtml(site.servicesHeadline)}</h2>
      <div class="services">${serviceCards(site)}
      </div>
    </div>
  </section>

  <section id="about" class="about">
    <div class="wrap split">
      <div data-reveal>
        <p class="eyebrow">Why us</p>
        <h2>${escapeHtml(site.aboutHeadline)}</h2>
        <p class="lede">${escapeHtml(site.aboutText)}</p>
      </div>
      <ul class="points" data-reveal>
        ${site.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("\n        ")}
      </ul>
    </div>
  </section>

  <section id="contact" class="contact">
    <div class="wrap split">
      <div>
        <p class="eyebrow">Get in touch</p>
        <h2>Free estimates, straight answers.</h2>
        <p class="lede">${escapeHtml(site.contactText)}</p>
        <ul>${contactRows(site)}</ul>
      </div>
      <div class="quote">
        <h3>Request a quote</h3>
        <form data-quote-form>
          <label>Name<input name="name" required></label>
          <label>Phone<input name="phone" type="tel" required></label>
          <label>What do you need?<textarea name="detail" rows="3"></textarea></label>
          <button class="btn btn--primary" type="submit">Send request</button>
          <p class="thanks" hidden>Thanks — we will call you back shortly.</p>
        </form>
      </div>
    </div>
  </section>

  <section class="cta-band">
    <div class="wrap">
      <h2>${escapeHtml(site.ctaHeadline)}</h2>
      <p>${escapeHtml(site.ctaText)}</p>
      <a class="btn" href="${telHref(site.phone)}">${escapeHtml(site.cta)}</a>
    </div>
  </section>`;

  const css = `${themeCss(theme)}${BASE_CSS}
.hero { padding: 96px 0 84px; }
.hero h1 { font-size: clamp(2.1rem, 5.2vw, 3.5rem); letter-spacing: -0.035em; line-height: 1.05; margin-top: 14px; }
.hero__actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 28px 0 18px; }
.hero__panel { position: relative; min-height: 380px; border-radius: 18px; background:
  linear-gradient(150deg, color-mix(in srgb, var(--accent) 88%, #000) 0%, color-mix(in srgb, var(--accent) 55%, #111) 100%); }
.hero__badge { position: absolute; left: 22px; bottom: 22px; background: var(--paper); border-radius: 12px; padding: 16px 20px; }
.hero__badge strong { display: block; font-size: 1.6rem; letter-spacing: -0.02em; }
.hero__badge span { color: var(--muted); font-size: 0.82rem; font-weight: 600; }
.about { background: var(--band); }
.quote { background: var(--paper); border: 1px solid var(--hairline); border-radius: 16px; padding: 26px; }
.quote h3 { font-size: 1.2rem; margin-bottom: 16px; }
.quote label { display: block; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.quote input, .quote textarea { width: 100%; margin-top: 6px; padding: 12px; border: 1px solid var(--hairline); border-radius: 8px; font: inherit; font-size: 1rem; background: var(--card); color: var(--ink); }
.quote .btn { width: 100%; border: 0; cursor: pointer; font: inherit; font-weight: 700; }
.quote .thanks { margin-top: 12px; color: var(--accent-deep); font-weight: 600; }
@media (max-width: 820px) { .hero { padding: 56px 0 48px; } .hero__panel { min-height: 220px; } }
`;

  return { html: shell({ site, theme, sections }), css, js: SHARED_JS };
}

/* Centred hero on a dark band. Reads bolder — good for emergency work. */
function boldLocal(site, theme) {
  const sections = `  <section class="hero">
    <div class="wrap">
      <p class="eyebrow">${escapeHtml(site.eyebrow)}</p>
      <h1>${escapeHtml(site.headline)}</h1>
      <p class="lede">${escapeHtml(site.subheadline)}</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="${telHref(site.phone)}">${escapeHtml(site.cta)}</a>
        <a class="btn btn--ghost" href="#contact">Request a quote</a>
      </div>
      ${ratingBlock(site)}
      <div class="hero__strip">
        ${site.points.slice(0, 3).map((point) => `<span>${escapeHtml(point)}</span>`).join("\n        ")}
      </div>
    </div>
  </section>

  <section id="services">
    <div class="wrap">
      <p class="eyebrow">Services</p>
      <h2>${escapeHtml(site.servicesHeadline)}</h2>
      <div class="services">${serviceCards(site)}
      </div>
    </div>
  </section>

  <section id="about" class="about">
    <div class="wrap split">
      <div data-reveal>
        <p class="eyebrow">About</p>
        <h2>${escapeHtml(site.aboutHeadline)}</h2>
        <p class="lede">${escapeHtml(site.aboutText)}</p>
      </div>
      <div class="quote-card" data-reveal>
        <strong>${escapeHtml(site.badgeValue)}</strong>
        <span>${escapeHtml(site.badgeLabel)}</span>
        <a class="btn btn--primary" href="${telHref(site.phone)}">${escapeHtml(site.cta)}</a>
      </div>
    </div>
  </section>

  <section id="contact" class="contact">
    <div class="wrap split">
      <div>
        <p class="eyebrow">Contact</p>
        <h2>Talk to a real person today.</h2>
        <p class="lede">${escapeHtml(site.contactText)}</p>
      </div>
      <ul>${contactRows(site)}</ul>
    </div>
  </section>

  <section class="cta-band">
    <div class="wrap">
      <h2>${escapeHtml(site.ctaHeadline)}</h2>
      <p>${escapeHtml(site.ctaText)}</p>
      <a class="btn" href="${telHref(site.phone)}">${escapeHtml(site.cta)}</a>
    </div>
  </section>`;

  const css = `${themeCss(theme)}${BASE_CSS}
.hero { background: var(--hero); color: #fff; text-align: center; padding: 104px 0 92px; }
.hero .eyebrow { color: color-mix(in srgb, var(--accent) 70%, #fff); }
.hero h1 { font-size: clamp(2.2rem, 6vw, 3.8rem); letter-spacing: -0.04em; line-height: 1.03; margin-top: 16px; }
.hero .lede { color: rgba(255,255,255,.76); margin: 16px auto 0; }
.hero__actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 30px 0 16px; }
.hero .rating { color: rgba(255,255,255,.7); }
.hero__strip { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 26px; margin-top: 34px; padding-top: 26px; border-top: 1px solid rgba(255,255,255,.16); font-weight: 600; font-size: 0.94rem; color: rgba(255,255,255,.8); }
.about { background: var(--band); }
.quote-card { background: var(--paper); border: 1px solid var(--hairline); border-radius: 16px; padding: 30px; text-align: center; }
.quote-card strong { display: block; font-size: 2.4rem; letter-spacing: -0.03em; }
.quote-card span { display: block; color: var(--muted); font-weight: 600; margin-bottom: 20px; }
@media (max-width: 820px) { .hero { padding: 62px 0 54px; } }
`;

  return { html: shell({ site, theme, sections }), css, js: SHARED_JS };
}

export const LAYOUTS = Object.freeze({
  "service-pro": { label: "Service Pro", render: servicePro },
  "bold-local": { label: "Bold Local", render: boldLocal },
});

export function renderLayout(layoutKey, site, theme) {
  const layout = LAYOUTS[layoutKey] || LAYOUTS["service-pro"];
  return layout.render(site, theme);
}
