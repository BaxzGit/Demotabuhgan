let token = localStorage.getItem('token');

const el = id => document.getElementById(id);
const show = sel => document.querySelector(sel).classList.remove('hidden');
const hide = sel => document.querySelector(sel).classList.add('hidden');

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, { headers, ...opts });
  return res.json();
}

async function refreshMe() {
  if (!token) return;
  const r = await api('/me', { method: 'GET' });
  if (r.user) {
    hide('#authSection');
    show('#dashboard');
    el('balanceDisplay').innerText = 'Rp' + (r.user.balance || 0).toLocaleString('id-ID');
  } else {
    token = null; localStorage.removeItem('token');
    hide('#dashboard'); show('#authSection');
  }
}

el('btnRegister').addEventListener('click', async () => {
  const username = el('reg_username').value.trim();
  const phone = el('reg_phone').value.trim();
  const password = el('reg_password').value;
  const r = await fetch('/api/register', {
    method: 'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username, phone, password })
  }).then(r=>r.json());
  if (r.token) { token = r.token; localStorage.setItem('token', token); alert('Daftar sukses'); refreshMe(); }
  else alert(r.error || 'Gagal daftar');
});

el('btnLogin').addEventListener('click', async () => {
  const phone = el('login_phone').value.trim();
  const password = el('login_password').value;
  const r = await fetch('/api/login', {
    method: 'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ phone, password })
  }).then(r=>r.json());
  if (r.token) { token = r.token; localStorage.setItem('token', token); alert('Login sukses'); refreshMe(); }
  else alert(r.error || 'Gagal login');
});

el('btnLogout').addEventListener('click', ()=>{ token=null; localStorage.removeItem('token'); hide('#dashboard'); show('#authSection'); });

el('btnDeposit').addEventListener('click', async ()=>{
  const amount = parseInt(el('deposit_amount').value || 0, 10);
  if (!amount || amount <= 0) return alert('Masukkan nominal valid');
  const res = await fetch('/api/deposit', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ token, amount })
  }).then(r=>r.json());
  if (res.ok) { alert('Setoran dicatat (simulasi).'); refreshMe(); } else alert(res.error || 'Gagal');
});

el('btnWithdraw').addEventListener('click', async ()=>{
  const amount = parseInt(el('withdraw_amount').value || 0, 10);
  const name = el('withdraw_name').value.trim();
  const method = el('withdraw_method').value;
  const wallet = el('withdraw_wallet').value.trim();

  if (!amount || amount < 20000) return alert('Minimal penarikan Rp20.000');
  if (!name || !wallet) return alert('Isi nama dan no rek/e-wallet');

  const r = await fetch('/api/withdraw', {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization': 'Bearer ' + token},
    body: JSON.stringify({ amount, name, method, wallet })
  }).then(r=>r.json());

  if (!r.ok && r.error) return alert(r.error || 'Gagal buat request');

  const adminPhone = '6283109105308';
  const message =
    `HALO CEES👋%0ASAYA MAU MENARIK DENGAN NOMINAL%0A%0ANOMINAL PENARIKAN:${amount}%0AATAS NAMA: ${encodeURIComponent(name)}%0AREKKENUBG/E WALLET: ${encodeURIComponent(wallet)}%0A%0A(Tolong proses ya)`;
  const waUrl = `https://wa.me/${adminPhone}?text=${message}`;
  window.open(waUrl, '_blank');
  alert('Request penarikan dibuat. Silakan lanjutkan chat ke admin via WhatsApp.');
  refreshMe();
});

refreshMe();
