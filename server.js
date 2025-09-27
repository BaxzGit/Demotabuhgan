const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'ganti_dengan_rahasia_yang_panjang';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

app.post('/api/register', async (req, res) => {
  const { username, phone, password } = req.body;
  if (!username || !phone || !password) return res.status(400).json({ error: 'Lengkapi semua field' });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (username, phone, password_hash, balance) VALUES (?, ?, ?, 0)`,
      [username, phone, hash],
      function (err) {
        if (err) {
          return res.status(400).json({ error: 'Username atau nomor sudah terdaftar' });
        }
        const user = { id: this.lastID, username, phone };
        const token = createToken(user);
        res.json({ token, user });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Lengkapi field' });
  db.get(`SELECT * FROM users WHERE phone = ?`, [phone], async (err, row) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!row) return res.status(400).json({ error: 'User tidak ditemukan' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Password salah' });
    const user = { id: row.id, username: row.username, phone: row.phone };
    const token = createToken(user);
    res.json({ token, user });
  });
});

app.get('/api/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  db.get(`SELECT id, username, phone, balance FROM users WHERE id = ?`, [payload.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json({ user: row });
  });
});

app.post('/api/deposit', (req, res) => {
  const { token } = req.body;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  const amount = parseInt(req.body.amount || 0, 10);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Nominal tidak valid' });
  db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [amount, payload.id], function (err) {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json({ ok: true, added: amount });
  });
});

app.post('/api/withdraw', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  const { amount, name, wallet, method } = req.body;
  const amt = parseInt(amount || 0, 10);
  if (!amt || amt < 20000) return res.status(400).json({ error: 'Minimal penarikan Rp20.000' });

  db.get(`SELECT balance FROM users WHERE id = ?`, [payload.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!row) return res.status(404).json({ error: 'User not found' });
    if (row.balance < amt) return res.status(400).json({ error: 'Saldo tidak mencukupi' });

    db.run(
      `INSERT INTO withdrawals (user_id, amount, name, wallet, method, status) VALUES (?,?,?,?,?,?)`,
      [payload.id, amt, name || '', wallet || '', method || '', 'pending'],
      function (err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json({ ok: true, requestId: this.lastID });
      }
    );
  });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = createToken({ admin: true });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Password admin salah' });
});

app.get('/api/admin/users', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload || !payload.admin) return res.status(401).json({ error: 'Unauthorized' });

  db.all(`SELECT id, username, phone, balance, created_at FROM users ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json({ users: rows });
  });
});

app.get('/api/admin/withdrawals', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload || !payload.admin) return res.status(401).json({ error: 'Unauthorized' });

  db.all(
    `SELECT w.id, w.user_id, u.username, u.phone, w.amount, w.name, w.wallet, w.method, w.status, w.created_at
     FROM withdrawals w LEFT JOIN users u ON u.id = w.user_id ORDER BY w.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json({ withdrawals: rows });
    }
  );
});

app.post('/api/admin/withdrawals/:id/approve', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload || !payload.admin) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.params.id;
  db.get(`SELECT * FROM withdrawals WHERE id = ?`, [id], (err, w) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!w) return res.status(404).json({ error: 'Request tidak ditemukan' });
    if (w.status !== 'pending') return res.status(400).json({ error: 'Sudah diproses' });

    db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [w.amount, w.user_id], function (err) {
      if (err) return res.status(500).json({ error: 'Server error' });
      db.run(`UPDATE withdrawals SET status = 'paid' WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json({ ok: true });
      });
    });
  });
});

app.post('/api/admin/withdrawals/:id/decline', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload || !payload.admin) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.params.id;
  db.run(`UPDATE withdrawals SET status = 'declined' WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: 'Server error' });
    res.json({ ok: true });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
