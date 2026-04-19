/* ===================================
   GRANTWISE — app.js
   Full backend: Supabase + Stripe
   =================================== */

// ── CONFIG ──────────────────────────────────────────────
const SUPABASE_URL      = 'https://pufidlfcdosihqcnfcdu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1ZmlkbGZjZG9zaWhxY25mY2R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjY4MjQsImV4cCI6MjA5MjEwMjgyNH0.RzpCrWETYphY-1dV8JOp_7E-DcjZrN26HLGBqfxg110'
const STRIPE_STARTER_LINK = 'https://buy.stripe.com/4gMbIU5vlfbrcCW0rG8N207'
const STRIPE_GROWTH_LINK  = 'https://buy.stripe.com/3cIeV66zp8N30Ue3DS8N208'
const STRIPE_PRO_LINK     = 'https://buy.stripe.com/dRm4gs2j9d3jcCW4HW8N209'

// ── SUPABASE ────────────────────────────────────────────
const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── STATE ───────────────────────────────────────────────
let currentUser = null
let userProfile = null
let selectedGrantType = 'Foundation grant'
let selectedSection   = 'executive summary'
let currentText       = ''

const TRIAL_DAYS    = 0
const STARTER_LIMIT = 15
const GROWTH_LIMIT  = 40
const FREE_LIMIT = 5

const TIPS = {
  'executive summary':   ['Keep it to 1–2 paragraphs — funders read dozens.','Lead with the problem, then solution, then the ask.','Mention your EIN and 501(c)(3) for credibility.'],
  'statement of need':   ['Use local data, not just national figures.','Connect the need to the funder\'s stated priorities.','Focus on the community problem, not your org.'],
  'project description': ['Include who, what, where, when, how many served.','List concrete measurable activities.','Tie each activity to the funder\'s goals.'],
  'goals and objectives':['Goals are broad; objectives are SMART.','Include a timeline with milestones.','Aim for 2–4 objectives per goal.'],
  'budget narrative':    ['Justify every line item — funders cut unexplained costs.','Show matching funds if you have them.','Personnel costs need FTE % and benefits.'],
  'evaluation plan':     ['Measure both outputs and outcomes.','Name specific data collection tools.','State who is responsible for evaluation.'],
}

// ── INIT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('signoutLink')?.addEventListener('click', async e => {
    e.preventDefault()
    await sb.auth.signOut()
    window.location.href = 'login.html'
  })

  sb.auth.onAuthStateChange(async (event, session) => {
    if (!session) {
      if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        window.location.href = 'login.html'
      }
      return
    }
    if (currentUser) return
    currentUser = session.user
    await loadProfile()
    checkAccess()
    wireNav()
    wireGrantTypes()
    wireSectionPills()
    renderTips()
  })
})

// ── LOAD PROFILE ────────────────────────────────────────
async function loadProfile() {
  let { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single()

  if (!data) {
    const newProfile = {
      id: currentUser.id,
      email: currentUser.email,
      org_name: currentUser.user_metadata?.org_name || '',
      trial_start: new Date().toISOString(),
      plan: 'trial',
      proposals_used: 0,
    }
    await sb.from('profiles').upsert(newProfile)
    data = newProfile
  }

  userProfile = data
  renderStatus()
  renderAccountView()
}

// ── ACCESS CHECK ────────────────────────────────────────
function checkAccess() {
  if (!userProfile) return
  const plan = userProfile.plan
  if (plan === 'pro') return
  if (plan === 'growth' && userProfile.proposals_used < GROWTH_LIMIT) return
  if (plan === 'starter' && userProfile.proposals_used < STARTER_LIMIT) return
  if (plan === 'trial') {
    const trialStart = new Date(userProfile.trial_start)
    const now = new Date()
    const daysUsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
    if (daysUsed < TRIAL_DAYS) return
  }
  showPaywall()
}

function canGenerate() {
  if (!userProfile) return false
  const plan = userProfile.plan
  if (plan === 'pro') return true
  if (plan === 'growth') return (userProfile.proposals_used || 0) < GROWTH_LIMIT
  if (plan === 'starter') return (userProfile.proposals_used || 0) < STARTER_LIMIT
  if (plan === 'trial') return (userProfile.proposals_used || 0) < FREE_LIMIT
  return false
}

function trialDaysLeft() {
  if (!userProfile || userProfile.plan !== 'trial') return null
  const trialStart = new Date(userProfile.trial_start)
  const now = new Date()
  const daysUsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24))
  return Math.max(0, TRIAL_DAYS - daysUsed)
}

// ── RENDER STATUS ────────────────────────────────────────
function renderStatus() {
  if (!userProfile) return
  const plan = userProfile.plan
  const used = userProfile.proposals_used || 0

  const planBadge = document.getElementById('planBadge')
  const bar = document.getElementById('usageBar')
  const label = document.getElementById('usageLabel')
  const topbar = document.getElementById('topbarStatus')
  const countdown = document.getElementById('trialCountdown')

  if (planBadge) planBadge.textContent = plan === 'trial' ? 'Trial' : plan === 'starter' ? 'Starter' : plan === 'growth' ? 'Growth' : 'Pro'

  if (plan === 'pro') {
    if (bar) bar.style.width = '20%'
    if (label) label.textContent = 'Unlimited proposals'
    if (topbar) topbar.textContent = '✦ Pro'
  } else if (plan === 'growth') {
    const pct = Math.min(100, (used / GROWTH_LIMIT) * 100)
    if (bar) bar.style.width = pct + '%'
    if (label) label.textContent = `${used} / ${GROWTH_LIMIT} proposals`
    if (topbar) topbar.textContent = `⚡ ${GROWTH_LIMIT - used} left`
  } else if (plan === 'starter') {
    const pct = Math.min(100, (used / STARTER_LIMIT) * 100)
    if (bar) bar.style.width = pct + '%'
    if (label) label.textContent = `${used} / ${STARTER_LIMIT} proposals`
    if (topbar) topbar.textContent = `⚡ ${STARTER_LIMIT - used} left`
  } else {
    const days = trialDaysLeft()
    if (bar) bar.style.width = ((TRIAL_DAYS - days) / TRIAL_DAYS * 100) + '%'
    if (label) label.textContent = `${used} proposals written`
    if (topbar) topbar.textContent = `⏱ ${days}d trial left`
    if (countdown) countdown.textContent = days > 0 ? `${days} days left in trial` : 'Trial ended'
  }
}

// ── PAYWALL ──────────────────────────────────────────────
function showPaywall() {
  document.getElementById('paywallOverlay').style.display = 'flex'
}

function checkout(plan) {
  const url = plan === 'pro' ? STRIPE_PRO_LINK : plan === 'growth' ? STRIPE_GROWTH_LINK : STRIPE_STARTER_LINK
  const fullUrl = url + '?prefilled_email=' + encodeURIComponent(currentUser.email)
  window.open(fullUrl, '_blank')
}

// ── NAV ──────────────────────────────────────────────────
function wireNav() {
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault()
      const v = link.dataset.view
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'))
      link.classList.add('active')
      document.querySelectorAll('.view').forEach(el => el.classList.remove('active'))
      document.getElementById('view-' + v)?.classList.add('active')
      if (v === 'proposals') loadProposals()
      if (v === 'org') loadOrgProfile()
      if (v === 'account') renderAccountView()
    })
  })
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('closed')
}

// ── GRANT TYPES ──────────────────────────────────────────
function wireGrantTypes() {
  document.querySelectorAll('.gt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gt-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      selectedGrantType = btn.dataset.type
    })
  })
}

// ── SECTION PILLS ────────────────────────────────────────
function wireSectionPills() {
  document.querySelectorAll('.sec-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.sec-pill').forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      selectedSection = pill.dataset.section
      document.getElementById('sectionBadge').textContent = cap(selectedSection)
      renderTips()
    })
  })
}

function renderTips() {
  const list = document.getElementById('tipsList')
  if (!list) return
  const tips = TIPS[selectedSection] || []
  list.innerHTML = tips.map(t => `<div class="tip-item"><div class="tip-dot"></div><span>${t}</span></div>`).join('')
}

// ── GENERATE ─────────────────────────────────────────────
async function generate() {
  if (!canGenerate()) { showPaywall(); return }

  const mission = document.getElementById('missionInput')?.value?.trim()
  const project = document.getElementById('projectInput')?.value?.trim()
  const funder  = document.getElementById('funderInput')?.value?.trim()
  const amount  = document.getElementById('amountInput')?.value?.trim()

  if (!mission) { shake(document.getElementById('missionInput')); showToast('Please describe your mission.'); return }
  if (!project) { shake(document.getElementById('projectInput')); showToast('Please describe your project.'); return }

  const btn  = document.getElementById('writeBtn')
  const card = document.getElementById('outputCard')
  const body = document.getElementById('outputBody')

  btn.disabled = true
  btn.innerHTML = '<span class="spin-inline"></span> Writing…'
  card.classList.add('generating')
  body.innerHTML = '<span id="streamOut"></span>'

  let fullText = ''

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: selectedGrantType,
        section: selectedSection,
        mission,
        funder,
        project,
        amount,
        orgName: userProfile?.org_name || '',
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `API error ${res.status}`)
    }

    const data = await res.json()
    fullText = data.content?.[0]?.text || ''
    body.innerHTML = `<span style="color:var(--text)">${esc(fullText)}</span>`
    currentText = fullText

    const newCount = (userProfile.proposals_used || 0) + 1
    await sb.from('profiles').update({ proposals_used: newCount }).eq('id', currentUser.id)
    userProfile.proposals_used = newCount
    renderStatus()

  } catch(err) {
    body.innerHTML = `<span style="color:#b43232">Error: ${esc(err.message)}</span>`
  }

  card.classList.remove('generating')
  btn.disabled = false
  btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10a1 1 0 0 1 1.12-.38z" clip-rule="evenodd"/></svg> Generate section`
}

// ── SAVE PROPOSAL ─────────────────────────────────────────
async function saveProposal() {
  if (!currentText) return
  const { error } = await sb.from('proposals').insert({
    user_id:    currentUser.id,
    grant_type: selectedGrantType,
    section:    selectedSection,
    funder:     document.getElementById('funderInput')?.value?.trim() || '',
    content:    currentText,
    created_at: new Date().toISOString(),
  })
  if (error) { showToast('Error saving — ' + error.message); return }
  showToast('Saved to My proposals.')
}

// ── LOAD PROPOSALS ──────────────────────────────────────
async function loadProposals() {
  const grid = document.getElementById('proposalsGrid')
  if (!grid) return
  grid.innerHTML = '<p class="empty-msg" style="color:var(--text3)">Loading…</p>'

  const { data, error } = await sb.from('proposals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false })

  if (error || !data?.length) { grid.innerHTML = '<p class="empty-msg">No proposals saved yet.</p>'; return }

  grid.innerHTML = ''
  data.forEach(p => {
    const card = document.createElement('div')
    card.className = 'proposal-card'
    const d = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    card.innerHTML = `
      <div class="pc-top"><span class="pc-type">${shortType(p.grant_type)}</span><span class="pc-date">${d}</span></div>
      <div class="pc-section">${cap(p.section)}</div>
      <div class="pc-preview">${esc(p.content)}</div>
      <div class="pc-actions">
        <button class="card-action-btn" onclick="copyText(${JSON.stringify(p.content)})">Copy</button>
        <button class="card-action-btn" style="color:#b43232" onclick="deleteProposal('${p.id}', this)">Delete</button>
      </div>`
    grid.appendChild(card)
  })
}

async function deleteProposal(id, btn) {
  await sb.from('proposals').delete().eq('id', id)
  btn.closest('.proposal-card').remove()
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard.'))
}

// ── ORG PROFILE ───────────────────────────────────────────
async function loadOrgProfile() {
  if (!userProfile) return
  const fields = ['orgNameField','orgMissionField','orgProgramsField','orgBudgetField','orgEINField']
  const keys   = ['org_name','org_mission','org_programs','org_budget','org_ein']
  fields.forEach((f, i) => { const el = document.getElementById(f); if (el) el.value = userProfile[keys[i]] || '' })
}

async function saveOrgProfile() {
  const updates = {
    org_name:     document.getElementById('orgNameField')?.value?.trim(),
    org_mission:  document.getElementById('orgMissionField')?.value?.trim(),
    org_programs: document.getElementById('orgProgramsField')?.value?.trim(),
    org_budget:   document.getElementById('orgBudgetField')?.value?.trim(),
    org_ein:      document.getElementById('orgEINField')?.value?.trim(),
  }
  const { error } = await sb.from('profiles').update(updates).eq('id', currentUser.id)
  if (error) { showToast('Error saving profile.'); return }
  Object.assign(userProfile, updates)
  showToast('Org profile saved ✓')
}

// ── ACCOUNT VIEW ──────────────────────────────────────────
function renderAccountView() {
  if (!userProfile) return
  const days = trialDaysLeft()
  document.getElementById('acctOrg').textContent    = userProfile.org_name || '—'
  document.getElementById('acctEmail').textContent  = userProfile.email || currentUser.email
  document.getElementById('acctPlan').textContent   = cap(userProfile.plan || 'trial')
  document.getElementById('acctTrial').textContent  = userProfile.plan === 'trial' ? (days + ' days left') : 'N/A'
  document.getElementById('acctUsage').textContent  = (userProfile.proposals_used || 0) + (userProfile.plan === 'pro' ? ' (unlimited)' : userProfile.plan === 'growth' ? ` / ${GROWTH_LIMIT}` : userProfile.plan === 'starter' ? ` / ${STARTER_LIMIT}` : '')
}

// ── COPY OUTPUT ───────────────────────────────────────────
function copyOutput() {
  if (!currentText) return
  navigator.clipboard.writeText(currentText).then(() => showToast('Copied!'))
}

// ── HELPERS ───────────────────────────────────────────────
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function shortType(t) { return { 'Foundation grant':'Foundation','Federal government grant':'Federal','Corporate grant':'Corporate','Community/local grant':'Community' }[t] || t.slice(0,12) }
function shake(el) { if (!el) return; el.style.animation='none'; el.offsetHeight; el.style.animation='shake .35s ease'; el.addEventListener('animationend',()=>el.style.animation='',{once:true}) }
function showToast(msg) { const t=document.getElementById('toast'); if(!t)return; t.textContent=msg; t.style.opacity='1'; clearTimeout(t._t); t._t=setTimeout(()=>{t.style.opacity='0'},2600) }
function flashBtn(btn) { if(!btn)return; const o=btn.textContent; btn.textContent='Saved ✓'; btn.style.color='var(--olive)'; setTimeout(()=>{btn.textContent=o;btn.style.color=''},1600) }

const s = document.createElement('style')
s.textContent = `.spin-inline{display:inline-block;width:13px;height:13px;border:2px solid rgba(250,247,242,.35);border-top-color:var(--cream);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle}`
document.head.appendChild(s)
