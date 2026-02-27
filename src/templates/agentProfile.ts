import { scoreToTier } from '../db.js'
import type { AgentRegistrationRow, ScoreHistoryRow, ScoreRow } from '../types.js'

// ---------- Helpers ----------

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function scoreColor(s: number): string {
  if (s >= 90) return 'var(--accent)'
  if (s >= 75) return 'var(--green)'
  if (s >= 50) return 'var(--yellow)'
  if (s >= 25) return 'var(--orange)'
  return 'var(--text-muted)'
}

function tierClass(tier: string): string {
  return (
    (
      {
        Elite: 'stt-elite',
        Trusted: 'stt-trusted',
        Established: 'stt-established',
        Emerging: 'stt-emerging',
      } as Record<string, string>
    )[tier] ?? 'stt-unverified'
  )
}

function recClass(rec: string): string {
  return (
    (
      {
        proceed: 'rc-proceed',
        proceed_with_caution: 'rc-caution',
        insufficient_history: 'rc-insufficient',
        high_risk: 'rc-high-risk',
        flagged_for_review: 'rc-flagged',
      } as Record<string, string>
    )[rec] ?? 'rc-insufficient'
  )
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function fmtWallet(w: string): string {
  return `${w.slice(0, 8)}…${w.slice(-6)}`
}

function dimBar(label: string, score: number, color: string): string {
  return `
    <div class="dim-row">
      <div class="dim-label">${label}</div>
      <div class="dim-track"><div class="dim-fill" style="width:${score}%;background:${color}"></div></div>
      <div class="dim-val" style="color:${color}">${score}</div>
    </div>`
}

// ---------- Page template ----------

export function renderAgentPage(
  wallet: string,
  score: ScoreRow | undefined,
  history: ScoreHistoryRow[],
  reg: AgentRegistrationRow | undefined,
  origin: string,
): string {
  // Force HTTPS in URLs — behind Fly.io's proxy, origin can report http://
  const safeOrigin = origin.replace(/^http:/, 'https:')
  const badgeUrl = `${safeOrigin}/v1/badge/${wallet}.svg`
  const pageUrl = `${safeOrigin}/agent/${wallet}`
  const s = score?.composite_score ?? 0
  const tier = score?.tier ?? 'Unverified'
  const conf = score?.confidence ?? 0
  const rec = score?.recommendation ?? 'insufficient_history'
  const rel = score?.reliability_score ?? 0
  const via = score?.viability_score ?? 0
  const idn = score?.identity_score ?? 0
  const beh = score?.behavior_score ?? 0
  const cap = score?.capability_score ?? 0
  const sybil = score ? (score.sybil_flag ?? 0) === 1 : false
  const calcAt = score?.calculated_at ?? ''

  const displayName = reg?.name ?? fmtWallet(wallet)
  const ogTitle = `${esc(displayName)} — ${s} · ${esc(tier)} | DJD Agent Score`
  const ogDesc = reg?.description
    ? esc(reg.description)
    : `On-chain reputation score for ${fmtWallet(wallet)}: ${s}/100 (${tier})`

  const isRegistered = !!reg

  const historyRows = history
    .slice(0, 8)
    .map(
      (h) => `
    <div class="hist-row">
      <span class="hist-score" style="color:${scoreColor(h.score)}">${h.score}</span>
      <span class="hist-tier">${scoreToTier(h.score)}</span>
      <span class="hist-date">${fmtDate(h.calculated_at)}</span>
    </div>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ogTitle}</title>
<meta name="description" content="${ogDesc}">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:image" content="${esc(badgeUrl)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<meta name="twitter:image" content="${esc(badgeUrl)}">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet">
<style>
:root{--bg:#090d16;--bg2:#10151f;--bg3:#171d2b;--surface:#1a2030;--border:#1c2536;--border-hi:#2a3548;--text:#e2e8f0;--text-dim:#94a3b8;--text-muted:#4b5c73;--accent:#22d3ee;--accent-dim:rgba(34,211,238,0.08);--green:#34d399;--green-dim:rgba(52,211,153,0.08);--yellow:#fbbf24;--yellow-dim:rgba(251,191,36,0.08);--red:#f87171;--red-dim:rgba(248,113,113,0.08);--orange:#fb923c;--orange-dim:rgba(251,146,60,0.08);--purple:#a78bfa;--purple-dim:rgba(167,139,250,0.08)}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(34,211,238,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.015) 1px,transparent 1px);background-size:64px 64px;pointer-events:none;z-index:0}
.wrap{max-width:860px;margin:0 auto;padding:0 24px;position:relative;z-index:1}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.mono{font-family:'JetBrains Mono',monospace}

nav{padding:16px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}
.logo{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:16px;color:var(--accent);letter-spacing:-.5px}
.logo span{color:var(--text-muted);font-weight:400}
.nav-back{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted)}
.nav-back:hover{color:var(--accent);text-decoration:none}

.agent-hdr{padding:36px 0 28px;border-bottom:1px solid var(--border)}
.agent-name{font-size:26px;font-weight:700;letter-spacing:-.5px;margin-bottom:5px}
.agent-wallet{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);word-break:break-all;margin-bottom:12px}
.agent-desc{font-size:14px;color:var(--text-dim);line-height:1.65;margin-bottom:12px;max-width:600px}
.agent-links{display:flex;gap:12px;flex-wrap:wrap}
.agent-link{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);border:1px solid var(--border);border-radius:5px;padding:4px 10px;display:inline-flex;align-items:center;gap:5px}
.agent-link:hover{color:var(--accent);border-color:var(--accent);text-decoration:none}
.reg-badge{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:600;padding:2px 7px;border-radius:3px;color:var(--accent);background:var(--accent-dim);margin-left:8px;vertical-align:middle}
.gh-badge{color:var(--green);background:var(--green-dim)}

.main{display:grid;grid-template-columns:1fr 340px;gap:20px;padding:28px 0}
@media(max-width:720px){.main{grid-template-columns:1fr}}

.card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px}
.card+.card{margin-top:16px}
.card-label{font-family:'JetBrains Mono',monospace;font-size:9.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px}

.score-big{font-family:'JetBrains Mono',monospace;font-size:64px;font-weight:700;line-height:1;margin-bottom:8px}
.score-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.sc-tier{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;padding:3px 9px;border-radius:4px}
.stt-elite{color:var(--accent);background:var(--accent-dim)}.stt-trusted{color:var(--green);background:var(--green-dim)}.stt-established{color:var(--yellow);background:var(--yellow-dim)}.stt-emerging{color:var(--orange);background:var(--orange-dim)}.stt-unverified{color:var(--text-muted);background:rgba(71,85,105,0.18)}
.sc-rec{font-family:'JetBrains Mono',monospace;font-size:10.5px;padding:2px 7px;border-radius:3px}
.rc-proceed{color:var(--green);background:var(--green-dim)}.rc-caution{color:var(--yellow);background:var(--yellow-dim)}.rc-insufficient{color:var(--text-muted);background:rgba(71,85,105,0.18)}.rc-high-risk,.rc-flagged{color:var(--red);background:var(--red-dim)}
.score-bar-bg{height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:16px}
.score-bar-fill{height:100%;border-radius:3px;transition:width .6s ease}
.score-meta{font-size:12.5px;color:var(--text-dim);line-height:1.8}
.score-meta span{font-family:'JetBrains Mono',monospace}
.sybil-flag{font-family:'JetBrains Mono',monospace;font-size:10px;padding:2px 7px;border-radius:3px;color:var(--red);background:var(--red-dim);margin-top:8px;display:inline-block}
.updated{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}

.dim-row{display:grid;grid-template-columns:90px 1fr 32px;align-items:center;gap:10px;margin-bottom:10px}
.dim-label{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted)}
.dim-track{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden}
.dim-fill{height:100%;border-radius:2px}
.dim-val{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;text-align:right}

.hist-row{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px}
.hist-row:last-child{border-bottom:none}
.hist-score{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:16px;min-width:32px}
.hist-tier{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);flex:1}
.hist-date{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted)}
.no-data{font-size:12.5px;color:var(--text-muted);padding:8px 0}

.badge-preview{margin-bottom:12px}
.badge-preview img{height:20px;display:block}
.embed-input-wrap{position:relative}
.embed-input{width:100%;background:var(--bg);border:1px solid var(--border-hi);border-radius:5px;padding:7px 60px 7px 10px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-dim);outline:none;cursor:text}
.copy-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:var(--bg3);color:var(--text-dim);border:none;border-radius:4px;padding:3px 9px;font-family:'JetBrains Mono',monospace;font-size:9.5px;cursor:pointer}
.copy-btn:hover{color:var(--accent)}

.unscored{text-align:center;padding:40px 0}
.unscored-t{font-size:18px;font-weight:600;margin-bottom:8px}
.unscored-d{font-size:13.5px;color:var(--text-dim);margin-bottom:20px;line-height:1.65}
.btn-score{display:inline-block;background:var(--accent);color:var(--bg);border-radius:7px;padding:11px 24px;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;text-decoration:none}
.btn-score:hover{background:#06b6d4;text-decoration:none}

footer{border-top:1px solid var(--border);padding:24px 0 36px;margin-top:40px}
.ft-disc{font-size:10.5px;color:var(--text-muted);line-height:1.7;max-width:680px;margin-bottom:14px}
.ft-bot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.ft-l{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted)}
.ft-links{display:flex;gap:12px}.ft-links a{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);text-decoration:none}.ft-links a:hover{color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">

<nav>
  <a class="logo" href="/">DJD<span> Agent Score</span></a>
  <a class="nav-back" href="/">← leaderboard</a>
</nav>

<div class="agent-hdr">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <div class="agent-name">${esc(displayName)}</div>
    ${isRegistered ? '<span class="reg-badge">REGISTERED</span>' : ''}
    ${isRegistered && reg?.github_verified ? '<span class="reg-badge gh-badge">GH VERIFIED</span>' : ''}
  </div>
  <div class="agent-wallet">${esc(wallet)}</div>
  ${reg?.description ? `<div class="agent-desc">${esc(reg.description)}</div>` : ''}
  <div class="agent-links">
    ${
      reg?.github_url
        ? `<a class="agent-link" href="${esc(reg.github_url)}" target="_blank" rel="noopener">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      ${esc(reg.github_url.replace('https://github.com/', ''))}${reg.github_stars !== null ? ` · ${reg.github_stars}★` : ''}
    </a>`
        : ''
    }
    ${
      reg?.website_url
        ? `<a class="agent-link" href="${esc(reg.website_url)}" target="_blank" rel="noopener">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      ${esc(new URL(reg.website_url).hostname)}
    </a>`
        : ''
    }
  </div>
</div>

${
  !score
    ? `
<div class="unscored" style="padding:60px 0">
  <div class="unscored-t">Not yet scored</div>
  <div class="unscored-d">This wallet hasn't been scored yet. Use the free lookup tool to score it now.</div>
  <a class="btn-score" href="/?wallet=${esc(wallet)}#lookup">Score this wallet →</a>
</div>
`
    : `
<div class="main">
  <!-- LEFT: score + dimensions + history -->
  <div>
    <div class="card">
      <div class="card-label">Composite Score</div>
      <div class="score-big" style="color:${scoreColor(s)}">${s}</div>
      <div class="score-row">
        <span class="sc-tier ${tierClass(tier)}">${esc(tier)}</span>
        <span class="sc-rec ${recClass(rec)}">${esc(rec.replace(/_/g, ' '))}</span>
        ${sybil ? '<span class="sybil-flag">⚠ sybil flag</span>' : ''}
      </div>
      <div class="score-bar-bg"><div class="score-bar-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
      <div class="score-meta">
        Confidence: <span>${(conf * 100).toFixed(0)}%</span><br>
        Model: <span>${esc(score.model_version ?? '1.0.0')}</span>
      </div>
      ${calcAt ? `<div class="updated">Last scored ${fmtDate(calcAt)}</div>` : ''}
    </div>

    <div class="card">
      <div class="card-label">Dimensions</div>
      ${dimBar('Reliability', rel, scoreColor(rel))}
      ${dimBar('Viability', via, scoreColor(via))}
      ${dimBar('Identity', idn, scoreColor(idn))}
      ${dimBar('Behavior', beh, scoreColor(beh))}
      ${dimBar('Capability', cap, scoreColor(cap))}
    </div>

    ${
      historyRows
        ? `
    <div class="card">
      <div class="card-label">Score History</div>
      ${historyRows}
    </div>`
        : ''
    }
  </div>

  <!-- RIGHT: badge + share -->
  <div>
    <div class="card">
      <div class="card-label">Badge</div>
      <div class="badge-preview"><img src="${esc(badgeUrl)}" alt="DJD Agent Score badge" loading="lazy"></div>
      <div class="embed-input-wrap">
        <input class="embed-input" id="embedCode" type="text" readonly value="![DJD Score](${esc(badgeUrl)})">
        <button class="copy-btn" id="copyBtn" onclick="copyEmbed()">copy</button>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:8px">Paste in any Markdown README or website</div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-label">Share</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">Permanent link to this score card:</div>
      <div class="embed-input-wrap">
        <input class="embed-input" id="shareUrl" type="text" readonly value="${esc(pageUrl)}">
        <button class="copy-btn" onclick="copyShare()">copy</button>
      </div>
    </div>

    ${
      !isRegistered
        ? `
    <div class="card" style="margin-top:16px;border-color:rgba(34,211,238,0.2)">
      <div class="card-label" style="color:var(--accent)">Boost this score</div>
      <div style="font-size:12.5px;color:var(--text-dim);line-height:1.65;margin-bottom:14px">Is this your wallet? Register it to add +15 identity points and appear on the leaderboard.</div>
      <a href="/#api-ref" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent)">See registration docs →</a>
    </div>`
        : ''
    }
  </div>
</div>
`
}

<footer>
  <div class="ft-disc">DJD Agent Score is experimental. Scores are algorithmically generated from public blockchain data and unverified submissions. Not financial advice. Not a consumer report under the FCRA. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></div>
  <div class="ft-bot">
    <div class="ft-l">© 2026 DJD Agent Score LLC · Built on Base · Powered by x402</div>
    <div class="ft-links"><a href="/">Home</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/health">Status</a></div>
  </div>
</footer>

</div>
<script>
function copyEmbed(){
  const v=document.getElementById('embedCode').value;
  navigator.clipboard.writeText(v).then(()=>{const b=document.getElementById('copyBtn');b.textContent='copied!';setTimeout(()=>b.textContent='copy',1800);}).catch(()=>{});
}
function copyShare(){
  const inp=document.getElementById('shareUrl');
  navigator.clipboard.writeText(inp.value).then(()=>{}).catch(()=>{inp.select();document.execCommand('copy');});
}
</script>
</body>
</html>`
}
