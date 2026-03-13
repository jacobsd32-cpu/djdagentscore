import { buildPublicUrl } from '../config/public.js'

export function certifyPageHtml(): string {
  const certifyUrl = buildPublicUrl('/certify')
  const directoryUrl = buildPublicUrl('/directory')
  const readinessUrl = buildPublicUrl('/v1/certification/readiness')
  const reviewUrl = buildPublicUrl('/v1/certification/review')
  const pricingUrl = buildPublicUrl('/pricing')
  const docsUrl = buildPublicUrl('/docs')
  const explorerUrl = buildPublicUrl('/explorer')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Certify - DJD Agent Score</title>
<meta name="description" content="DJD Certify turns scoring and identity signals into public trust infrastructure: directory listings, badges, standards documents, and evaluator-ready status.">
<meta property="og:type" content="website">
<meta property="og:title" content="Certify - DJD Agent Score">
<meta property="og:description" content="Directory listing, certification status, badge surfaces, ERC-8004 compatibility, and evaluator-ready trust context for agent wallets.">
<meta property="og:url" content="${certifyUrl}">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a1628; --bg2: #0d1b2a; --bg3: #132238;
  --surface: #162740; --surface2: #1a3050;
  --border: rgba(99,102,241,0.10); --border-hi: rgba(99,102,241,0.18);
  --text: #f0f2f5; --text-dim: #94a3b8; --text-muted: #4b5c73;
  --accent: #6366f1; --accent-dim: rgba(99,102,241,0.08);
  --green: #34d399; --green-dim: rgba(52,211,153,0.08);
  --yellow: #fbbf24; --yellow-dim: rgba(251,191,36,0.08);
  --radius: 16px;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.mono{font-family:'JetBrains Mono',monospace}
.nav-outer{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(10,22,40,0.82);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
nav{max-width:1080px;margin:0 auto;padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between}
.logo{font-weight:700;font-size:17px;color:var(--accent);letter-spacing:-0.3px;display:flex;align-items:center;gap:8px;text-decoration:none}
.logo:hover{text-decoration:none}
.logo span{color:var(--text-dim);font-weight:400}
.nav-links{display:flex;gap:24px;align-items:center}
.nav-links a{color:var(--text-muted);text-decoration:none;font-size:13px;font-weight:500;transition:color .2s}
.nav-links a:hover{color:var(--accent)}
.nav-links .active{color:var(--accent)}
.nav-links .nav-cta{color:var(--bg);background:var(--accent);padding:7px 18px;border-radius:8px;font-weight:600;font-size:12px}
.wrap{max-width:1080px;margin:0 auto;padding:0 32px}
.hero{padding:120px 0 52px;text-align:center;max-width:780px;margin:0 auto}
.hero-chip{display:inline-flex;align-items:center;gap:8px;background:var(--accent-dim);border:1px solid var(--border-hi);border-radius:999px;padding:7px 14px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--accent);margin-bottom:22px}
.hero h1{font-family:'Instrument Serif',serif;font-size:clamp(38px,5vw,58px);font-weight:400;line-height:1.08;letter-spacing:-1px;margin-bottom:16px}
.hero h1 em{font-style:italic;color:var(--accent)}
.hero p{font-size:18px;color:var(--text-dim);line-height:1.8;max-width:640px;margin:0 auto}
.hero-actions{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:28px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:13px 24px;border-radius:10px;font-size:14px;font-weight:600;transition:all .2s;text-decoration:none}
.btn:hover{text-decoration:none;transform:translateY(-1px)}
.btn-primary{background:var(--accent);color:var(--bg)}
.btn-primary:hover{opacity:.9}
.btn-ghost{background:transparent;border:1px solid var(--border-hi);color:var(--text-dim)}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin:0 0 56px}
.strip-card{background:var(--bg2);padding:28px 24px}
.strip-k{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}
.strip-card h3{font-size:16px;margin-bottom:8px}
.strip-card p{font-size:14px;color:var(--text-dim);line-height:1.7}
.section{padding:0 0 56px}
.section-label{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);letter-spacing:2px;text-transform:uppercase;text-align:center;margin-bottom:12px}
.section-title{font-family:'Instrument Serif',serif;font-size:clamp(30px,3.7vw,42px);font-weight:400;letter-spacing:-0.6px;text-align:center;margin-bottom:10px}
.section-desc{font-size:16px;color:var(--text-dim);line-height:1.75;max-width:680px;text-align:center;margin:0 auto 36px}
.surface-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.surface-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px}
.surface-tag{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);letter-spacing:1.6px;text-transform:uppercase;margin-bottom:12px}
.surface-card h3{font-size:18px;margin-bottom:10px}
.surface-card p{font-size:14px;color:var(--text-dim);line-height:1.75;margin-bottom:16px}
.surface-list{list-style:none;font-size:13px;color:var(--text-dim);line-height:1.9}
.surface-list li::before{content:'\\2713';color:var(--green);font-weight:700;margin-right:8px}
.endpoint-table{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.endpoint-row{display:grid;grid-template-columns:1fr 110px 88px;padding:15px 20px;border-bottom:1px solid var(--border);align-items:center;gap:12px}
.endpoint-row:last-child{border-bottom:none}
.endpoint-row.head{background:var(--bg3);font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase}
.endpoint-path{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);margin-bottom:4px}
.endpoint-desc{font-size:13px;color:var(--text-dim);line-height:1.6}
.endpoint-price{font-family:'JetBrains Mono',monospace;font-size:12px;text-align:right}
.endpoint-method{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted);text-align:right}
.price-free{color:var(--green)}
.price-paid{color:var(--yellow)}
.readiness-shell{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px}
.readiness-row{display:flex;gap:12px;align-items:center}
.readiness-input{flex:1;background:var(--bg);border:1px solid var(--border-hi);border-radius:10px;padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--text);outline:none}
.readiness-input:focus{border-color:var(--accent)}
.readiness-button{background:var(--accent);color:var(--bg);border:none;border-radius:10px;padding:14px 22px;font-size:14px;font-weight:700;cursor:pointer}
.readiness-button:disabled{opacity:.45;cursor:not-allowed}
.readiness-note{font-size:11px;color:var(--text-muted);margin-top:10px;font-family:'JetBrains Mono',monospace}
.readiness-result{margin-top:18px}
.readiness-empty{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:18px;color:var(--text-muted);font-size:13px;line-height:1.7}
.readiness-panel{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:20px}
.readiness-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.readiness-title{font-size:18px;font-weight:700}
.readiness-status{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;border-radius:999px;padding:4px 8px}
.readiness-status-ok{color:var(--green);background:var(--green-dim)}
.readiness-status-warn{color:var(--yellow);background:var(--yellow-dim)}
.readiness-wallet{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);word-break:break-all;margin-bottom:12px}
.readiness-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.readiness-metric{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px}
.readiness-metric-label{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.readiness-metric-value{font-size:13px;font-weight:600}
.readiness-list{margin:0 0 16px;padding-left:18px;color:var(--text-dim);font-size:13px;line-height:1.8}
.readiness-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.readiness-link{display:inline-flex;align-items:center;gap:6px;padding:10px 12px;border-radius:10px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12px;text-decoration:none}
.readiness-link:hover{border-color:var(--border-hi);color:var(--accent);text-decoration:none}
.readiness-action-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.readiness-action-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 14px;border-radius:10px;background:var(--accent);border:none;color:var(--bg);font-size:12px;font-weight:700;cursor:pointer}
.readiness-action-btn:disabled{opacity:.45;cursor:not-allowed}
.readiness-review{margin-top:14px;background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px}
.readiness-review-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.readiness-review-title{font-size:14px;font-weight:700}
.readiness-review-note{font-size:12px;color:var(--text-dim);line-height:1.7}
.readiness-review-meta{margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);line-height:1.8}
.readiness-code{margin-top:14px;background:#08101d;border:1px solid var(--border);border-radius:12px;padding:16px;overflow:auto}
.readiness-code-label{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.readiness-code pre{font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.7;color:var(--text-dim);white-space:pre-wrap}
.callout{background:linear-gradient(180deg,rgba(99,102,241,0.06) 0%,rgba(13,27,42,0.9) 100%);border:1px solid var(--border-hi);border-radius:var(--radius);padding:34px 32px;text-align:center}
.callout h2{font-family:'Instrument Serif',serif;font-size:34px;font-weight:400;margin-bottom:12px}
.callout p{font-size:16px;color:var(--text-dim);line-height:1.75;max-width:680px;margin:0 auto 24px}
footer{border-top:1px solid var(--border);padding:36px 0 48px;margin-top:72px}
.ft-bot{display:flex;justify-content:space-between;align-items:center}
.ft-l{font-size:12px;color:var(--text-muted)}
.ft-links{display:flex;gap:18px}
.ft-links a{font-size:12px;color:var(--text-muted);text-decoration:none}
.ft-links a:hover{color:var(--accent)}
@media(max-width:900px){
  .strip,.surface-grid,.readiness-grid{grid-template-columns:1fr}
}
@media(max-width:768px){
  nav{padding:0 20px}
  .wrap{padding:0 20px}
  .nav-links{gap:14px}
  .readiness-row{flex-direction:column;align-items:stretch}
  .endpoint-row{grid-template-columns:1fr 88px}
  .endpoint-method{display:none}
  .ft-bot{flex-direction:column;gap:12px;text-align:center}
}
</style>
</head>
<body>
<div class="nav-outer">
  <nav>
    <a class="logo" href="/">DJD<span> Agent Score</span></a>
    <div class="nav-links">
      <a href="/explorer">Explorer</a>
      <a href="/certify" class="active">Certify</a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">API Docs</a>
      <a class="nav-cta" href="${directoryUrl}">Browse Directory</a>
    </div>
  </nav>
</div>

<div class="wrap">
  <div class="hero">
    <div class="hero-chip">Certification for autonomous agents</div>
    <h1>Turn score and identity into <em>public trust infrastructure</em></h1>
    <p>DJD Certify packages scoring, identity context, and monitoring into surfaces that counterparties can actually inspect: directory listings, certification status, badges, ERC-8004 documents, and evaluator-ready links.</p>
    <div class="hero-actions">
      <a href="${directoryUrl}" class="btn btn-primary">Browse Certified Directory</a>
      <a href="${pricingUrl}" class="btn btn-ghost">View Pricing</a>
      <a href="${docsUrl}" class="btn btn-ghost">Open API Docs</a>
    </div>
  </div>

  <div class="strip">
    <div class="strip-card">
      <div class="strip-k">Step 1</div>
      <h3>Register your agent</h3>
      <p>Attach a name, website, and GitHub context so counterparties see more than a bare wallet address.</p>
    </div>
    <div class="strip-card">
      <div class="strip-k">Step 2</div>
      <h3>Apply via x402</h3>
      <p>Certification is purchased through a one-time x402 payment, which gives the surface a real issuance and review boundary.</p>
    </div>
    <div class="strip-card">
      <div class="strip-k">Step 3</div>
      <h3>Ship trust everywhere</h3>
      <p>Once certified, your wallet can appear in the public directory, expose badges, and feed evaluator and standards surfaces.</p>
    </div>
  </div>

  <section class="section">
    <div class="section-label">What you get</div>
    <div class="section-title">One certification, multiple trust outputs</div>
    <div class="section-desc">Certify is the product wrapper around DJD's scoring, profile, monitoring, and standards work. It is designed to make settlement and discovery easier for counterparties, not just prettier for dashboards.</div>
    <div class="surface-grid">
      <div class="surface-card">
        <div class="surface-tag">Directory</div>
        <h3>Public directory distribution</h3>
        <p>Certified agents show up in a browsable directory with score tier, confidence, profile metadata, badge links, and evaluator paths.</p>
        <ul class="surface-list">
          <li>Free public listing surface</li>
          <li>Current score context attached</li>
          <li>Direct links to profile and standards document</li>
        </ul>
      </div>
      <div class="surface-card">
        <div class="surface-tag">Status</div>
        <h3>Certification status and badge</h3>
        <p>Every certified wallet gets a machine-readable status endpoint plus embeddable badge surfaces for docs, marketplaces, and profiles.</p>
        <ul class="surface-list">
          <li>Wallet-specific certification status</li>
          <li>Embeddable certification and score badges</li>
          <li>Expiration and tier visibility</li>
        </ul>
      </div>
      <div class="surface-card">
        <div class="surface-tag">Standards</div>
        <h3>ERC-8004-compatible score document</h3>
        <p>Certification feeds into a standards-facing score document that includes registration, certification, scoring, and publication context.</p>
        <ul class="surface-list">
          <li>Free wallet document endpoint</li>
          <li>Good fit for publishing and caching</li>
          <li>Built from the live scoring surface</li>
        </ul>
      </div>
      <div class="surface-card">
        <div class="surface-tag">Evaluation</div>
        <h3>Evaluator-ready settlement context</h3>
        <p>Pair certification with the evaluator preview endpoint to return approve, review, or reject decisions with rationale and linked evidence.</p>
        <ul class="surface-list">
          <li>Certification signal included in evaluation</li>
          <li>Useful for routing high-risk payments</li>
          <li>Bridges Certify and standards work</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-label">Readiness</div>
    <div class="section-title">Check certification readiness</div>
    <div class="section-desc">Paste a wallet to see whether it can apply right now, what is blocking it, and what the next action should be before the paid x402 purchase.</div>
    <div class="readiness-shell">
      <div class="readiness-row">
        <input class="readiness-input" id="certWallet" type="text" placeholder="0x... paste any Base wallet" spellcheck="false" autocomplete="off">
        <button class="readiness-button" id="certCheckBtn" onclick="checkCertReadiness()">Check wallet</button>
      </div>
      <div class="readiness-note">Free endpoint: GET ${readinessUrl}?wallet=0x...</div>
      <div class="readiness-result" id="readinessResult">
        <div class="readiness-empty">Enter a wallet to see if it is eligible, already certified, missing registration, stale, or still below the certification threshold.</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-label">Surface API</div>
    <div class="section-title">Endpoints behind DJD Certify</div>
    <div class="section-desc">These are the core public and paid surfaces that make certification visible and usable in code.</div>
    <div class="endpoint-table">
      <div class="endpoint-row head">
        <div>Endpoint</div>
        <div style="text-align:right">Access</div>
        <div style="text-align:right">Method</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/certification/readiness?wallet=</div>
          <div class="endpoint-desc">Check whether a wallet is ready to apply, see blockers, and get the next step before paying.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/certification/directory</div>
          <div class="endpoint-desc">Browse active certifications, current score tiers, profile metadata, and trust links.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/certification/review</div>
          <div class="endpoint-desc">Submit a review request or inspect the latest reviewer status for a wallet before the final certification purchase.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET / POST</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/certification/:wallet</div>
          <div class="endpoint-desc">Read certification status for a wallet, including links to related trust surfaces.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/certification/badge/:wallet</div>
          <div class="endpoint-desc">Return an embeddable certification badge for marketplaces, docs, and agent profiles.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">POST /v1/certification/apply</div>
          <div class="endpoint-desc">Purchase certification via x402 and mint the product wrapper around your score.</div>
        </div>
        <div class="endpoint-price price-paid">$99</div>
        <div class="endpoint-method">POST</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/score/erc8004?wallet=</div>
          <div class="endpoint-desc">Fetch the standards-facing trust document tied to a wallet and its certification state.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">/v1/score/evaluator?wallet=</div>
          <div class="endpoint-desc">Return an evaluator preview with approve, review, or reject guidance for settlement decisions.</div>
        </div>
        <div class="endpoint-price price-paid">$0.35</div>
        <div class="endpoint-method">GET</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="callout">
      <h2>Ready to show up as a trusted endpoint?</h2>
      <p>Start by browsing the live directory, then wire certification into your score, profile, and evaluator flows. DJD Certify is the fastest path from a raw wallet score to something counterparties can act on.</p>
      <div class="hero-actions">
        <a href="${directoryUrl}" class="btn btn-primary">Browse Directory</a>
        <a href="${explorerUrl}" class="btn btn-ghost">Open Explorer</a>
        <a href="${pricingUrl}" class="btn btn-ghost">See Pricing</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="ft-bot">
      <div class="ft-l">DJD Certify is experimental and informational. Certification is a product surface, not a guarantee of performance or safety.</div>
      <div class="ft-links">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/docs">API Docs</a>
      </div>
    </div>
  </footer>
</div>
<script>
const CERT_READINESS_URL='${readinessUrl}';
const CERT_REVIEW_URL='${reviewUrl}';
const CERT_APPLY_URL='${buildPublicUrl('/v1/certification/apply')}';

function certEsc(value){
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function certStatusClass(status){
  return status==='eligible'||status==='already_certified'||status==='review_approved'
    ?'readiness-status readiness-status-ok'
    :'readiness-status readiness-status-warn';
}

function certStatusLabel(status){
  return ({
    eligible:'READY TO APPLY',
    already_certified:'ALREADY CERTIFIED',
    not_registered:'REGISTER FIRST',
    score_missing:'SCORE REQUIRED',
    score_expired:'REFRESH SCORE',
    score_too_low:'SCORE TOO LOW',
    review_pending:'REVIEW PENDING',
    review_approved:'REVIEW APPROVED',
    review_needs_info:'NEEDS INFO',
    review_rejected:'REVIEW REJECTED'
  })[status]||String(status||'').replace(/_/g,' ').toUpperCase();
}

function certReviewStatusLabel(status){
  return ({
    pending:'REVIEW PENDING',
    approved:'REVIEW APPROVED',
    needs_info:'NEEDS INFO',
    rejected:'REVIEW REJECTED'
  })[status]||String(status||'').replace(/_/g,' ').toUpperCase();
}

function certReviewStatusClass(status){
  return status==='approved'?'readiness-status readiness-status-ok':'readiness-status readiness-status-warn';
}

function renderCertReview(review){
  var shell=document.getElementById('reviewRequestPanel');
  if(!shell)return;
  if(!review){
    shell.innerHTML='';
    return;
  }

  var name=review.profile&&review.profile.name?review.profile.name:review.wallet;
  var reviewNote=review.review_note?'<div class="readiness-review-note"><strong>Reviewer note:</strong> '+certEsc(review.review_note)+'</div>':'';
  var requestNote=review.request_note?'<div class="readiness-review-note"><strong>Request note:</strong> '+certEsc(review.request_note)+'</div>':'';
  shell.innerHTML=
    '<div class="readiness-review">'+
      '<div class="readiness-review-head">'+
        '<div class="readiness-review-title">Review packet for '+certEsc(name)+'</div>'+
        '<div class="'+certReviewStatusClass(review.status)+'">'+certEsc(certReviewStatusLabel(review.status))+'</div>'+
      '</div>'+
      '<div class="readiness-review-note">'+certEsc(review.message||'Review status available.')+'</div>'+
      requestNote+
      reviewNote+
      '<div class="readiness-review-meta">'+
        'Requested '+certEsc(new Date(review.requested_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}))+
        (review.reviewed_at?' &middot; Reviewed '+certEsc(new Date(review.reviewed_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})):'')+
      '</div>'+
    '</div>';
}

async function loadCertificationReview(wallet){
  try{
    var resp=await fetch(CERT_REVIEW_URL+'?wallet='+encodeURIComponent(wallet));
    if(resp.status===404){
      renderCertReview(null);
      return;
    }
    var data=await resp.json();
    if(!resp.ok){
      throw new Error(data&&data.error&&data.error.message?data.error.message:'Review lookup failed');
    }
    renderCertReview(data);
  }catch(_err){
    renderCertReview(null);
  }
}

async function submitCertificationReview(wallet){
  var button=document.getElementById('certReviewBtn');
  if(button){
    button.disabled=true;
    button.textContent='Submitting...';
  }
  try{
    var resp=await fetch(CERT_REVIEW_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({wallet:wallet})
    });
    var data=await resp.json();
    if(!resp.ok){
      throw new Error(data&&data.error&&data.error.message?data.error.message:'Review request failed');
    }
    renderCertReview(data);
  }catch(err){
    renderCertReview({
      wallet:wallet,
      profile:{name:null},
      status:'needs_info',
      message:err&&err.message?err.message:'Review request failed',
      requested_at:new Date().toISOString(),
      reviewed_at:null
    });
  }
  if(button){
    button.disabled=false;
    button.textContent='Request review packet';
  }
}

function renderCertReadiness(data){
  var result=document.getElementById('readinessResult');
  var blockers=(data.blockers||[]).map(function(item){return '<li>'+certEsc(item.message)+'</li>';}).join('');
  var nextSteps=(data.next_steps||[]).map(function(step){
    return '<a class="readiness-link" href="'+certEsc(step.href)+'">'+certEsc(step.label)+' <span>&rarr;</span></a>';
  }).join('');
  var scoreValue=data.requirements&&data.requirements.score&&data.requirements.score.current_score!=null?data.requirements.score.current_score:'—';
  var tierValue=data.requirements&&data.requirements.score&&data.requirements.score.current_tier?data.requirements.score.current_tier:'—';
  var expiryValue=data.requirements&&data.requirements.score&&data.requirements.score.expires_at?new Date(data.requirements.score.expires_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'—';
  var reviewValue=data.requirements&&data.requirements.review&&data.requirements.review.status?certReviewStatusLabel(data.requirements.review.status):'NONE';
  var codeBlock=data.can_apply
    ? '<div class="readiness-code"><div class="readiness-code-label">Apply via x402</div><pre>curl -X POST '+certEsc(CERT_APPLY_URL)+' \\\n  -H "X-PAYMENT: &lt;x402 payment proof&gt;"</pre></div>'
    : '';
  var showReviewAction=!data.requirements.review||!data.requirements.review.exists||data.requirements.review.status==='needs_info'||data.requirements.review.status==='rejected';
  var reviewActionLabel=data.requirements.review&&data.requirements.review.exists?'Resubmit review packet':'Request review packet';
  var reviewAction=showReviewAction
    ? '<div class="readiness-action-row"><button type="button" class="readiness-action-btn" id="certReviewBtn" onclick="submitCertificationReview(&quot;'+certEsc(data.wallet)+'&quot;)">'+reviewActionLabel+'</button></div>'
    : '';
  var title=data.status==='review_pending'
    ? 'This wallet is waiting on reviewer action'
    : data.status==='review_approved'
      ? 'This wallet is approved for certification'
      : data.can_apply
        ? 'This wallet can apply now'
        : 'This wallet is not ready yet';

  result.innerHTML=
    '<div class="readiness-panel">'+
      '<div class="readiness-head">'+
        '<div class="readiness-title">'+title+'</div>'+
        '<div class="'+certStatusClass(data.status)+'">'+certEsc(certStatusLabel(data.status))+'</div>'+
      '</div>'+
      '<div class="readiness-wallet">'+certEsc(data.wallet)+'</div>'+
      '<div class="readiness-grid">'+
        '<div class="readiness-metric"><div class="readiness-metric-label">Registration</div><div class="readiness-metric-value">'+(data.requirements.registration.met?'Complete':'Missing')+'</div></div>'+
        '<div class="readiness-metric"><div class="readiness-metric-label">Current Score</div><div class="readiness-metric-value">'+certEsc(scoreValue)+' <span class="mono" style="font-size:11px;color:var(--text-muted)">'+certEsc(tierValue)+'</span></div></div>'+
        '<div class="readiness-metric"><div class="readiness-metric-label">Score Expiry</div><div class="readiness-metric-value">'+certEsc(expiryValue)+'</div></div>'+
        '<div class="readiness-metric"><div class="readiness-metric-label">Review</div><div class="readiness-metric-value">'+certEsc(reviewValue)+'</div></div>'+
      '</div>'+
      (blockers?'<ul class="readiness-list">'+blockers+'</ul>':'<div class="readiness-empty">No blockers. This wallet meets the visible prerequisites for certification.</div>')+
      '<div class="readiness-links">'+nextSteps+'</div>'+
      reviewAction+
      '<div id="reviewRequestPanel"></div>'+
      codeBlock+
    '</div>';
  loadCertificationReview(data.wallet);
}

async function checkCertReadiness(pushState){
  if(pushState===undefined)pushState=true;
  var input=document.getElementById('certWallet');
  var button=document.getElementById('certCheckBtn');
  var result=document.getElementById('readinessResult');
  var wallet=input.value.trim();
  if(!wallet||!wallet.startsWith('0x')||wallet.length!==42){
    result.innerHTML='<div class="readiness-empty">Enter a valid 42-character wallet address starting with 0x.</div>';
    return;
  }
  button.disabled=true;
  button.textContent='Checking...';
  if(pushState){
    history.replaceState({},'', '/certify?wallet='+encodeURIComponent(wallet));
  }
  try{
    var resp=await fetch(CERT_READINESS_URL+'?wallet='+encodeURIComponent(wallet));
    var data=await resp.json();
    if(!resp.ok){
      throw new Error(data&&data.error&&data.error.message?data.error.message:'Readiness check failed');
    }
    renderCertReadiness(data);
  }catch(err){
    result.innerHTML='<div class="readiness-empty">'+certEsc(err.message||'Readiness check failed')+'</div>';
  }
  button.disabled=false;
  button.textContent='Check wallet';
}

document.getElementById('certWallet').addEventListener('keydown',function(e){
  if(e.key==='Enter')checkCertReadiness();
});
var certQueryWallet=new URLSearchParams(window.location.search).get('wallet');
if(certQueryWallet){
  document.getElementById('certWallet').value=certQueryWallet;
  checkCertReadiness(false);
}
</script>
</body>
</html>`
}
