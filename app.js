/* ===================================
   GRANTWISE — app.js
   Full backend: Supabase + Stripe
   =================================== */

const SUPABASE_URL      = 'https://pufidlfcdosihqcnfcdu.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1ZmlkbGZjZG9zaWhxY25mY2R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjY4MjQsImV4cCI6MjA5MjEwMjgyNH0.RzpCrWETYphY-1dV8JOp_7E-DcjZrN26HLGBqfxg110'
const STRIPE_STARTER_LINK = 'https://buy.stripe.com/4gMbIU5vlfbrcCW0rG8N207'
const STRIPE_GROWTH_LINK  = 'https://buy.stripe.com/3cIeV66zp8N30Ue3DS8N208'
const STRIPE_PRO_LINK     = 'https://buy.stripe.com/dRm4gs2j9d3jcCW4HW8N209'

const { createClient } = supabase
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null
let userProfile = null
let selectedGrantType = 'Foundation grant'
let selectedSection   = 'executive summary'
let currentText       = ''

const STARTER_LIMIT = 30
const GROWTH_LIMIT  = 75
const FREE_LIMIT    = 5

const TIPS = {
  'executive summary':   ['Keep it to 1-2 paragraphs - funders read dozens.','Lead with the problem, then solution, then the ask.','Mention your EIN and 501(c)(3) for credibility.'],
  'statement of need':   ['Use local data, not just national figures.','Connect the need to the funder\'s stated priorities.','Focus on the community problem, not your org.'],
  'project description': ['Include who, what, where, when, how many served.','List concrete measurable activities.','Tie each activity to the funder\'s goals.'],
  'goals and objectives':['Goals are broad; objectives are SMART.','Include a timeline with milestones.','Aim for 2-4 objectives per goal.'],
  'budget narrative':    ['Justify every line item - funders cut unexplained costs.','Show matching funds if you have them.','Personnel costs need FTE % and benefits.'],
  'evaluation plan':     ['Measure both outputs and outcomes.','Name specific data collection tools.','State who is responsible for evaluation.'],
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('signoutLink')?.addEventListener('click', async e => {
    e.preventDefault()
    await sb.auth.signOut()
    window.location.href = 'login.html'
  })

  async function initApp(session) {
    if (!session) { window.location.href = 'login.html'; return }
    if (currentUser) return
    currentUser = session.user
    await loadProfile()
    checkAccess()
    wireNav()
    wireGrantTypes()
    wireSectionPills()
    renderTips()
  }

  const { data: { session } } = await sb.auth.getSession()
  if (session) {
    await initApp(session)
  } else {
    const { data: { subscription } } = sb.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        subscription.unsubscribe()
        await initApp(session)
      } else if (event === 'INITIAL_SESSION' && !session) {
        window.location.href = 'login.html'
      }
    })
  }
})

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

function checkAccess() {
  if (!userProfile) return
  const plan = userProfile.plan
  const used = userProfile.proposals_used || 0
  if (plan === 'pro') return
  if (plan === 'growth' && used < GROWTH_LIMIT) return
  if (plan === 'starter' && used < STARTER_LIMIT) return
  if (used < FREE_LIMIT) return
  showPaywall()
}

function canGenerate() {
  if (!userProfile) return false
  const plan = userProfile.plan
  const used = userProfile.proposals_used || 0
  if (plan === 'pro') return true
  if (plan === 'growth') return used < GROWTH_LIMIT
  if (plan === 'starter') return used < STARTER_LIMIT
  return used < FREE_LIMIT
}

function renderStatus() {
  if (!userProfile) return
  const plan = userProfile.plan
  const used = userProfile.proposals_used || 0
  const planBadge = document.getElementById('planBadge')
  const bar       = document.getElementById('usageBar')
  const label     = document.getElementById('usageLabel')
  const topbar    = document.getElementById('topbarStatus')
  const countdown = document.getElementById('trialCountdown')

  if (planBadge) planBadge.textContent = plan === 'trial' ? 'Free' : plan === 'starter' ? 'Starter' : plan === 'growth' ? 'Growth' : 'Pro'

  if (plan === 'pro') {
    if (bar) bar.style.width = '20%'
    if (label) label.textContent = 'Unlimited proposals'
    if (topbar) topbar.textContent = 'Pro - unlimited'
  } else if (plan === 'growth') {
    const pct = Math.min(100, (used / GROWTH_LIMIT) * 100)
    if (bar) bar.style.width = pct + '%'
    if (label) label.textContent = used + ' / ' + GROWTH_LIMIT + ' proposals'
    if (topbar) topbar.textContent = (GROWTH_LIMIT - used) + ' left'
  } else if (plan === 'starter') {
    const pct = Math.min(100, (used / STARTER_LIMIT) * 100)
    if (bar) bar.style.width = pct + '%'
    if (label) label.textContent = used + ' / ' + STARTER_LIMIT + ' proposals'
    if (topbar) topbar.textContent = (STARTER_LIMIT - used) + ' left'
  } else {
    const left = Math.max(0, FREE_LIMIT - used)
    const pct  = Math.min(100, (used / FREE_LIMIT) * 100)
    if (bar) bar.style.width = pct + '%'
    if (label) label.textContent = used + ' / ' + FREE_LIMIT + ' free proposals'
    if (topbar) topbar.textContent = left + ' free left'
    if (countdown) countdown.textContent = left > 0 ? left + ' free proposals left' : 'Upgrade to continue'
  }
}

function showPaywall() {
  document.getElementById('paywallOverlay').style.display = 'flex'
}

function checkout(plan) {
  const url = plan === 'pro' ? STRIPE_PRO_LINK : plan === 'growth' ? STRIPE_GROWTH_LINK : STRIPE_STARTER_LINK
  window.open(url + '?prefilled_email=' + encodeURIComponent(currentUser.email), '_blank')
}

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
  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebarOverlay')
  sidebar.classList.toggle('open')
  if (overlay) overlay.classList.toggle('show')
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar')
  const overlay = document.getElementById('sidebarOverlay')
  sidebar.classList.remove('open')
  if (overlay) overlay.classList.remove('show')
}

function wireGrantTypes() {
  document.querySelectorAll('.gt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gt-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      selectedGrantType = btn.dataset.type
    })
  })
}

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
  list.innerHTML = tips.map(t => '<div class="tip-item"><div class="tip-dot"></div><span>' + t + '</span></div>').join('')
}

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
  btn.innerHTML = '<span class="spin-inline"></span> Writing...'
  card.classList.add('generating')
  body.innerHTML = '<span id="streamOut"></span>'

  let fullText = ''

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grantType: selectedGrantType,
        section:   selectedSection,
        mission, funder, project, amount,
        orgName: userProfile?.org_name || '',
         rfp: document.getElementById('rfpInput')?.value?.trim() || '',
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || 'Server error ' + res.status)
    }

    const data = await res.json()
    fullText = data.content?.[0]?.text || ''
    body.innerHTML = '<span style="color:var(--text)">' + esc(fullText) + '</span>'
    currentText = fullText

    const newCount = (userProfile.proposals_used || 0) + 1
    await sb.from('profiles').update({ proposals_used: newCount }).eq('id', currentUser.id)
    userProfile.proposals_used = newCount
    renderStatus()
    checkAccess()

  } catch(err) {
    body.innerHTML = '<span style="color:#b43232">Error: ' + esc(err.message) + '</span>'
  }

  card.classList.remove('generating')
  btn.disabled = false
  btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10a1 1 0 0 1 1.12-.38z" clip-rule="evenodd"/></svg> Generate section'
}

async function saveProposal() {
  if (!currentText) return
  const { error } = await sb.from('proposals').insert({
    user_id: currentUser.id, grant_type: selectedGrantType, section: selectedSection,
    funder: document.getElementById('funderInput')?.value?.trim() || '',
    content: currentText, created_at: new Date().toISOString(),
  })
  if (error) { showToast('Error saving - ' + error.message); return }
  showToast('Saved to My proposals.')
}

async function loadProposals() {
  const grid = document.getElementById('proposalsGrid')
  if (!grid) return
  grid.innerHTML = '<p class="empty-msg" style="color:var(--text3)">Loading...</p>'
  const { data, error } = await sb.from('proposals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false })
  if (error || !data?.length) { grid.innerHTML = '<p class="empty-msg">No proposals saved yet.</p>'; return }
  grid.innerHTML = ''
  data.forEach(p => {
    const card = document.createElement('div')
    card.className = 'proposal-card'
    const d = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    card.innerHTML = '<div class="pc-top"><span class="pc-type">' + shortType(p.grant_type) + '</span><span class="pc-date">' + d + '</span></div><div class="pc-section">' + cap(p.section) + '</div><div class="pc-preview">' + esc(p.content) + '</div><div class="pc-actions"><button class="card-action-btn" onclick="copyText(' + JSON.stringify(JSON.stringify(p.content)) + ')">Copy</button><button class="card-action-btn" style="color:#b43232" onclick="deleteProposal(\'' + p.id + '\', this)">Delete</button></div>'
    grid.appendChild(card)
  })
}

async function deleteProposal(id, btn) {
  await sb.from('proposals').delete().eq('id', id)
  btn.closest('.proposal-card').remove()
}

function copyText(text) {
  navigator.clipboard.writeText(JSON.parse(text)).then(() => showToast('Copied!'))
}

async function loadOrgProfile() {
  if (!userProfile) return
  const fields = ['orgNameField','orgMissionField','orgProgramsField','orgBudgetField','orgEINField']
  const keys   = ['org_name','org_mission','org_programs','org_budget','org_ein']
  fields.forEach((f, i) => { const el = document.getElementById(f); if (el) el.value = userProfile[keys[i]] || '' })
}

async function saveOrgProfile() {
  const updates = {
    org_name: document.getElementById('orgNameField')?.value?.trim(),
    org_mission: document.getElementById('orgMissionField')?.value?.trim(),
    org_programs: document.getElementById('orgProgramsField')?.value?.trim(),
    org_budget: document.getElementById('orgBudgetField')?.value?.trim(),
    org_ein: document.getElementById('orgEINField')?.value?.trim(),
  }
  const { error } = await sb.from('profiles').update(updates).eq('id', currentUser.id)
  if (error) { showToast('Error saving profile.'); return }
  Object.assign(userProfile, updates)
  showToast('Org profile saved')
}

function renderAccountView() {
  if (!userProfile) return
  const used = userProfile.proposals_used || 0
  document.getElementById('acctOrg').textContent   = userProfile.org_name || '-'
  document.getElementById('acctEmail').textContent = userProfile.email || currentUser.email
  document.getElementById('acctPlan').textContent  = cap(userProfile.plan || 'trial')
  document.getElementById('acctTrial').textContent = userProfile.plan === 'trial' ? (Math.max(0, FREE_LIMIT - used) + ' free proposals left') : 'N/A'
  document.getElementById('acctUsage').textContent = used + (userProfile.plan === 'pro' ? ' (unlimited)' : userProfile.plan === 'growth' ? ' / ' + GROWTH_LIMIT : userProfile.plan === 'starter' ? ' / ' + STARTER_LIMIT : ' / ' + FREE_LIMIT + ' free')
}

function copyOutput() {
  if (!currentText) return
  navigator.clipboard.writeText(currentText).then(() => showToast('Copied!'))
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function shortType(t) { return {'Foundation grant':'Foundation','Federal government grant':'Federal','Corporate grant':'Corporate','Community/local grant':'Community'}[t] || t.slice(0,12) }
function shake(el) { if (!el) return; el.style.animation='none'; el.offsetHeight; el.style.animation='shake .35s ease'; el.addEventListener('animationend',()=>el.style.animation='',{once:true}) }
function showToast(msg) { const t=document.getElementById('toast'); if(!t)return; t.textContent=msg; t.style.opacity='1'; clearTimeout(t._t); t._t=setTimeout(()=>{t.style.opacity='0'},2600) }

const s = document.createElement('style')
s.textContent = '.spin-inline{display:inline-block;width:13px;height:13px;border:2px solid rgba(250,247,242,.35);border-top-color:var(--cream);border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle}'
document.head.appendChild(s)
