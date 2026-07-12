const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function isExpired(dateStr) {
  return new Date(dateStr) < new Date(new Date().toDateString());
}

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = `SELECT t.*, v.registration_number, v.name AS vehicle_name, dr.name AS driver_name
             FROM trips t
             JOIN vehicles v ON v.id = t.vehicle_id
             JOIN drivers dr ON dr.id = t.driver_id
             WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  sql += ' ORDER BY t.id DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const t = db.prepare(`SELECT t.*, v.registration_number, v.name AS vehicle_name, dr.name AS driver_name
    FROM trips t JOIN vehicles v ON v.id = t.vehicle_id JOIN drivers dr ON dr.id = t.driver_id
    WHERE t.id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Trip not found' });
  res.json(t);
});

// Create a Draft trip (selection validated but resources not yet locked)
router.post('/', authorize('Driver', 'FleetManager'), (req, res) => {
  const { source, destination, vehicle_id, driver_id, cargo_weight, planned_distance } = req.body || {};
  if (!source || !destination || !vehicle_id || !driver_id || cargo_weight == null || planned_distance == null) {
    return res.status(400).json({ error: 'source, destination, vehicle_id, driver_id, cargo_weight, planned_distance are required' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driver_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  if (vehicle.status === 'Retired' || vehicle.status === 'In Shop') {
    return res.status(400).json({ error: `Vehicle is ${vehicle.status} and cannot be dispatched` });
  }
  if (vehicle.status === 'On Trip') return res.status(400).json({ error: 'Vehicle is already on a trip' });
  if (driver.status === 'Suspended') return res.status(400).json({ error: 'Driver is suspended and cannot be assigned' });
  if (driver.status === 'On Trip') return res.status(400).json({ error: 'Driver is already on a trip' });
  if (isExpired(driver.license_expiry)) return res.status(400).json({ error: 'Driver license has expired' });
  if (cargo_weight > vehicle.max_load_capacity) {
    return res.status(400).json({ error: `Cargo weight (${cargo_weight}kg) exceeds vehicle max load capacity (${vehicle.max_load_capacity}kg)` });
  }

  const info = db.prepare(`INSERT INTO trips
    (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, status)
    VALUES (?,?,?,?,?,?,'Draft')`).run(source, destination, vehicle_id, driver_id, cargo_weight, planned_distance);

  res.status(201).json(db.prepare('SELECT * FROM trips WHERE id = ?').get(info.lastInsertRowid));
});

// Dispatch: Draft -> Dispatched. Locks vehicle & driver (status -> On Trip)
router.post('/:id/dispatch', authorize('Driver', 'FleetManager'), (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'Draft') return res.status(400).json({ error: `Only Draft trips can be dispatched (current: ${trip.status})` });

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(trip.vehicle_id);
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(trip.driver_id);

  if (vehicle.status !== 'Available') return res.status(400).json({ error: `Vehicle is not Available (current: ${vehicle.status})` });
  if (driver.status !== 'Available') return res.status(400).json({ error: `Driver is not Available (current: ${driver.status})` });
  if (isExpired(driver.license_expiry)) return res.status(400).json({ error: 'Driver license has expired' });
  if (trip.cargo_weight > vehicle.max_load_capacity) {
    return res.status(400).json({ error: 'Cargo weight exceeds vehicle max load capacity' });
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE trips SET status='Dispatched', dispatched_at=datetime('now') WHERE id = ?").run(trip.id);
    db.prepare("UPDATE vehicles SET status='On Trip' WHERE id = ?").run(vehicle.id);
    db.prepare("UPDATE drivers SET status='On Trip' WHERE id = ?").run(driver.id);
  });
  tx();

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id));
});

// Complete: Dispatched -> Completed. Requires final odometer + fuel consumed. Restores Available.
router.post('/:id/complete', authorize('Driver', 'FleetManager'), (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (trip.status !== 'Dispatched') return res.status(400).json({ error: `Only Dispatched trips can be completed (current: ${trip.status})` });

  const { final_odometer, fuel_consumed, actual_distance, revenue, fuel_cost } = req.body || {};
  if (final_odometer == null || fuel_consumed == null) {
    return res.status(400).json({ error: 'final_odometer and fuel_consumed are required' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(trip.vehicle_id);
  const distance = actual_distance != null ? actual_distance : Math.max(0, final_odometer - vehicle.odometer);

  const tx = db.transaction(() => {
    db.prepare(`UPDATE trips SET status='Completed', completed_at=datetime('now'),
        actual_distance = ?, fuel_consumed = ?, revenue = COALESCE(?, revenue) WHERE id = ?`)
      .run(distance, fuel_consumed, revenue, trip.id);
    db.prepare("UPDATE vehicles SET status='Available', odometer = ? WHERE id = ?").run(final_odometer, vehicle.id);
    db.prepare("UPDATE drivers SET status='Available' WHERE id = ?").run(trip.driver_id);
    if (fuel_consumed > 0) {
      db.prepare(`INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, date)
        VALUES (?,?,?,?,date('now'))`).run(vehicle.id, trip.id, fuel_consumed, fuel_cost || 0);
    }
  });
  tx();

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id));
});

// Cancel: Draft or Dispatched -> Cancelled. Restores vehicle/driver to Available if they were locked.
router.post('/:id/cancel', authorize('Driver', 'FleetManager'), (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  if (!['Draft', 'Dispatched'].includes(trip.status)) {
    return res.status(400).json({ error: `Cannot cancel a trip with status ${trip.status}` });
  }

  const wasDispatched = trip.status === 'Dispatched';
  const tx = db.transaction(() => {
    db.prepare("UPDATE trips SET status='Cancelled', cancelled_at=datetime('now') WHERE id = ?").run(trip.id);
    if (wasDispatched) {
      db.prepare("UPDATE vehicles SET status='Available' WHERE id = ?").run(trip.vehicle_id);
      db.prepare("UPDATE drivers SET status='Available' WHERE id = ?").run(trip.driver_id);
    }
  });
  tx();

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(trip.id));
});

module.exports = router;
