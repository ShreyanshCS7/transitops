const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// --- Fuel logs ---
router.get('/fuel-logs', (req, res) => {
  const { vehicle_id } = req.query;
  let sql = `SELECT f.*, v.registration_number, v.name AS vehicle_name FROM fuel_logs f
             JOIN vehicles v ON v.id = f.vehicle_id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ' AND f.vehicle_id = ?'; params.push(vehicle_id); }
  sql += ' ORDER BY f.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/fuel-logs', authorize('FleetManager', 'FinancialAnalyst'), (req, res) => {
  const { vehicle_id, liters, cost, date } = req.body || {};
  if (!vehicle_id || liters == null || cost == null) return res.status(400).json({ error: 'vehicle_id, liters, cost are required' });
  const vehicle = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  const info = db.prepare(`INSERT INTO fuel_logs (vehicle_id, liters, cost, date) VALUES (?,?,?, COALESCE(?, date('now')))`)
    .run(vehicle_id, liters, cost, date);
  res.status(201).json(db.prepare('SELECT * FROM fuel_logs WHERE id = ?').get(info.lastInsertRowid));
});

// --- Expenses (tolls, misc) ---
router.get('/expenses', (req, res) => {
  const { vehicle_id, type } = req.query;
  let sql = `SELECT e.*, v.registration_number, v.name AS vehicle_name FROM expenses e
             LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE 1=1`;
  const params = [];
  if (vehicle_id) { sql += ' AND e.vehicle_id = ?'; params.push(vehicle_id); }
  if (type) { sql += ' AND e.type = ?'; params.push(type); }
  sql += ' ORDER BY e.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/expenses', authorize('FleetManager', 'FinancialAnalyst'), (req, res) => {
  const { vehicle_id, type, amount, date, description } = req.body || {};
  if (!type || amount == null) return res.status(400).json({ error: 'type and amount are required' });
  const info = db.prepare(`INSERT INTO expenses (vehicle_id, type, amount, date, description)
    VALUES (?,?,?, COALESCE(?, date('now')), ?)`).run(vehicle_id || null, type, amount, date, description || '');
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
});

// --- Per-vehicle operational cost summary ---
router.get('/operational-cost', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const result = vehicles.map(v => {
    const fuelCost = db.prepare('SELECT COALESCE(SUM(cost),0) c FROM fuel_logs WHERE vehicle_id = ?').get(v.id).c;
    const maintCost = db.prepare('SELECT COALESCE(SUM(cost),0) c FROM maintenance_logs WHERE vehicle_id = ?').get(v.id).c;
    const otherExpenses = db.prepare("SELECT COALESCE(SUM(amount),0) c FROM expenses WHERE vehicle_id = ?").get(v.id).c;
    return {
      vehicle_id: v.id,
      registration_number: v.registration_number,
      name: v.name,
      fuel_cost: fuelCost,
      maintenance_cost: maintCost,
      other_expenses: otherExpenses,
      total_operational_cost: fuelCost + maintCost + otherExpenses,
    };
  });
  res.json(result);
});

module.exports = router;
