import { buildPublicUrl, getSupportEmail } from '../config/public.js'

type PublicNavKey =
  | 'home'
  | 'explorer'
  | 'directory'
  | 'certify'
  | 'blog'
  | 'pricing'
  | 'docs'
  | 'methodology'
  | 'reviewer'

interface PublicHeadOptions {
  title: string
  description: string
  path: string
  ogType?: 'website' | 'article'
  canonicalUrl?: string
  imageUrl?: string
  imageAlt?: string
  extraHead?: string
}

interface PublicShellOptions extends PublicHeadOptions {
  nav?: PublicNavKey
  ctaHref?: string
  ctaLabel?: string
  footerCopy?: string
  extraCss?: string
  content: string
}

interface PublicFooterOptions {
  copy?: string
}

export const PUBLIC_BASE_CSS = `
:root{
  --bg:#07111f;
  --bg2:#0d1b2d;
  --bg3:#13243c;
  --surface:#11233a;
  --surface-strong:#182b46;
  --border:rgba(129,140,248,0.14);
  --border-hi:rgba(129,140,248,0.26);
  --text:#eef2ff;
  --text-dim:#a7b7ce;
  --text-muted:#6c7b92;
  --accent:#7dd3fc;
  --accent-strong:#818cf8;
  --accent-dim:rgba(125,211,252,0.10);
  --green:#34d399;
  --green-dim:rgba(52,211,153,0.10);
  --yellow:#fbbf24;
  --yellow-dim:rgba(251,191,36,0.10);
  --red:#f87171;
  --red-dim:rgba(248,113,113,0.10);
  --radius:18px;
  --shadow:0 28px 80px rgba(2,6,23,0.28);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  min-height:100vh;
  color:var(--text);
  font-family:'DM Sans',sans-serif;
  background:
    radial-gradient(circle at top left, rgba(129,140,248,0.18), transparent 28%),
    radial-gradient(circle at top right, rgba(125,211,252,0.16), transparent 30%),
    linear-gradient(180deg, #07111f 0%, #091728 42%, #060d18 100%);
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:none}
img{max-width:100%;display:block}
.mono{font-family:'JetBrains Mono',monospace}
.serif{font-family:'Instrument Serif',serif}
.site-shell{max-width:1180px;margin:0 auto;padding:0 28px 72px;position:relative;z-index:1}
.nav-outer{
  position:sticky;
  top:0;
  z-index:100;
  background:rgba(7,17,31,0.84);
  backdrop-filter:blur(22px);
  -webkit-backdrop-filter:blur(22px);
  border-bottom:1px solid var(--border);
}
nav{
  max-width:1180px;
  margin:0 auto;
  height:68px;
  padding:0 28px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:20px;
}
.logo{
  display:inline-flex;
  align-items:center;
  gap:8px;
  font-size:17px;
  font-weight:700;
  letter-spacing:-0.02em;
  color:var(--accent);
}
.logo:hover{text-decoration:none}
.logo span{color:var(--text-dim);font-weight:400}
.nav-links{
  display:flex;
  align-items:center;
  gap:12px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
.nav-link{
  display:inline-flex;
  align-items:center;
  padding:8px 10px;
  border-radius:999px;
  color:var(--text-muted);
  font-size:12px;
  font-weight:600;
  letter-spacing:0.02em;
  transition:color .2s ease, background .2s ease;
}
.nav-link:hover,
.nav-link.active{
  color:var(--text);
  background:rgba(129,140,248,0.08);
}
.nav-cta{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 16px;
  border-radius:999px;
  border:1px solid rgba(129,140,248,0.26);
  background:linear-gradient(135deg, rgba(129,140,248,0.92), rgba(125,211,252,0.88));
  color:#08111d;
  font-size:12px;
  font-weight:800;
  letter-spacing:0.02em;
  box-shadow:0 10px 30px rgba(56,189,248,0.18);
}
.nav-cta:hover{opacity:.94}
.hero{
  padding:84px 0 44px;
}
.hero-grid{
  display:grid;
  grid-template-columns:minmax(0,1.25fr) minmax(280px,0.75fr);
  gap:24px;
  align-items:end;
}
.eyebrow{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:7px 14px;
  border-radius:999px;
  border:1px solid var(--border-hi);
  background:var(--accent-dim);
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.12em;
  text-transform:uppercase;
}
.display{
  font-family:'Instrument Serif',serif;
  font-size:clamp(40px,5vw,66px);
  font-weight:400;
  line-height:1.02;
  letter-spacing:-0.04em;
  margin-top:18px;
}
.display em{color:var(--accent);font-style:italic}
.lede{
  margin-top:18px;
  max-width:720px;
  color:var(--text-dim);
  font-size:18px;
  line-height:1.82;
}
.action-row{
  display:flex;
  gap:12px;
  flex-wrap:wrap;
  margin-top:28px;
}
.button{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:13px 20px;
  border-radius:12px;
  border:1px solid var(--border-hi);
  font-size:14px;
  font-weight:700;
  cursor:pointer;
  transition:transform .18s ease, opacity .18s ease, border-color .18s ease, color .18s ease;
}
.button:hover{transform:translateY(-1px)}
.button-primary{
  color:#07111f;
  background:linear-gradient(135deg, rgba(125,211,252,0.98), rgba(129,140,248,0.9));
  border-color:transparent;
}
.button-secondary{
  color:var(--text);
  background:rgba(17,35,58,0.58);
}
.button-secondary:hover{
  color:var(--accent);
  border-color:var(--border-hi);
}
.hero-panel,
.card,
.panel,
.metric-card,
.callout,
.table-shell,
.article-shell,
.prose-callout{
  background:linear-gradient(180deg, rgba(17,35,58,0.9), rgba(12,27,45,0.92));
  border:1px solid var(--border);
  box-shadow:var(--shadow);
}
.hero-panel,
.card,
.panel,
.metric-card,
.callout,
.article-shell{border-radius:var(--radius)}
.hero-panel,
.panel,
.callout,
.article-shell{padding:24px}
.section{
  padding:22px 0 0;
}
.section-header{
  max-width:760px;
  margin-bottom:28px;
}
.section-label{
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.14em;
  text-transform:uppercase;
  color:var(--accent);
  margin-bottom:12px;
}
.section-title{
  font-family:'Instrument Serif',serif;
  font-size:clamp(30px,3.8vw,46px);
  font-weight:400;
  line-height:1.08;
  letter-spacing:-0.03em;
  margin-bottom:10px;
}
.section-copy{
  color:var(--text-dim);
  font-size:16px;
  line-height:1.82;
}
.section-center{text-align:center}
.section-center .section-header{margin-left:auto;margin-right:auto}
.grid-2,.grid-3,.grid-4{
  display:grid;
  gap:18px;
}
.grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.grid-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.card{
  padding:24px;
  border-radius:16px;
}
.card-kicker{
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.12em;
  text-transform:uppercase;
  margin-bottom:10px;
}
.card-title{
  font-size:19px;
  font-weight:700;
  line-height:1.25;
  margin-bottom:10px;
}
.card-copy{
  color:var(--text-dim);
  font-size:14px;
  line-height:1.78;
}
.stat-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;
}
.metric-card{
  padding:18px;
  border-radius:16px;
}
.metric-label{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.1em;
  text-transform:uppercase;
  margin-bottom:10px;
}
.metric-value{
  font-size:22px;
  font-weight:800;
  letter-spacing:-0.03em;
}
.table-shell{
  border-radius:16px;
  overflow:hidden;
}
.table-row{
  display:grid;
  align-items:center;
  gap:14px;
  padding:16px 20px;
  border-bottom:1px solid var(--border);
}
.table-row:last-child{border-bottom:none}
.table-row.head{
  background:rgba(10,22,40,0.72);
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.1em;
  text-transform:uppercase;
}
.badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  border-radius:999px;
  padding:6px 10px;
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.06em;
  text-transform:uppercase;
}
.badge-info{background:var(--accent-dim);color:var(--accent)}
.badge-success{background:var(--green-dim);color:var(--green)}
.badge-warn{background:var(--yellow-dim);color:var(--yellow)}
.badge-danger{background:var(--red-dim);color:var(--red)}
.field label{
  display:block;
  margin-bottom:8px;
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.12em;
  text-transform:uppercase;
}
.input,
.select,
.textarea{
  width:100%;
  padding:14px 15px;
  border-radius:12px;
  border:1px solid var(--border-hi);
  background:rgba(7,17,31,0.72);
  color:var(--text);
  font-size:14px;
  outline:none;
}
.textarea{min-height:120px;resize:vertical}
.input:focus,
.select:focus,
.textarea:focus{border-color:var(--accent)}
.article-shell{
  max-width:860px;
  margin:84px auto 0;
}
.article-back{
  display:inline-flex;
  align-items:center;
  gap:8px;
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  font-weight:600;
  margin-bottom:30px;
}
.article-back:hover{color:var(--accent)}
.article-meta{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:20px;
}
.article-title{
  font-family:'Instrument Serif',serif;
  font-size:clamp(34px,4.4vw,54px);
  font-weight:400;
  line-height:1.06;
  letter-spacing:-0.04em;
  margin-bottom:14px;
}
.article-lede{
  color:var(--text-dim);
  font-size:18px;
  line-height:1.85;
  padding-bottom:28px;
  border-bottom:1px solid var(--border);
  margin-bottom:28px;
}
.prose h2{
  font-family:'Instrument Serif',serif;
  font-size:clamp(26px,3.2vw,38px);
  font-weight:400;
  line-height:1.12;
  letter-spacing:-0.03em;
  margin:46px 0 12px;
}
.prose h3{
  font-size:17px;
  font-weight:700;
  margin:28px 0 10px;
}
.prose p,
.prose li{
  color:var(--text-dim);
  font-size:15px;
  line-height:1.86;
}
.prose p{margin-bottom:16px}
.prose ul{
  list-style:none;
  margin:16px 0;
  padding:0;
}
.prose li{
  position:relative;
  padding-left:18px;
  margin-bottom:10px;
}
.prose li::before{
  content:'';
  position:absolute;
  left:0;
  top:12px;
  width:6px;
  height:6px;
  border-radius:999px;
  background:var(--accent);
  opacity:.7;
}
.prose strong{color:var(--text)}
.prose em{color:var(--accent)}
.prose-callout{
  border-radius:16px;
  padding:22px 24px;
  margin:22px 0;
}
.site-footer{
  margin-top:64px;
  border-top:1px solid var(--border);
}
.site-footer-inner{
  max-width:1180px;
  margin:0 auto;
  padding:30px 28px 48px;
  display:flex;
  justify-content:space-between;
  gap:18px;
  flex-wrap:wrap;
}
.footer-copy{
  max-width:700px;
  color:var(--text-muted);
  font-size:12px;
  line-height:1.8;
}
.footer-links{
  display:flex;
  align-items:center;
  gap:14px;
  flex-wrap:wrap;
}
.footer-links a{
  color:var(--text-muted);
  font-size:12px;
  font-weight:600;
}
.footer-links a:hover{color:var(--accent)}
@media(max-width:980px){
  .hero-grid,
  .grid-2,
  .grid-3,
  .grid-4,
  .stat-grid{grid-template-columns:1fr}
}
@media(max-width:760px){
  .nav-outer{position:sticky}
  nav,
  .site-shell,
  .site-footer-inner{padding-left:20px;padding-right:20px}
  nav{height:auto;min-height:68px;padding-top:12px;padding-bottom:12px;align-items:flex-start;flex-wrap:wrap}
  .logo{width:100%}
  .nav-links{width:100%;justify-content:flex-start;gap:8px}
  .nav-link{padding:7px 10px}
  .nav-cta{margin-top:4px}
  .hero{padding-top:56px}
  .article-shell{margin-top:56px;padding:20px}
}
`

function navLink(href: string, label: string, key: PublicNavKey, active?: PublicNavKey): string {
  return `<a href="${href}" class="nav-link${active === key ? ' active' : ''}">${label}</a>`
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function buildDefaultSocialImage(title: string, description: string): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" fill="none">
  <defs>
    <linearGradient id="g" x1="88" y1="80" x2="1112" y2="550" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7dd3fc" stop-opacity="0.24" />
      <stop offset="0.55" stop-color="#818cf8" stop-opacity="0.18" />
      <stop offset="1" stop-color="#07111f" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" rx="40" fill="#07111f" />
  <rect x="40" y="40" width="1120" height="550" rx="32" fill="#0d1b2d" stroke="rgba(129,140,248,0.18)" />
  <path d="M72 112C226 56 412 28 600 28C788 28 974 56 1128 112V548H72V112Z" fill="url(#g)" />
  <text x="84" y="166" fill="#7dd3fc" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="2">DJD Agent Score</text>
  <text x="84" y="268" fill="#eef2ff" font-family="Instrument Serif,Georgia,serif" font-size="64" font-weight="400">${escapeXml(title)}</text>
  <text x="84" y="340" fill="#a7b7ce" font-family="DM Sans,Arial,sans-serif" font-size="28">${escapeXml(description)}</text>
  <text x="84" y="442" fill="#7dd3fc" font-family="JetBrains Mono,monospace" font-size="22" font-weight="700">Screen wallets before payout</text>
  <text x="84" y="494" fill="#6c7b92" font-family="DM Sans,Arial,sans-serif" font-size="22">Trust signals for payouts, paid routes, and agent workflows</text>
</svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function renderPublicHeadStart(options: PublicHeadOptions): string {
  const {
    title,
    description,
    path,
    ogType = 'website',
    canonicalUrl = buildPublicUrl(path),
    imageUrl = buildDefaultSocialImage(title, description),
    imageAlt = `${title} on DJD Agent Score`,
    extraHead = '',
  } = options

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:site_name" content="DJD Agent Score">
<meta property="og:image" content="${imageUrl}">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${imageUrl}">
<meta name="twitter:image:alt" content="${imageAlt}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
${extraHead}
<style>${PUBLIC_BASE_CSS}`
}

export function renderPublicNav(
  active?: PublicNavKey,
  ctaHref = buildPublicUrl('/pricing'),
  ctaLabel = 'Get Started',
): string {
  const extraLink =
    active === 'methodology'
      ? navLink('/methodology', 'Methodology', 'methodology', active)
      : active === 'reviewer'
        ? navLink('/reviewer', 'Reviewer', 'reviewer', active)
        : ''

  return `</style>
</head>
<body>
<div class="nav-outer">
  <nav>
    <a class="logo" href="/">DJD<span> Agent Score</span></a>
    <div class="nav-links">
      ${navLink('/explorer', 'Explorer', 'explorer', active)}
      ${navLink('/directory', 'Directory', 'directory', active)}
      ${navLink('/certify', 'Certify', 'certify', active)}
      ${navLink('/blog', 'Blog', 'blog', active)}
      ${navLink('/pricing', 'Pricing', 'pricing', active)}
      ${navLink('/docs', 'Docs', 'docs', active)}
      ${extraLink}
      <a class="nav-cta" href="${ctaHref}">${ctaLabel}</a>
    </div>
  </nav>
</div>`
}

export function renderPublicFooter(options: PublicFooterOptions = {}): string {
  const copy =
    options.copy ??
    `DJD Agent Score helps apps and agent operators screen wallets before payouts, paid routes, and settlement on Base. Questions? Contact ${getSupportEmail()}.`

  return `
<footer class="site-footer">
  <div class="site-footer-inner">
    <div class="footer-copy">${copy}</div>
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/directory">Directory</a>
      <a href="/certify">Certify</a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">Docs</a>
      <a href="/blog">Blog</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </div>
  </div>
</footer>
</body>
</html>`
}

export function renderPublicPage(options: PublicShellOptions): string {
  const {
    title,
    description,
    path,
    nav,
    ctaHref,
    ctaLabel,
    footerCopy,
    extraCss = '',
    content,
    ogType,
    extraHead,
  } = options

  return `${renderPublicHeadStart({ title, description, path, ogType, extraHead })}${extraCss}${renderPublicNav(
    nav,
    ctaHref,
    ctaLabel,
  )}${content}${renderPublicFooter({ copy: footerCopy })}`
}
