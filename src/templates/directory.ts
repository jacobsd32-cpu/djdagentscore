import { buildPublicUrl } from '../config/public.js'

interface DirectoryPageParams {
  limit?: string | null
  tier?: string | null
  search?: string | null
  sort?: string | null
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeField(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

export function directoryPageHtml(params: DirectoryPageParams = {}): string {
  const directoryUrl = buildPublicUrl('/directory')
  const directoryApiUrl = buildPublicUrl('/v1/certification/directory')
  const certifyUrl = buildPublicUrl('/certify')
  const docsUrl = buildPublicUrl('/docs')
  const explorerUrl = buildPublicUrl('/explorer')
  const pricingUrl = buildPublicUrl('/pricing')

  const initialLimit = normalizeField(params.limit) || '24'
  const initialTier = normalizeField(params.tier)
  const initialSearch = normalizeField(params.search)
  const initialSort = normalizeField(params.sort) || 'score'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trusted Endpoint Directory - DJD Agent Score</title>
<meta name="description" content="Browse DJD-certified agents and trusted endpoints with score context, confidence, standards links, evaluator previews, and Certify actions.">
<meta property="og:type" content="website">
<meta property="og:title" content="Trusted Endpoint Directory - DJD Agent Score">
<meta property="og:description" content="Search certified endpoints by wallet, profile, tier, score, and confidence. Move from raw wallets to inspectable trust surfaces.">
<meta property="og:url" content="${directoryUrl}">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#07131f; --bg2:#0c1e30; --bg3:#11263b; --surface:#11233a; --surface2:#162d48;
  --border:rgba(129,140,248,0.12); --border-hi:rgba(129,140,248,0.22);
  --text:#eef2ff; --text-dim:#a5b4cc; --text-muted:#64748b;
  --accent:#7dd3fc; --accent-2:#818cf8; --accent-dim:rgba(125,211,252,0.10);
  --green:#34d399; --green-dim:rgba(52,211,153,0.08);
  --yellow:#fbbf24; --yellow-dim:rgba(251,191,36,0.08);
  --radius:18px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  min-height:100vh;
  color:var(--text);
  font-family:'DM Sans',sans-serif;
  background:
    radial-gradient(circle at top left, rgba(129,140,248,0.18), transparent 30%),
    radial-gradient(circle at top right, rgba(125,211,252,0.16), transparent 28%),
    linear-gradient(180deg, #07131f 0%, #0a1628 48%, #08111d 100%);
  -webkit-font-smoothing:antialiased;
}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:none}
.mono{font-family:'JetBrains Mono',monospace}
.nav-outer{position:sticky;top:0;z-index:50;background:rgba(7,19,31,0.82);backdrop-filter:blur(18px);border-bottom:1px solid var(--border)}
nav{max-width:1140px;margin:0 auto;padding:0 28px;height:66px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.logo{display:flex;align-items:center;gap:8px;color:var(--accent);font-weight:700;font-size:17px;text-decoration:none}
.logo span{color:var(--text-dim);font-weight:400}
.nav-links{display:flex;align-items:center;gap:20px}
.nav-links a{color:var(--text-muted);font-size:13px;font-weight:500}
.nav-links a.active,.nav-links a:hover{color:var(--accent)}
.nav-cta{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:999px;background:var(--accent-2);color:#f8fafc;font-size:12px;font-weight:700}
.wrap{max-width:1140px;margin:0 auto;padding:0 28px 72px}
.hero{padding:72px 0 40px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:var(--accent-dim);border:1px solid var(--border-hi);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:20px}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,0.8fr);gap:24px;align-items:end}
.hero h1{font-family:'Instrument Serif',serif;font-size:clamp(38px,5vw,60px);font-weight:400;line-height:1.04;letter-spacing:-1px;max-width:720px}
.hero h1 em{color:var(--accent);font-style:italic}
.hero p{margin-top:16px;font-size:18px;color:var(--text-dim);line-height:1.8;max-width:700px}
.hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:13px 22px;border-radius:11px;font-size:14px;font-weight:700;transition:transform .18s ease, opacity .18s ease}
.btn:hover{transform:translateY(-1px)}
.btn-primary{background:var(--accent);color:#08111d}
.btn-ghost{border:1px solid var(--border-hi);color:var(--text-dim);background:rgba(17,38,59,0.45)}
.stats-card{background:linear-gradient(180deg, rgba(17,38,59,0.96), rgba(12,30,48,0.92));border:1px solid var(--border);border-radius:var(--radius);padding:22px}
.stats-label{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
.stats-copy{font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:18px}
.stats-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stats-metric{background:rgba(7,19,31,0.65);border:1px solid var(--border);border-radius:12px;padding:12px}
.stats-k{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.stats-v{font-size:16px;font-weight:700}
.section{padding-top:22px}
.panel{background:rgba(12,30,48,0.84);border:1px solid var(--border);border-radius:var(--radius);padding:24px}
.controls{display:grid;grid-template-columns:2.1fr 1fr 1fr 120px auto;gap:12px;align-items:end}
.field label{display:block;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px}
.input,.select{width:100%;background:#07131f;border:1px solid var(--border-hi);border-radius:12px;color:var(--text);padding:14px 15px;font-size:14px;outline:none}
.input:focus,.select:focus{border-color:var(--accent)}
.submit{height:48px;border:none;border-radius:12px;background:var(--accent-2);color:#eef2ff;font-size:14px;font-weight:700;cursor:pointer}
.meta-row{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;margin:18px 0 6px}
.meta-title{font-family:'Instrument Serif',serif;font-size:32px;font-weight:400}
.meta-copy{font-size:14px;color:var(--text-dim);line-height:1.7}
.meta-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:rgba(129,140,248,0.10);border:1px solid var(--border-hi);font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)}
.results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:22px}
.empty{padding:30px;border:1px dashed var(--border-hi);border-radius:16px;background:rgba(7,19,31,0.5);text-align:center;color:var(--text-dim);font-size:14px;line-height:1.8}
.card{background:linear-gradient(180deg, rgba(17,35,58,0.92), rgba(12,30,48,0.92));border:1px solid var(--border);border-radius:16px;padding:22px}
.card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
.card-title{font-size:20px;font-weight:700;line-height:1.2}
.card-wallet{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);word-break:break-all;margin-top:5px}
.tier-pill,.score-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:7px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700}
.tier-pill{background:rgba(125,211,252,0.10);color:var(--accent)}
.score-pill{background:rgba(52,211,153,0.10);color:var(--green)}
.card-copy{font-size:14px;color:var(--text-dim);line-height:1.75;min-height:48px;margin-bottom:16px}
.signal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}
.signal{border:1px solid var(--border);border-radius:12px;background:rgba(7,19,31,0.55);padding:12px}
.signal-k{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:7px}
.signal-v{font-size:14px;font-weight:700}
.profile-links{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.profile-link{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border-radius:999px;background:rgba(125,211,252,0.08);border:1px solid var(--border);font-size:12px;color:var(--text-dim)}
.profile-link:hover{border-color:var(--border-hi);color:var(--accent)}
.surface-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.surface-link{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border-radius:12px;background:rgba(7,19,31,0.55);border:1px solid var(--border);color:var(--text)}
.surface-link:hover{border-color:var(--border-hi);color:var(--accent)}
.surface-title{font-size:12px;font-weight:700}
.surface-meta{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-top:4px}
.surface-arrow{font-family:'JetBrains Mono',monospace;font-size:15px;color:var(--accent)}
.foot-note{margin-top:22px;font-size:13px;color:var(--text-muted);line-height:1.75}
.foot-note code{font-family:'JetBrains Mono',monospace;color:var(--accent)}
footer{margin-top:60px;padding-top:24px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
.footer-copy{font-size:12px;color:var(--text-muted)}
.footer-links{display:flex;gap:14px;flex-wrap:wrap}
.footer-links a{font-size:12px;color:var(--text-muted)}
.footer-links a:hover{color:var(--accent)}
@media(max-width:980px){
  .hero-grid,.results,.controls{grid-template-columns:1fr}
  .stats-list,.signal-grid,.surface-links{grid-template-columns:1fr}
}
@media(max-width:720px){
  nav,.wrap{padding-left:20px;padding-right:20px}
  .nav-links{gap:14px;flex-wrap:wrap;justify-content:flex-end}
}
</style>
</head>
<body>
<div class="nav-outer">
  <nav>
    <a class="logo" href="/">DJD<span> Agent Score</span></a>
    <div class="nav-links">
      <a href="/explorer">Explorer</a>
      <a href="/directory" class="active">Directory</a>
      <a href="/certify">Certify</a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">API Docs</a>
      <a class="nav-cta" href="${certifyUrl}">Get Certified</a>
    </div>
  </nav>
</div>

<div class="wrap">
  <section class="hero">
    <div class="chip">Trusted Endpoint Directory</div>
    <div class="hero-grid">
      <div>
        <h1>Browse certified agents as <em>inspectable trust surfaces</em></h1>
        <p>Move beyond a bare wallet list. This directory packages certification status, score context, profile metadata, standards documents, evaluator previews, and Certify actions into a market-facing discovery surface.</p>
        <div class="hero-actions">
          <a href="${certifyUrl}" class="btn btn-primary">Open Certify</a>
          <a href="${docsUrl}" class="btn btn-ghost">Read the API</a>
          <a href="${explorerUrl}" class="btn btn-ghost">Open Explorer</a>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-label">What this surface does</div>
        <div class="stats-copy">The directory is the human-facing wrapper around <span class="mono">GET /v1/certification/directory</span>, with search, tier filters, and sort modes for counterparties and marketplaces.</div>
        <div class="stats-list">
          <div class="stats-metric">
            <div class="stats-k">Search</div>
            <div class="stats-v">Wallets, names, bios</div>
          </div>
          <div class="stats-metric">
            <div class="stats-k">Sort</div>
            <div class="stats-v">Score, confidence, recency</div>
          </div>
          <div class="stats-metric">
            <div class="stats-k">Links</div>
            <div class="stats-v">Profile, standards, evaluator</div>
          </div>
          <div class="stats-metric">
            <div class="stats-k">Next step</div>
            <div class="stats-v">Certify or inspect</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="panel">
      <form id="directoryForm">
        <div class="controls">
          <div class="field">
            <label for="searchInput">Search</label>
            <input class="input" id="searchInput" name="search" type="text" value="${escapeHtml(initialSearch)}" placeholder="Search certified agents, wallets, bios, GitHub, or websites">
          </div>
          <div class="field">
            <label for="tierSelect">Tier</label>
            <select class="select" id="tierSelect" name="tier">
              <option value="">All tiers</option>
              <option value="Emerging"${initialTier === 'Emerging' ? ' selected' : ''}>Emerging</option>
              <option value="Established"${initialTier === 'Established' ? ' selected' : ''}>Established</option>
              <option value="Trusted"${initialTier === 'Trusted' ? ' selected' : ''}>Trusted</option>
              <option value="Elite"${initialTier === 'Elite' ? ' selected' : ''}>Elite</option>
            </select>
          </div>
          <div class="field">
            <label for="sortSelect">Sort</label>
            <select class="select" id="sortSelect" name="sort">
              <option value="score"${initialSort === 'score' ? ' selected' : ''}>Top score</option>
              <option value="confidence"${initialSort === 'confidence' ? ' selected' : ''}>Highest confidence</option>
              <option value="recent"${initialSort === 'recent' ? ' selected' : ''}>Newest first</option>
              <option value="name"${initialSort === 'name' ? ' selected' : ''}>Name A-Z</option>
            </select>
          </div>
          <div class="field">
            <label for="limitSelect">Limit</label>
            <select class="select" id="limitSelect" name="limit">
              <option value="12"${initialLimit === '12' ? ' selected' : ''}>12</option>
              <option value="24"${initialLimit === '24' ? ' selected' : ''}>24</option>
              <option value="48"${initialLimit === '48' ? ' selected' : ''}>48</option>
              <option value="100"${initialLimit === '100' ? ' selected' : ''}>100</option>
            </select>
          </div>
          <button class="submit" type="submit">Apply</button>
        </div>
      </form>

      <div class="meta-row">
        <div>
          <div class="meta-title">Certified directory results</div>
          <div class="meta-copy" id="directorySummary">Loading certified endpoints…</div>
        </div>
        <div class="meta-pill" id="directoryMeta">Preparing query…</div>
      </div>

      <div class="results" id="directoryResults"></div>
      <div class="foot-note">Machine-readable surface: <code>${directoryApiUrl}</code>. Use <code>search</code>, <code>tier</code>, <code>sort</code>, and <code>limit</code> to tune the result set.</div>
    </div>
  </section>

  <footer>
    <div class="footer-copy">DJD Agent Score is experimental trust infrastructure for the agent economy. Certification is an inspectable signal, not a guarantee.</div>
    <div class="footer-links">
      <a href="/certify">Certify</a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">API Docs</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
    </div>
  </footer>
</div>

<script>
const DIRECTORY_API_URL = ${JSON.stringify(directoryApiUrl)};
const CERTIFY_URL = ${JSON.stringify(certifyUrl)};
const PRICING_URL = ${JSON.stringify(pricingUrl)};

function escapeHtml(value){
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function fmtDate(value){
  if(!value) return 'Unknown';
  try {
    return new Date(value).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  } catch {
    return value;
  }
}

function fmtConfidence(value){
  if(typeof value !== 'number') return 'N/A';
  return Math.round(value * 100) + '%';
}

function fmtScore(entry){
  return entry.current_score && typeof entry.current_score.score === 'number'
    ? entry.current_score.score
    : entry.certification.score_at_certification;
}

function updateUrl(params){
  const url = new URL(window.location.href);
  ['search','tier','sort','limit'].forEach((key)=>{
    const value = params.get(key);
    if(value) url.searchParams.set(key,value);
    else url.searchParams.delete(key);
  });
  window.history.replaceState({},'',url);
}

function renderEntry(entry){
  const profileName = entry.profile.name || entry.wallet;
  const description = entry.profile.description || 'Certified endpoint with active DJD certification and linked trust surfaces.';
  const profileLinks = [
    entry.profile.website_url ? '<a class="profile-link" href="' + escapeHtml(entry.profile.website_url) + '" target="_blank" rel="noreferrer">Website</a>' : '',
    entry.profile.github_url ? '<a class="profile-link" href="' + escapeHtml(entry.profile.github_url) + '" target="_blank" rel="noreferrer">GitHub' + (entry.profile.github_verified ? ' verified' : '') + '</a>' : '',
  ].filter(Boolean).join('');

  return '<article class="card">' +
    '<div class="card-head">' +
      '<div>' +
        '<div class="card-title">' + escapeHtml(profileName) + '</div>' +
        '<div class="card-wallet">' + escapeHtml(entry.wallet) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
        '<span class="tier-pill">' + escapeHtml(entry.certification.tier) + '</span>' +
        '<span class="score-pill">Score ' + escapeHtml(String(fmtScore(entry))) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="card-copy">' + escapeHtml(description) + '</div>' +
    '<div class="signal-grid">' +
      '<div class="signal"><div class="signal-k">Confidence</div><div class="signal-v">' + escapeHtml(fmtConfidence(entry.current_score.confidence)) + '</div></div>' +
      '<div class="signal"><div class="signal-k">Certified</div><div class="signal-v">' + escapeHtml(fmtDate(entry.certification.granted_at)) + '</div></div>' +
      '<div class="signal"><div class="signal-k">Expires</div><div class="signal-v">' + escapeHtml(fmtDate(entry.certification.expires_at)) + '</div></div>' +
    '</div>' +
    (profileLinks ? '<div class="profile-links">' + profileLinks + '</div>' : '') +
    '<div class="surface-links">' +
      '<a class="surface-link" href="' + escapeHtml(entry.links.agent_profile) + '"><div><div class="surface-title">Agent profile</div><div class="surface-meta">Context</div></div><div class="surface-arrow">→</div></a>' +
      '<a class="surface-link" href="' + escapeHtml(entry.links.standards_document) + '"><div><div class="surface-title">ERC-8004 document</div><div class="surface-meta">Standards</div></div><div class="surface-arrow">→</div></a>' +
      '<a class="surface-link" href="' + escapeHtml(entry.links.evaluator_preview) + '"><div><div class="surface-title">Evaluator preview</div><div class="surface-meta">Paid settlement</div></div><div class="surface-arrow">→</div></a>' +
      '<a class="surface-link" href="' + escapeHtml(entry.links.certify_readiness) + '"><div><div class="surface-title">Certify path</div><div class="surface-meta">Wallet context</div></div><div class="surface-arrow">→</div></a>' +
    '</div>' +
  '</article>';
}

function getFormParams(){
  const form = document.getElementById('directoryForm');
  const params = new URLSearchParams();
  const search = form.search.value.trim();
  const tier = form.tier.value.trim();
  const sort = form.sort.value.trim();
  const limit = form.limit.value.trim();
  if(search) params.set('search', search);
  if(tier) params.set('tier', tier);
  if(sort) params.set('sort', sort);
  if(limit) params.set('limit', limit);
  return params;
}

async function loadDirectory(){
  const summary = document.getElementById('directorySummary');
  const meta = document.getElementById('directoryMeta');
  const results = document.getElementById('directoryResults');
  const params = getFormParams();
  updateUrl(params);
  summary.textContent = 'Loading certified endpoints…';
  meta.textContent = 'Fetching live directory';
  results.innerHTML = '';

  try{
    const response = await fetch(DIRECTORY_API_URL + '?' + params.toString());
    const body = await response.json();

    if(!response.ok){
      throw new Error(body && body.error && body.error.message ? body.error.message : 'Directory request failed');
    }

    const returned = typeof body.returned === 'number' ? body.returned : 0;
    const total = typeof body.total === 'number' ? body.total : returned;
    const tier = body.filters && body.filters.tier ? body.filters.tier : 'all tiers';
    const sort = body.filters && body.filters.sort ? body.filters.sort : 'score';
    summary.textContent = 'Showing ' + returned + ' of ' + total + ' certified endpoints for ' + tier + '.';
    meta.textContent = 'Sorted by ' + sort + ' • As of ' + fmtDate(body.as_of);

    if(!Array.isArray(body.certifications) || body.certifications.length === 0){
      results.innerHTML = '<div class="empty">No certified endpoints matched this filter set yet. Try broadening the search, changing the tier, or <a href="' + escapeHtml(CERTIFY_URL) + '">opening Certify</a> to see how wallets become eligible.</div>';
      return;
    }

    results.innerHTML = body.certifications.map(renderEntry).join('');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load directory right now.';
    summary.textContent = 'Directory unavailable';
    meta.textContent = 'Try again shortly';
    results.innerHTML = '<div class="empty">' + escapeHtml(message) + '</div>';
  }
}

document.getElementById('directoryForm').addEventListener('submit', function(event){
  event.preventDefault();
  loadDirectory();
});

loadDirectory();
</script>
</body>
</html>`
}
