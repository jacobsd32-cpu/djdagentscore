import { Hono } from 'hono'
import { getSupportEmail } from '../config/public.js'
import { renderPublicPage } from '../templates/publicPage.js'

const methodology = new Hono()
const SUPPORT_EMAIL = getSupportEmail()

const methodologyCss = `
.article-shell{
  max-width:980px;
}
.method-layout{
  display:grid;
  grid-template-columns:minmax(0,1fr) 280px;
  gap:22px;
}
.method-sidebar{
  position:sticky;
  top:92px;
  align-self:start;
}
.method-nav{
  display:grid;
  gap:10px;
}
.method-nav a{
  display:block;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid var(--border);
  color:var(--text-dim);
  font-size:13px;
  font-weight:600;
  background:rgba(7,17,31,0.42);
}
.method-nav a:hover{
  color:var(--accent);
  border-color:var(--border-hi);
}
.dim-card{
  padding:24px;
  margin:22px 0;
  border-radius:16px;
  background:linear-gradient(180deg, rgba(17,35,58,0.88), rgba(12,27,45,0.9));
  border:1px solid var(--border);
}
.dim-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  margin-bottom:14px;
}
.dim-name{
  font-family:'Instrument Serif',serif;
  font-size:26px;
  font-weight:400;
}
.dim-weight{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:6px 10px;
  border-radius:999px;
  background:var(--accent-dim);
  color:var(--accent);
  font-family:'JetBrains Mono',monospace;
  font-size:11px;
  font-weight:700;
}
.dim-desc{
  color:var(--text-dim);
  font-size:14px;
  line-height:1.8;
  margin-bottom:14px;
}
.dim-signals{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}
.dim-signal{
  display:inline-flex;
  align-items:center;
  padding:6px 9px;
  border-radius:999px;
  border:1px solid var(--border);
  background:rgba(7,17,31,0.58);
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:600;
}
.tier-table{
  width:100%;
  border-collapse:collapse;
  margin:22px 0;
  border-radius:16px;
  overflow:hidden;
  background:rgba(7,17,31,0.42);
  border:1px solid var(--border);
}
.tier-table th,
.tier-table td{
  padding:14px 16px;
  border-bottom:1px solid var(--border);
  text-align:left;
}
.tier-table th{
  color:var(--text-muted);
  font-family:'JetBrains Mono',monospace;
  font-size:10px;
  font-weight:700;
  letter-spacing:0.1em;
  text-transform:uppercase;
  background:rgba(10,22,40,0.72);
}
.tier-table td{
  color:var(--text-dim);
  font-size:14px;
  line-height:1.7;
}
.tier-table tr:last-child td{
  border-bottom:none;
}
.tier-name{
  color:var(--text);
  font-weight:700;
}
.tier-badge{
  display:inline-block;
  width:8px;
  height:8px;
  border-radius:999px;
  margin-right:8px;
}
.code-block{
  margin:22px 0;
  padding:20px 22px;
  border-radius:16px;
  border:1px solid var(--border);
  background:#050c17;
  overflow:auto;
}
.code-block code{
  color:var(--text-dim);
  font-family:'JetBrains Mono',monospace;
  font-size:12px;
  line-height:1.7;
  white-space:pre;
}
.prose-callout{
  margin:22px 0;
}
.method-endnote{
  margin-top:28px;
  color:var(--text-muted);
  font-size:13px;
  line-height:1.8;
  font-style:italic;
}
@media(max-width:980px){
  .method-layout{
    grid-template-columns:1fr;
  }
  .method-sidebar{
    position:static;
  }
}
`

const pageHtml = renderPublicPage({
  title: 'Scoring Methodology — DJD Agent Score',
  description:
    'How DJD turns on-chain activity into trust signals: five scoring dimensions, sybil detection, gaming penalties, and adaptive calibration.',
  path: '/methodology',
  nav: 'methodology',
  ctaHref: '/docs',
  ctaLabel: 'Open Docs',
  ogType: 'article',
  extraCss: methodologyCss,
  content: `
<main class="site-shell">
  <article class="article-shell">
    <a class="article-back" href="/docs">&larr; Back to docs</a>
    <div class="article-meta">
      <span class="badge badge-info">Transparency</span>
      <span class="badge badge-success">Model v2.5.0</span>
      <span class="badge badge-info">Updated March 2026</span>
    </div>
    <h1 class="article-title">How DJD calculates trust</h1>
    <p class="article-lede">
      DJD Agent Score produces a 0&ndash;100 trust score for wallets on Base and then packages that signal into certification,
      evaluator, directory, and monitoring surfaces. The model is intentionally inspectable: no hidden manual overrides, no social
      proof scraping, and no black-box human opinions in the score itself.
    </p>

    <div class="method-layout">
      <div class="prose">
        <h2 id="pipeline">Scoring pipeline</h2>
        <p>When an app calls DJD with a wallet address, the engine runs a five-phase pipeline:</p>
        <ul>
          <li><strong>Fetch on-chain data</strong> &mdash; transaction history, USDC transfers, balances, basename, GitHub verification, and Insumer attestations pulled from verifiable sources.</li>
          <li><strong>Run sybil and gaming detection</strong> &mdash; behavioral checks identify fake wallet networks, circular funding, wash-trading, and timing anomalies before scoring finishes.</li>
          <li><strong>Calculate five dimensions</strong> &mdash; each dimension produces a 0&ndash;100 sub-score from explicit on-chain signals.</li>
          <li><strong>Compose the final score</strong> &mdash; weights, trajectory, confidence dampening, and integrity penalties turn the dimension set into a single output.</li>
          <li><strong>Package explainability</strong> &mdash; confidence, improvement guidance, top contributors, and top detractors travel with the score.</li>
        </ul>
        <p>The full pipeline runs against live blockchain state. Scores are cached briefly for performance, and background jobs continuously refresh stale wallets as the network evolves.</p>

        <h2 id="dimensions">The five dimensions</h2>
        <p>Each dimension maps to a question an operator or payment system would naturally ask before trusting a wallet.</p>

        <div class="dim-card">
          <div class="dim-header">
            <span class="dim-name">Payment Reliability</span>
            <span class="dim-weight">30%</span>
          </div>
          <p class="dim-desc">Does this wallet consistently execute transactions? Reliability measures transaction success rate, total volume, nonce alignment, uptime estimation, and recency of activity.</p>
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
          <p class="dim-desc">Can this wallet actually pay? Viability looks at ETH and USDC balances, income-to-spend ratio, wallet age, balance trends, and whether the wallet routinely collapses to zero.</p>
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
          <p class="dim-desc">Has this wallet established a verifiable identity? Identity checks agent registration, Base Name ownership, GitHub verification with activity signals, and attestations from Insumer.</p>
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
          <p class="dim-desc">Does this wallet behave like a legitimate actor or a bot? Behavior scores timing variance, hourly entropy, and suspicious inactivity gaps that often show up in manufactured identities.</p>
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
          <p class="dim-desc">Is this wallet actively providing services in the agent economy? Capability tracks x402 service endpoints, revenue earned, counterparty breadth, and service longevity.</p>
          <div class="dim-signals">
            <span class="dim-signal">x402Services</span>
            <span class="dim-signal">revenue</span>
            <span class="dim-signal">uniqueCounterparties</span>
            <span class="dim-signal">serviceLongevity</span>
          </div>
        </div>

        <h2 id="formula">Composite score formula</h2>
        <p>The final score is not just a weighted average. Three additional layers keep the output aligned with real-world trust decisions.</p>
        <div class="code-block"><code>raw = Reliability*0.30 + Viability*0.25 + Identity*0.20
    + Behavior*0.15 + Capability*0.10

adjusted = raw + trajectoryModifier
final    = adjusted * integrityMultiplier
output   = clamp(0, 100, final)</code></div>
        <p><strong>Trajectory modifier</strong> adds or subtracts up to five points based on sustained improvement or decline over time.</p>
        <p><strong>Integrity multiplier</strong> compounds penalties from sybil indicators, gaming flags, and fraud pressure instead of letting one clean-looking dimension mask deeper issues.</p>
        <p><strong>Confidence dampening</strong> keeps mature wallets stable and lets new wallets move more as fresh evidence arrives.</p>

        <h2 id="tiers">Tier model</h2>
        <table class="tier-table">
          <thead>
            <tr><th>Tier</th><th>Score range</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="tier-badge" style="background:#a78bfa"></span><span class="tier-name">Elite</span></td>
              <td>90 &ndash; 100</td>
              <td>Exceptional track record across the full trust surface.</td>
            </tr>
            <tr>
              <td><span class="tier-badge" style="background:#34d399"></span><span class="tier-name">Trusted</span></td>
              <td>75 &ndash; 89</td>
              <td>Reliable actor with verified identity and consistent operating history.</td>
            </tr>
            <tr>
              <td><span class="tier-badge" style="background:#6366f1"></span><span class="tier-name">Established</span></td>
              <td>50 &ndash; 74</td>
              <td>Active wallet with reasonable history but some dimensions still developing.</td>
            </tr>
            <tr>
              <td><span class="tier-badge" style="background:#fbbf24"></span><span class="tier-name">Emerging</span></td>
              <td>25 &ndash; 49</td>
              <td>Limited history or mixed signals; useful, but not yet high-trust.</td>
            </tr>
            <tr>
              <td><span class="tier-badge" style="background:#f87171"></span><span class="tier-name">Unverified</span></td>
              <td>0 &ndash; 24</td>
              <td>Insufficient evidence or significant red flags.</td>
            </tr>
          </tbody>
        </table>

        <div class="prose-callout">
          <strong>Adaptive thresholds.</strong> Tier boundaries are not static. Auto-recalibration jobs adjust breakpoints based on the actual score distribution and observed outcomes so the system does not drift into tier inflation.
        </div>

        <h2 id="defense">Sybil and gaming defense</h2>
        <p>A high score is meaningless if wallets can fake their way into it, so the engine defends the model before the score ships.</p>
        <h3>Sybil detection</h3>
        <p>DJD identifies suspicious wallet networks using the interaction graph stored in SQLite. It looks for circular funding patterns, shared funding sources, tightly synchronized timing, low-diversity counterparties, and other topology signals that show up in manufactured identity farms.</p>
        <h3>Gaming detection</h3>
        <p>The engine also catches wallets inflating their stats through temporary balance window dressing, wash-trading, or query-sensitive behavior. Gaming penalties are applied directly to the composite score and also feed the integrity multiplier.</p>

        <div class="prose-callout">
          <strong>Two-layer penalty system.</strong> Sybil indicators cap dimension scores. Gaming indicators reduce the composite score directly. Both still flow into the final integrity multiplier, so a wallet cannot hide behind one strong-looking metric.
        </div>

        <h2 id="sources">Data sources</h2>
        <p>Every signal comes from verifiable on-chain or explicitly linked identity data on Base:</p>
        <ul>
          <li><strong>Base RPC data</strong> &mdash; transaction history, nonces, balances, and contract interactions.</li>
          <li><strong>USDC transfer events</strong> &mdash; indexed from live event logs.</li>
          <li><strong>Base Name Service</strong> &mdash; for name ownership.</li>
          <li><strong>GitHub API</strong> &mdash; repository verification and activity for registered agents.</li>
          <li><strong>Insumer Model</strong> &mdash; multi-chain attestations for linked identity context.</li>
          <li><strong>Internal indexer</strong> &mdash; a continuous Base block indexer that builds the local relationship graph and feature store.</li>
        </ul>
        <p>No social clout metrics, manual score overrides, or pay-to-improve backdoors influence the score. If it is not on-chain or verifiably linked to the wallet, it does not count.</p>

        <h2 id="outcomes">Outcome tracking</h2>
        <p>Scores only matter if they predict real behavior. DJD tracks post-score outcomes such as payment follow-through, fraud pressure, and subsequent on-chain activity to understand whether the model is becoming more or less predictive over time.</p>
        <p>That outcome data feeds the recalibration system, which adjusts weights and tier thresholds as the network matures.</p>

        <h2 id="limits">What DJD does not do</h2>
        <ul>
          <li>No manual score overrides.</li>
          <li>No pay-to-boost mechanics. Certification can package and verify trust, but it does not purchase a better score.</li>
          <li>No hidden off-chain reputation sources such as social followings or vague community claims.</li>
          <li>No “secret sauce” positioning that prevents buyers from understanding what the model is measuring.</li>
        </ul>

        <div class="callout">
          <h2 class="section-title">See the model in the product</h2>
          <p class="section-copy">Use the free lookup to score a real wallet, then follow that same wallet into Certify, evaluator preview, and directory surfaces.</p>
          <div class="action-row" style="justify-content:center">
            <a class="button button-primary" href="/#lookup">Try the free lookup</a>
            <a class="button button-secondary" href="/docs">Open API docs</a>
          </div>
        </div>

        <p class="method-endnote">
          Model version 2.5.0. This methodology is a living document and will change as the scoring engine evolves.
          Questions or feedback? Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
        </p>
      </div>

      <aside class="method-sidebar">
        <div class="card">
          <div class="card-kicker">On this page</div>
          <div class="method-nav">
            <a href="#pipeline">Scoring pipeline</a>
            <a href="#dimensions">Five dimensions</a>
            <a href="#formula">Composite formula</a>
            <a href="#tiers">Tier model</a>
            <a href="#defense">Sybil and gaming defense</a>
            <a href="#sources">Data sources</a>
            <a href="#outcomes">Outcome tracking</a>
            <a href="#limits">What DJD does not do</a>
          </div>
        </div>
      </aside>
    </div>
  </article>
</main>`,
})

methodology.get('/', (c) => c.html(pageHtml))

export default methodology
