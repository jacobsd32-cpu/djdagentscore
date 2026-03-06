import { Hono } from 'hono'

const methodology = new Hono()

// ─── Design tokens (matches blog.ts / index.html) ───

const pageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Scoring Methodology — DJD Agent Score</title>
<meta name="description" content="How DJD Agent Score calculates trust scores: five on-chain dimensions, sybil detection, gaming penalties, and adaptive calibration. Fully transparent methodology.">
<meta property="og:type" content="article">
<meta property="og:title" content="Scoring Methodology — DJD Agent Score">
<meta property="og:description" content="How we score wallets: five on-chain dimensions, sybil detection, gaming penalties, and adaptive calibration.">
<meta property="og:url" content="https://djdagentscore.dev/methodology">
<meta property="og:site_name" content="DJD Agent Score">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Scoring Methodology — DJD Agent Score">
<meta name="twitter:description" content="How we score wallets: five on-chain dimensions, sybil detection, gaming penalties, and adaptive calibration.">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a1628; --bg2: #0d1b2a; --bg3: #132238;
  --surface: #162740; --surface2: #1a3050;
  --border: rgba(99,102,241,0.10); --border-hi: rgba(99,102,241,0.18);
  --text: #f0f2f5; --text-dim: #94a3b8; --text-muted: #4b5c73;
  --accent: #6366f1; --accent-dim: rgba(99,102,241,0.08);
  --green: #34d399; --green-dim: rgba(52,211,153,0.08);
  --yellow: #fbbf24; --red: #f87171; --red-dim: rgba(248,113,113,0.08);
  --orange: #fb923c; --purple: #a78bfa;
  --radius: 16px;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
.mono{font-family:'JetBrains Mono',monospace}
.serif{font-family:'Instrument Serif',serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}

.nav-outer{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(10,22,40,0.82);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
nav{max-width:1080px;margin:0 auto;padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between}
.logo{font-weight:700;font-size:17px;color:var(--accent);letter-spacing:-0.3px;display:flex;align-items:center;gap:8px;text-decoration:none}
.logo:hover{text-decoration:none}
.logo span{color:var(--text-dim);font-weight:400}
.nav-links{display:flex;gap:24px;align-items:center}
.nav-links a{color:var(--text-muted);text-decoration:none;font-size:13px;font-weight:500;transition:color .2s}
.nav-links a:hover{color:var(--accent);text-decoration:none}
.nav-links .active{color:var(--accent)}
.nav-links .nav-cta{color:var(--bg);background:var(--accent);padding:7px 18px;border-radius:8px;font-weight:600;font-size:12px;transition:all .2s}
.nav-links .nav-cta:hover{opacity:.88}

.article{max-width:720px;margin:0 auto;padding:120px 32px 0}
.article-meta{display:flex;gap:12px;align-items:center;margin-bottom:24px}
.article-date{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted)}
.article-tag{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-dim);border:1px solid var(--border-hi);padding:3px 10px;border-radius:100px;text-transform:uppercase;letter-spacing:.5px}
.article h1{font-family:'Instrument Serif',serif;font-size:clamp(30px,4.5vw,46px);font-weight:400;line-height:1.15;margin-bottom:20px;letter-spacing:-0.5px}
.article .lead{font-size:18px;color:var(--text-dim);line-height:1.8;margin-bottom:48px;padding-bottom:40px;border-bottom:1px solid var(--border)}
.prose h2{font-family:'Instrument Serif',serif;font-size:clamp(22px,3vw,30px);font-weight:400;margin-top:56px;margin-bottom:8px;letter-spacing:-0.3px}
.prose h3{font-size:16px;font-weight:700;margin-top:32px;margin-bottom:8px;color:var(--text)}
.prose p{font-size:15px;color:var(--text-dim);line-height:1.85;margin-bottom:16px}
.prose strong{color:var(--text);font-weight:600}
.prose em{color:var(--accent);font-style:italic}
.prose ul{list-style:none;padding:0;margin:16px 0}
.prose ul li{position:relative;padding-left:20px;font-size:14px;color:var(--text-dim);line-height:1.75;margin-bottom:10px}
.prose ul li::before{content:'';position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:.5}

.dim-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px;margin:24px 0}
.dim-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.dim-name{font-family:'Instrument Serif',serif;font-size:22px;font-weight:400}
.dim-weight{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--accent);background:var(--accent-dim);border:1px solid var(--border-hi);padding:4px 12px;border-radius:100px}
.dim-desc{font-size:14px;color:var(--text-dim);line-height:1.75;margin-bottom:16px}
.dim-signals{display:flex;flex-wrap:wrap;gap:8px}
.dim-signal{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);background:var(--bg3);border:1px solid var(--border);padding:4px 10px;border-radius:6px}

.tier-table{width:100%;border-collapse:collapse;margin:24px 0}
.tier-table th{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:12px 16px;border-bottom:1px solid var(--border)}
.tier-table td{font-size:14px;color:var(--text-dim);padding:12px 16px;border-bottom:1px solid var(--border)}
.tier-table tr:last-child td{border-bottom:none}
.tier-name{font-weight:600;color:var(--text)}
.tier-badge{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}

.signal{background:var(--bg2);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:20px 24px;margin:20px 0;font-size:14px;color:var(--text-dim);line-height:1.75}
.signal strong{color:var(--text)}

.code-block{background:#060e1a;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin:20px 0;overflow-x:auto}
.code-block code{font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.65;color:var(--text-dim);white-space:pre}

.cta-box{background:var(--accent-dim);border:1px solid var(--border-hi);border-radius:var(--radius);padding:32px;margin:48px 0;text-align:center}
.cta-box p{font-size:14px;color:var(--text-dim);line-height:1.75;margin-bottom:8px}
.cta-box .btn{display:inline-flex;align-items:center;gap:6px;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;background:var(--accent);color:var(--bg);text-decoration:none;margin-top:16px;transition:all .2s}
.cta-box .btn:hover{opacity:.9;transform:translateY(-1px);text-decoration:none}

footer{border-top:1px solid var(--border);padding:36px 0 48px;margin-top:80px}
.ft-bot{display:flex;justify-content:space-between;align-items:center;max-width:1080px;margin:0 auto;padding:0 32px}
.ft-l{font-size:12px;color:var(--text-muted)}
.ft-links{display:flex;gap:18px}.ft-links a{font-size:12px;color:var(--text-muted);text-decoration:none;transition:color .2s}.ft-links a:hover{color:var(--accent)}

@media(max-width:768px){
  nav{padding:0 20px}
  .article{padding:100px 20px 0}
  .ft-bot{flex-direction:column;gap:12px;text-align:center;padding:0 20px}
  .nav-links{gap:14px}
  .dim-header{flex-direction:column;align-items:flex-start;gap:8px}
  .tier-table{font-size:13px}
}
</style>
</head>
<body>
<div class="nav-outer">
<nav>
  <a class="logo" href="/">DJD<span> Agent Score</span></a>
  <div class="nav-links">
    <a href="/explorer">Explorer</a>
    <a href="/blog">Blog</a>
    <a href="/methodology" class="active">Methodology</a>
    <a href="/pricing">Pricing</a>
    <a href="/#api-ref">API</a>
    <a class="nav-cta" href="/pricing">Get Started</a>
  </div>
</nav>
</div>

<div class="article">
  <div class="article-meta">
    <span class="article-tag">Transparency</span>
    <span class="article-date">Model v2.5.0 &middot; Updated March 2026</span>
  </div>

  <h1>Scoring Methodology</h1>
  <p class="lead">
    DJD Agent Score produces a 0&ndash;100 trust score for any wallet on Base L2. Every score is derived entirely from on-chain data &mdash; no opinions, no manual review, no black boxes. This page explains exactly how it works.
  </p>

  <div class="prose">

    <h2>How it works</h2>
    <p>When your agent calls the API with a wallet address, the scoring engine runs a five-phase pipeline:</p>
    <ul>
      <li><strong>Fetch on-chain data</strong> &mdash; transaction history, USDC transfers, balances, basename, GitHub verification, and Insumer attestations, all pulled directly from the Base blockchain</li>
      <li><strong>Run sybil &amp; gaming detection</strong> &mdash; seven behavioral checks for fake wallet networks, plus gaming detection for wallets inflating their stats</li>
      <li><strong>Calculate five dimensions</strong> &mdash; each dimension produces a 0&ndash;100 sub-score from specific on-chain signals</li>
      <li><strong>Compose final score</strong> &mdash; weighted sum of dimensions, adjusted by integrity multiplier, trajectory, and confidence dampening</li>
      <li><strong>Build explainability</strong> &mdash; confidence level, improvement paths, top contributors and detractors</li>
    </ul>
    <p>The entire pipeline runs against live blockchain state. Scores are cached for one hour, and background jobs continuously refresh stale scores.</p>

    <h2>The five dimensions</h2>
    <p>Each dimension measures a different aspect of wallet trustworthiness. Weights reflect how predictive each dimension is of reliable behavior.</p>

    <div class="dim-card">
      <div class="dim-header">
        <span class="dim-name">Payment Reliability</span>
        <span class="dim-weight">30%</span>
      </div>
      <p class="dim-desc">Does this wallet consistently execute transactions? Measures transaction success rate, total volume (log-scaled), nonce alignment, uptime estimation, and how recently the wallet was active.</p>
      <div class="dim-signals">
        <span class="dim-signal">txSuccessRate</span>
        <span class="dim-signal">txCountLog</span>
        <span class="dim-signal">nonceAlignment</span>
        <span class="dim-signal">uptimeEstimate</span>
        <span class="dim-signal">recencyBonus</span>
      </div>
    </div>

    <div class="dim-card">
      <div class="dim-header">
        <span class="dim-name">Economic Viability</span>
        <span class="dim-weight">25%</span>
      </div>
      <p class="dim-desc">Can this wallet actually pay? Evaluates ETH and USDC balances, income-to-spend ratio, wallet age, balance trends over 7 days, and whether the wallet has ever been drained to zero.</p>
      <div class="dim-signals">
        <span class="dim-signal">ethBalance</span>
        <span class="dim-signal">usdcBalance</span>
        <span class="dim-signal">incomeRatio</span>
        <span class="dim-signal">walletAge</span>
        <span class="dim-signal">balanceTrend</span>
        <span class="dim-signal">zeroBalancePenalty</span>
      </div>
    </div>

    <div class="dim-card">
      <div class="dim-header">
        <span class="dim-name">Identity</span>
        <span class="dim-weight">20%</span>
      </div>
      <p class="dim-desc">Has this wallet established a verifiable identity? Checks for agent registration, Base Name Service ownership, GitHub verification with activity signals, and multi-chain attestations via Insumer.</p>
      <div class="dim-signals">
        <span class="dim-signal">registration</span>
        <span class="dim-signal">basename</span>
        <span class="dim-signal">githubVerified</span>
        <span class="dim-signal">githubActivity</span>
        <span class="dim-signal">insumerAttestation</span>
      </div>
    </div>

    <div class="dim-card">
      <div class="dim-header">
        <span class="dim-name">Behavior</span>
        <span class="dim-weight">15%</span>
      </div>
      <p class="dim-desc">Does this wallet behave like a legitimate actor or a bot? Analyzes transaction timing patterns using inter-arrival coefficient of variation, hourly entropy (how spread out activity is across the day), and maximum gaps between transactions.</p>
      <div class="dim-signals">
        <span class="dim-signal">interArrivalCV</span>
        <span class="dim-signal">hourlyEntropy</span>
        <span class="dim-signal">maxGapHours</span>
      </div>
    </div>

    <div class="dim-card">
      <div class="dim-header">
        <span class="dim-name">Capability</span>
        <span class="dim-weight">10%</span>
      </div>
      <p class="dim-desc">Is this wallet actively providing services in the agent economy? Measures active x402 service endpoints, total revenue earned, unique counterparties served, and how long the wallet has been operating.</p>
      <div class="dim-signals">
        <span class="dim-signal">x402Services</span>
        <span class="dim-signal">revenue</span>
        <span class="dim-signal">uniqueCounterparties</span>
        <span class="dim-signal">serviceLongevity</span>
      </div>
    </div>

    <h2>Composite score formula</h2>
    <p>The final score is not just a simple weighted average. Three additional layers refine it:</p>
    <div class="code-block"><code>raw = Reliability&times;0.30 + Viability&times;0.25 + Identity&times;0.20
    + Behavior&times;0.15 + Capability&times;0.10

adjusted = raw + trajectoryModifier      // &plusmn;5 from sustained trends
final    = adjusted &times; integrityMultiplier  // penalizes sybil/gaming/fraud
output   = clamp(0, 100, final)          // dampened by confidence level</code></div>

    <p><strong>Trajectory modifier</strong> &mdash; analyzes the wallet's score history. Sustained improvement adds up to +5; sustained decline subtracts up to &minus;5. New wallets start at zero modifier.</p>
    <p><strong>Integrity multiplier</strong> &mdash; a compound penalty from sybil indicators, gaming flags, and fraud reports. A clean wallet has a multiplier of 1.0. Flagged wallets get dampened toward zero.</p>
    <p><strong>Confidence dampening</strong> &mdash; wallets with long histories and many data points have high confidence, which limits score volatility. New wallets with little data have low confidence, allowing larger score swings as new information arrives.</p>

    <h2>Tiers</h2>
    <table class="tier-table">
      <thead>
        <tr><th>Tier</th><th>Score Range</th><th>Meaning</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="tier-badge" style="background:#a78bfa"></span><span class="tier-name">Elite</span></td>
          <td>90 &ndash; 100</td>
          <td>Exceptional track record across all dimensions</td>
        </tr>
        <tr>
          <td><span class="tier-badge" style="background:#34d399"></span><span class="tier-name">Trusted</span></td>
          <td>75 &ndash; 89</td>
          <td>Reliable actor with verified identity and consistent history</td>
        </tr>
        <tr>
          <td><span class="tier-badge" style="background:#6366f1"></span><span class="tier-name">Established</span></td>
          <td>50 &ndash; 74</td>
          <td>Active wallet with reasonable history, some dimensions still developing</td>
        </tr>
        <tr>
          <td><span class="tier-badge" style="background:#fbbf24"></span><span class="tier-name">Emerging</span></td>
          <td>25 &ndash; 49</td>
          <td>Limited history or mixed signals &mdash; proceed with caution</td>
        </tr>
        <tr>
          <td><span class="tier-badge" style="background:#f87171"></span><span class="tier-name">Unverified</span></td>
          <td>0 &ndash; 24</td>
          <td>Insufficient data or significant red flags</td>
        </tr>
      </tbody>
    </table>

    <div class="signal">
      <strong>Adaptive thresholds.</strong> Tier boundaries are not static. An auto-recalibration job runs every 6 hours, adjusting breakpoints based on the actual score distribution and outcome data. This prevents tier inflation as more wallets enter the system.
    </div>

    <h2>Sybil &amp; gaming detection</h2>
    <p>A high score means nothing if wallets can fake it. The engine runs two layers of detection before scoring:</p>

    <h3>Sybil detection (7 checks)</h3>
    <p>Identifies fake wallet networks using the on-chain relationship graph stored in SQLite. Checks for circular funding patterns, shared funding sources, coordinated transaction timing, low-diversity counterparties, and other network topology signals. Flagged wallets receive hard caps on Reliability, Viability, and Identity scores.</p>

    <h3>Gaming detection</h3>
    <p>Catches wallets inflating their stats. Detects window dressing (temporarily inflating balances before a score check), wash trading (self-transfers to boost volume), and query manipulation. Gaming penalties are applied as a direct deduction from the composite score.</p>

    <div class="signal">
      <strong>Two-layer penalty system.</strong> Sybil indicators cap individual dimension scores. Gaming indicators reduce the composite score directly. Both feed into the integrity multiplier, which dampens the final output. A wallet cannot game one dimension without triggering penalties that affect the overall score.
    </div>

    <h2>Data sources</h2>
    <p>Every signal comes from verifiable on-chain data on Base L2:</p>
    <ul>
      <li><strong>Base blockchain RPC</strong> &mdash; transaction history, nonces, ETH balances, contract interactions</li>
      <li><strong>USDC transfer events</strong> &mdash; token transfers indexed from on-chain event logs</li>
      <li><strong>Base Name Service</strong> &mdash; .base.eth name ownership</li>
      <li><strong>GitHub API</strong> &mdash; repository verification, stars, recent activity (for registered agents)</li>
      <li><strong>Insumer Model</strong> &mdash; multi-chain attestations (USDC/Base, ENS, Optimism, Arbitrum, stETH)</li>
      <li><strong>Internal indexer</strong> &mdash; continuously indexes Base blocks (every 12 seconds), building a local relationship graph of wallet interactions</li>
    </ul>
    <p>No off-chain opinions, manual reviews, or centralized databases influence the score. If it's not on-chain or verifiably linked to an on-chain identity, it doesn't count.</p>

    <h2>Outcome tracking</h2>
    <p>Scores are only useful if they predict real behavior. The engine tracks outcomes after scoring:</p>
    <ul>
      <li>Did high-scored wallets follow through on payments?</li>
      <li>Did low-scored wallets exhibit fraudulent behavior?</li>
      <li>How do scores correlate with subsequent on-chain activity?</li>
    </ul>
    <p>This outcome data feeds the auto-recalibration system, which adjusts dimension weights and tier thresholds over time. The model gets more accurate as more wallets are scored and more outcomes are observed.</p>

    <h2>What we don't do</h2>
    <ul>
      <li>No manual score overrides &mdash; every score is algorithmically derived</li>
      <li>No pay-to-improve &mdash; the certification product verifies existing scores, it doesn't boost them</li>
      <li>No off-chain data &mdash; social media followers, KYC status, and reputation claims are not inputs</li>
      <li>No model secrecy &mdash; this page documents the methodology; the scoring engine source code will be published</li>
    </ul>

    <div class="cta-box">
      <p>Try it yourself. Score any Base wallet in under 200ms.</p>
      <a class="btn" href="/#api-ref">View API Reference &rarr;</a>
    </div>

    <p style="margin-top:32px;font-size:13px;color:var(--text-muted);font-style:italic">
      Model version 2.5.0. This methodology is a living document &mdash; updated as the scoring engine evolves.
      Questions or feedback? Reach out at <a href="mailto:jacobsd32@gmail.com">jacobsd32@gmail.com</a>.
    </p>
  </div>
</div>

<footer>
<div class="ft-bot">
  <div class="ft-l">&copy; 2026 DJD Agent Score &middot; Identity attestation by <a href="https://insumermodel.com" target="_blank" style="color:var(--text-dim);text-decoration:underline">Insumer Model</a></div>
  <div class="ft-links">
    <a href="/">Home</a>
    <a href="/blog">Blog</a>
    <a href="/methodology">Methodology</a>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </div>
</div>
</footer>
</body>
</html>`

methodology.get('/', (c) => c.html(pageHtml))

export default methodology
