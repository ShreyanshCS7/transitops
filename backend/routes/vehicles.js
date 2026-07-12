const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const STATUSES = ['Available', 'On Trip', 'In Shop', 'Retired'];

router.get('/', (req, res) => {
  const { type, status, region } = req.query;
  let sql = 'SELECT * FROM vehicles WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (region) { sql += ' AND region = ?'; params.push(region); }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});


router.get('/available', (req, res) => {
  res.json(db.prepare("SELECT * FROM vehicles WHERE status = 'Available' ORDER BY name").all());
});

router.get('/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(v);
});

router.post('/', authorize('FleetManager'), (req, res) => {
  const { registration_number, name, type, max_load_capacity, odometer, acquisition_cost, region } = req.body || {};
  if (!registration_number || !name || !type || !max_load_capacity) {
    return res.status(400).json({ error: 'registration_number, name, type, max_load_capacity are required' });
  }
  const existing = db.prepare('SELECT id FROM vehicles WHERE registration_number = ?').get(registration_number);
  if (existing) return res.status(409).json({ error: 'Registration number must be unique' });

  const info = db.prepare(`INSERT INTO vehicles
    (registration_number, name, type, max_load_capacity, odometer, acquisition_cost, region, status)
    VALUES (?,?,?,?,?,?,?,'Available')`).run(
    registration_number, name, type, max_load_capacity, odometer || 0, acquisition_cost || 0, region || 'Unassigned'
  );
  res.status(201).json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', authorize('FleetManager'), (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });

  const { name, type, max_load_capacity, odometer, acquisition_cost, region, status } = req.body || {};

  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  // Prevent manually setting On Trip / In Shop through this endpoint (those are system-managed)
  if (status && (status === 'On Trip')) {
    return res.status(400).json({ error: "'On Trip' status is system-managed via dispatch" });
  }

  db.prepare(`UPDATE vehicles SET
      name = COALESCE(?, name),
      type = COALESCE(?, type),
      max_load_capacity = COALESCE(?, max_load_capacity),
      odometer = COALESCE(?, odometer),
      acquisition_cost = COALESCE(?, acquisition_cost),
      region = COALESCE(?, region),
      status = COALESCE(?, status)
    WHERE id = ?`).run(name, type, max_load_capacity, odometer, acquisition_cost, region, status, req.params.id);

  res.json(db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authorize('FleetManager'), (req, res) => {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Vehicle not found' });
  if (v.status === 'On Trip') return res.status(400).json({ error: 'Cannot delete a vehicle that is On Trip' });
  db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
