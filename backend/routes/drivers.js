const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['Available', 'On Trip', 'Off Duty', 'Suspended'];

function isExpired(dateStr) {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM drivers WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params).map(d => ({ ...d, license_expired: isExpired(d.license_expiry) }));
  res.json(rows);
});

// Drivers eligible for trip assignment: Available status AND license not expired
router.get('/available', (req, res) => {
  const rows = db.prepare("SELECT * FROM drivers WHERE status = 'Available' ORDER BY name").all()
    .filter(d => !isExpired(d.license_expiry));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  res.json({ ...d, license_expired: isExpired(d.license_expiry) });
});

router.post('/', authorize('FleetManager', 'SafetyOfficer'), (req, res) => {
  const { name, license_number, license_category, license_expiry, contact_number, safety_score } = req.body || {};
  if (!name || !license_number || !license_category || !license_expiry) {
    return res.status(400).json({ error: 'name, license_number, license_category, license_expiry are required' });
  }
  const existing = db.prepare('SELECT id FROM drivers WHERE license_number = ?').get(license_number);
  if (existing) return res.status(409).json({ error: 'License number must be unique' });

  const info = db.prepare(`INSERT INTO drivers
    (name, license_number, license_category, license_expiry, contact_number, safety_score, status)
    VALUES (?,?,?,?,?,?,'Available')`).run(
    name, license_number, license_category, license_expiry, contact_number || '', safety_score ?? 100
  );
  res.status(201).json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', authorize('FleetManager', 'SafetyOfficer'), (req, res) => {
  const d = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });

  const { name, license_category, license_expiry, contact_number, safety_score, status } = req.body || {};
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (status === 'On Trip') return res.status(400).json({ error: "'On Trip' status is system-managed via dispatch" });

  db.prepare(`UPDATE drivers SET
      name = COALESCE(?, name),
      license_category = COALESCE(?, license_category),
      license_expiry = COALESCE(?, license_expiry),
      contact_number = COALESCE(?, contact_number),
      safety_score = COALESCE(?, safety_score),
      status = COALESCE(?, status)
    WHERE id = ?`).run(name, license_category, license_expiry, contact_number, safety_score, status, req.params.id);

  res.json(db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authorize('FleetManager'), (req, res) => {
  const d = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  if (d.status === 'On Trip') return res.status(400).json({ error: 'Cannot delete a driver that is On Trip' });
  db.prepare('DELETE FROM drivers WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
