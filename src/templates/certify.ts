import { buildPublicUrl } from '../config/public.js'
import { renderPublicPage } from './publicPage.js'

const certifyCss = `
.certify-shell{
  display:grid;
  gap:18px;
}
.hero-grid{
  align-items:stretch;
}
.hero-card{
  padding:24px;
  border-radius:18px;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.9), rgba(12,27,45,0.92));
}
.hero-list{
  display:grid;
  gap:10px;
  margin-top:16px;
}
.hero-list li{
  position:relative;
  list-style:none;
  padding-left:18px;
  color:var(--text-dim);
  font-size:14px;
  line-height:1.72;
}
.hero-list li::before{
  content:'';
  position:absolute;
  left:0;
  top:9px;
  width:7px;
  height:7px;
  border-radius:999px;
  background:var(--green);
}
.surface-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:18px;
}
.endpoint-table{
  border-radius:18px;
  overflow:hidden;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.88), rgba(12,27,45,0.92));
}
.endpoint-row{
  display:grid;
  grid-template-columns:1fr 110px 80px;
  gap:12px;
  align-items:center;
  padding:16px 20px;
  border-bottom:1px solid var(--border);
}
.endpoint-row:last-child{border-bottom:none}
.endpoint-row.head{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.1em;
  text-transform:uppercase;
  background:rgba(7,17,31,0.44);
}
.endpoint-path{
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  margin-bottom:6px;
}
.endpoint-desc{
  color:var(--text-dim);
  font-size:13px;
  line-height:1.7;
}
.endpoint-price,
.endpoint-method{
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  text-align:right;
}
.price-free{color:var(--green)}
.price-paid{color:var(--yellow)}
.readiness-shell{
  padding:24px;
  border-radius:18px;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.9), rgba(12,27,45,0.92));
}
.readiness-row{
  display:flex;
  gap:12px;
  align-items:center;
}
.readiness-input{
  flex:1;
}
.readiness-button{
  min-width:140px;
}
.readiness-note{
  margin-top:10px;
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  line-height:1.7;
}
.readiness-result{
  margin-top:18px;
}
.readiness-empty{
  padding:18px;
  border-radius:14px;
  border:1px dashed var(--border-hi);
  background:rgba(7,17,31,0.45);
  color:var(--text-dim);
  font-size:13px;
  line-height:1.78;
}
.readiness-panel{
  padding:20px;
  border-radius:16px;
  border:1px solid var(--border);
  background:rgba(7,17,31,0.45);
}
.readiness-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  margin-bottom:14px;
}
.readiness-title{
  font-size:19px;
  font-weight:700;
}
.readiness-status{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:6px 10px;
  border-radius:999px;
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.08em;
  text-transform:uppercase;
}
.readiness-status-ok{
  color:var(--green);
  background:var(--green-dim);
}
.readiness-status-warn{
  color:var(--yellow);
  background:var(--yellow-dim);
}
.readiness-wallet{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  word-break:break-all;
  margin-bottom:14px;
}
.readiness-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:10px;
  margin-bottom:14px;
}
.readiness-metric{
  padding:12px;
  border-radius:12px;
  border:1px solid var(--border);
  background:rgba(12,27,45,0.92);
}
.readiness-metric-label{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:9px;
  font-weight:700;
  letter-spacing:0.08em;
  text-transform:uppercase;
  margin-bottom:7px;
}
.readiness-metric-value{
  font-size:13px;
  font-weight:700;
}
.readiness-list{
  margin:0 0 14px;
  padding-left:18px;
}
.readiness-list li{
  color:var(--text-dim);
  font-size:13px;
  line-height:1.72;
  margin-bottom:8px;
}
.readiness-links,
.readiness-action-row{
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}
.readiness-link,
.readiness-action-btn{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid var(--border);
  background:rgba(12,27,45,0.92);
  color:var(--text);
  font-size:12px;
  font-weight:700;
  cursor:pointer;
}
.readiness-link:hover,
.readiness-action-btn:hover{
  color:var(--accent);
  border-color:var(--border-hi);
}
.readiness-review{
  margin-top:14px;
  padding:16px;
  border-radius:14px;
  border:1px solid var(--border);
  background:rgba(12,27,45,0.92);
}
.readiness-review-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:10px;
}
.readiness-review-title{
  font-size:14px;
  font-weight:700;
}
.readiness-review-note{
  color:var(--text-dim);
  font-size:12px;
  line-height:1.72;
}
.readiness-review-meta{
  margin-top:10px;
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  line-height:1.72;
}
.readiness-code{
  margin-top:14px;
  padding:16px;
  border-radius:14px;
  border:1px solid var(--border);
  background:#050c17;
  overflow:auto;
}
.readiness-code-label{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.1em;
  text-transform:uppercase;
  margin-bottom:8px;
}
.readiness-code pre{
  color:var(--text-dim);
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  line-height:1.7;
  white-space:pre-wrap;
}
@media(max-width:980px){
  .surface-grid,
  .readiness-grid{grid-template-columns:1fr}
}
@media(max-width:760px){
  .readiness-row,
  .endpoint-row{grid-template-columns:1fr}
  .readiness-row{flex-direction:column;align-items:stretch}
  .endpoint-row{
    display:grid;
  }
  .endpoint-method{
    display:none;
  }
}
`

export function certifyPageHtml(): string {
  const readinessUrl = buildPublicUrl('/v1/certification/readiness')
  const reviewUrl = buildPublicUrl('/v1/certification/review')
  const directoryUrl = buildPublicUrl('/directory')
  const docsUrl = buildPublicUrl('/docs')
  const explorerUrl = buildPublicUrl('/explorer')

  return renderPublicPage({
    title: 'DJD Certify — Public Trust Infrastructure for Agent Wallets',
    description:
      'DJD Certify turns scoring and identity signals into public trust infrastructure: directory listings, badges, standards documents, and evaluator-ready status.',
    path: '/certify',
    nav: 'certify',
    ctaHref: directoryUrl,
    ctaLabel: 'Browse Directory',
    extraCss: certifyCss,
    content: `
<main class="site-shell certify-shell">
  <section class="hero">
    <div class="hero-grid">
      <div>
        <span class="eyebrow">Certification for autonomous agents</span>
        <h1 class="display">DJD Certify turns wallet evidence into <em>public trust infrastructure</em></h1>
        <p class="lede">Certify is the product wrapper around DJD’s scoring, identity, and monitoring work. It gives counterparties something they can actually inspect: certification status, badges, directory presence, standards documents, and evaluator-ready context before money moves.</p>
        <div class="action-row">
          <a class="button button-primary" href="${directoryUrl}">Browse certified directory</a>
          <a class="button button-secondary" href="${docsUrl}">Open docs</a>
          <a class="button button-secondary" href="${explorerUrl}">Open explorer</a>
        </div>
      </div>
      <aside class="hero-card">
        <div class="metric-label">What Certify gives you</div>
        <ul class="hero-list">
          <li>A public certification surface instead of a hidden backend decision.</li>
          <li>Machine-readable status, badges, and standards-linked trust packaging.</li>
          <li>A reviewer-governed issuance path for wallets that want stronger legitimacy.</li>
          <li>Cleaner distribution into the certified directory and evaluator-ready flows.</li>
        </ul>
      </aside>
    </div>
  </section>

  <section class="section">
    <div class="section-header section-center">
      <div class="section-label">How it works</div>
      <h2 class="section-title">One certification, multiple trust outputs</h2>
      <p class="section-copy">The point of Certify is not to create another badge silo. It is to take the score, identity, and review state you already have and package it into surfaces buyers, marketplaces, operators, and evaluators can use.</p>
    </div>
    <div class="surface-grid">
      <article class="card">
        <div class="card-kicker">Directory</div>
        <div class="card-title">Public distribution</div>
        <div class="card-copy">Certified agents appear in the Trusted Endpoint Directory with score tier, confidence, profile metadata, and linked trust surfaces instead of a bare wallet string.</div>
      </article>
      <article class="card">
        <div class="card-kicker">Status</div>
        <div class="card-title">Machine-readable certification</div>
        <div class="card-copy">Every certified wallet gets a status endpoint plus embeddable badge surfaces for docs, marketplaces, profiles, and operator dashboards.</div>
      </article>
      <article class="card">
        <div class="card-kicker">Standards</div>
        <div class="card-title">ERC-8004-compatible packaging</div>
        <div class="card-copy">Certification feeds the wallet’s standards-facing score document so registration, score state, and certification all travel together.</div>
      </article>
      <article class="card">
        <div class="card-kicker">Evaluation</div>
        <div class="card-title">Evaluator-ready context</div>
        <div class="card-copy">Certify pairs with the evaluator preview to help payout and settlement flows decide whether to approve, review, or reject before money moves.</div>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-header section-center">
      <div class="section-label">Readiness</div>
      <h2 class="section-title">Check certification readiness</h2>
      <p class="section-copy">Paste a wallet to see whether it can apply right now, what is blocking it, and what the next step should be before the paid issuance path begins.</p>
    </div>
    <div class="readiness-shell">
      <div class="readiness-row">
        <input class="input readiness-input" id="certWallet" type="text" placeholder="0x... paste any Base wallet" spellcheck="false" autocomplete="off">
        <button class="button button-primary readiness-button" id="certCheckBtn" onclick="checkCertReadiness()">Check wallet</button>
      </div>
      <div class="readiness-note">Free endpoint: GET ${readinessUrl}?wallet=0x...</div>
      <div class="readiness-result" id="readinessResult">
        <div class="readiness-empty">Enter a wallet to see if it is eligible, already certified, missing registration, stale, below threshold, or waiting on reviewer action.</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-header section-center">
      <div class="section-label">Surface API</div>
      <h2 class="section-title">Endpoints behind DJD Certify</h2>
      <p class="section-copy">These are the public and paid surfaces that make certification visible in code. The site is just the human-facing wrapper around them.</p>
    </div>
    <div class="endpoint-table">
      <div class="endpoint-row head">
        <div>Endpoint</div>
        <div style="text-align:right">Price</div>
        <div style="text-align:right">Method</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">GET /v1/certification/readiness</div>
          <div class="endpoint-desc">Checks whether a wallet is ready for certification and returns blockers, review state, and next-step links.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">GET /v1/certification/review</div>
          <div class="endpoint-desc">Returns the current reviewer packet state for a wallet that has requested certification review.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">POST /v1/certification/review</div>
          <div class="endpoint-desc">Submits or refreshes a reviewer packet for an eligible wallet before final issuance.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">POST</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">POST /v1/certification/apply</div>
          <div class="endpoint-desc">Final issuance endpoint for certification. Paid x402 route used when a wallet is actually ready to certify.</div>
        </div>
        <div class="endpoint-price price-paid">x402</div>
        <div class="endpoint-method">POST</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">GET /v1/certification/directory</div>
          <div class="endpoint-desc">Machine-readable certified directory with search, filters, trust links, and metadata.</div>
        </div>
        <div class="endpoint-price price-free">Free</div>
        <div class="endpoint-method">GET</div>
      </div>
      <div class="endpoint-row">
        <div>
          <div class="endpoint-path">GET /v1/score/evaluator?wallet=0x...</div>
          <div class="endpoint-desc">Paid evaluator preview that combines score, certification, risk, ratings, and staking into an approve/review/reject decision surface.</div>
        </div>
        <div class="endpoint-price price-paid">$x402</div>
        <div class="endpoint-method">GET</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="callout">
      <h2 class="section-title">Use Certify when trust needs to be visible</h2>
      <p class="section-copy">DJD Certify is strongest when a simple backend score is not enough and a marketplace, operator, or counterparty needs an inspectable public trust surface.</p>
      <div class="action-row" style="justify-content:center">
        <a class="button button-primary" href="${directoryUrl}">See who’s already certified</a>
        <a class="button button-secondary" href="/v1/certification/directory">Open directory JSON</a>
      </div>
    </div>
  </section>
</main>

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
  }catch{
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
        '<div class="readiness-metric"><div class="readiness-metric-label">Current score</div><div class="readiness-metric-value">'+certEsc(scoreValue)+' <span class="mono" style="font-size:11px;color:var(--text-muted)">'+certEsc(tierValue)+'</span></div></div>'+
        '<div class="readiness-metric"><div class="readiness-metric-label">Score expiry</div><div class="readiness-metric-value">'+certEsc(expiryValue)+'</div></div>'+
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
</script>`,
  })
}
