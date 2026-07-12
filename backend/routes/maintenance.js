const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT m.*, v.registration_number, v.name AS vehicle_name FROM maintenance_logs m
             JOIN vehicles v ON v.id = m.vehicle_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND m.status = ?'; params.push(status); }
  sql += ' ORDER BY m.id DESC';
  res.json(db.prepare(sql).all(...params));
});

// Create maintenance record -> vehicle status becomes In Shop, removed from dispatch pool
router.post('/', authorize('FleetManager'), (req, res) => {
  const { vehicle_id, description, cost } = req.body || {};
  if (!vehicle_id || !description) return res.status(400).json({ error: 'vehicle_id and description are required' });

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  if (vehicle.status === 'On Trip') return res.status(400).json({ error: 'Cannot service a vehicle that is currently On Trip' });
  if (vehicle.status === 'Retired') return res.status(400).json({ error: 'Cannot service a Retired vehicle' });

  const tx = db.transaction(() => {
    const info = db.prepare(`INSERT INTO maintenance_logs (vehicle_id, description, cost, status)
      VALUES (?,?,?,'Active')`).run(vehicle_id, description, cost || 0);
    db.prepare("UPDATE vehicles SET status='In Shop' WHERE id = ?").run(vehicle_id);
    return info.lastInsertRowid;
  });
  const id = tx();

  res.status(201).json(db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(id));
});

// Close maintenance -> vehicle restored to Available (unless Retired)
router.post('/:id/close', authorize('FleetManager'), (req, res) => {
  const m = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Maintenance record not found' });
  if (m.status === 'Closed') return res.status(400).json({ error: 'Maintenance record already closed' });

  const { final_cost } = req.body || {};
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(m.vehicle_id);

  const tx = db.transaction(() => {
    db.prepare(`UPDATE maintenance_logs SET status='Closed', closed_at=datetime('now'), cost = COALESCE(?, cost) WHERE id = ?`)
      .run(final_cost, m.id);
    // Only restore to Available if no other active maintenance exists for this vehicle
    const otherActive = db.prepare(`SELECT COUNT(*) c FROM maintenance_logs WHERE vehicle_id = ? AND status='Active' AND id != ?`)
      .get(m.vehicle_id, m.id).c;
    if (vehicle.status !== 'Retired' && otherActive === 0) {
      db.prepare("UPDATE vehicles SET status='Available' WHERE id = ?").run(m.vehicle_id);
    }
  });
  tx();

  res.json(db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(m.id));
});

module.exports = router;
