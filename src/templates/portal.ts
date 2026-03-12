/**
 * Developer Portal Template
 *
 * Self-service dashboard for API key holders. Developer enters their
 * full API key in the browser, it gets SHA-256 hashed client-side,
 * and the hash is sent to the server to look up usage stats.
 *
 * The raw key never leaves the browser in plaintext.
 */

export interface PortalData {
  keyPrefix: string
  planName: string
  tier: string
  monthlyUsed: number
  monthlyLimit: number
  usageResetAt: string
  stripeCustomerId: string | null
  lastUsedAt: string | null
}

export function portalPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Developer Portal - DJD Agent Score</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #0d1117; color: #c9d1d9; min-height: 100vh; padding: 20px;
  }
  .container { max-width: 680px; margin: 0 auto; padding-top: 40px; }
  h1 { font-size: 28px; color: #f0f6fc; margin-bottom: 8px; }
  .subtitle { color: #8b949e; font-size: 14px; margin-bottom: 32px; }
  .auth-section {
    background: #161b22; border: 1px solid #30363d; border-radius: 12px;
    padding: 32px; text-align: center;
  }
  .auth-section h2 { font-size: 18px; color: #f0f6fc; margin-bottom: 12px; }
  .auth-section p { font-size: 14px; color: #8b949e; margin-bottom: 20px; }
  .key-input-group { display: flex; gap: 8px; }
  .key-input {
    flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid #30363d;
    background: #0d1117; color: #c9d1d9; font-size: 14px;
    font-family: 'SFMono-Regular', Consolas, monospace;
  }
  .key-input::placeholder { color: #484f58; }
  .key-input:focus { outline: none; border-color: #58a6ff; }
  .btn-primary {
    padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
    font-size: 14px; font-weight: 600; background: #238636; color: #fff;
    transition: background 0.2s;
  }
  .btn-primary:hover { background: #2ea043; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .error-msg { color: #f85149; font-size: 13px; margin-top: 12px; display: none; }

  /* Dashboard (hidden until auth) */
  .dashboard { display: none; }
  .card {
    background: #161b22; border: 1px solid #30363d; border-radius: 12px;
    padding: 24px; margin-bottom: 16px;
  }
  .card h3 { font-size: 16px; color: #f0f6fc; margin-bottom: 16px; }
  .stat-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .stat-label { font-size: 13px; color: #8b949e; }
  .stat-value { font-size: 15px; color: #f0f6fc; font-weight: 600; }
  .usage-bar-bg {
    width: 100%; height: 8px; background: #21262d; border-radius: 4px;
    margin: 8px 0 4px; overflow: hidden;
  }
  .usage-bar-fill {
    height: 100%; border-radius: 4px; transition: width 0.4s ease;
  }
  .usage-pct { font-size: 12px; color: #8b949e; text-align: right; }
  .key-prefix-display {
    font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px;
    color: #58a6ff; background: #0d1117; padding: 8px 12px;
    border-radius: 6px; border: 1px solid #30363d; display: inline-block;
  }
  .links { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .btn-link {
    display: inline-block; padding: 8px 16px; border-radius: 8px;
    text-decoration: none; font-size: 13px; font-weight: 600;
    border: 1px solid #30363d; background: #21262d; color: #c9d1d9;
    transition: background 0.2s; cursor: pointer;
  }
  .btn-link:hover { background: #30363d; }
  .reset-info { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .back-link { display: inline-block; margin-top: 20px; color: #58a6ff; text-decoration: none; font-size: 13px; }
  .back-link:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <h1>Developer Portal</h1>
  <p class="subtitle">View your API key usage and manage your subscription</p>

  <!-- Auth step -->
  <div class="auth-section" id="auth-section">
    <h2>Enter Your API Key</h2>
    <p>Your key is hashed in the browser before being sent. We never see the raw key.</p>
    <div class="key-input-group">
      <input type="password" class="key-input" id="key-input" placeholder="djd_live_..." autocomplete="off" />
      <button class="btn-primary" id="auth-btn" onclick="authenticate()">View Usage</button>
    </div>
    <div class="error-msg" id="error-msg"></div>
  </div>

  <!-- Dashboard (shown after auth) -->
  <div class="dashboard" id="dashboard">
    <div class="card">
      <h3>API Key</h3>
      <div class="stat-row">
        <span class="stat-label">Key Prefix</span>
        <span class="key-prefix-display" id="d-prefix"></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Plan</span>
        <span class="stat-value" id="d-plan"></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Last Used</span>
        <span class="stat-value" id="d-last-used"></span>
      </div>
    </div>

    <div class="card">
      <h3>Monthly Usage</h3>
      <div class="stat-row">
        <span class="stat-label">Requests</span>
        <span class="stat-value"><span id="d-used">0</span> / <span id="d-limit">0</span></span>
      </div>
      <div class="usage-bar-bg">
        <div class="usage-bar-fill" id="usage-bar"></div>
      </div>
      <div class="usage-pct" id="usage-pct">0%</div>
      <div class="reset-info">Resets <span id="d-reset"></span></div>
    </div>

    <div class="card">
      <h3>Manage</h3>
      <div class="links">
        <a href="/docs" class="btn-link">API Docs</a>
        <a href="/explorer" class="btn-link">Explorer</a>
        <button class="btn-link" id="portal-btn" style="display:none;" onclick="openPortal()">Billing Portal</button>
      </div>
    </div>
  </div>

  <a href="/docs" class="back-link" id="back-link">Back to API Docs</a>
</div>

<script>
let activeApiKey = '';

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function authenticate() {
  const input = document.getElementById('key-input');
  const errEl = document.getElementById('error-msg');
  const btn = document.getElementById('auth-btn');
  const key = input.value.trim();

  if (!key.startsWith('djd_live_')) {
    errEl.textContent = 'API key must start with djd_live_';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Checking...';
  errEl.style.display = 'none';

  try {
    const hash = await sha256(key);
    const res = await fetch('/portal/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyHash: hash }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? 'Invalid API key');
    }

    const data = await res.json();
    activeApiKey = key;
    renderDashboard(data);
  } catch (e) {
    activeApiKey = '';
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'View Usage';
  }
}

function renderDashboard(d) {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  document.getElementById('d-prefix').textContent = d.keyPrefix + '...';
  document.getElementById('d-plan').textContent = d.planName;
  document.getElementById('d-last-used').textContent = d.lastUsedAt
    ? new Date(d.lastUsedAt).toLocaleDateString()
    : 'Never';
  document.getElementById('d-used').textContent = d.monthlyUsed.toLocaleString();
  document.getElementById('d-limit').textContent = d.monthlyLimit.toLocaleString();

  const pct = d.monthlyLimit > 0 ? Math.min(100, (d.monthlyUsed / d.monthlyLimit) * 100) : 0;
  const bar = document.getElementById('usage-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 90 ? '#f85149' : pct > 70 ? '#d29922' : '#238636';
  document.getElementById('usage-pct').textContent = pct.toFixed(1) + '%';

  const resetDate = new Date(d.usageResetAt);
  document.getElementById('d-reset').textContent = resetDate.toLocaleDateString();

  if (d.stripeCustomerId) {
    const portalBtn = document.getElementById('portal-btn');
    portalBtn.style.display = 'inline-block';
    portalBtn.dataset.customerId = d.stripeCustomerId;
  }
}

async function openPortal() {
  const cid = document.getElementById('portal-btn').dataset.customerId;
  if (!cid || !activeApiKey) return;

  try {
    const res = await fetch('/billing/portal?customer_id=' + encodeURIComponent(cid), {
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + activeApiKey,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message ?? 'Unable to open billing portal');
    }

    const data = await res.json();
    if (!data.url) {
      throw new Error('Billing portal URL missing');
    }

    window.location.href = data.url;
  } catch (e) {
    window.alert(e.message ?? 'Unable to open billing portal');
  }
}

document.getElementById('key-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') authenticate();
});
</script>
</body>
</html>`
}
