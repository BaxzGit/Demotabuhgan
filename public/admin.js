let adminToken = null;
const el = id => document.getElementById(id);

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
  const res = await fetch('/api' + path, { headers, ...opts });
  return res.json();
}

el('btnAdminLogin').addEventListener('click', async ()=>{
  const pass = el('admin_pass').value;
  const r = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pass })}).then(r=>r.json());
  if (r.token) { adminToken = r.token; localStorage.setItem('adminToken', adminToken); el('admin_pass').value=''; el('adminPanel').classList.remove('hidden'); loadData(); }
  else alert('Password salah');
});

async function loadData() {
  const u = await req('/admin/users');
  const w = await req('/admin/withdrawals');

  const tableUsers = el('usersTable');
  tableUsers.innerHTML = '<tr><th>#</th><th>Username</th><th>Phone</th><th>Balance</th></tr>';
  (u.users||[]).forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.id}</td><td>${x.username}</td><td>${x.phone}</td><td>Rp${(x.balance||0).toLocaleString('id-ID')}</td>`;
    tableUsers.appendChild(tr);
  });

  const tableW = el('withTable');
  tableW.innerHTML = '<tr><th>#</th><th>User</th><th>Amount</th><th>Wallet</th><th>Status</th><th>Action</th></tr>';
  (w.withdrawals||[]).forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.id}</td><td>${x.username||x.phone}</td><td>Rp${(x.amount||0).toLocaleString('id-ID')}</td><td>${x.wallet||''}</td><td>${x.status}</td><td>
      ${x.status==='pending' ? `<button onclick="approve(${x.id})">Approve</button><button onclick="decline(${x.id})">Decline</button>` : ''}</td>`;
    tableW.appendChild(tr);
  });
}

window.approve = async (id) => {
  if (!confirm('Setujui penarikan ini?')) return;
  const r = await fetch(`/api/admin/withdrawals/${id}/approve`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+adminToken}}).then(r=>r.json());
  if (r.ok) { alert('Disetujui'); loadData(); } else alert(r.error || 'Gagal');
};
window.decline = async (id) => {
  if (!confirm('Tolak penarikan ini?')) return;
  const r = await fetch(`/api/admin/withdrawals/${id}/decline`, { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+adminToken}}).then(r=>r.json());
  if (r.ok) { alert('Ditolak'); loadData(); } else alert(r.error || 'Gagal');
};

document.addEventListener('DOMContentLoaded', ()=> {
  adminToken = localStorage.getItem('adminToken');
  if (adminToken) { el('adminPanel').classList.remove('hidden'); loadData(); }
});
