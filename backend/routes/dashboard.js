const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/kpis', (req, res) => {
  const { type, status, region } = req.query;
  let vSql = 'SELECT * FROM vehicles WHERE 1=1';
  const vParams = [];
  if (type) { vSql += ' AND type = ?'; vParams.push(type); }
  if (status) { vSql += ' AND status = ?'; vParams.push(status); }
  if (region) { vSql += ' AND region = ?'; vParams.push(region); }
  const vehicles = db.prepare(vSql).all(...vParams);

  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status !== 'Retired').length;
  const availableVehicles = vehicles.filter(v => v.status === 'Available').length;
  const inMaintenance = vehicles.filter(v => v.status === 'In Shop').length;
  const onTripVehicles = vehicles.filter(v => v.status === 'On Trip').length;

  const activeTrips = db.prepare("SELECT COUNT(*) c FROM trips WHERE status = 'Dispatched'").get().c;
  const pendingTrips = db.prepare("SELECT COUNT(*) c FROM trips WHERE status = 'Draft'").get().c;
  const driversOnDuty = db.prepare("SELECT COUNT(*) c FROM drivers WHERE status = 'On Trip'").get().c;

  const fleetUtilization = activeVehicles > 0 ? Math.round((onTripVehicles / activeVehicles) * 1000) / 10 : 0;

  res.json({
    active_vehicles: activeVehicles,
    available_vehicles: availableVehicles,
    vehicles_in_maintenance: inMaintenance,
    active_trips: activeTrips,
    pending_trips: pendingTrips,
    drivers_on_duty: driversOnDuty,
    fleet_utilization_percent: fleetUtilization,
    total_vehicles: totalVehicles,
  });
});

router.get('/filters', (req, res) => {
  const types = db.prepare('SELECT DISTINCT type FROM vehicles ORDER BY type').all().map(r => r.type);
  const regions = db.prepare('SELECT DISTINCT region FROM vehicles ORDER BY region').all().map(r => r.region);
  res.json({ types, regions, statuses: ['Available', 'On Trip', 'In Shop', 'Retired'] });
});

module.exports = router;
