/**
 * Aentho — reports.js
 * Monthly P&L, inventory report, export to CSV / print.
 */

async function renderReports() {
  await Promise.all([loadMonthlySummary(), loadProfitLossTable(), loadInventoryReport()]);
}

async function loadMonthlySummary() {
  const [sales, expenses] = await Promise.all([ADB.Sales.getThisMonth(), ADB.Expenses.getThisMonth()]);
  const revenue  = sales.reduce((s,x)=>s+x.total,0);
  const cogs     = sales.reduce((s,x)=>s+((x.cost||0)*x.qty),0);
  const grossProfit = revenue - cogs;
  const expTotal = expenses.reduce((s,x)=>s+x.amount,0);
  const netProfit = grossProfit - expTotal;
  const margin   = revenue ? ((netProfit/revenue)*100).toFixed(1) : 0;
  _t('rep-revenue', UI.formatCurrency(revenue));
  _t('rep-profit',  UI.formatCurrency(netProfit));
  _t('rep-cost',    UI.formatCurrency(cogs));
  _t('rep-count',   sales.length);
  _t('rep-avg',     UI.formatCurrency(sales.length ? revenue/sales.length : 0));
  _t('rep-margin',  margin+'%');
  const pEl = document.getElementById('rep-profit');
  if (pEl) pEl.style.color = netProfit>=0?'var(--success)':'var(--danger)';
}

async function loadProfitLossTable() {
  const tbody = document.getElementById('pl-tbody');
  if (!tbody) return;
  const [allSales, allExp] = await Promise.all([ADB.Sales.getAll(), ADB.Expenses.getAll()]);
  const rows=[];
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const yr=d.getFullYear(), mo=d.getMonth();
    const label=d.toLocaleDateString('en-ZA',{month:'long',year:'numeric'});
    const ms=allSales.filter(s=>{const x=new Date(s.date);return x.getFullYear()===yr&&x.getMonth()===mo;});
    const me=allExp.filter(e=>{const x=new Date(e.date);return x.getFullYear()===yr&&x.getMonth()===mo;});
    const revenue=ms.reduce((s,x)=>s+x.total,0);
    const cogs=ms.reduce((s,x)=>s+((x.cost||0)*x.qty),0);
    const exp=me.reduce((s,x)=>s+x.amount,0);
    const profit=revenue-cogs-exp;
    const margin=revenue?((profit/revenue)*100).toFixed(1):0;
    rows.push({label,count:ms.length,revenue,cogs,exp,profit,margin});
  }
  tbody.innerHTML = rows.map(r=>{
    const c=r.profit>=0?'var(--success)':'var(--danger)';
    return `<tr>
      <td style="font-weight:500">${r.label}</td><td>${r.count}</td>
      <td>${UI.formatCurrency(r.revenue)}</td><td>${UI.formatCurrency(r.cogs)}</td>
      <td>${UI.formatCurrency(r.exp)}</td>
      <td style="font-weight:700;color:${c}">${UI.formatCurrency(r.profit)}</td>
      <td>${r.margin}%</td>
    </tr>`;
  }).join('');

  // Update table header if needed for expenses column
  const thead = tbody.closest('table')?.querySelector('thead tr');
  if (thead && thead.children.length === 6) {
    thead.innerHTML = '<th>Month</th><th>Sales</th><th>Revenue</th><th>COGS</th><th>Expenses</th><th>Net Profit</th><th>Margin</th>';
  }
}

async function loadInventoryReport() {
  const tbody = document.getElementById('inv-report-tbody');
  if (!tbody) return;
  const products = await ADB.Products.getAll();
  const totalVal = products.reduce((s,p)=>s+(p.stock*p.cost),0);
  _t('rep-inv-value', UI.formatCurrency(totalVal));
  _t('rep-inv-count', products.length);
  _t('rep-inv-low',   products.filter(p=>p.stock<=p.minStock).length);
  if (!products.length) {
    tbody.innerHTML='<tr><td colspan="6"><div class="empty-state"><p>No products in inventory</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = [...products].sort((a,b)=>a.stock-b.stock).map(p=>{
    const s=p.stock===0?'danger':p.stock<=p.minStock?'warning':'success';
    const l=p.stock===0?'Out':'Low'[0]||p.stock<=p.minStock?'Low':'OK';
    const label=p.stock===0?'Out':p.stock<=p.minStock?'Low':'OK';
    return `<tr>
      <td style="font-weight:500">${_e(p.name)}</td>
      <td class="hide-mobile">${_e(p.category||'—')}</td>
      <td>${p.stock} ${_e(p.unit)}</td>
      <td>${UI.formatCurrency(p.price)}</td>
      <td>${UI.formatCurrency(p.stock*p.cost)}</td>
      <td><span class="badge badge-${s}">${label}</span></td>
    </tr>`;
  }).join('');
}

function printReport() { window.print(); }

async function exportFullReport() {
  const [sales, products, expenses] = await Promise.all([ADB.Sales.getAll(), ADB.Products.getAll(), ADB.Expenses.getAll()]);
  const lines = [
    'AENTHO BUSINESS REPORT',
    `Generated: ${new Date().toLocaleString('en-ZA')}`,
    '',
    '--- SALES SUMMARY ---',
    `Total Transactions,${sales.length}`,
    `Total Revenue,${sales.reduce((s,x)=>s+x.total,0).toFixed(2)}`,
    `Total Profit,${sales.reduce((s,x)=>s+(x.profit||0),0).toFixed(2)}`,
    '',
    '--- SALES DETAIL ---',
    'Product,Qty,Unit Price,Total,Profit,Customer,Payment,Date',
    ...sales.map(s=>`"${s.productName}",${s.qty},${s.price},${s.total},${s.profit||0},"${s.customer||''}",${s.payMethod},${UI.formatDate(s.date)}`),
    '',
    '--- EXPENSES ---',
    'Description,Category,Amount,Payment,Date',
    ...expenses.map(e=>`"${e.description}","${e.category}",${e.amount},${e.payMethod||'Cash'},${e.date}`),
    '',
    '--- INVENTORY ---',
    'Product,Category,Stock,Cost Price,Stock Value,Status',
    ...products.map(p=>`"${p.name}","${p.category||''}",${p.stock},${p.cost},${(p.stock*p.cost).toFixed(2)},${p.stock===0?'Out of Stock':p.stock<=p.minStock?'Low Stock':'OK'}`)
  ];
  const blob=new Blob([lines.join('\n')],{type:'text/csv'});
  const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`aentho-report-${Date.now()}.csv`});
  a.click(); URL.revokeObjectURL(a.href);
  UI.toast('Full report exported','success');
}

function _t(id,v) { const el=document.getElementById(id); if(el) el.textContent=v; }
function _e(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

window.ReportsModule = { renderReports, printReport, exportFullReport };
