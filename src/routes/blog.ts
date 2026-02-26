import { Hono } from 'hono'

const blog = new Hono()

// ─── Shared head / design tokens (matches index.html gold/navy system) ───

const blogHead = (title: string, description: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — DJD Agent Score</title>
<meta name="description" content="${description}">
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

/* Nav */
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

/* Footer */
footer{border-top:1px solid var(--border);padding:36px 0 48px;margin-top:80px}
.ft-bot{display:flex;justify-content:space-between;align-items:center;max-width:1080px;margin:0 auto;padding:0 32px}
.ft-l{font-size:12px;color:var(--text-muted)}
.ft-links{display:flex;gap:18px}.ft-links a{font-size:12px;color:var(--text-muted);text-decoration:none;transition:color .2s}.ft-links a:hover{color:var(--accent)}

@media(max-width:768px){
  nav{padding:0 20px}
  .ft-bot{flex-direction:column;gap:12px;text-align:center;padding:0 20px}
  .nav-links{gap:14px}
}
`

const blogNav = `
</style>
</head>
<body>
<div class="nav-outer">
<nav>
  <a class="logo" href="/">DJD<span> Agent Score</span></a>
  <div class="nav-links">
    <a href="/explorer">Explorer</a>
    <a href="/blog" class="active">Blog</a>
    <a href="/#lookup">Score</a>
    <a href="/#api-ref">API</a>
    <a href="https://github.com/jacobsd32-cpu/djdagentscore" target="_blank">GitHub</a>
    <a class="nav-cta" href="/#lookup">Try It Free</a>
  </div>
</nav>
</div>
`

const blogFooter = `
<footer>
<div class="ft-bot">
  <div class="ft-l">&copy; 2026 DJD Agent Score &middot; Identity attestation by <a href="https://insumermodel.com" target="_blank" style="color:var(--text-dim);text-decoration:underline">Insumer Model</a></div>
  <div class="ft-links">
    <a href="/">Home</a>
    <a href="/blog">Blog</a>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
  </div>
</div>
</footer>
</body>
</html>`

// ─── Blog listing page ───

const listingHtml = `${blogHead(
  'Blog',
  'Insights on AI agent reputation, sybil detection, and trust infrastructure for the autonomous agent economy.',
)}
<style>
.blog-hero{max-width:1080px;margin:0 auto;padding:120px 32px 60px;text-align:center}
.blog-hero .chip{display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;color:var(--accent);background:var(--accent-dim);border:1px solid var(--border-hi);padding:6px 16px;border-radius:100px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
.blog-hero h1{font-family:'Instrument Serif',serif;font-size:clamp(32px,5vw,52px);font-weight:400;line-height:1.15;margin-bottom:16px;letter-spacing:-1px}
.blog-hero p{font-size:17px;color:var(--text-dim);max-width:540px;margin:0 auto;line-height:1.75}

.posts{max-width:1080px;margin:0 auto;padding:0 32px;display:grid;gap:24px}
.post-card{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:start;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:40px;transition:all .25s;text-decoration:none;color:inherit}
.post-card:hover{border-color:var(--border-hi);transform:translateY(-2px);text-decoration:none;box-shadow:0 8px 40px rgba(0,0,0,0.2)}
.post-meta{display:flex;gap:12px;align-items:center;margin-bottom:14px}
.post-date{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted)}
.post-tag{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-dim);border:1px solid var(--border-hi);padding:3px 10px;border-radius:100px;text-transform:uppercase;letter-spacing:.5px}
.post-title{font-family:'Instrument Serif',serif;font-size:clamp(22px,3vw,30px);font-weight:400;line-height:1.25;margin-bottom:12px;letter-spacing:-0.3px}
.post-excerpt{font-size:15px;color:var(--text-dim);line-height:1.75;max-width:640px}
.post-read{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);white-space:nowrap;margin-top:20px;opacity:.7;transition:opacity .2s}
.post-card:hover .post-read{opacity:1}

@media(max-width:768px){
  .blog-hero{padding:100px 20px 40px}
  .posts{padding:0 20px}
  .post-card{grid-template-columns:1fr;padding:28px}
}
</style>
${blogNav}

<div class="blog-hero">
  <div class="chip">Insights</div>
  <h1>Building trust infrastructure<br>in the open</h1>
  <p>Research, analysis, and updates from the DJD Agent Score team on sybil detection, on-chain reputation, and the agent economy.</p>
</div>

<div class="posts">

  <a href="/blog/sybil-patterns" class="post-card">
    <div>
      <div class="post-meta">
        <span class="post-date">Feb 26, 2026</span>
        <span class="post-tag">Research</span>
      </div>
      <div class="post-title">5 On-Chain Patterns That Reveal Sybil Agents</div>
      <p class="post-excerpt">How we use on-chain behavioral forensics to separate real AI agents from manufactured identities &mdash; tight cluster rings, symmetric round-trips, coordinated creation, puppet funding, and bot-like timing.</p>
    </div>
    <div class="post-read">Read &rarr;</div>
  </a>

</div>

${blogFooter}`

// ─── Individual article: Sybil Patterns ───

const sybilPostHtml = `${blogHead(
  '5 On-Chain Patterns That Reveal Sybil Agents',
  'How DJD Agent Score uses on-chain behavioral forensics to separate real AI agents from manufactured identities.',
)}
<style>
.article{max-width:720px;margin:0 auto;padding:120px 32px 0}
.article-back{display:inline-flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted);margin-bottom:40px;transition:color .2s}
.article-back:hover{color:var(--accent);text-decoration:none}
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

.signal{background:var(--bg2);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:20px 24px;margin:20px 0;font-size:14px;color:var(--text-dim);line-height:1.75}
.signal strong{color:var(--text)}

.pattern-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:28px;margin:24px 0}
.pattern-num{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.pattern-card h3{margin-top:0;margin-bottom:12px}
.pattern-card p{margin-bottom:12px}
.pattern-card p:last-child{margin-bottom:0}

.code-block{background:#060e1a;border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin:20px 0;overflow-x:auto}
.code-block code{font-family:'JetBrains Mono',monospace;font-size:13px;line-height:1.65;color:var(--text-dim);white-space:pre}

.prose ul{list-style:none;padding:0;margin:16px 0}
.prose ul li{position:relative;padding-left:20px;font-size:14px;color:var(--text-dim);line-height:1.75;margin-bottom:10px}
.prose ul li::before{content:'';position:absolute;left:0;top:10px;width:6px;height:6px;border-radius:50%;background:var(--accent);opacity:.5}

.cta-box{background:var(--accent-dim);border:1px solid var(--border-hi);border-radius:var(--radius);padding:32px;margin:48px 0;text-align:center}
.cta-box p{font-size:14px;color:var(--text-dim);line-height:1.75;margin-bottom:8px}
.cta-box code{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent);background:rgba(99,102,241,0.08);padding:2px 8px;border-radius:4px}
.cta-box .btn{display:inline-flex;align-items:center;gap:6px;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;background:var(--accent);color:var(--bg);text-decoration:none;margin-top:16px;transition:all .2s}
.cta-box .btn:hover{opacity:.9;transform:translateY(-1px);text-decoration:none}

.article-footer{margin-top:56px;padding-top:32px;border-top:1px solid var(--border);font-size:13px;color:var(--text-muted);line-height:1.65;font-style:italic}

@media(max-width:768px){
  .article{padding:100px 20px 0}
}
</style>
${blogNav}

<article class="article">
  <a href="/blog" class="article-back">&larr; All posts</a>
  <div class="article-meta">
    <span class="article-date">Feb 26, 2026</span>
    <span class="article-tag">Research</span>
  </div>
  <h1>5 On-Chain Patterns That Reveal Sybil Agents</h1>
  <p class="lead">The AI agent economy has a trust problem. As autonomous agents begin transacting via protocols like x402, every participant needs to answer a fundamental question: <em>is this agent real, or is it a manufactured identity designed to game the system?</em></p>

  <div class="prose">

    <p>Sybil attacks &mdash; where one operator creates many fake identities to accumulate outsized influence or rewards &mdash; are the oldest trick in decentralized systems. But agents make sybils <strong>cheaper to create</strong> and <strong>harder to detect</strong> than ever before.</p>

    <p>At DJD Agent Score, we analyze on-chain transaction patterns to assign reputation scores to AI agent wallets. Here are five behavioral signatures that reliably expose sybil agents &mdash; even when their operators try to disguise them.</p>

    <!-- Pattern 1 -->
    <div class="pattern-card">
      <div class="pattern-num">Pattern 1</div>
      <h3>Tight Cluster Rings</h3>
      <div class="signal"><strong>The signal:</strong> A wallet's top transaction partners all transact heavily with <em>each other</em>.</div>
      <p>Legitimate agents interact with diverse counterparties. Sybil agents exist in a manufactured ecosystem &mdash; their operator controls all the wallets, so the &ldquo;agents&rdquo; inevitably transact within a tight, interconnected group.</p>
      <p>We build a relationship graph and check whether a wallet's top 5 partners share significant mutual connections. When more than 50% are interconnected, the <code class="mono">tight_cluster</code> indicator fires.</p>
      <p><strong>Real-world analog:</strong> In traditional finance, this is how investigators identify shell company networks &mdash; entities that only transact with each other are likely under common control.</p>
    </div>

    <!-- Pattern 2 -->
    <div class="pattern-card">
      <div class="pattern-num">Pattern 2</div>
      <h3>Symmetric Round-Trips</h3>
      <div class="signal"><strong>The signal:</strong> More than 50% of a wallet's partnerships show nearly equal volume in both directions.</div>
      <p>Real economic activity is asymmetric &mdash; an agent that provides a service collects payments; one that consumes a service pays fees. When an operator simply moves funds between controlled wallets, the amounts going A&rarr;B and B&rarr;A tend to be suspiciously similar.</p>
      <p>When the smaller direction is within 10% of the larger for more than half of a wallet's partnerships, <code class="mono">symmetric_transactions</code> fires. We also detect explicit wash trading &mdash; when more than 40% of 7-day volume consists of round-trips within 24 hours.</p>
    </div>

    <!-- Pattern 3 -->
    <div class="pattern-card">
      <div class="pattern-num">Pattern 3</div>
      <h3>Coordinated Creation Windows</h3>
      <div class="signal"><strong>The signal:</strong> A wallet and its primary transaction partner were both first seen on-chain within the same 24-hour window.</div>
      <p>Organic relationships develop over time. Sybil wallets are deployed in batches &mdash; created on the same day, funded from the same source, and immediately start manufacturing activity between them.</p>
      <p>Timing is the hardest thing to fake retroactively. Once a wallet's creation timestamp is on-chain, it's permanent. This pattern becomes especially powerful when combined with Pattern 4.</p>
    </div>

    <!-- Pattern 4 -->
    <div class="pattern-card">
      <div class="pattern-num">Pattern 4</div>
      <h3>Puppet Funding Chains</h3>
      <div class="signal"><strong>The signal:</strong> A wallet's earliest funding source is also its highest-volume transaction partner.</div>
      <p>Legitimate agents are funded by exchanges, bridges, or treasuries &mdash; neutral infrastructure. Sybil agents are funded by the operator's main wallet, which is also the entity they'll &ldquo;transact&rdquo; with to build fake reputation.</p>
      <p>This is one of our highest-confidence signals. It simultaneously caps both Identity and Reliability dimension scores. <strong>Real agents have independence</strong> &mdash; their funding and revenue come from different sources. Puppet agents have dependence.</p>
    </div>

    <!-- Pattern 5 -->
    <div class="pattern-card">
      <div class="pattern-num">Pattern 5</div>
      <h3>Bot-Like Temporal Signatures</h3>
      <div class="signal"><strong>The signal:</strong> Transactions arrive at metronomically regular intervals, concentrated in a narrow time window.</div>
      <p>This pattern analyzes <em>when</em> a wallet transacts, not who with. Human-directed agents show natural variability &mdash; business hours, weekend gaps, irregular spacing. Sybil scripts run on fixed intervals with unnaturally low variance.</p>
      <p>We measure three things:</p>
      <ul>
        <li><strong>Inter-arrival CV:</strong> Below 0.1 = machine-like regularity</li>
        <li><strong>Hourly entropy:</strong> Low entropy = activity concentrated in a few hours</li>
        <li><strong>Maximum gap:</strong> Genuine agents have downtime. Sybil scripts don't.</li>
      </ul>
    </div>

    <!-- Compounding -->
    <h2>How These Patterns Compound</h2>

    <p>No single pattern is conclusive on its own. The power lies in <em>pattern stacking</em>. We apply each detected pattern as a multiplicative penalty &mdash; the <strong>integrity multiplier</strong>.</p>

    <p>A wallet flagged for tight clustering (0.55x), symmetric transactions (0.60x), and wash trading (0.50x):</p>

    <div class="code-block"><code>0.55 &times; 0.60 &times; 0.50 = 0.165x    &larr; 83.5% score reduction</code></div>

    <p>The multiplier floors at 0.10x &mdash; we never completely zero a score, because even our highest-confidence signals carry some false positive risk. This creates a sharp separation between legitimate agents (near 1.0x) and sybils (below 0.30x).</p>

    <!-- Why it matters -->
    <h2>Why This Matters</h2>

    <p>As AI agents begin operating autonomously in the x402 ecosystem, the ability to distinguish real agents from manufactured ones becomes critical infrastructure:</p>

    <ul>
      <li><strong>Service providers</strong> need to know if a client is trustworthy before extending credit</li>
      <li><strong>Protocols</strong> need to prevent sybils from farming governance influence or rewards</li>
      <li><strong>Marketplaces</strong> need to surface quality agents and suppress fake ones</li>
    </ul>

    <p>With DJD Agent Score now publishing to the on-chain <strong>ERC-8004 Reputation Registry</strong>, these signals are available as public infrastructure. Any protocol on Base can call <code class="mono">getSummary()</code> to check an agent's reputation &mdash; no API key required.</p>

    <div class="cta-box">
      <p>Check your agent's score via x402 micropayments, or verify on-chain at the ERC-8004 Reputation Registry:</p>
      <p><code>0x8004BAa17C55a88189AE136b182e5fdA19dE9b63</code></p>
      <a href="/#lookup" class="btn">Score a Wallet</a>
    </div>

    <p class="article-footer">DJD Agent Score is a reputation scoring engine for autonomous AI agents. Scores are paid via x402 micropayments and published to the ERC-8004 Reputation Registry on Base mainnet.</p>

  </div>
</article>

${blogFooter}`

// ─── Routes ───

blog.get('/', (c) => c.html(listingHtml))
blog.get('/sybil-patterns', (c) => c.html(sybilPostHtml))

export default blog
