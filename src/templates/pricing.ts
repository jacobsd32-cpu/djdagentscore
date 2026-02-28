/**
 * Pricing Page Template
 *
 * Dedicated pricing page that makes it crystal clear how developers
 * can start using and paying for DJD Agent Score. Two paths:
 * 1. Free tier — 10 requests/day, no signup
 * 2. Subscription plans — Stripe checkout, API key provisioned
 *
 * Also mentions x402 for AI agents as a secondary path.
 * Uses the same design system as index.html (DM Sans, Instrument Serif,
 * JetBrains Mono, indigo-on-navy).
 */

interface PricingPlan {
  id: string
  name: string
  monthlyPrice: number
  monthlyLimit: number
}

export function pricingPageHtml(plans: PricingPlan[]): string {
  const starter = plans.find((p) => p.id === 'starter')
  const growth = plans.find((p) => p.id === 'growth')
  const scale = plans.find((p) => p.id === 'scale')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pricing — DJD Agent Score</title>
<meta name="description" content="Simple, flat-rate pricing for AI agent trust scores. Free tier included. Start in minutes with an API key.">
<meta property="og:type" content="website">
<meta property="og:title" content="Pricing — DJD Agent Score">
<meta property="og:description" content="Simple, flat-rate pricing for AI agent trust scores. Free tier included.">
<meta property="og:url" content="https://djdagentscore.dev/pricing">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a1628; --bg2: #0d1b2a; --bg3: #132238;
  --surface: #162740; --surface2: #1a3050;
  --border: rgba(99,102,241,0.10); --border-hi: rgba(99,102,241,0.18);
  --text: #f0f2f5; --text-dim: #94a3b8; --text-muted: #4b5c73;
  --accent: #6366f1; --accent-dim: rgba(99,102,241,0.08);
  --green: #34d399; --green-dim: rgba(52,211,153,0.08);
  --yellow: #fbbf24; --red: #f87171;
  --radius: 16px;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.mono{font-family:'JetBrains Mono',monospace}
.serif{font-family:'Instrument Serif',serif}

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

/* Page */
.wrap{max-width:1080px;margin:0 auto;padding:0 32px;position:relative;z-index:1}

/* Hero */
.pricing-hero{padding:120px 0 60px;text-align:center;max-width:700px;margin:0 auto}
.pricing-hero h1{font-family:'Instrument Serif',serif;font-size:clamp(36px,5vw,56px);font-weight:400;line-height:1.12;margin-bottom:16px;letter-spacing:-1px}
.pricing-hero h1 em{font-style:italic;color:var(--accent)}
.pricing-hero p{font-size:18px;color:var(--text-dim);line-height:1.75;max-width:560px;margin:0 auto}

/* How it works strip */
.how-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin:48px 0 60px}
.how-step{background:var(--bg2);padding:28px 24px;text-align:center}
.how-num{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}
.how-title{font-size:15px;font-weight:600;margin-bottom:6px}
.how-desc{font-size:13px;color:var(--text-dim);line-height:1.6}

/* Plans grid */
.plans{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:0 0 60px}
.plan-card{background:var(--bg2);border:1px solid var(--border);padding:36px 28px;position:relative;transition:border-color .2s}
.plan-card:first-child{border-radius:var(--radius) 0 0 var(--radius)}
.plan-card:last-child{border-radius:0 var(--radius) var(--radius) 0}
.plan-card:not(:first-child){border-left:none}
.plan-card.popular{border-color:var(--accent);background:linear-gradient(180deg,rgba(99,102,241,0.04) 0%,var(--bg2) 100%)}
.popular-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--accent);color:var(--bg);font-size:11px;font-weight:700;padding:4px 14px;border-radius:100px;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap}
.plan-name{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px}
.plan-price{font-size:40px;font-weight:700;margin-bottom:4px;letter-spacing:-1px}
.plan-price .dollar{font-size:22px;color:var(--text-dim);vertical-align:top;position:relative;top:6px}
.plan-price .period{font-size:14px;color:var(--text-muted);font-weight:400}
.plan-free-price{font-size:40px;font-weight:700;margin-bottom:4px;color:var(--green)}
.plan-limit{font-size:14px;color:var(--text-dim);margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border)}
.plan-features{list-style:none;font-size:13px;color:var(--text-dim);line-height:2.2}
.plan-features li::before{content:'\\2713';color:var(--green);font-weight:700;margin-right:8px}
.plan-cta{display:block;text-align:center;padding:12px 0;border-radius:10px;font-size:14px;font-weight:600;margin-top:28px;text-decoration:none;transition:all .2s;cursor:pointer;border:none}
.plan-cta:hover{text-decoration:none;transform:translateY(-1px)}
.plan-cta-primary{background:var(--accent);color:var(--bg)}
.plan-cta-primary:hover{opacity:.9}
.plan-cta-ghost{background:transparent;border:1px solid var(--border-hi);color:var(--text-dim)}
.plan-cta-ghost:hover{border-color:var(--accent);color:var(--accent)}
.plan-cta-free{background:var(--green-dim);border:1px solid rgba(52,211,153,0.18);color:var(--green)}
.plan-cta-free:hover{background:rgba(52,211,153,0.14)}

/* FAQ & Comparison */
.section-label{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px;text-align:center}
.section-title{font-family:'Instrument Serif',serif;font-size:clamp(28px,3.5vw,40px);font-weight:400;margin-bottom:10px;letter-spacing:-0.5px;text-align:center}
.section-desc{font-size:16px;color:var(--text-dim);line-height:1.75;max-width:600px;text-align:center;margin:0 auto 40px}

/* Comparison table — Agents vs Developers */
.compare{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:80px}
.compare-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:36px 32px}
.compare-icon{font-size:28px;margin-bottom:12px}
.compare-name{font-size:18px;font-weight:600;margin-bottom:8px}
.compare-desc{font-size:14px;color:var(--text-dim);line-height:1.7;margin-bottom:20px}
.compare-list{list-style:none;font-size:13px;color:var(--text-dim);line-height:2.2}
.compare-list li::before{content:'\\2022';color:var(--accent);font-weight:700;margin-right:8px}

/* FAQ */
.faq{max-width:700px;margin:0 auto 80px}
.faq-item{border-bottom:1px solid var(--border);padding:20px 0}
.faq-q{font-size:15px;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;color:var(--text)}
.faq-q:hover{color:var(--accent)}
.faq-a{font-size:14px;color:var(--text-dim);line-height:1.75;margin-top:12px;display:none}
.faq-item.open .faq-a{display:block}
.faq-toggle{font-size:18px;color:var(--text-muted);transition:transform .2s}
.faq-item.open .faq-toggle{transform:rotate(45deg)}

/* CTA */
.bottom-cta{text-align:center;padding:60px 0;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:40px}
.bottom-cta h2{font-family:'Instrument Serif',serif;font-size:32px;font-weight:400;margin-bottom:12px}
.bottom-cta p{font-size:16px;color:var(--text-dim);margin-bottom:24px}
.bottom-cta .btn-row{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:600;transition:all .2s;text-decoration:none;cursor:pointer;border:none}
.btn:hover{text-decoration:none;transform:translateY(-1px)}
.btn-primary{background:var(--accent);color:var(--bg)}
.btn-primary:hover{opacity:.9}
.btn-ghost{background:transparent;border:1px solid var(--border-hi);color:var(--text-dim)}
.btn-ghost:hover{border-color:var(--accent);color:var(--accent)}

@media(max-width:900px){
  .plans{grid-template-columns:1fr 1fr}
  .plan-card:first-child{border-radius:var(--radius) 0 0 0}
  .plan-card:nth-child(2){border-radius:0 var(--radius) 0 0;border-left:none}
  .plan-card:nth-child(3){border-radius:0 0 0 var(--radius);border-left:1px solid var(--border);border-top:none}
  .plan-card:last-child{border-radius:0 0 var(--radius) 0;border-top:none}
}
@media(max-width:768px){
  nav{padding:0 20px}
  .wrap{padding:0 20px}
  .plans{grid-template-columns:1fr}
  .plan-card{border-radius:0!important;border-left:1px solid var(--border)!important;border-top:none}
  .plan-card:first-child{border-radius:var(--radius) var(--radius) 0 0!important;border-top:1px solid var(--border)}
  .plan-card:last-child{border-radius:0 0 var(--radius) var(--radius)!important}
  .how-strip{grid-template-columns:1fr}
  .compare{grid-template-columns:1fr}
  .nav-links{gap:14px}
  .ft-bot{flex-direction:column;gap:12px;text-align:center;padding:0 20px}
}
</style>
</head>
<body>

<!-- NAV -->
<div class="nav-outer">
<nav>
  <a class="logo" href="/">DJD<span> Agent Score</span></a>
  <div class="nav-links">
    <a href="/explorer">Explorer</a>
    <a href="/blog">Blog</a>
    <a href="/pricing" class="active">Pricing</a>
    <a href="/docs">API Docs</a>
    <a class="nav-cta" href="#plans">Get Started</a>
  </div>
</nav>
</div>

<div class="wrap">

<!-- HERO -->
<div class="pricing-hero">
  <h1>Simple pricing for <em>reputation intelligence</em></h1>
  <p>Start free. Upgrade when you need more. Every plan includes full API access with a standard API key &mdash; no crypto wallet required.</p>
</div>

<!-- HOW IT WORKS -->
<div class="how-strip">
  <div class="how-step">
    <div class="how-num">Step 1</div>
    <div class="how-title">Pick a plan</div>
    <div class="how-desc">Free tier or flat monthly subscription. No usage surprises.</div>
  </div>
  <div class="how-step">
    <div class="how-num">Step 2</div>
    <div class="how-title">Get your API key</div>
    <div class="how-desc">Pay with any credit card. Receive your key instantly after checkout.</div>
  </div>
  <div class="how-step">
    <div class="how-num">Step 3</div>
    <div class="how-title">Start scoring wallets</div>
    <div class="how-desc">One header. One GET request. Trust score in milliseconds.</div>
  </div>
</div>

<!-- PLAN CARDS -->
<div class="plans" id="plans">

  <!-- Free -->
  <div class="plan-card">
    <div class="plan-name">Free</div>
    <div class="plan-free-price">$0</div>
    <div class="plan-limit">10 requests / day &mdash; no signup</div>
    <ul class="plan-features">
      <li>Basic score endpoint</li>
      <li>Score + tier + recommendation</li>
      <li>IP-based rate limit</li>
      <li>No API key needed</li>
    </ul>
    <a href="/#lookup" class="plan-cta plan-cta-free">Try It Now</a>
  </div>

  <!-- Starter -->
  <div class="plan-card">
    <div class="plan-name">Starter</div>
    <div class="plan-price"><span class="dollar">$</span>${starter?.monthlyPrice ?? 29}<span class="period">/mo</span></div>
    <div class="plan-limit">${(starter?.monthlyLimit ?? 1000).toLocaleString()} requests / month</div>
    <ul class="plan-features">
      <li>All paid endpoints</li>
      <li>Full dimension breakdown</li>
      <li>Score history &amp; trends</li>
      <li>Fraud &amp; blacklist checks</li>
      <li>Standard API key</li>
    </ul>
    <button onclick="startCheckout('starter')" class="plan-cta plan-cta-ghost">Get Started</button>
  </div>

  <!-- Growth -->
  <div class="plan-card popular">
    <div class="popular-badge">Most Popular</div>
    <div class="plan-name">Growth</div>
    <div class="plan-price"><span class="dollar">$</span>${growth?.monthlyPrice ?? 79}<span class="period">/mo</span></div>
    <div class="plan-limit">${(growth?.monthlyLimit ?? 5000).toLocaleString()} requests / month</div>
    <ul class="plan-features">
      <li>Everything in Starter</li>
      <li>Batch scoring (20 wallets)</li>
      <li>Certification applications</li>
      <li>Force-refresh scores</li>
      <li>Priority support</li>
    </ul>
    <button onclick="startCheckout('growth')" class="plan-cta plan-cta-primary">Get Started</button>
  </div>

  <!-- Scale -->
  <div class="plan-card">
    <div class="plan-name">Scale</div>
    <div class="plan-price"><span class="dollar">$</span>${scale?.monthlyPrice ?? 199}<span class="period">/mo</span></div>
    <div class="plan-limit">${(scale?.monthlyLimit ?? 25000).toLocaleString()} requests / month</div>
    <ul class="plan-features">
      <li>Everything in Growth</li>
      <li>25,000 requests/month</li>
      <li>Webhook subscriptions</li>
      <li>Best per-query cost</li>
      <li>Priority support</li>
    </ul>
    <button onclick="startCheckout('scale')" class="plan-cta plan-cta-ghost">Get Started</button>
  </div>

</div>

<!-- TWO PATHS: Developers vs Agents -->
<div style="margin-bottom:80px">
  <div class="section-label">Two Ways to Pay</div>
  <div class="section-title">Built for developers <em class="serif" style="color:var(--accent)">and</em> AI agents</div>
  <div class="section-desc">Human developers pay with credit cards. Autonomous AI agents pay per-request with crypto. Same API, same scores.</div>
  <div class="compare">
    <div class="compare-card">
      <div class="compare-icon">&#128187;</div>
      <div class="compare-name">For Developers</div>
      <div class="compare-desc">Building an app, bot, or service that needs trust scores? Pay with your credit card and get a standard API key.</div>
      <ul class="compare-list">
        <li>Monthly subscription via Stripe</li>
        <li>Standard API key (Bearer token)</li>
        <li>Flat monthly quota &mdash; no per-request fees</li>
        <li>Manage plan in Stripe Customer Portal</li>
        <li>Cancel anytime, no lock-in</li>
      </ul>
    </div>
    <div class="compare-card">
      <div class="compare-icon">&#129302;</div>
      <div class="compare-name">For AI Agents</div>
      <div class="compare-desc">Autonomous agents with crypto wallets can pay per-request via the x402 micropayment protocol. No key needed.</div>
      <ul class="compare-list">
        <li>Pay-per-request with USDC on Base</li>
        <li>x402 protocol &mdash; automatic micropayments</li>
        <li>No signup, no API key required</li>
        <li>Agent pays from its own wallet</li>
        <li><a href="https://x402.org" target="_blank">Learn about x402</a></li>
      </ul>
    </div>
  </div>
</div>

<!-- FAQ -->
<div class="section-label">FAQ</div>
<div class="section-title">Common questions</div>
<div class="section-desc">Everything you need to know about pricing and billing.</div>
<div class="faq">
  <div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span>What endpoints are included?</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a">All paid plans include access to every endpoint: full scores, score history, batch scoring, fraud/blacklist checks, certification, and force-refresh. The free tier is limited to the basic score endpoint.</div>
  </div>
  <div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span>How do I authenticate?</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a">After checkout, you receive a standard API key. Include it in every request as a Bearer token: <code style="background:var(--bg);padding:2px 6px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:12px">Authorization: Bearer djd_sk_...</code></div>
  </div>
  <div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span>What counts toward my quota?</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a">Only successful responses (2xx status codes) count toward your monthly quota. Failed requests, rate limit responses, and validation errors are not counted.</div>
  </div>
  <div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span>Can I change or cancel my plan?</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a">Yes. You can upgrade, downgrade, or cancel anytime through the Stripe Customer Portal. Changes take effect at the start of your next billing cycle. No lock-in contracts.</div>
  </div>
  <div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span>What happens if I hit my monthly limit?</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a">You'll receive a 429 response. Your quota resets at the start of each billing cycle. You can upgrade your plan at any time if you need more capacity.</div>
  </div>
  <div class="faq-item">
    <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
      <span>What's x402? Do I need a crypto wallet?</span>
      <span class="faq-toggle">+</span>
    </div>
    <div class="faq-a">No! x402 is a micropayment protocol for AI agents. If you're a human developer, just use a regular credit card subscription. You don't need a crypto wallet, USDC, or anything blockchain-related to use the API.</div>
  </div>
</div>

<!-- BOTTOM CTA -->
<div class="bottom-cta">
  <h2>Ready to add trust to your app?</h2>
  <p>Start with the free tier &mdash; no signup required. Upgrade when you're ready.</p>
  <div class="btn-row">
    <a href="/#lookup" class="btn btn-primary">Try Free &mdash; No Signup</a>
    <a href="/docs" class="btn btn-ghost">Read the Docs</a>
  </div>
</div>

<!-- FOOTER -->
<footer>
  <div class="ft-bot">
    <div class="ft-l">&copy; 2026 DJD Agent Score LLC &middot; Built on Base</div>
    <div class="ft-links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/blog">Blog</a><a href="/health">Status</a></div>
  </div>
</footer>

</div>

<script>
async function startCheckout(plan) {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = 'Redirecting...';
  btn.disabled = true;
  try {
    const res = await fetch('/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error?.message || 'Something went wrong. Please try again.');
      btn.textContent = orig;
      btn.disabled = false;
    }
  } catch (err) {
    alert('Network error. Please try again.');
    btn.textContent = orig;
    btn.disabled = false;
  }
}
</script>
</body>
</html>`
}
