import { buildPublicUrl } from '../config/public.js'
import { renderPublicPage } from './publicPage.js'

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

const directoryCss = `
.directory-hero{
  display:grid;
  grid-template-columns:minmax(0,1.15fr) minmax(280px,0.85fr);
  gap:18px;
  align-items:stretch;
}
.directory-note{
  padding:24px;
  border-radius:18px;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.9), rgba(12,27,45,0.92));
}
.directory-note-copy{
  color:var(--text-dim);
  font-size:14px;
  line-height:1.78;
  margin-bottom:18px;
}
.directory-list{
  display:grid;
  gap:10px;
}
.directory-list li{
  position:relative;
  list-style:none;
  padding-left:18px;
  color:var(--text-dim);
  font-size:13px;
  line-height:1.72;
}
.directory-list li::before{
  content:'';
  position:absolute;
  left:0;
  top:9px;
  width:7px;
  height:7px;
  border-radius:999px;
  background:var(--green);
}
.panel-shell{
  padding:24px;
  border-radius:18px;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.9), rgba(12,27,45,0.92));
}
.controls{
  display:grid;
  grid-template-columns:2.1fr 1fr 1fr 120px auto;
  gap:12px;
  align-items:end;
}
.submit{
  height:48px;
  border:none;
  border-radius:12px;
  background:linear-gradient(135deg, rgba(129,140,248,0.92), rgba(125,211,252,0.88));
  color:#08111d;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
}
.meta-row{
  display:flex;
  justify-content:space-between;
  gap:16px;
  align-items:center;
  flex-wrap:wrap;
  margin:20px 0 8px;
}
.meta-title{
  font-family:'Instrument Serif',serif;
  font-size:32px;
  font-weight:400;
  letter-spacing:-0.03em;
}
.meta-copy{
  color:var(--text-dim);
  font-size:14px;
  line-height:1.72;
}
.meta-pill{
  display:inline-flex;
  align-items:center;
  padding:8px 12px;
  border-radius:999px;
  border:1px solid var(--border-hi);
  background:rgba(129,140,248,0.12);
  color:var(--text-dim);
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  font-weight:600;
}
.results{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:18px;
  margin-top:22px;
}
.empty{
  padding:30px;
  border:1px dashed var(--border-hi);
  border-radius:16px;
  background:rgba(7,17,31,0.45);
  text-align:center;
  color:var(--text-dim);
  font-size:14px;
  line-height:1.8;
}
.card{
  background:linear-gradient(180deg, rgba(17,35,58,0.92), rgba(12,30,48,0.92));
}
.card-head{
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:flex-start;
  margin-bottom:12px;
}
.card-title{
  font-size:20px;
}
.card-wallet{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  word-break:break-all;
  margin-top:5px;
}
.tier-pill,.score-pill{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:999px;
  padding:7px 10px;
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  font-weight:700;
}
.tier-pill{background:rgba(125,211,252,0.10);color:var(--accent)}
.score-pill{background:rgba(52,211,153,0.10);color:var(--green)}
.signal-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
  margin-bottom:16px;
}
.signal{
  padding:12px;
  border-radius:12px;
  border:1px solid var(--border);
  background:rgba(7,17,31,0.52);
}
.signal-k{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:9px;
  font-weight:700;
  letter-spacing:0.08em;
  text-transform:uppercase;
  margin-bottom:7px;
}
.signal-v{
  font-size:14px;
  font-weight:700;
}
.profile-links{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:16px;
}
.profile-link{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:8px 10px;
  border-radius:999px;
  border:1px solid var(--border);
  background:rgba(125,211,252,0.08);
  color:var(--text-dim);
  font-size:12px;
  font-weight:600;
}
.profile-link:hover{
  color:var(--accent);
  border-color:var(--border-hi);
}
.surface-links{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
}
.surface-link{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:12px;
  border-radius:12px;
  border:1px solid var(--border);
  background:rgba(7,17,31,0.52);
  color:var(--text);
}
.surface-link:hover{
  color:var(--accent);
  border-color:var(--border-hi);
}
.surface-title{
  font-size:12px;
  font-weight:700;
}
.surface-meta{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:9px;
  font-weight:700;
  letter-spacing:0.08em;
  text-transform:uppercase;
  margin-top:4px;
}
.surface-arrow{
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
  font-size:15px;
}
.foot-note{
  margin-top:22px;
  color:var(--text-muted);
  font-size:13px;
  line-height:1.78;
}
.foot-note code{
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
}
@media(max-width:980px){
  .directory-hero,
  .results,
  .controls,
  .signal-grid,
  .surface-links{grid-template-columns:1fr}
}
`

export function directoryPageHtml(params: DirectoryPageParams = {}): string {
  const directoryApiUrl = buildPublicUrl('/v1/certification/directory')
  const certifyUrl = buildPublicUrl('/certify')
  const docsUrl = buildPublicUrl('/docs')
  const explorerUrl = buildPublicUrl('/explorer')

  const initialLimit = normalizeField(params.limit) || '24'
  const initialTier = normalizeField(params.tier)
  const initialSearch = normalizeField(params.search)
  const initialSort = normalizeField(params.sort) || 'score'

  return renderPublicPage({
    title: 'Trusted Endpoint Directory — DJD Agent Score',
    description:
      'Browse DJD-certified agents and trusted endpoints with score context, confidence, standards links, evaluator previews, and Certify actions.',
    path: '/directory',
    nav: 'directory',
    ctaHref: certifyUrl,
    ctaLabel: 'Get Certified',
    extraCss: directoryCss,
    content: `
<main class="site-shell">
  <section class="hero">
    <div class="directory-hero">
      <div>
        <span class="eyebrow">Trusted Endpoint Directory</span>
        <h1 class="display">Browse certified agents as <em>inspectable trust surfaces</em></h1>
        <p class="lede">This directory is the market-facing wrapper around DJD certification. It moves beyond a wallet list and packages certification status, score context, profile metadata, standards documents, evaluator previews, and Certify actions into a discoverable surface.</p>
        <div class="action-row">
          <a class="button button-primary" href="${certifyUrl}">Open Certify</a>
          <a class="button button-secondary" href="${docsUrl}">Read the API</a>
          <a class="button button-secondary" href="${explorerUrl}">Open explorer</a>
        </div>
      </div>
      <aside class="directory-note">
        <div class="metric-label">What this surface does</div>
        <div class="directory-note-copy">The directory is the human-facing wrapper around <span class="mono">GET /v1/certification/directory</span>, with search, tier filters, and sort modes for counterparties, operators, and marketplaces.</div>
        <ul class="directory-list">
          <li>Search certified agents, wallets, bios, GitHub, or websites.</li>
          <li>Filter by tier and sort by score, confidence, recency, or name.</li>
          <li>Jump directly into the agent profile, standards document, evaluator preview, or wallet-specific Certify path.</li>
        </ul>
      </aside>
    </div>
  </section>

  <section class="section">
    <div class="panel-shell">
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
</main>

<script>
const DIRECTORY_API_URL = ${JSON.stringify(directoryApiUrl)};
const CERTIFY_URL = ${JSON.stringify(certifyUrl)};

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
</script>`,
  })
}
