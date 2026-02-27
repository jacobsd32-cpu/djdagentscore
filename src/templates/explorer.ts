/**
 * Explorer page — fully client-side rendered single-page app.
 * Wallet lookup, score display, and leaderboard table all driven by
 * embedded JS that calls the public API endpoints.
 */

export const explorerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Explorer - DJD Agent Score</title>
<meta name="description" content="Look up trust scores for any AI agent wallet on Base. Explore the leaderboard, check reputation, and verify wallets before transacting.">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#090d16;--bg2:#10151f;--surface:#1a2030;--surface2:#1f2738;
  --border:#1c2536;--border-hi:#2a3548;
  --text:#e2e8f0;--dim:#94a3b8;--muted:#4b5c73;
  --accent:#22d3ee;--green:#34d399;--yellow:#fbbf24;--orange:#fb923c;--red:#f87171;--purple:#a78bfa;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
.mono{font-family:'JetBrains Mono',monospace}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
nav{padding:16px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
.logo{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:16px;color:var(--accent)}
.logo span{color:var(--dim);font-weight:400}
.nav-r{margin-left:auto;display:flex;gap:16px}
.nav-r a{color:var(--muted);font-size:12px;font-family:'JetBrains Mono',monospace}
.nav-r a:hover{color:var(--accent);text-decoration:none}
.wrap{max-width:960px;margin:0 auto;padding:32px 24px}
.search-box{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:28px}
.search-box h1{font-size:22px;font-weight:700;margin-bottom:4px;letter-spacing:-.3px}
.search-box p{font-size:14px;color:var(--dim);margin-bottom:18px}
.search-row{display:flex;gap:10px}
.search-row input{flex:1;background:var(--bg);border:1px solid var(--border-hi);border-radius:8px;padding:12px 16px;font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--text);outline:none;transition:border-color .2s}
.search-row input:focus{border-color:var(--accent)}
.search-row input::placeholder{color:var(--muted)}
.search-row button{background:var(--accent);color:var(--bg);border:none;border-radius:8px;padding:12px 24px;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity .15s}
.search-row button:hover{opacity:.85}
.search-row button:disabled{opacity:.5;cursor:not-allowed}
.search-err{color:var(--red);font-size:13px;margin-top:10px;display:none}
.search-err.vis{display:block}
.panel{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:28px;margin-bottom:28px;display:none}
.panel.vis{display:block}
.panel-hdr{display:flex;align-items:flex-start;gap:24px;margin-bottom:20px;flex-wrap:wrap}
.score-ring{width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}
.score-ring::before{content:'';position:absolute;inset:0;border-radius:50%;border:4px solid var(--border)}
.score-num{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;z-index:1}
.panel-meta{flex:1;min-width:200px}
.panel-wallet{font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--dim);margin-bottom:8px;word-break:break-all;cursor:pointer}
.panel-wallet:hover{color:var(--accent)}
.tier-badge{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;margin-right:8px}
.tier-Elite{background:rgba(34,211,238,.1);color:var(--accent);border:1px solid rgba(34,211,238,.25)}
.tier-Trusted{background:rgba(52,211,153,.1);color:var(--green);border:1px solid rgba(52,211,153,.25)}
.tier-Established{background:rgba(251,191,36,.1);color:var(--yellow);border:1px solid rgba(251,191,36,.25)}
.tier-Emerging{background:rgba(251,146,60,.1);color:var(--orange);border:1px solid rgba(251,146,60,.25)}
.tier-Unverified{background:rgba(75,92,115,.1);color:var(--muted);border:1px solid rgba(75,92,115,.25)}
.rec-badge{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;padding:4px 10px;border-radius:20px}
.rec-proceed{background:rgba(52,211,153,.08);color:var(--green);border:1px solid rgba(52,211,153,.2)}
.rec-caution{background:rgba(251,191,36,.08);color:var(--yellow);border:1px solid rgba(251,191,36,.2)}
.rec-insufficient{background:rgba(75,92,115,.08);color:var(--muted);border:1px solid rgba(75,92,115,.2)}
.rec-high_risk,.rec-flagged{background:rgba(248,113,113,.08);color:var(--red);border:1px solid rgba(248,113,113,.2)}
.conf-row{margin-top:10px;display:flex;align-items:center;gap:10px}
.conf-bar-bg{flex:1;max-width:140px;height:5px;background:var(--border);border-radius:3px}
.conf-bar{height:100%;border-radius:3px;background:var(--accent);transition:width .4s ease}
.conf-label{font-size:12px;color:var(--dim);font-family:'JetBrains Mono',monospace}
.panel-bar{height:6px;background:var(--border);border-radius:3px;margin-bottom:18px;overflow:hidden}
.panel-bar-fill{height:100%;border-radius:3px;transition:width .5s ease}
.panel-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.detail-card{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px}
.detail-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-family:'JetBrains Mono',monospace;margin-bottom:4px}
.detail-val{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600}
.badge-section{border-top:1px solid var(--border);padding-top:16px;margin-top:8px}
.badge-section label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-family:'JetBrains Mono',monospace;display:block;margin-bottom:8px}
.badge-section img{height:20px;margin-bottom:8px;display:block}
.badge-copy-row{display:flex;gap:6px}
.badge-copy-row input{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);outline:none}
.badge-copy-row button{background:var(--surface2);color:var(--dim);border:none;border-radius:6px;padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:10px;cursor:pointer}
.disc{font-size:11px;color:var(--muted);line-height:1.6;border-top:1px solid var(--border);padding-top:14px;margin-top:14px}
.disc a{color:var(--muted)}
.stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.stat{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px 18px;min-width:120px}
.stat-v{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;color:var(--accent)}
.stat-l{font-size:11px;color:var(--muted);margin-top:2px}
.lb-section{margin-top:8px}
.lb-section h2{font-size:18px;font-weight:700;margin-bottom:4px}
.lb-section .sub{font-size:13px;color:var(--dim);margin-bottom:16px}
table{width:100%;border-collapse:collapse;background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden}
thead th{background:var(--surface);color:var(--muted);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);font-family:'JetBrains Mono',monospace}
tbody tr{border-top:1px solid var(--border);cursor:pointer;transition:background .12s}
tbody tr:hover{background:var(--surface)}
td{padding:10px 14px;font-size:13px;vertical-align:middle}
.rk{color:var(--muted);font-weight:600;width:40px;font-family:'JetBrains Mono',monospace}
.rk-1{color:#ffd700}.rk-2{color:#c0c0c0}.rk-3{color:#cd7f32}
.wl{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent)}
.sc-cell{display:flex;align-items:center;gap:8px}
.sc-n{font-weight:700;font-family:'JetBrains Mono',monospace;min-width:24px}
.sc-bar-bg{flex:1;height:4px;background:var(--border);border-radius:2px;max-width:70px}
.sc-bar{height:100%;border-radius:2px}
.tr-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap;font-family:'JetBrains Mono',monospace}
.sig{display:flex;gap:3px;flex-wrap:wrap}
.sig-b{font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;font-family:'JetBrains Mono',monospace}
.sig-reg{background:rgba(52,211,153,.08);color:var(--green);border:1px solid rgba(52,211,153,.15)}
.sig-gh{background:rgba(148,163,184,.08);color:var(--dim);border:1px solid rgba(148,163,184,.15)}
.age-col{color:var(--muted);font-size:12px;font-family:'JetBrains Mono',monospace}
.loading{text-align:center;padding:40px;color:var(--muted);font-size:14px}
.updated-at{font-size:11px;color:var(--muted);margin-top:10px;text-align:right;font-family:'JetBrains Mono',monospace}
.share-link{display:flex;align-items:center;gap:8px;margin-top:12px}
.share-link input{flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--dim);outline:none}
.share-link button{background:var(--surface2);color:var(--dim);border:none;border-radius:6px;padding:6px 12px;font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer}
footer{text-align:center;padding:36px 24px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);margin-top:40px;font-family:'JetBrains Mono',monospace}
footer a{color:var(--muted)}
@media(max-width:640px){
  .panel-hdr{flex-direction:column;align-items:center;text-align:center}
  .sc-bar-bg,.age-col,.sig{display:none}
  td,th{padding:8px 8px}
}
</style>
</head>
<body>
<nav>
  <a class="logo" href="/">DJD <span>Agent Score</span></a>
  <div class="nav-r">
    <a href="/">Home</a>
    <a href="/leaderboard">Leaderboard</a>
    <a href="/docs">API Docs</a>
    <a href="https://github.com/jacobsd32-cpu/djdagentscore">GitHub</a>
  </div>
</nav>
<div class="wrap">
  <div class="search-box">
    <h1>Wallet Explorer</h1>
    <p>Look up the trust score for any AI agent wallet on Base. Free, no signup.</p>
    <div class="search-row">
      <input type="text" id="q" placeholder="0x... paste any Base wallet address" spellcheck="false" autocomplete="off">
      <button id="btn" onclick="lookup()">Score</button>
    </div>
    <div class="search-err" id="err"></div>
  </div>
  <div class="panel" id="panel">
    <div class="panel-hdr">
      <div class="score-ring" id="ring">
        <div class="score-num" id="pScore">--</div>
      </div>
      <div class="panel-meta">
        <div class="panel-wallet" id="pWallet" onclick="copyWallet()" title="Click to copy">--</div>
        <div><span class="tier-badge" id="pTier">--</span><span class="rec-badge" id="pRec">--</span></div>
        <div class="conf-row">
          <span class="conf-label" id="pConfLabel">Confidence: --</span>
          <div class="conf-bar-bg"><div class="conf-bar" id="pConfBar"></div></div>
        </div>
      </div>
    </div>
    <div class="panel-bar"><div class="panel-bar-fill" id="pBar"></div></div>
    <div class="panel-details" id="pDetails"></div>
    <div class="share-link">
      <input type="text" id="shareUrl" readonly>
      <button onclick="copyShare()">Copy link</button>
    </div>
    <div class="badge-section">
      <label>Embed Badge</label>
      <img id="pBadgeImg" src="" alt="DJD Agent Score badge">
      <div class="badge-copy-row">
        <input id="pBadgeCode" type="text" readonly>
        <button onclick="copyBadge()">Copy</button>
      </div>
    </div>
    <div class="disc">
      Scores are algorithmically generated from public blockchain data and unverified third-party submissions.
      Not verified, audited, or guaranteed. Not a consumer report under the FCRA.
      <a href="/terms">Terms</a> &middot; <a href="/privacy">Privacy</a>
    </div>
  </div>
  <div class="stats" id="stats"></div>
  <div class="lb-section">
    <h2>Top Agents</h2>
    <p class="sub">Click any wallet to see its full score. Rankings refresh periodically.</p>
    <div id="lb"><div class="loading">Loading leaderboard...</div></div>
    <p class="updated-at" id="updated"></p>
  </div>
</div>
<footer>
  DJD Agent Score &middot; Trust infrastructure for the agent economy &middot;
  <a href="/v1/leaderboard">API</a> &middot;
  <a href="https://github.com/jacobsd32-cpu/djdagentscore">GitHub</a> &middot;
  <a href="/terms">Terms</a>
</footer>
<script>
var API = window.location.origin;
function sColor(s) {
  if (s >= 90) return 'var(--accent)';
  if (s >= 75) return 'var(--green)';
  if (s >= 50) return 'var(--yellow)';
  if (s >= 25) return 'var(--orange)';
  return 'var(--muted)';
}
function recClass(r) {
  return ({proceed:'rec-proceed',proceed_with_caution:'rec-caution',insufficient_history:'rec-insufficient',high_risk:'rec-high_risk',flagged_for_review:'rec-flagged'})[r] || 'rec-insufficient';
}
function tierClass(t) { return 'tier-' + (t || 'Unverified'); }
function el(id) { return document.getElementById(id); }
function mkEl(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt !== undefined) e.textContent = String(txt);
  return e;
}
function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

async function lookup(pushState) {
  if (pushState === undefined) pushState = true;
  var input = el('q'), btn = el('btn'), err = el('err'), panel = el('panel');
  var w = input.value.trim();
  err.classList.remove('vis');
  if (!w || !w.startsWith('0x') || w.length !== 42) {
    err.textContent = 'Enter a valid 42-character wallet address starting with 0x';
    err.classList.add('vis');
    return;
  }
  btn.disabled = true; btn.textContent = 'Scoring...';
  if (pushState) history.pushState({}, '', '/explorer?wallet=' + w);
  try {
    var resp = await fetch(API + '/v1/score/basic?wallet=' + w);
    if (!resp.ok) throw new Error('API returned ' + resp.status);
    var d = await resp.json();
    var s = d.score ?? 0, t = d.tier || 'Unverified', c = d.confidence ?? 0;
    var rec = d.recommendation || 'insufficient_history';
    var color = sColor(s);
    el('ring').style.background = 'conic-gradient(' + color + ' ' + (s * 3.6) + 'deg, var(--border) 0deg)';
    el('pScore').textContent = s;
    el('pScore').style.color = color;
    el('pWallet').textContent = w;
    var tierEl = el('pTier');
    tierEl.textContent = t;
    tierEl.className = 'tier-badge ' + tierClass(t);
    var recEl = el('pRec');
    recEl.textContent = rec.replace(/_/g, ' ');
    recEl.className = 'rec-badge ' + recClass(rec);
    el('pConfLabel').textContent = 'Confidence: ' + (c * 100).toFixed(0) + '%';
    el('pConfBar').style.width = (c * 100) + '%';
    var bar = el('pBar');
    bar.style.width = s + '%';
    bar.style.background = color;
    var details = el('pDetails');
    clearChildren(details);
    [
      { label: 'Model Version', val: d.modelVersion || '--' },
      { label: 'Freshness', val: d.scoreFreshness || '--' },
      { label: 'Last Updated', val: d.lastUpdated ? new Date(d.lastUpdated).toLocaleDateString() : '--' },
      { label: 'Computed At', val: d.computedAt ? new Date(d.computedAt).toLocaleString() : '--' },
    ].forEach(function(item) {
      var card = mkEl('div', 'detail-card');
      card.appendChild(mkEl('div', 'detail-label', item.label));
      card.appendChild(mkEl('div', 'detail-val', item.val));
      details.appendChild(card);
    });
    el('shareUrl').value = window.location.origin + '/explorer?wallet=' + w;
    var badgeUrl = API + '/v1/badge/' + w + '.svg';
    el('pBadgeImg').src = badgeUrl;
    el('pBadgeCode').value = '![DJD Score](' + badgeUrl + ')';
    panel.classList.add('vis');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (x) {
    err.textContent = 'Error: ' + x.message;
    err.classList.add('vis');
  }
  btn.disabled = false; btn.textContent = 'Score';
}

function copyWallet() { navigator.clipboard.writeText(el('pWallet').textContent); }
function copyShare() {
  var inp = el('shareUrl');
  navigator.clipboard.writeText(inp.value).then(function() {
    inp.style.borderColor = 'var(--green)';
    setTimeout(function() { inp.style.borderColor = ''; }, 1200);
  });
}
function copyBadge() { navigator.clipboard.writeText(el('pBadgeCode').value); }

async function loadLB() {
  try {
    var resp = await fetch(API + '/v1/leaderboard');
    if (!resp.ok) throw new Error(resp.status);
    var data = await resp.json();
    var lb = data.leaderboard;
    var statsEl = el('stats');
    clearChildren(statsEl);
    [
      { v: lb.length, l: 'Ranked' },
      { v: data.totalAgentsScored, l: 'Scored' },
      { v: data.totalAgentsRegistered, l: 'Registered' },
    ].forEach(function(s) {
      var div = mkEl('div', 'stat');
      div.appendChild(mkEl('div', 'stat-v', s.v));
      div.appendChild(mkEl('div', 'stat-l', s.l));
      statsEl.appendChild(div);
    });
    var lbEl = el('lb');
    if (!lb || !lb.length) {
      clearChildren(lbEl);
      lbEl.appendChild(mkEl('div', 'loading', 'No scored wallets yet. Indexer is building data.'));
      return;
    }
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['#', 'Wallet', 'Score', 'Tier', 'Age', 'Signals'].forEach(function(h) {
      headRow.appendChild(mkEl('th', null, h));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    lb.forEach(function(entry) {
      var tr = document.createElement('tr');
      tr.onclick = function() {
        el('q').value = entry.wallet;
        lookup();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      var rkTd = mkEl('td', 'rk' + (entry.rank <= 3 ? ' rk-' + entry.rank : ''), entry.rank);
      tr.appendChild(rkTd);
      var wTd = mkEl('td', 'wl', entry.wallet.slice(0, 6) + '...' + entry.wallet.slice(-4));
      tr.appendChild(wTd);
      var sTd = document.createElement('td');
      var sDiv = mkEl('div', 'sc-cell');
      var sn = mkEl('span', 'sc-n', entry.score);
      sn.style.color = sColor(entry.score);
      sDiv.appendChild(sn);
      var barBg = mkEl('div', 'sc-bar-bg');
      var bar = mkEl('div', 'sc-bar');
      bar.style.width = entry.score + '%';
      bar.style.background = sColor(entry.score);
      barBg.appendChild(bar);
      sDiv.appendChild(barBg);
      sTd.appendChild(sDiv);
      tr.appendChild(sTd);
      var tTd = document.createElement('td');
      var tSpan = mkEl('span', 'tr-badge ' + tierClass(entry.tier), entry.tier || 'Unverified');
      tTd.appendChild(tSpan);
      tr.appendChild(tTd);
      var aTd = mkEl('td', 'age-col', entry.daysAlive >= 30 ? '30d+' : entry.daysAlive + 'd');
      tr.appendChild(aTd);
      var sigTd = document.createElement('td');
      var sigDiv = mkEl('div', 'sig');
      if (entry.isRegistered) sigDiv.appendChild(mkEl('span', 'sig-b sig-reg', 'REG'));
      if (entry.githubVerified) sigDiv.appendChild(mkEl('span', 'sig-b sig-gh', 'GH'));
      sigTd.appendChild(sigDiv);
      tr.appendChild(sigTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    clearChildren(lbEl);
    lbEl.appendChild(table);
    el('updated').textContent = 'Updated: ' + new Date(data.lastUpdated).toLocaleString();
  } catch (e) {
    var lbEl = el('lb');
    clearChildren(lbEl);
    var errMsg = mkEl('div', 'loading', 'Failed to load leaderboard.');
    errMsg.style.color = 'var(--red)';
    lbEl.appendChild(errMsg);
  }
}

(function() {
  var params = new URLSearchParams(window.location.search);
  var w = params.get('wallet');
  if (w) { el('q').value = w; lookup(false); }
  loadLB();
  el('q').addEventListener('keydown', function(e) { if (e.key === 'Enter') lookup(); });
  window.addEventListener('popstate', function() {
    var p = new URLSearchParams(window.location.search);
    var w2 = p.get('wallet');
    if (w2) { el('q').value = w2; lookup(false); }
  });
})();
</script>
</body>
</html>`
