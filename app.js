/**
 * Aentho — app.js
 * Main controller: navigation, sidebar, search, settings, profile, boot.
 */

// ── Navigation ────────────────────────────────────────────────────
async function navigateTo(section) {
  document.querySelectorAll('.page-section').forEach(el=>el.classList.remove('active'));
  document.getElementById(`section-${section}`)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active', el.dataset.section===section));
  const titles={overview:'Dashboard',sales:'Sales Tracking',inventory:'Inventory',
    expenses:'Expenses',analytics:'Analytics',reports:'Reports',notifications:'Notifications',settings:'Settings'};
  const titleEl=document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[section]||'Aentho';
  closeMobileSidebar();
  document.getElementById('main-scroll')?.scrollTo(0,0);
  await _loadSection(section);
}

async function _loadSection(s) {
  try {
    switch(s) {
      case 'overview':      await DashOverview.renderOverview();     break;
      case 'sales':         await SalesModule.renderSales();         break;
      case 'inventory':     await InventoryModule.renderInventory(); break;
      case 'expenses':      await ExpenseModule.renderExpenses();    break;
      case 'analytics':     await AnalyticsModule.renderAnalytics(); break;
      case 'reports':       await ReportsModule.renderReports();     break;
      case 'notifications': await NotifModule.renderNotifications(); break;
      case 'settings':      _loadSettingsForm();                     break;
    }
  } catch(err) { console.error('[App] Section load error:', err); }
}

// ── Sidebar ───────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  sb?.classList.toggle('collapsed');
  try { localStorage.setItem('aentho_sidebar', sb?.classList.contains('collapsed')?'1':'0'); } catch{}
}
function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('mobile-open');
  document.getElementById('sidebar-overlay')?.classList.add('show');
  document.body.style.overflow='hidden';
}
function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
  document.body.style.overflow='';
}

// ── Dropdown ──────────────────────────────────────────────────────
function toggleProfileDropdown() {
  document.getElementById('profile-dropdown')?.querySelector('.dropdown-menu')?.classList.toggle('open');
}
document.addEventListener('click', e => {
  const dd = document.getElementById('profile-dropdown');
  if (dd && !dd.contains(e.target)) dd.querySelector('.dropdown-menu')?.classList.remove('open');
});

// ── Search ────────────────────────────────────────────────────────
const _doSearch = UI.debounce(async (query) => {
  const panel = _getOrCreateSearchPanel();
  if (!query?.trim()) { panel.style.display='none'; return; }
  const q = query.toLowerCase();
  const [products, sales] = await Promise.all([ADB.Products.getAll(), ADB.Sales.getAll()]);
  const results = [
    ...products.filter(p=>p.name.toLowerCase().includes(q)).slice(0,3).map(p=>({type:'Product',label:p.name,sub:`Stock: ${p.stock} ${p.unit}`,section:'inventory'})),
    ...sales.filter(s=>s.productName.toLowerCase().includes(q)||(s.customer||'').toLowerCase().includes(q)).slice(0,3).map(s=>({type:'Sale',label:s.productName,sub:UI.formatCurrency(s.total),section:'sales'}))
  ].slice(0,6);
  if (!results.length) {
    panel.innerHTML=`<div style="padding:12px;font-size:.85rem;color:var(--text-muted);text-align:center">No results for "${_e(query)}"</div>`;
  } else {
    panel.innerHTML=results.map(r=>`
      <div onclick="navigateTo('${r.section}');closeSearch()" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--radius);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
        <span style="font-size:.7rem;padding:2px 7px;border-radius:99px;background:var(--accent-soft);color:var(--accent);font-weight:600;white-space:nowrap">${r.type}</span>
        <div style="min-width:0">
          <div style="font-size:.875rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_e(r.label)}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${r.sub}</div>
        </div>
      </div>`).join('');
  }
  panel.style.display='block';
}, 300);

function _getOrCreateSearchPanel() {
  let p = document.getElementById('search-panel');
  if (!p) {
    p = document.createElement('div');
    p.id='search-panel';
    p.style.cssText='position:absolute;top:calc(100% + 6px);left:0;right:0;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-lg);padding:6px;box-shadow:var(--shadow-lg);z-index:600;max-height:260px;overflow-y:auto';
    document.getElementById('topbar-search-wrap')?.appendChild(p);
  }
  return p;
}
function closeSearch() {
  const p=document.getElementById('search-panel'); if(p) p.style.display='none';
  const i=document.getElementById('search-input');  if(i) i.value='';
}
document.addEventListener('click', e => {
  const w=document.getElementById('topbar-search-wrap');
  if (w && !w.contains(e.target)) closeSearch();
});

// ── Settings ──────────────────────────────────────────────────────
function _loadSettingsForm() {
  const p = AAuth.getProfile()||{};
  _sf('settings-business', p.businessName||'');
  _sf('settings-owner',    p.ownerName||'');
  _sf('settings-email',    p.email||'');
  _sf('settings-currency', p.currency||'ZAR');
  const nameEl = document.getElementById('settings-display-name');
  const bizEl  = document.getElementById('settings-display-biz');
  if (nameEl) nameEl.textContent = p.ownerName||p.email||'Your Name';
  if (bizEl)  bizEl.textContent  = p.businessName||'Business Name';
  _refreshAvatarEl('settings-avatar', p, 'large');
}

async function saveSettings() {
  const biz   = document.getElementById('settings-business')?.value?.trim();
  const owner = document.getElementById('settings-owner')?.value?.trim();
  const email = document.getElementById('settings-email')?.value?.trim();
  const cur   = document.getElementById('settings-currency')?.value||'ZAR';
  if (!biz)   { UI.toast('Business name required','error'); return; }
  if (!owner) { UI.toast('Owner name required','error'); return; }
  await AAuth.updateUserProfile({businessName:biz,ownerName:owner,email});
  AAuth.saveProfile({...AAuth.getProfile(), currency:cur});
  UI.toast('Settings saved','success');
  _updateSidebar(); _updateTopbar();
}

async function savePasswordChange() {
  const cur  = document.getElementById('settings-cur-password')?.value;
  const np   = document.getElementById('settings-new-password')?.value;
  const np2  = document.getElementById('settings-confirm-password')?.value;
  if (!cur)       { UI.toast('Enter your current password','error'); return; }
  if (!np)        { UI.toast('Enter a new password','error'); return; }
  if (np !== np2) { UI.toast('Passwords do not match','error'); return; }
  if (np.length<6){ UI.toast('Password must be 6+ characters','error'); return; }
  const r = await AAuth.changePassword(np);
  if (r.success) {
    UI.toast('Password updated','success');
    ['settings-cur-password','settings-new-password','settings-confirm-password'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  } else { UI.toast(r.error,'error'); }
}

function triggerAvatarUpload() { document.getElementById('avatar-file-input')?.click(); }
function handleAvatarUpload(e) {
  const file=e.target.files?.[0];
  if (!file) return;
  if (file.size>600_000) { UI.toast('Image too large (max 600 KB)','error'); return; }
  const reader=new FileReader();
  reader.onload=async ev=>{
    await AAuth.updateUserProfile({photoURL:ev.target.result});
    _loadSettingsForm(); _updateSidebar(); _updateTopbar();
    UI.toast('Profile photo updated','success');
  };
  reader.readAsDataURL(file);
}

function _updateSidebar() {
  const p=AAuth.getProfile()||{};
  _t('sidebar-user-name', p.ownerName||p.email||'User');
  _t('sidebar-user-biz',  p.businessName||'My Business');
  _refreshAvatarEl('sidebar-avatar', p, 'small');
}
function _updateTopbar() {
  const p=AAuth.getProfile()||{};
  _refreshAvatarEl('topbar-avatar', p, 'topbar');
}
function _refreshAvatarEl(id, p, size) {
  const el = document.getElementById(id);
  if (!el) return;
  if (p.photoURL) {
    el.innerHTML=`<img src="${p.photoURL}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    if (size==='large') el.querySelector('img').style.borderRadius='50%';
  } else {
    el.innerHTML=`<span>${UI.initials(p.ownerName||p.email||'U')}</span>`;
    if (size==='large') el.innerHTML+=`<div class="avatar-overlay"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>`;
  }
}

// ── Quick actions ─────────────────────────────────────────────────
function quickAction(action) {
  switch(action) {
    case 'add-product': navigateTo('inventory').then(()=>InventoryModule.openAddProduct()); break;
    case 'record-sale': navigateTo('sales').then(()=>SalesModule.openAddSale()); break;
    case 'view-reports': navigateTo('reports'); break;
    case 'expenses': navigateTo('expenses').then(()=>ExpenseModule.openAddExpense()); break;
  }
}

// ── Danger zone ───────────────────────────────────────────────────
async function clearAllLocalData() {
  const ok=await UI.confirm('Delete ALL local data (products, sales, expenses)? This cannot be undone.','Clear All Data',true);
  if (!ok) return;
  try { indexedDB.deleteDatabase('AenthoDB'); localStorage.clear(); UI.toast('All local data cleared','warning'); setTimeout(()=>window.location.href='./index.html',1500); }
  catch(e) { UI.toast('Error clearing data','error'); }
}

// ── Boot ──────────────────────────────────────────────────────────
async function initDashboard() {
  const session = AAuth.requireAuth();
  if (!session) return;

  // Restore sidebar collapse
  if (localStorage.getItem('aentho_sidebar')==='1') document.getElementById('sidebar')?.classList.add('collapsed');

  // Fill user info
  _updateSidebar(); _updateTopbar();
  const p=AAuth.getProfile()||{};
  _t('dropdown-user-name',  p.ownerName||'User');
  _t('dropdown-user-email', p.email||'');

  // Greeting
  const h=new Date().getHours();
  const g=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  const name=(p.ownerName||'').split(' ')[0];
  const grEl=document.getElementById('overview-greeting');
  if (grEl) grEl.textContent=`${g}${name?', '+name:''} — here's your business at a glance.`;

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').then(r=>console.log('[SW]',r.scope)).catch(()=>{});
  }

  // Firebase + sync
  AAuth.initFirebase().then(()=>Sync.triggerSync()).catch(()=>{});
  Sync.initSync();

  // Init DB
  await ADB.openDB();

  // Load default section
  await navigateTo('overview');

  // Hide loader
  const loader=document.getElementById('page-loader');
  if (loader) { loader.classList.add('hidden'); setTimeout(()=>loader.remove(),500); }
}

function _t(id,v)  { const el=document.getElementById(id); if(el) el.textContent=v; }
function _sf(id,v) { const el=document.getElementById(id); if(el) el.value=v; }
function _e(s='')  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Global exposure ───────────────────────────────────────────────
window.navigateTo=navigateTo; window.toggleSidebar=toggleSidebar;
window.openMobileSidebar=openMobileSidebar; window.closeMobileSidebar=closeMobileSidebar;
window.toggleProfileDropdown=toggleProfileDropdown;
window.quickAction=quickAction; window.saveSettings=saveSettings;
window.savePasswordChange=savePasswordChange;
window.triggerAvatarUpload=triggerAvatarUpload; window.handleAvatarUpload=handleAvatarUpload;
window._doSearch=_doSearch; window.closeSearch=closeSearch;
window.clearAllLocalData=clearAllLocalData;
