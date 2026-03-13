export function reviewerPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Certification Reviewer Dashboard - DJD Agent Score</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:
      radial-gradient(circle at top left, rgba(34,211,238,0.10), transparent 25%),
      radial-gradient(circle at top right, rgba(99,102,241,0.12), transparent 30%),
      linear-gradient(180deg,#08111d 0%,#0a1628 60%,#07111b 100%);
    color:#e5e7eb;
    min-height:100vh;
    padding:24px;
  }
  .wrap{max-width:1120px;margin:0 auto;padding-top:28px}
  h1{font-size:34px;line-height:1.1;margin-bottom:10px;color:#f8fafc}
  .sub{color:#94a3b8;font-size:15px;line-height:1.8;max-width:780px;margin-bottom:28px}
  .card{
    background:rgba(15,23,42,0.88);
    border:1px solid rgba(148,163,184,0.16);
    border-radius:18px;
    padding:24px;
    margin-bottom:18px;
    box-shadow:0 18px 50px rgba(2,6,23,0.22);
  }
  .auth-row,.filter-row,.action-row{display:flex;gap:12px;flex-wrap:wrap}
  .field{flex:1;min-width:220px}
  label{
    display:block;
    font-size:11px;
    text-transform:uppercase;
    letter-spacing:1px;
    color:#64748b;
    margin-bottom:8px;
    font-weight:700;
  }
  input,select,textarea{
    width:100%;
    background:#020817;
    border:1px solid rgba(148,163,184,0.22);
    border-radius:12px;
    color:#e5e7eb;
    padding:13px 14px;
    font-size:14px;
    outline:none;
  }
  textarea{min-height:84px;resize:vertical}
  input:focus,select:focus,textarea:focus{border-color:#22d3ee}
  .btn{
    border:none;
    border-radius:12px;
    padding:13px 16px;
    font-size:14px;
    font-weight:700;
    cursor:pointer;
    transition:transform .16s ease, opacity .16s ease;
  }
  .btn:hover{transform:translateY(-1px)}
  .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
  .btn-primary{background:#22d3ee;color:#082032}
  .btn-secondary{background:#1e293b;color:#e2e8f0;border:1px solid rgba(148,163,184,0.18)}
  .btn-success{background:#16a34a;color:#f0fdf4}
  .btn-warn{background:#d97706;color:#fff7ed}
  .btn-danger{background:#dc2626;color:#fef2f2}
  .meta{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
  .meta-chip{
    display:inline-flex;align-items:center;gap:8px;
    padding:8px 12px;border-radius:999px;
    background:rgba(15,118,110,0.12);color:#67e8f9;
    border:1px solid rgba(34,211,238,0.16);font-size:12px;font-weight:700
  }
  .queue{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  .request{
    border:1px solid rgba(148,163,184,0.14);
    background:rgba(2,8,23,0.56);
    border-radius:16px;
    padding:18px;
  }
  .request-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
  .request-name{font-size:19px;font-weight:700;color:#f8fafc}
  .request-wallet{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#64748b;word-break:break-all;margin-top:4px}
  .pill{
    display:inline-flex;align-items:center;justify-content:center;
    border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.7px
  }
  .pill-pending{background:rgba(234,179,8,0.12);color:#fde68a}
  .pill-approved{background:rgba(22,163,74,0.12);color:#86efac}
  .pill-needs-info{background:rgba(249,115,22,0.12);color:#fdba74}
  .pill-rejected{background:rgba(220,38,38,0.12);color:#fca5a5}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
  .metric{background:rgba(15,23,42,0.84);border:1px solid rgba(148,163,184,0.12);border-radius:12px;padding:12px}
  .metric-k{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px;font-weight:700}
  .metric-v{font-size:14px;font-weight:700}
  .copy{font-size:13px;color:#cbd5e1;line-height:1.75;margin-bottom:12px}
  .note{font-size:12px;color:#94a3b8;line-height:1.75;margin-top:8px}
  .request-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .empty{padding:28px;text-align:center;color:#94a3b8;line-height:1.8}
  .status{margin-top:12px;font-size:13px;color:#67e8f9;display:none}
  .error{margin-top:12px;font-size:13px;color:#fca5a5;display:none}
  .top-link{display:inline-block;margin-top:10px;font-size:13px;color:#67e8f9;text-decoration:none}
  .top-link:hover{text-decoration:underline}
  @media(max-width:900px){
    .queue,.grid{grid-template-columns:1fr}
  }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Certification Reviewer Dashboard</h1>
    <p class="sub">Internal operations surface for DJD Certify. Load the review queue with an admin key, inspect score and profile context, then approve, request more information, reject, or issue a certification from an approved review.</p>

    <div class="card">
      <div class="auth-row">
        <div class="field">
          <label for="adminKey">Admin Key</label>
          <input id="adminKey" type="password" placeholder="Enter x-admin-key for reviewer actions" autocomplete="off">
        </div>
        <div class="field" style="max-width:170px">
          <label for="statusFilter">Status</label>
          <select id="statusFilter">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="needs_info">Needs Info</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="field" style="max-width:130px">
          <label for="limitFilter">Limit</label>
          <select id="limitFilter">
            <option value="12">12</option>
            <option value="24" selected>24</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>
      <div class="action-row" style="margin-top:14px">
        <button class="btn btn-primary" id="loadBtn" onclick="loadQueue()">Load Review Queue</button>
        <button class="btn btn-secondary" onclick="clearDashboard()">Clear</button>
      </div>
      <div class="status" id="statusMsg"></div>
      <div class="error" id="errorMsg"></div>
    </div>

    <div class="meta">
      <div class="meta-chip" id="queueMeta">Queue idle</div>
      <a class="top-link" href="/certify">Back to Certify</a>
    </div>

    <div class="queue" id="queue"></div>
  </div>

<script>
const REVIEWS_API='/v1/certification/admin/reviews';

function esc(value){
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function showStatus(message){
  const el=document.getElementById('statusMsg');
  el.textContent=message;
  el.style.display='block';
}

function showError(message){
  const el=document.getElementById('errorMsg');
  el.textContent=message;
  el.style.display='block';
}

function clearMessages(){
  document.getElementById('statusMsg').style.display='none';
  document.getElementById('errorMsg').style.display='none';
}

function formatDate(value){
  if(!value) return '—';
  try{
    return new Date(value).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  }catch{
    return value;
  }
}

function pillClass(status){
  return status==='approved'
    ? 'pill pill-approved'
    : status==='needs_info'
      ? 'pill pill-needs-info'
      : status==='rejected'
        ? 'pill pill-rejected'
        : 'pill pill-pending';
}

function labelForStatus(status){
  return ({
    pending:'PENDING',
    approved:'APPROVED',
    needs_info:'NEEDS INFO',
    rejected:'REJECTED'
  })[status] || String(status || '').replace(/_/g,' ').toUpperCase();
}

function getAdminKey(){
  return document.getElementById('adminKey').value.trim();
}

function getQueueParams(){
  const params=new URLSearchParams();
  const status=document.getElementById('statusFilter').value;
  const limit=document.getElementById('limitFilter').value;
  if(status) params.set('status', status);
  if(limit) params.set('limit', limit);
  return params;
}

function noteBlock(label, value){
  return value ? '<div class="note"><strong>' + label + ':</strong> ' + esc(value) + '</div>' : '';
}

function renderRequest(request){
  const issueAction = request.status === 'approved'
    ? '<button class="btn btn-success" onclick="issueRequest(' + request.id + ')">Issue Certification</button>'
    : '';

  return '<article class="request">' +
    '<div class="request-head">' +
      '<div>' +
        '<div class="request-name">' + esc(request.profile.name || request.wallet) + '</div>' +
        '<div class="request-wallet">' + esc(request.wallet) + '</div>' +
      '</div>' +
      '<div class="' + pillClass(request.status) + '">' + esc(labelForStatus(request.status)) + '</div>' +
    '</div>' +
    '<div class="grid">' +
      '<div class="metric"><div class="metric-k">Requested Score</div><div class="metric-v">' + esc(request.requested_score) + '</div></div>' +
      '<div class="metric"><div class="metric-k">Requested Tier</div><div class="metric-v">' + esc(request.requested_tier) + '</div></div>' +
      '<div class="metric"><div class="metric-k">Current Score</div><div class="metric-v">' + esc(request.current_score.score == null ? '—' : request.current_score.score) + '</div></div>' +
      '<div class="metric"><div class="metric-k">Confidence</div><div class="metric-v">' + esc(request.current_score.confidence == null ? '—' : Math.round(request.current_score.confidence * 100) + '%') + '</div></div>' +
      '<div class="metric"><div class="metric-k">Requested</div><div class="metric-v">' + esc(formatDate(request.requested_at)) + '</div></div>' +
      '<div class="metric"><div class="metric-k">Reviewed</div><div class="metric-v">' + esc(formatDate(request.reviewed_at)) + '</div></div>' +
    '</div>' +
    '<div class="copy">' + esc(request.message) + '</div>' +
    noteBlock('Description', request.profile.description) +
    noteBlock('Request note', request.request_note) +
    noteBlock('Reviewer note', request.review_note) +
    '<div class="note">Profile: <a href="' + esc(request.links.agent_profile) + '" target="_blank" rel="noreferrer">agent page</a> · <a href="' + esc(request.links.readiness) + '" target="_blank" rel="noreferrer">readiness</a> · <a href="' + esc(request.links.review_status) + '" target="_blank" rel="noreferrer">review status</a></div>' +
    '<div class="request-actions">' +
      '<button class="btn btn-success" onclick="decision(' + request.id + ', &quot;approved&quot;)">Approve</button>' +
      '<button class="btn btn-warn" onclick="decision(' + request.id + ', &quot;needs_info&quot;)">Needs Info</button>' +
      '<button class="btn btn-danger" onclick="decision(' + request.id + ', &quot;rejected&quot;)">Reject</button>' +
      issueAction +
    '</div>' +
  '</article>';
}

async function loadQueue(){
  clearMessages();
  const adminKey=getAdminKey();
  if(!adminKey){
    showError('Enter the admin key before loading reviewer data.');
    return;
  }

  const button=document.getElementById('loadBtn');
  button.disabled=true;
  button.textContent='Loading...';
  try{
    const params=getQueueParams();
    const res=await fetch(REVIEWS_API + '?' + params.toString(),{
      headers:{'x-admin-key':adminKey}
    });
    const body=await res.json();
    if(!res.ok){
      throw new Error(body && body.error && body.error.message ? body.error.message : 'Unable to load review queue');
    }

    document.getElementById('queueMeta').textContent='Showing ' + body.returned + ' review request(s)';
    document.getElementById('queue').innerHTML=body.returned
      ? body.requests.map(renderRequest).join('')
      : '<div class="card empty">No review requests matched the current filter.</div>';
    showStatus('Reviewer queue loaded.');
  }catch(err){
    showError(err && err.message ? err.message : 'Unable to load reviewer queue.');
  }
  button.disabled=false;
  button.textContent='Load Review Queue';
}

async function decision(id, status){
  clearMessages();
  const adminKey=getAdminKey();
  if(!adminKey){
    showError('Enter the admin key before submitting reviewer actions.');
    return;
  }
  const note=window.prompt('Optional reviewer note for ' + labelForStatus(status).toLowerCase() + ':', '');
  if(note === null && status !== 'approved'){
    return;
  }
  try{
    const res=await fetch('/v1/certification/admin/reviews/' + id + '/decision',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-admin-key':adminKey
      },
      body:JSON.stringify({
        decision:status,
        note:note || undefined,
        reviewed_by:'reviewer-dashboard'
      })
    });
    const body=await res.json();
    if(!res.ok){
      throw new Error(body && body.error && body.error.message ? body.error.message : 'Unable to update review request');
    }
    showStatus('Review updated to ' + labelForStatus(body.status).toLowerCase() + '.');
    loadQueue();
  }catch(err){
    showError(err && err.message ? err.message : 'Unable to update review request.');
  }
}

async function issueRequest(id){
  clearMessages();
  const adminKey=getAdminKey();
  if(!adminKey){
    showError('Enter the admin key before issuing certifications.');
    return;
  }
  if(!window.confirm('Issue a certification from this approved review request?')){
    return;
  }
  try{
    const res=await fetch('/v1/certification/admin/reviews/' + id + '/issue',{
      method:'POST',
      headers:{'x-admin-key':adminKey}
    });
    const body=await res.json();
    if(!res.ok){
      throw new Error(body && body.error && body.error.message ? body.error.message : 'Unable to issue certification');
    }
    showStatus('Certification issued for ' + body.certification.wallet + '.');
    loadQueue();
  }catch(err){
    showError(err && err.message ? err.message : 'Unable to issue certification.');
  }
}

function clearDashboard(){
  clearMessages();
  document.getElementById('queue').innerHTML='';
  document.getElementById('queueMeta').textContent='Queue idle';
  document.getElementById('adminKey').value='';
}

document.getElementById('adminKey').addEventListener('keydown', function(event){
  if(event.key === 'Enter') loadQueue();
});
</script>
</body>
</html>`
}
