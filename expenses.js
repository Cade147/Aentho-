/**
 * Aentho — expenses.js
 * Expense tracking: add, edit, delete, monthly totals.
 */

const EXP_CATS = ['Rent','Utilities','Salaries','Stock Purchase','Transport','Marketing','Equipment','Insurance','Taxes','Maintenance','Printing','Communication','Other'];
let _editExpenseId = null;

async function renderExpenses() {
  _populateCats();
  await loadExpensesTable();
  await loadExpensesStats();
}

async function loadExpensesStats() {
  const [month, all] = await Promise.all([ADB.Expenses.getThisMonth(), ADB.Expenses.getAll()]);
  _t('exp-stat-month',  UI.formatCurrency(month.reduce((s,e)=>s+e.amount,0)));
  _t('exp-stat-total',  UI.formatCurrency(all.reduce((s,e)=>s+e.amount,0)));
  _t('exp-stat-count',  month.length);
  // 6-month average
  const sixMonths = [];
  for (let i=5;i>=0;i--) {
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const yr=d.getFullYear(), mo=d.getMonth();
    sixMonths.push(all.filter(e=>{const x=new Date(e.date);return x.getFullYear()===yr&&x.getMonth()===mo;}).reduce((s,e)=>s+e.amount,0));
  }
  const avg = sixMonths.reduce((s,x)=>s+x,0)/6;
  _t('exp-stat-avg', UI.formatCurrency(avg));
}

async function loadExpensesTable() {
  const tbody = document.getElementById('exp-tbody');
  if (!tbody) return;
  const all = await ADB.Expenses.getAll();
  if (!all.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <div class="empty-icon">💸</div><p>No expenses recorded</p>
      <button class="btn btn-primary btn-sm" onclick="ExpenseModule.openAddExpense()">Add Expense</button>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = all.map(e=>`<tr>
    <td style="font-weight:500">${_e(e.description)}</td>
    <td><span class="badge badge-muted">${_e(e.category)}</span></td>
    <td style="font-weight:600;color:var(--danger)">${UI.formatCurrency(e.amount)}</td>
    <td class="hide-mobile">${_e(e.payMethod||'Cash')}</td>
    <td class="hide-mobile">${UI.formatDate(e.date,true)}</td>
    <td><div class="flex gap-1">
      <button class="btn btn-icon btn-secondary btn-sm" onclick="ExpenseModule.openEditExpense('${e.id}')" title="Edit">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn btn-icon btn-danger btn-sm" onclick="ExpenseModule.deleteExpense('${e.id}')" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div></td>
  </tr>`).join('');
}

function _populateCats() {
  const sel = document.getElementById('exp-category');
  if (sel) sel.innerHTML = EXP_CATS.map(c=>`<option value="${c}">${c}</option>`).join('');
}

function openAddExpense() {
  _editExpenseId = null;
  _t('exp-modal-title','Add Expense');
  document.getElementById('exp-form')?.reset();
  _sf('exp-date', new Date().toISOString().slice(0,10));
  _populateCats();
  UI.openModal('expense-modal');
}

async function openEditExpense(id) {
  const e = await ADB.Expenses.getById(id);
  if (!e) return;
  _editExpenseId = id;
  _t('exp-modal-title','Edit Expense');
  _populateCats();
  _sf('exp-description', e.description);
  _sf('exp-category',    e.category);
  _sf('exp-amount',      e.amount);
  _sf('exp-paymethod',   e.payMethod||'Cash');
  _sf('exp-notes',       e.notes||'');
  _sf('exp-date',        (e.date||'').slice(0,10));
  UI.openModal('expense-modal');
}

async function saveExpense() {
  const description = document.getElementById('exp-description')?.value?.trim();
  const amount      = document.getElementById('exp-amount')?.value;
  if (!description)     { UI.toast('Description is required','error'); return; }
  if (!amount||+amount<=0) { UI.toast('Enter a valid amount','error'); return; }
  const data = {
    description,
    category:  document.getElementById('exp-category')?.value||'Other',
    amount,
    payMethod: document.getElementById('exp-paymethod')?.value||'Cash',
    notes:     document.getElementById('exp-notes')?.value||'',
    date:      document.getElementById('exp-date')?.value||new Date().toISOString().slice(0,10)
  };
  try {
    if (_editExpenseId) { await ADB.Expenses.update(_editExpenseId,data); UI.toast('Expense updated','success'); }
    else                { await ADB.Expenses.add(data);                   UI.toast('Expense recorded','success'); }
    UI.closeModal('expense-modal');
    await loadExpensesTable(); await loadExpensesStats();
  } catch(e) { UI.toast('Error: '+e.message,'error'); }
}

async function deleteExpense(id) {
  if (!await UI.confirm('Delete this expense?','Delete',true)) return;
  await ADB.Expenses.delete(id);
  UI.toast('Expense deleted','warning');
  await loadExpensesTable(); await loadExpensesStats();
}

function _t(id,v)  { const el=document.getElementById(id); if(el) el.textContent=v; }
function _sf(id,v) { const el=document.getElementById(id); if(el) el.value=v; }
function _e(s='')  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.ExpenseModule = { renderExpenses, openAddExpense, openEditExpense, saveExpense, deleteExpense };
