import { buildPublicUrl } from '../config/public.js'
import { renderPublicPage } from './publicPage.js'

interface PricingPlan {
  id: string
  name: string
  monthlyPrice: number
  monthlyLimit: number
}

const pricingCss = `
.pricing-hero-panel{
  display:grid;
  grid-template-columns:minmax(0,1.15fr) minmax(260px,0.85fr);
  gap:18px;
  margin-top:24px;
}
.hero-note{
  padding:24px;
  border-radius:16px;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.9), rgba(12,27,45,0.92));
}
.hero-note .metric-label{margin-bottom:8px}
.hero-note-copy{
  color:var(--text-dim);
  font-size:14px;
  line-height:1.78;
}
.story-grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:18px;
}
.plans{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
}
.plan-card{
  position:relative;
  padding:24px;
  border-radius:18px;
  border:1px solid var(--border);
  background:linear-gradient(180deg, rgba(17,35,58,0.88), rgba(12,27,45,0.92));
}
.plan-card.popular{
  border-color:var(--border-hi);
  box-shadow:0 22px 60px rgba(56,189,248,0.12);
}
.popular-badge{
  position:absolute;
  top:14px;
  right:14px;
}
.plan-name{
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.12em;
  text-transform:uppercase;
  margin-bottom:12px;
}
.plan-price{
  font-size:42px;
  font-weight:800;
  letter-spacing:-0.04em;
}
.plan-period{
  color:var(--text-muted);
  font-size:14px;
  font-weight:500;
}
.plan-limit{
  margin-top:10px;
  padding-bottom:18px;
  border-bottom:1px solid var(--border);
  color:var(--text-dim);
  font-size:14px;
  line-height:1.7;
}
.plan-features{
  list-style:none;
  margin:18px 0 0;
  display:grid;
  gap:10px;
}
.plan-features li{
  position:relative;
  padding-left:18px;
  color:var(--text-dim);
  font-size:13px;
  line-height:1.75;
}
.plan-features li::before{
  content:'';
  position:absolute;
  left:0;
  top:9px;
  width:7px;
  height:7px;
  border-radius:999px;
  background:var(--green);
}
.plan-action{
  margin-top:20px;
  width:100%;
}
.plan-action button{
  width:100%;
}
.plan-action .button{
  width:100%;
}
.split-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:18px;
}
.faq-list{
  display:grid;
  gap:12px;
}
.faq-item{
  border-radius:16px;
  border:1px solid var(--border);
  background:rgba(12,27,45,0.9);
  overflow:hidden;
}
.faq-q{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:18px 20px;
  cursor:pointer;
  color:var(--text);
  font-size:15px;
  font-weight:700;
}
.faq-a{
  display:none;
  padding:0 20px 18px;
  color:var(--text-dim);
  font-size:14px;
  line-height:1.78;
}
.faq-item.open .faq-a{
  display:block;
}
.faq-toggle{
  color:var(--text-muted);
  font-size:20px;
}
.cta-strip{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:12px;
  margin-top:24px;
}
.cta-metric{
  padding:16px;
  border-radius:16px;
  border:1px solid var(--border);
  background:rgba(7,17,31,0.45);
}
.cta-metric .metric-value{
  font-size:18px;
}
@media(max-width:980px){
  .pricing-hero-panel,
  .story-grid,
  .plans,
  .split-grid,
  .cta-strip{grid-template-columns:1fr}
}
`

export function pricingPageHtml(plans: PricingPlan[]): string {
  const starter = plans.find((plan) => plan.id === 'starter')
  const growth = plans.find((plan) => plan.id === 'growth')
  const scale = plans.find((plan) => plan.id === 'scale')

  const certifiedDirectoryUrl = buildPublicUrl('/directory')
  const explorerUrl = buildPublicUrl('/explorer')

  return renderPublicPage({
    title: 'Pricing — DJD Agent Score',
    description:
      'Pricing for developers building with wallet trust. Start free, then unlock API-key access to scoring, Certify, evaluator decisions, monitoring, and public trust surfaces.',
    path: '/pricing',
    nav: 'pricing',
    ctaHref: '#plans',
    ctaLabel: 'Choose a Plan',
    extraCss: pricingCss,
    content: `
<main class="site-shell">
  <section class="hero">
    <span class="eyebrow">For developer teams and agent operators</span>
    <div class="pricing-hero-panel">
      <div>
        <h1 class="display">Pricing for products that need to <em>trust a wallet</em></h1>
        <p class="lede">DJD helps your app decide whether to trust a wallet, make that trust visible to users, and gate money movement with evaluator and certification surfaces. Start free, then move into production API-key access when the trust layer becomes part of a real product path.</p>
        <div class="action-row">
          <a class="button button-primary" href="#plans">View plans</a>
          <a class="button button-secondary" href="/docs">Open docs</a>
          <a class="button button-secondary" href="${certifiedDirectoryUrl}">Browse certified directory</a>
        </div>
      </div>
      <aside class="hero-note">
        <div class="metric-label">What teams buy from DJD</div>
        <div class="hero-note-copy">
          DJD is not “just a score API.” You are buying a trust layer that combines wallet scoring, certification, evaluator decisions,
          monitoring, ratings, Forensics reads, and public trust surfaces that counterparties can inspect.
        </div>
        <div class="cta-strip">
          <div class="cta-metric">
            <div class="metric-label">Start</div>
            <div class="metric-value">Free lookup</div>
          </div>
          <div class="cta-metric">
            <div class="metric-label">Production</div>
            <div class="metric-value">API key or x402</div>
          </div>
          <div class="cta-metric">
            <div class="metric-label">Expansion</div>
            <div class="metric-value">Certify + evaluator</div>
          </div>
        </div>
      </aside>
    </div>
  </section>

  <section class="section">
    <div class="section-header">
      <div class="section-label">Best first customers</div>
      <h2 class="section-title">Common ways developer teams use DJD</h2>
      <p class="section-copy">The product is strongest where a wallet can cost you money, reputation, or fulfillment quality. These are the buyer stories the current platform is built for.</p>
    </div>
    <div class="story-grid">
      <article class="card">
        <div class="card-kicker">Marketplaces</div>
        <div class="card-title">Agent marketplaces and directories</div>
        <div class="card-copy">Screen providers before listing them, rank counterparties with more context, and give buyers inspectable profile, certification, and directory surfaces instead of a bare wallet address.</div>
      </article>
      <article class="card">
        <div class="card-kicker">Settlement</div>
        <div class="card-title">Payout and settlement products</div>
        <div class="card-copy">Use score, risk, staking, and evaluator outputs to decide whether a payout should auto-approve, route to review, or stop before money moves.</div>
      </article>
      <article class="card">
        <div class="card-kicker">Paid tools</div>
        <div class="card-title">Paid agent tools and x402 services</div>
        <div class="card-copy">Protect expensive routes, reject unknown payers, and keep wallet trust checks inside the same flow that already handles billing, API keys, or x402 settlement.</div>
      </article>
    </div>
  </section>

  <section class="section" id="plans">
    <div class="section-header section-center">
      <div class="section-label">Plans</div>
      <h2 class="section-title">From free screening to production wallet controls</h2>
      <p class="section-copy">Human teams usually pay by subscription and use a standard Bearer API key. Autonomous agents can still pay per request with x402. Same platform, same scoring engine, same certified directory and evaluator surfaces.</p>
    </div>
    <div class="plans">
      <article class="plan-card">
        <div class="plan-name">Free</div>
        <div class="plan-price">$0 <span class="plan-period">/ forever</span></div>
        <div class="plan-limit">10 requests per day. No signup. Best for proving the trust layer before you commit engineering time.</div>
        <ul class="plan-features">
          <li>Basic score endpoint</li>
          <li>ERC-8004-compatible trust document</li>
          <li>Verifier ABI and Solidity package endpoint</li>
          <li>Compiled contract artifact endpoint</li>
          <li>Escrow settlement calldata endpoint</li>
          <li>Verifier and escrow deploy plan endpoint</li>
          <li>One-shot deploy bundle endpoint</li>
          <li>Score, tier, and recommendation</li>
          <li>IP-based rate limit</li>
          <li>No API key needed</li>
        </ul>
        <div class="plan-action">
          <a class="button button-secondary" href="/#lookup">Try free lookup</a>
        </div>
      </article>

      <article class="plan-card">
        <div class="plan-name">Starter</div>
        <div class="plan-price">$${starter?.monthlyPrice ?? 29} <span class="plan-period">/ month</span></div>
        <div class="plan-limit">${(starter?.monthlyLimit ?? 1000).toLocaleString()} requests per month for early production use.</div>
        <ul class="plan-features">
          <li>All paid endpoints</li>
          <li>Full dimension breakdown</li>
          <li>Score history and trend views</li>
          <li>Risk, cluster, economy, ratings, and data products</li>
          <li>DJD Forensics summaries, feeds, watchlists, and disputes</li>
          <li>Standard API key</li>
        </ul>
        <div class="plan-action">
          <button class="button button-secondary" onclick="startCheckout('starter')">Start with Starter</button>
        </div>
      </article>

      <article class="plan-card popular">
        <span class="badge badge-success popular-badge">Most popular</span>
        <div class="plan-name">Growth</div>
        <div class="plan-price">$${growth?.monthlyPrice ?? 79} <span class="plan-period">/ month</span></div>
        <div class="plan-limit">${(growth?.monthlyLimit ?? 5000).toLocaleString()} requests per month for products moving into real wallet-dependent operations.</div>
        <ul class="plan-features">
          <li>Everything in Starter</li>
          <li>Batch scoring for 20 wallets</li>
          <li>Certification applications</li>
          <li>ERC-8183 evaluator preview endpoint</li>
          <li>ERC-8183 evaluator evidence packet endpoint</li>
          <li>ERC-8183 oracle verdict endpoint</li>
          <li>Oracle callback calldata endpoint</li>
          <li>Force-refresh scores</li>
          <li>Priority support</li>
        </ul>
        <div class="plan-action">
          <button class="button button-primary" onclick="startCheckout('growth')">Choose Growth</button>
        </div>
      </article>

      <article class="plan-card">
        <div class="plan-name">Scale</div>
        <div class="plan-price">$${scale?.monthlyPrice ?? 199} <span class="plan-period">/ month</span></div>
        <div class="plan-limit">${(scale?.monthlyLimit ?? 25000).toLocaleString()} requests per month plus the strongest production packaging in the current product.</div>
        <ul class="plan-features">
          <li>Everything in Growth</li>
          <li>High-volume production quotas</li>
          <li>Managed monitoring subscriptions and alert filters</li>
          <li>Certified directory and evaluator-ready trust surfaces</li>
          <li>Best per-query cost</li>
          <li>Priority support</li>
        </ul>
        <div class="plan-action">
          <button class="button button-secondary" onclick="startCheckout('scale')">Talk to Scale</button>
        </div>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-header section-center">
      <div class="section-label">Two ways to pay</div>
      <h2 class="section-title">Buy like a software team or pay like an agent</h2>
      <p class="section-copy">DJD supports both normal SaaS billing and crypto-native request billing. Most developer customers use Stripe plus Bearer auth. Autonomous agents can keep using x402 without changing the underlying trust surface.</p>
    </div>
    <div class="split-grid">
      <article class="card">
        <div class="card-kicker">For developers</div>
        <div class="card-title">Use normal SaaS billing</div>
        <div class="card-copy">Pay with a credit card, receive a standard API key, and manage your plan through the customer portal. This is the default path for marketplaces, internal tooling, payout products, and developer platforms.</div>
        <ul class="plan-features">
          <li>Monthly subscription via Stripe</li>
          <li>Standard Bearer token auth</li>
          <li>Predictable quota-based billing</li>
          <li>No crypto wallet required</li>
        </ul>
      </article>
      <article class="card">
        <div class="card-kicker">For AI agents</div>
        <div class="card-title">Use x402 pay-per-request</div>
        <div class="card-copy">Autonomous agents with crypto wallets can pay per request with USDC on Base. Same platform, same trust outputs, just a different billing and auth layer.</div>
        <ul class="plan-features">
          <li>USDC micropayments on Base</li>
          <li>No signup or API key required</li>
          <li>Fits autonomous spend loops</li>
          <li><a href="https://x402.org" target="_blank" rel="noreferrer">Learn about x402</a></li>
        </ul>
      </article>
    </div>
  </section>

  <section class="section">
    <div class="section-header section-center">
      <div class="section-label">FAQ</div>
      <h2 class="section-title">Common questions</h2>
      <p class="section-copy">The product can look broad because the score, certification, monitoring, and evaluator surfaces connect to one another. This is the simple version.</p>
    </div>
    <div class="faq-list">
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>What am I buying?</span>
          <span class="faq-toggle">+</span>
        </div>
        <div class="faq-a">You are buying a developer trust layer for agent wallets: score APIs, risk and cluster reads, score history, economy analytics, counterparty ratings, DJD Forensics reads, certification workflows, evaluator decisions, force-refresh, and webhook-based monitoring. Growth and Scale expand that into higher-volume production use. The free tier is limited to the basic score endpoint.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>How do I authenticate?</span>
          <span class="faq-toggle">+</span>
        </div>
        <div class="faq-a">After checkout you receive a standard API key. Include it as <code class="mono">Authorization: Bearer djd_sk_...</code>. Autonomous agents can alternatively use x402 payment proofs on supported routes.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>What counts toward my quota?</span>
          <span class="faq-toggle">+</span>
        </div>
        <div class="faq-a">Only successful 2xx responses count toward monthly quota. Validation failures, rate-limit responses, and other unsuccessful calls are not billed against your monthly request pool.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>Can I change or cancel my plan?</span>
          <span class="faq-toggle">+</span>
        </div>
        <div class="faq-a">Yes. You can upgrade, downgrade, or cancel through the Stripe customer portal. There are no long-term lock-ins in the current product.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>Do I need a crypto wallet to use DJD?</span>
          <span class="faq-toggle">+</span>
        </div>
        <div class="faq-a">No. x402 is the crypto-native path for autonomous agents. If you are a human developer or software team, use the normal Stripe subscription path and a regular API key.</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="callout">
      <h2 class="section-title">Ready to add wallet trust checks to your product?</h2>
      <p class="section-copy">Start with the free tier, then upgrade when you need production API keys, evaluator decisions, monitoring, and certified directory surfaces.</p>
      <div class="action-row" style="justify-content:center">
        <a class="button button-primary" href="/#lookup">Try free lookup</a>
        <a class="button button-secondary" href="${certifiedDirectoryUrl}">Browse certified directory</a>
        <a class="button button-secondary" href="${explorerUrl}">Open explorer</a>
      </div>
    </div>
  </section>
</main>

<script>
async function startCheckout(plan) {
  const button = event.target;
  const originalText = button.textContent;
  button.textContent = 'Redirecting...';
  button.disabled = true;

  try {
    const response = await fetch('/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    });

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
      return;
    }

    alert(data.error?.message || 'Something went wrong. Please try again.');
  } catch {
    alert('Network error. Please try again.');
  }

  button.textContent = originalText;
  button.disabled = false;
}
</script>`,
    footerCopy:
      'DJD Agent Score LLC provides wallet screening and trust signals for payouts, paid routes, and settlement flows on Base.',
  })
}
