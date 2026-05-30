/**
 * Aentho — sales.js
 * Sales tracking: record, edit, delete, filter, export.
 */

let _editSaleId = null;

async function renderSales() {
  await populateProductDropdown();
  await loadSalesTable();
  await loadSalesStats();
}

async function loadSalesStats() {
  const [month, today] = await Promise.all([ADB.Sales.getThisMonth(), ADB.Sales.getToday()]);
  _t('sales-stat-month',  UI.formatCurrency(month.reduce((s,x)=>s+x.total,0)));
  _t('sales-stat-today',  UI.formatCurrency(today.reduce((s,x)=>s+x.total,0)));
  _t('sales-stat-profit', UI.formatCurrency(month.reduce((s,x)=>s+(x.profit||0),0)));
  _t('sales-stat-count',  month.length);
}

async function loadSalesTable() {
  const tbody = document.getElementById('sales-tbody');
  if (!tbody) return;
  let sales = await ADB.Sales.getAll();

  const q    = document.getElementById('sales-search')?.value?.toLowerCase() || '';
  const from = document.getElementById('sales-from')?.value;
  const to   = document.getElementById('sales-to')?.value;
  if (q)    sales = sales.filter(s => s.productName.toLowerCase().includes(q) || (s.customer||'').toLowerCase().includes(q));
  if (from) sales = sales.filter(s => new Date(s.date) >= new Date(from));
  if (to)   sales = sales.filter(s => new Date(s.date) <= new Date(to+'T23:59:59'));

  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
      <div class="empty-icon">📊</div><p>No sales found</p>
      <button class="btn btn-primary btn-sm" onclick="SalesModule.openAddSale()">Record First Sale</button>
    </div></td></tr>`;
    return;
  }
  tbody.innerHTML = sales.map(s => `<tr>
    <td><span style="font-weight:500">${_e(s.productName)}</span>${s.customer?`<br><span style="font-size:.72rem;color:var(--text-muted)">${_e(s.customer)}</span>`:''}</td>
    <td>${s.qty}</td>
    <td>${UI.formatCurrency(s.price)}</td>
    <td style="font-weight:600">${UI.formatCurrency(s.total)}</td>
    <td class="hide-mobile">${_e(s.payMethod)}</td>
    <td class="hide-mobile">${UI.formatDate(s.date,true)}</td>
    <td><div class="flex gap-1">
      <button class="btn btn-icon btn-secondary btn-sm" onclick="SalesModule.openEditSale('${s.id}')" title="Edit">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn btn-icon btn-danger btn-sm" onclick="SalesModule.deleteSale('${s.id}')" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div></td>
  </tr>`).join('');
}

async function populateProductDropdown() {
  const sel = document.getElementById('sale-product');
  if (!sel) return;
  const products = await ADB.Products.getAll();
  sel.innerHTML = `<option value="">— Select product (optional) —</option>` +
    products.map(p => `<option value="${p.id}" data-price="${p.price}" data-cost="${p.cost}">${_e(p.name)} (stock: ${p.stock})</option>`).join('');
  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    if (!opt?.value) return;
    _sf('sale-name',  opt.text.split(' (stock:')[0]);
    _sf('sale-price', (+opt.dataset.price).toFixed(2));
    _sf('sale-cost',  (+opt.dataset.cost).toFixed(2));
    saleAutoCalc();
  };
}

function saleAutoCalc() {
  const qty   = +document.getElementById('sale-qty')?.value   || 0;
  const price = +document.getElementById('sale-price')?.value || 0;
  const cost  = +document.getElementById('sale-cost')?.value  || 0;
  const total  = qty * price;
  const profit = total - cost * qty;
  _sf('sale-total',  total.toFixed(2));
  _sf('sale-profit', profit.toFixed(2));
}

function openAddSale() {
  _editSaleId = null;
  _t('sale-modal-title','Record Sale');
  document.getElementById('sale-form')?.reset();
  _sf('sale-date', new Date().toISOString().slice(0,16));
  UI.openModal('sale-modal');
}

async function openEditSale(id) {
  const s = await ADB.Sales.getById(id);
  if (!s) return;
  _editSaleId = id;
  _t('sale-modal-title','Edit Sale');
  _sf('sale-product',  s.productId||'');
  _sf('sale-name',     s.productName);
  _sf('sale-qty',      s.qty);
  _sf('sale-price',    s.price);
  _sf('sale-cost',     s.cost||0);
  _sf('sale-total',    s.total);
  _sf('sale-profit',   s.profit||0);
  _sf('sale-customer', s.customer||'');
  _sf('sale-paymethod',s.payMethod||'Cash');
  _sf('sale-notes',    s.notes||'');
  _sf('sale-date',     (s.date||'').slice(0,16));
  UI.openModal('sale-modal');
}

async function saveSale() {
  const productName = document.getElementById('sale-name')?.value?.trim() ||
    document.getElementById('sale-product')?.selectedOptions[0]?.text?.split(' (stock:')[0] || '';
  if (!productName)   { UI.toast('Item name is required','error'); return; }
  if (!document.getElementById('sale-qty')?.value)   { UI.toast('Quantity is required','error'); return; }
  if (!document.getElementById('sale-price')?.value) { UI.toast('Price is required','error'); return; }

  const data = {
    productId:   document.getElementById('sale-product')?.value||'',
    productName,
    qty:         document.getElementById('sale-qty')?.value,
    price:       document.getElementById('sale-price')?.value,
    cost:        document.getElementById('sale-cost')?.value||0,
    total:       document.getElementById('sale-total')?.value,
    profit:      document.getElementById('sale-profit')?.value||0,
    customer:    document.getElementById('sale-customer')?.value,
    payMethod:   document.getElementById('sale-paymethod')?.value||'Cash',
    notes:       document.getElementById('sale-notes')?.value,
    date:        document.getElementById('sale-date')?.value||new Date().toISOString()
  };
  try {
    if (_editSaleId) { await ADB.Sales.update(_editSaleId, data); UI.toast('Sale updated','success'); }
    else             { await ADB.Sales.add(data);                  UI.toast('Sale recorded','success'); }
    UI.closeModal('sale-modal');
    await loadSalesTable(); await loadSalesStats();
    if (document.getElementById('section-overview')?.classList.contains('active'))
      await DashOverview.loadStats();
  } catch(e) { UI.toast('Error: '+e.message,'error'); }
}

async function deleteSale(id) {
  if (!await UI.confirm('Delete this sale? Stock will be restored.','Delete Sale',true)) return;
  await ADB.Sales.delete(id);
  UI.toast('Sale deleted','warning');
  await loadSalesTable(); await loadSalesStats();
}

function filterSales() { loadSalesTable(); }

async function exportSalesCSV() {
  const sales = await ADB.Sales.getAll();
  const rows  = [['Product','Customer','Qty','Unit Price','Total','Profit','Payment','Date']];
  sales.forEach(s => rows.push([`"${s.productName}"`,`"${s.customer||''}"`,s.qty,s.price,s.total,s.profit||'',s.payMethod,UI.formatDate(s.date)]));
  _downloadCSV(rows, 'aentho-sales');
  UI.toast('Sales exported','success');
}

function _t(id,v)  { const el=document.getElementById(id); if(el) el.textContent=v; }
function _sf(id,v) { const el=document.getElementById(id); if(el) el.value=v; }
function _e(s='')  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _downloadCSV(rows, name) {
  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`${name}-${Date.now()}.csv`});
  a.click(); URL.revokeObjectURL(a.href);
}

window.SalesModule = { renderSales, openAddSale, openEditSale, saveSale, deleteSale, filterSales, saleAutoCalc, exportSalesCSV };
