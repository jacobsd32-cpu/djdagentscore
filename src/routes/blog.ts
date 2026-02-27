import { Hono } from 'hono'

const blog = new Hono()

// ─── Shared head / design tokens (matches index.html gold/navy system) ───

const blogHead = (title: string, description: string, slug = '') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — DJD Agent Score</title>
<meta name="description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title} — DJD Agent Score">
<meta property="og:description" content="${description}">
<meta property="og:url" content="https://djdagentscore.dev/blog${slug ? `/${slug}` : ''}">
<meta property="og:site_name" content="DJD Agent Score">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title} — DJD Agent Score">
<meta name="twitter:description" content="${description}">
<link rel="alternate" type="application/rss+xml" title="DJD Agent Score Blog" href="https://djdagentscore.dev/blog/rss.xml">
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

// ─── Shared article CSS (used by all blog posts) ───

const BLOG_ARTICLE_CSS = `
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
@media(max-width:768px){.article{padding:100px 20px 0}}
`

/** Generates head + shared article CSS for blog post pages. Pass extra CSS for post-specific styles. */
const blogPostHead = (title: string, description: string, slug: string, extraCss = '') =>
  `${blogHead(title, description, slug)}${BLOG_ARTICLE_CSS}${extraCss}`

// ─── Blog listing page ───

const listingHtml = `${blogHead(
  'Blog',
  'Insights on AI agent reputation, sybil detection, and trust infrastructure for the autonomous agent economy.',
)}
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
${blogNav}

<div class="blog-hero">
  <div class="chip">Insights</div>
  <h1>Building trust infrastructure<br>in the open</h1>
  <p>Research, analysis, and updates from the DJD Agent Score team on sybil detection, on-chain reputation, and the agent economy.</p>
</div>

<div class="posts">

  <a href="/blog/v2-4-0" class="post-card">
    <div>
      <div class="post-meta">
        <span class="post-date">Feb 27, 2026</span>
        <span class="post-tag">Release</span>
      </div>
      <div class="post-title">v2.4.0: Score Accuracy, Data Transparency, and a Code Audit</div>
      <p class="post-excerpt">Model v2.4.0 ships fixes for cache mutation, missing indicators, NaN edge cases, and adds a new dataSource field so consumers always know where their score came from.</p>
    </div>
    <div class="post-read">Read &rarr;</div>
  </a>

  <a href="/blog/on-chain-activity" class="post-card">
    <div>
      <div class="post-meta">
        <span class="post-date">Feb 27, 2026</span>
        <span class="post-tag">Case Study</span>
      </div>
      <div class="post-title">What We Found Analyzing Real Wallet Activity on Base</div>
      <p class="post-excerpt">We analyzed our own payment wallet and discovered real x402 transfers, address poisoning attacks, and a fake token scam. Here is what on-chain forensics looks like in practice.</p>
    </div>
    <div class="post-read">Read &rarr;</div>
  </a>

  <a href="/blog/what-is-erc-8004" class="post-card">
    <div>
      <div class="post-meta">
        <span class="post-date">Feb 27, 2026</span>
        <span class="post-tag">Infrastructure</span>
      </div>
      <div class="post-title">What is ERC-8004? On-Chain Reputation for AI Agents</div>
      <p class="post-excerpt">A deep dive into the Ethereum standard that puts AI agent reputation on-chain &mdash; how it works, why it matters, and how DJD Agent Score publishes to the registry on Base.</p>
    </div>
    <div class="post-read">Read &rarr;</div>
  </a>

  <a href="/blog/cold-start-problem" class="post-card">
    <div>
      <div class="post-meta">
        <span class="post-date">Feb 27, 2026</span>
        <span class="post-tag">Analysis</span>
      </div>
      <div class="post-title">The Cold Start Problem for AI Agents</div>
      <p class="post-excerpt">Every new agent wallet starts at zero. How do you bootstrap trust when there&rsquo;s no history? We break down the cold start problem and the scoring strategies that solve it.</p>
    </div>
    <div class="post-read">Read &rarr;</div>
  </a>

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

const sybilPostHtml = `${blogPostHead(
  '5 On-Chain Patterns That Reveal Sybil Agents',
  'How DJD Agent Score uses on-chain behavioral forensics to separate real AI agents from manufactured identities.',
  'sybil-patterns',
)}
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

// ─── Individual article: ERC-8004 ───

const erc8004PostHtml = `${blogPostHead(
  'What is ERC-8004? On-Chain Reputation for AI Agents',
  'A deep dive into the Ethereum standard that puts AI agent reputation on-chain — how it works, why it matters, and how DJD Agent Score publishes to the registry on Base.',
  'what-is-erc-8004',
)}
${blogNav}

<article class="article">
  <a href="/blog" class="article-back">&larr; All posts</a>
  <div class="article-meta">
    <span class="article-date">Feb 27, 2026</span>
    <span class="article-tag">Infrastructure</span>
  </div>
  <h1>What is ERC-8004? On-Chain Reputation for AI Agents</h1>
  <p class="lead">AI agents are starting to transact autonomously. But smart contracts can&rsquo;t Google someone&rsquo;s reputation. <em>ERC-8004 puts reputation where contracts can read it &mdash; on-chain.</em></p>

  <div class="prose">

    <p>When a human hires a freelancer, they check reviews, ratings, and work history. When a smart contract routes a task to an AI agent, it has none of that context. The agent is just a wallet address. ERC-8004 changes that by creating a <strong>standardized, on-chain reputation registry</strong> that any contract can query.</p>

    <h2>The Problem: Reputation Lives Off-Chain</h2>

    <p>Today, reputation data for AI agents is scattered across proprietary APIs, centralized databases, and siloed platforms. This creates three problems:</p>

    <ul>
      <li><strong>Smart contracts can&rsquo;t access it.</strong> A DeFi protocol can&rsquo;t call an HTTP API mid-transaction to check if an agent is trustworthy.</li>
      <li><strong>It&rsquo;s not composable.</strong> Reputation earned on one platform doesn&rsquo;t transfer to another.</li>
      <li><strong>It&rsquo;s censorable.</strong> A centralized provider can revoke or manipulate scores at will.</li>
    </ul>

    <p>For the agent economy to scale, reputation needs to be <strong>on-chain, permissionless, and standardized</strong> &mdash; just like token balances or ENS names.</p>

    <h2>How ERC-8004 Works</h2>

    <p>ERC-8004 defines a minimal interface for a <em>Reputation Registry</em> &mdash; a smart contract that maps wallet addresses to reputation summaries. The core function is simple:</p>

    <div class="code-block"><code>function getSummary(address wallet)
  returns (
    uint8 score,       // 0-100 composite score
    uint8 confidence,  // 0-100 data confidence
    uint32 lastUpdate, // unix timestamp
    bytes metadata     // flexible payload
  )</code></div>

    <p>Any contract on the same chain can call <code class="mono">getSummary()</code> to get a wallet&rsquo;s reputation in a single read &mdash; no oracle, no API key, no off-chain dependency.</p>

    <div class="pattern-card">
      <div class="pattern-num">Key Design Decisions</div>
      <h3>Why These Four Fields?</h3>
      <p><strong>Score (0-100):</strong> A universal, human-readable trust signal. Protocols can set their own thresholds &mdash; &ldquo;only accept agents above 60&rdquo; or &ldquo;require 80+ for high-value tasks.&rdquo;</p>
      <p><strong>Confidence (0-100):</strong> Separates &ldquo;we don&rsquo;t know&rdquo; from &ldquo;we know they&rsquo;re bad.&rdquo; A new wallet with score 40 and confidence 15 is very different from an established wallet with score 40 and confidence 90.</p>
      <p><strong>Last Update:</strong> Staleness detection. Protocols can require scores updated within the last 7 days.</p>
      <p><strong>Metadata:</strong> Flexible bytes field for publisher-specific data &mdash; dimension breakdowns, flag arrays, attestation hashes.</p>
    </div>

    <h2>DJD Agent Score + ERC-8004</h2>

    <p>DJD Agent Score is one of the first publishers to the ERC-8004 registry on <strong>Base mainnet</strong>. When you score a wallet through our API, we publish the result on-chain:</p>

    <div class="code-block"><code>Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
Network:  Base (Chain ID 8453)
Standard: ERC-8004 Reputation Registry</code></div>

    <p>This means any protocol on Base can check an agent&rsquo;s DJD score without calling our API. The data is already there, on-chain, waiting to be read.</p>

    <h2>What This Enables</h2>

    <p>With reputation on-chain, new patterns become possible:</p>

    <ul>
      <li><strong>Gated access:</strong> A DeFi protocol requires agents to have a score above 50 before granting borrowing privileges.</li>
      <li><strong>Tiered pricing:</strong> An x402 service charges lower fees to high-reputation agents (less risk = lower cost).</li>
      <li><strong>Automated trust:</strong> A multi-agent workflow checks counterparty reputation before delegating sensitive tasks &mdash; no human in the loop.</li>
      <li><strong>Sybil resistance:</strong> A governance protocol weighs votes by reputation score, making sybil attacks economically impractical.</li>
    </ul>

    <h2>The Bigger Picture</h2>

    <p>ERC-8004 isn&rsquo;t just about DJD Agent Score. The standard is designed for <strong>multiple publishers</strong> to coexist. Different scoring engines can publish to the same registry, and consumers can choose which publisher they trust &mdash; or aggregate across several.</p>

    <p>This is how internet reputation should work: <strong>open, composable, and owned by no one.</strong> The same way ERC-20 standardized tokens and ERC-721 standardized NFTs, ERC-8004 standardizes reputation. The agent economy needs this primitive.</p>

    <div class="cta-box">
      <p>Query the ERC-8004 registry directly on Base, or score a wallet through our API:</p>
      <p><code>0x8004BAa17C55a88189AE136b182e5fdA19dE9b63</code></p>
      <a href="/#lookup" class="btn">Score a Wallet</a>
    </div>

    <p class="article-footer">DJD Agent Score publishes to the ERC-8004 Reputation Registry on Base mainnet. Scores are paid via x402 micropayments. Registry reads are free and permissionless.</p>

  </div>
</article>

${blogFooter}`

// ─── Individual article: Cold Start Problem ───

const coldStartPostHtml = `${blogPostHead(
  'The Cold Start Problem for AI Agents',
  'Every new agent wallet starts at zero. How do you bootstrap trust when there is no history? We break down the cold start problem and the scoring strategies that solve it.',
  'cold-start-problem',
)}
${blogNav}

<article class="article">
  <a href="/blog" class="article-back">&larr; All posts</a>
  <div class="article-meta">
    <span class="article-date">Feb 27, 2026</span>
    <span class="article-tag">Analysis</span>
  </div>
  <h1>The Cold Start Problem for AI Agents</h1>
  <p class="lead">Every new agent wallet starts with a score of zero. No transactions, no counterparties, no history. <em>How do you earn trust when you have nothing to show?</em></p>

  <div class="prose">

    <p>The cold start problem is familiar territory in tech &mdash; Uber needed drivers before riders, Airbnb needed listings before guests. For AI agents, the problem is sharper: an agent with no on-chain history is <strong>indistinguishable from a sybil</strong>. Both have empty wallets, zero transactions, and no reputation.</p>

    <p>At DJD Agent Score, cold start isn&rsquo;t an edge case &mdash; it&rsquo;s the default state. Every wallet we score started at zero. Here&rsquo;s how our scoring engine handles it.</p>

    <h2>Why Cold Start Is Hard</h2>

    <p>Our scoring engine evaluates wallets across five dimensions: <strong>Activity, Reliability, Identity, Consistency, and Integrity</strong>. Each dimension draws on behavioral data. When there&rsquo;s no behavior to analyze, the system faces a choice:</p>

    <div class="pattern-card">
      <div class="pattern-num">The Dilemma</div>
      <h3>Score Low or Score Unknown?</h3>
      <p><strong>Option A: Default to zero.</strong> Safe, but punishes legitimate new agents. Nobody would use a service that brands every newcomer as untrustworthy.</p>
      <p><strong>Option B: Default to neutral.</strong> Generous, but sybils exploit it immediately. A score of 50 on day one means fake agents start with credibility they haven&rsquo;t earned.</p>
      <p><strong>Our approach: Score honestly, but signal confidence separately.</strong> A new wallet gets a low score <em>and</em> a low confidence rating. The score reflects limited data. The confidence tells consumers how much to trust that score.</p>
    </div>

    <h2>The Confidence Signal</h2>

    <p>This is why the ERC-8004 standard includes a <strong>confidence field</strong> alongside the score. A wallet with score 35 and confidence 12 means: &ldquo;we think this agent is in the low-to-mid range, but we have very little data.&rdquo;</p>

    <p>Protocols consuming our scores can use confidence to set policy:</p>

    <div class="code-block"><code>// Conservative: require both high score AND high confidence
if (score >= 60 && confidence >= 70) allow();

// Permissive: accept low confidence for low-stakes tasks
if (score >= 30 || confidence < 20) allowWithLimits();</code></div>

    <p>This lets new agents participate in the economy immediately &mdash; just with appropriate guardrails.</p>

    <h2>Three Paths Out of Cold Start</h2>

    <p>New agents aren&rsquo;t stuck at zero forever. Our scoring engine recognizes three acceleration paths:</p>

    <div class="pattern-card">
      <div class="pattern-num">Path 1</div>
      <h3>Identity Verification</h3>
      <p>Register on the <strong>ERC-8004 registry</strong> and verify a GitHub account. This doesn&rsquo;t require any transaction history &mdash; it&rsquo;s a pure identity signal. A wallet that&rsquo;s registered and GitHub-verified immediately gains points in the Identity dimension.</p>
      <p>This is the fastest path from zero. It costs gas for registration plus a GitHub verification, and it signals that the operator is willing to invest in their agent&rsquo;s identity.</p>
    </div>

    <div class="pattern-card">
      <div class="pattern-num">Path 2</div>
      <h3>Organic Transaction History</h3>
      <p>Transact with <strong>diverse, established counterparties</strong>. The Activity and Reliability dimensions reward wallets that interact with many different addresses over time. A wallet with 10 transactions across 8 unique counterparties over 30 days builds a meaningfully different profile than one with 10 transactions to the same address.</p>
      <p>This is the natural path &mdash; agents that are actually doing useful work accumulate reputation as a byproduct.</p>
    </div>

    <div class="pattern-card">
      <div class="pattern-num">Path 3</div>
      <h3>Consistent Behavior Over Time</h3>
      <p>The Consistency dimension rewards <strong>predictable, sustained activity</strong>. An agent that transacts regularly over weeks scores higher than one with sporadic bursts. This dimension is specifically designed to be hard for sybils to fake &mdash; maintaining consistent activity across many fake wallets is expensive.</p>
      <p>Time is the one resource that can&rsquo;t be manufactured. An agent that&rsquo;s been consistently active for 60 days has earned something that money alone can&rsquo;t buy.</p>
    </div>

    <h2>Why We Don&rsquo;t Offer &ldquo;Reputation Bootstrapping&rdquo;</h2>

    <p>Some reputation systems let you pay to bootstrap a score &mdash; essentially buying credibility. We deliberately avoid this. If you can buy a high score, sybils can too, and the score becomes meaningless.</p>

    <p>Our design principle is simple: <strong>reputation must be earned through observable behavior, not purchased.</strong> Identity verification is the one exception &mdash; and even that only affects a single dimension, not the overall score.</p>

    <p>The cold start period is a feature, not a bug. It&rsquo;s the cost of entry into a trust network. By making reputation expensive to earn and impossible to buy, we make it <em>meaningful</em>.</p>

    <h2>What This Means for Agent Builders</h2>

    <p>If you&rsquo;re deploying a new AI agent, here&rsquo;s the practical playbook:</p>

    <ul>
      <li><strong>Day 1:</strong> Register on ERC-8004 and verify GitHub. Immediate Identity boost.</li>
      <li><strong>Week 1-2:</strong> Start transacting with real services. Focus on diversity of counterparties over volume.</li>
      <li><strong>Month 1+:</strong> Maintain consistent activity. The Consistency dimension compounds over time.</li>
      <li><strong>Ongoing:</strong> Avoid patterns that look like wash trading or sybil behavior (see our post on <a href="/blog/sybil-patterns">sybil patterns</a>).</li>
    </ul>

    <p>Your score will climb naturally as your agent builds real history. There are no shortcuts &mdash; and that&rsquo;s exactly the point.</p>

    <div class="cta-box">
      <p>Check where your agent stands today:</p>
      <a href="/#lookup" class="btn">Score a Wallet</a>
    </div>

    <p class="article-footer">DJD Agent Score evaluates AI agent wallets across five behavioral dimensions. Scores are published to the ERC-8004 Reputation Registry on Base mainnet.</p>

  </div>
</article>

${blogFooter}`

// ─── Individual article: On-Chain Activity ───

const onchainActivityPostHtml = `${blogPostHead(
  'What We Found Analyzing Real Wallet Activity on Base',
  'We analyzed our own payment wallet and discovered real x402 transfers, address poisoning attacks, and a fake token scam. Here is what on-chain forensics looks like in practice.',
  'on-chain-activity',
  `
.tx-table{width:100%;border-collapse:collapse;margin:20px 0;font-size:13px}
.tx-table th{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-muted);text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.5px}
.tx-table td{padding:10px 12px;border-bottom:1px solid var(--border);color:var(--text-dim);font-family:'JetBrains Mono',monospace;font-size:12px}
.tx-table tr:last-child td{border-bottom:none}
.tx-in{color:#22c55e}
.tx-out{color:#ef4444}
.tx-scam{color:#f59e0b;font-weight:700}
@media(max-width:768px){.tx-table{font-size:11px}.tx-table th,.tx-table td{padding:8px 6px}}
`,
)}
${blogNav}

<article class="article">
  <a href="/blog" class="article-back">&larr; All posts</a>
  <div class="article-meta">
    <span class="article-date">Feb 26, 2026</span>
    <span class="article-tag">Case Study</span>
  </div>
  <h1>What We Found Analyzing Real Wallet Activity on Base</h1>
  <p class="lead">We pulled the full transaction history of our own payment wallet on Base. What we found was a window into the real on-chain environment AI agents operate in &mdash; including an address poisoning attack we caught in the act.</p>

  <div class="prose">

    <p>Most discussions about AI agent security are theoretical. We wanted to show what it actually looks like when you examine real on-chain data. So we analyzed the DJD Agent Score payment wallet &mdash; the address that receives x402 micropayments for API calls.</p>

    <p>Here is what the data showed, the attack we discovered, and why this matters for anyone building in the agent economy.</p>

    <!-- The Wallet -->
    <h2>The Wallet</h2>

    <p>Our x402 payment wallet on Base mainnet:</p>

    <div class="code-block"><code>0x3E4Ef1f774857C69E33ddDC471e110C7Ac7bB528</code></div>

    <p>This is the address specified in our <code class="mono">fly.toml</code> as the <code class="mono">PAY_TO</code> target. Every paid API call routes USDC here through the x402 facilitator. We pulled the full ERC-20 transfer history using Etherscan&rsquo;s export and Base RPC <code class="mono">eth_getLogs</code> queries.</p>

    <!-- Real Transfers -->
    <h2>The Real Transfers</h2>

    <p>The legitimate USDC activity broke down cleanly:</p>

    <table class="tx-table">
      <thead>
        <tr><th>Direction</th><th>Amount</th><th>Counterparty</th><th>Method</th></tr>
      </thead>
      <tbody>
        <tr><td class="tx-in">IN</td><td>24.39 USDC</td><td>Coinbase Hot Wallet</td><td>Transfer</td></tr>
        <tr><td class="tx-out">OUT</td><td>5.00 USDC &times;3</td><td>0x21DD37E3&hellip;e7Be10</td><td>TransferWithAuthorization</td></tr>
        <tr><td class="tx-out">OUT</td><td>3.36 USDC</td><td>0x930fEb56&hellip;CBb7a</td><td>TransferWithAuthorization</td></tr>
        <tr><td class="tx-in">IN</td><td>0.01 USDC</td><td>0xfc6087&hellip;2B09</td><td>Transfer</td></tr>
      </tbody>
    </table>

    <p>The initial 24.39 USDC came from <strong>Coinbase</strong> (tagged as &ldquo;Coinbase 42&rdquo; on Etherscan &mdash; one of Coinbase&rsquo;s hot wallets at <code class="mono">0x40EbC1&hellip;</code>). The outgoing transfers used <strong>EIP-3009 TransferWithAuthorization</strong>, which is the mechanism x402 facilitators use to move funds with off-chain signed approvals.</p>

    <div class="signal"><strong>Key insight:</strong> TransferWithAuthorization (EIP-3009) is how the x402 protocol works under the hood. The payer signs an off-chain message authorizing a specific transfer, and the facilitator submits it on-chain. This is why you see the facilitator address as the transaction sender, not the actual payer.</div>

    <!-- The Attack -->
    <h2>The Address Poisoning Attack</h2>

    <p>Mixed in with the legitimate transfers, we found something else: <strong>eight zero-value transfers</strong> of a token called &ldquo;&#42861;&#42834;&#42835;&#42842;&rdquo; sent to an address that looked almost identical to one of our real counterparties.</p>

    <div class="pattern-card">
      <div class="pattern-num">The Scam</div>
      <h3>Address Poisoning via Fake Tokens</h3>
      <div class="signal"><strong>Real address:</strong> 0x21DD<strong>37E3</strong>E4eA6CCC0a5C98A4944702eDE6<strong>e7Be10</strong></div>
      <div class="signal"><strong>Scam address:</strong> 0x21DD<strong>F521</strong>14F53CcFe37ddd3DC503853B52<strong>C6Be10</strong></div>
      <p>The attacker created a token with a name that uses <em>Unicode lookalike characters</em> to visually impersonate USDC. The token name &ldquo;&#42861;&#42834;&#42835;&#42842;&rdquo; uses characters from the Lisu script (Unicode block U+A4D0) that resemble Latin letters U, S, D, C.</p>
      <p>The scam address was chosen to match the <strong>first four and last four characters</strong> of our real transaction partner. If someone copies the address from their transaction history without carefully checking the middle bytes, they send funds to the attacker.</p>
    </div>

    <h3>How Address Poisoning Works</h3>

    <p>The attack follows a specific playbook:</p>

    <ul>
      <li><strong>Step 1:</strong> Monitor the mempool for USDC transfers to identify active wallets and their counterparties</li>
      <li><strong>Step 2:</strong> Generate a &ldquo;vanity&rdquo; address that matches the first and last few characters of a real recipient</li>
      <li><strong>Step 3:</strong> Deploy a fake ERC-20 token that visually mimics USDC (in this case, using Unicode Lisu characters)</li>
      <li><strong>Step 4:</strong> Send zero-value transfers of the fake token from the target wallet to the scam address, polluting the transaction history</li>
      <li><strong>Step 5:</strong> Wait for the victim to copy-paste the wrong address from their history</li>
    </ul>

    <p>The attacker bears almost no cost &mdash; sending zero-value ERC-20 transfers on Base costs fractions of a cent. But a single successful poisoning can yield thousands in stolen funds.</p>

    <!-- Why This Matters -->
    <h2>Why This Matters for AI Agents</h2>

    <p>Here is the thing: <strong>AI agents are even more vulnerable to this attack than humans.</strong></p>

    <p>When an autonomous agent needs to send funds, it often references recent transaction history to find the right address. If the agent&rsquo;s address resolution logic does a fuzzy match on &ldquo;starts with 0x21DD and ends with Be10,&rdquo; it will match the poisoned address. Unlike a human who might notice the middle bytes look different, a poorly designed agent will happily send real USDC to the scam address.</p>

    <p>This is exactly the kind of threat that reputation scoring can help mitigate:</p>

    <ul>
      <li><strong>Transaction graph analysis</strong> can detect when a wallet&rsquo;s history contains suspicious zero-value token transfers from unknown contracts</li>
      <li><strong>Counterparty scoring</strong> can flag addresses that appear in poisoning campaigns across multiple victims</li>
      <li><strong>Token contract verification</strong> can identify fake tokens that impersonate established assets using Unicode tricks</li>
    </ul>

    <!-- Forensic Methodology -->
    <h2>The Forensic Methodology</h2>

    <p>We used two approaches to pull this data:</p>

    <h3>1. Etherscan ERC-20 Export</h3>
    <p>Etherscan&rsquo;s token transfer CSV export captures all ERC-20 events for an address. This is the easiest way to see the full picture &mdash; including fake tokens that won&rsquo;t show up in standard wallet UIs.</p>

    <h3>2. Direct RPC Queries</h3>
    <p>We queried Base&rsquo;s RPC endpoint using <code class="mono">eth_getLogs</code> filtered by the ERC-20 Transfer event signature:</p>

    <div class="code-block"><code>Topic 0: 0xddf252ad1be2c89b69c2b068fc378daa
         952ba7f163c4a11628f55a4df523b3ef

Filter: address = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
        topic1 or topic2 = our wallet address</code></div>

    <p>Filtering by the <strong>real USDC contract address</strong> is the key differentiator. The RPC query only returns genuine USDC transfers, while the Etherscan export shows everything &mdash; real and fake tokens alike. Comparing the two is how we identified the poisoning attack.</p>

    <!-- What You Can Learn -->
    <h2>What You Can Learn from Your Wallet</h2>

    <p>If you&rsquo;re running an x402-enabled agent or API, here is how to audit your own payment wallet:</p>

    <ul>
      <li><strong>Export your ERC-20 history</strong> from Etherscan/Basescan and look for tokens you don&rsquo;t recognize</li>
      <li><strong>Compare addresses character by character</strong> &mdash; don&rsquo;t trust first-4/last-4 matching</li>
      <li><strong>Filter RPC logs by contract address</strong> to isolate real USDC transfers from noise</li>
      <li><strong>Check for zero-value transfers</strong> &mdash; these are almost always poisoning attempts</li>
      <li><strong>Score your counterparties</strong> using DJD Agent Score to identify suspicious wallets before transacting</li>
    </ul>

    <div class="cta-box">
      <p>Check any wallet&rsquo;s reputation score to identify suspicious activity patterns:</p>
      <a href="/#lookup" class="btn">Score a Wallet</a>
    </div>

    <p class="article-footer">DJD Agent Score analyzes on-chain behavioral patterns to assign reputation scores to AI agent wallets. Scores are published to the ERC-8004 Reputation Registry on Base mainnet.</p>

  </div>
</article>

${blogFooter}`

// ─── Individual article: v2.4.0 Release ───

const v240PostHtml = `${blogPostHead(
  'v2.4.0: Score Accuracy, Data Transparency, and a Code Audit',
  'Model v2.4.0 ships fixes for cache mutation, missing indicators, NaN edge cases, and adds a new dataSource field so consumers always know where their score came from.',
  'v2-4-0',
)}
${blogNav}

<article class="article">
  <a href="/blog" class="article-back">&larr; All posts</a>
  <div class="article-meta">
    <span class="article-date">Feb 27, 2026</span>
    <span class="article-tag">Release</span>
  </div>
  <h1>v2.4.0: Score Accuracy, Data Transparency, and a Code Audit</h1>
  <p class="lead">Model version 2.4.0 focuses on <strong>correctness</strong> and <strong>transparency</strong>. We ran a full code audit across the scoring engine, fixed every issue we found, and added a new field that tells API consumers exactly where their score came from.</p>

  <div class="prose">

    <h2>What Changed</h2>

    <p>This release addresses bugs that could silently degrade score accuracy under specific conditions, and adds infrastructure improvements to make the system more observable.</p>

    <h3>Cache Mutation Fix</h3>
    <p>The most impactful fix. When a cached score was served, a <strong>serve-time dampening function</strong> was mutating the cached object in memory. This meant the second consumer to read the same cached score would receive an already-dampened value &mdash; and each subsequent read would dampen it further.</p>
    <p>The fix is simple: we now spread the cached object into a fresh copy before applying any transformations. Scores returned from the cache are now identical to what was originally computed.</p>

    <h3>Missing Sybil &amp; Gaming Indicators</h3>
    <p>Several response builder paths were not including <code class="mono">sybilFlag</code> and <code class="mono">gamingIndicators</code> in their output. Consumers relying on these fields for downstream decisions would have received <code class="mono">undefined</code> instead of the actual analysis results. All response paths now consistently include both fields.</p>

    <h3>NaN Limit Parameter</h3>
    <p>A <code class="mono">limit</code> query parameter on the score history endpoint was being parsed without validation. Passing a non-numeric value would propagate <code class="mono">NaN</code> into the database query, returning zero results silently. We now clamp and default the parameter safely.</p>

    <h3>Balance Snapshot Resilience</h3>
    <p>When the RPC provider returns an error during the balance snapshot job, the system previously wrote a <code class="mono">0</code> balance to the database. For wallets with real holdings, this created a false &ldquo;balance dropped to zero&rdquo; event in the history. The snapshot job now <strong>skips the write entirely</strong> on RPC failure and logs the error for investigation.</p>

    <h2>New: <code class="mono">dataSource</code> Field</h2>

    <p>Every score response now includes a <code class="mono">dataSource</code> field that tells you exactly where the score came from:</p>

    <div class="code-block"><code>{
  "wallet": "0x1234...abcd",
  "score": 72,
  "tier": "Established",
  "dataSource": "cached",
  "modelVersion": "2.4.0"
}</code></div>

    <ul>
      <li><strong><code class="mono">live</code></strong> &mdash; freshly computed from on-chain data in this request</li>
      <li><strong><code class="mono">cached</code></strong> &mdash; served from a previously computed score that is still within its freshness window</li>
      <li><strong><code class="mono">unavailable</code></strong> &mdash; no score could be computed (e.g., wallet has no on-chain activity)</li>
    </ul>

    <p>This is useful for consumers who need to distinguish between a real-time computation and a cached result &mdash; for example, if you want to display a &ldquo;computed X minutes ago&rdquo; indicator in your UI, or trigger a <code class="mono">/v1/score/refresh</code> when the source is <code class="mono">cached</code>.</p>

    <h2>Infrastructure Improvements</h2>

    <ul>
      <li><strong>Database transactions</strong> &mdash; multi-step operations (outcome matching, intent matching, score refresh) are now wrapped in SQLite transactions for consistency</li>
      <li><strong>Silent catch elimination</strong> &mdash; all empty <code class="mono">catch {}</code> blocks now log errors with context, making production debugging possible</li>
      <li><strong>Magic number extraction</strong> &mdash; scoring thresholds, blockchain constants, and job configuration are centralized in <code class="mono">src/config/constants.ts</code></li>
      <li><strong>Template extraction</strong> &mdash; HTML templates for agent profiles, explorer, and legal pages are now in dedicated <code class="mono">src/templates/</code> modules, reducing route file sizes by over 1,000 lines total</li>
    </ul>

    <h2>SDK Update</h2>

    <p>The TypeScript SDK (<code class="mono">djd-agent-score-client</code>) has been updated to v0.2.0 with the new <code class="mono">dataSource</code> field typed in <code class="mono">BasicScoreResponse</code> and <code class="mono">FullScoreResponse</code>. If you are using the SDK, update to get typed access:</p>

    <div class="code-block"><code>const result = await client.getBasicScore(wallet)

if (result.dataSource === 'cached') {
  console.log('Score was served from cache')
}</code></div>

    <h2>Full Changelog</h2>

    <p>The complete list of changes is available in the <a href="https://github.com/jacobsd32-cpu/djdagentscore/releases/tag/v2.4.0" style="color:var(--accent)">GitHub release notes</a>. All 193 tests pass across 28 test files.</p>

    <div class="cta-box">
      <p>Try the updated scoring engine on any Base wallet:</p>
      <a href="/#lookup" class="btn">Score a Wallet</a>
    </div>

    <p class="article-footer">DJD Agent Score analyzes on-chain behavioral patterns to assign reputation scores to AI agent wallets. Scores are published to the ERC-8004 Reputation Registry on Base mainnet.</p>

  </div>
</article>

${blogFooter}`

// ─── RSS Feed ───

const SITE = 'https://djdagentscore.dev'

const blogPosts = [
  {
    title: 'v2.4.0: Score Accuracy, Data Transparency, and a Code Audit',
    slug: 'v2-4-0',
    description:
      'Model v2.4.0 ships fixes for cache mutation, missing indicators, NaN edge cases, and adds a new dataSource field so consumers always know where their score came from.',
    date: 'Thu, 27 Feb 2026 16:00:00 GMT',
    tag: 'Release',
  },
  {
    title: 'What We Found Analyzing Real Wallet Activity on Base',
    slug: 'on-chain-activity',
    description:
      'We analyzed our own payment wallet and discovered real x402 transfers, address poisoning attacks, and a fake token scam. Here is what on-chain forensics looks like in practice.',
    date: 'Thu, 27 Feb 2026 14:00:00 GMT',
    tag: 'Case Study',
  },
  {
    title: 'What is ERC-8004? On-Chain Reputation for AI Agents',
    slug: 'what-is-erc-8004',
    description:
      'A deep dive into the Ethereum standard that puts AI agent reputation on-chain — how it works, why it matters, and how DJD Agent Score publishes to the registry on Base.',
    date: 'Thu, 27 Feb 2026 12:00:00 GMT',
    tag: 'Infrastructure',
  },
  {
    title: 'The Cold Start Problem for AI Agents',
    slug: 'cold-start-problem',
    description:
      'Every new agent wallet starts at zero. How do you bootstrap trust when there is no history? We break down the cold start problem and the scoring strategies that solve it.',
    date: 'Thu, 27 Feb 2026 10:00:00 GMT',
    tag: 'Analysis',
  },
  {
    title: '5 On-Chain Patterns That Reveal Sybil Agents',
    slug: 'sybil-patterns',
    description:
      'How DJD Agent Score uses on-chain behavioral forensics to separate real AI agents from manufactured identities.',
    date: 'Wed, 26 Feb 2026 12:00:00 GMT',
    tag: 'Research',
  },
]

const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>DJD Agent Score Blog</title>
  <link>${SITE}/blog</link>
  <description>Insights on AI agent reputation, sybil detection, and trust infrastructure for the autonomous agent economy.</description>
  <language>en-us</language>
  <lastBuildDate>${blogPosts[0].date}</lastBuildDate>
  <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${blogPosts
  .map(
    (p) => `  <item>
    <title>${p.title}</title>
    <link>${SITE}/blog/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
    <description>${p.description}</description>
    <pubDate>${p.date}</pubDate>
    <category>${p.tag}</category>
  </item>`,
  )
  .join('\n')}
</channel>
</rss>`

// ─── Routes ───

blog.get('/', (c) => c.html(listingHtml))
blog.get('/rss.xml', (c) => {
  return c.body(rssXml, 200, {
    'Content-Type': 'application/rss+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
})
blog.get('/v2-4-0', (c) => c.html(v240PostHtml))
blog.get('/on-chain-activity', (c) => c.html(onchainActivityPostHtml))
blog.get('/sybil-patterns', (c) => c.html(sybilPostHtml))
blog.get('/what-is-erc-8004', (c) => c.html(erc8004PostHtml))
blog.get('/cold-start-problem', (c) => c.html(coldStartPostHtml))

export default blog
