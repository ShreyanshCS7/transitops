const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/vehicle-performance', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const result = vehicles.map(v => {
    const fuelCost = db.prepare('SELECT COALESCE(SUM(cost),0) c FROM fuel_logs WHERE vehicle_id = ?').get(v.id).c;
    const totalFuel = db.prepare('SELECT COALESCE(SUM(liters),0) c FROM fuel_logs WHERE vehicle_id = ?').get(v.id).c;
    const maintCost = db.prepare('SELECT COALESCE(SUM(cost),0) c FROM maintenance_logs WHERE vehicle_id = ?').get(v.id).c;
    const otherExpenses = db.prepare('SELECT COALESCE(SUM(amount),0) c FROM expenses WHERE vehicle_id = ?').get(v.id).c;
    const tripStats = db.prepare(`SELECT COALESCE(SUM(actual_distance),0) dist, COALESCE(SUM(revenue),0) rev, COUNT(*) trips
      FROM trips WHERE vehicle_id = ? AND status = 'Completed'`).get(v.id);

    const totalOperationalCost = fuelCost + maintCost + otherExpenses;
    const fuelEfficiency = totalFuel > 0 ? Math.round((tripStats.dist / totalFuel) * 100) / 100 : null;
    const roi = v.acquisition_cost > 0
      ? Math.round(((tripStats.rev - (maintCost + fuelCost)) / v.acquisition_cost) * 10000) / 100
      : null;

    return {
      vehicle_id: v.id,
      registration_number: v.registration_number,
      name: v.name,
      type: v.type,
      status: v.status,
      completed_trips: tripStats.trips,
      total_distance: tripStats.dist,
      total_fuel_liters: totalFuel,
      fuel_cost: fuelCost,
      maintenance_cost: maintCost,
      other_expenses: otherExpenses,
      total_operational_cost: totalOperationalCost,
      revenue: tripStats.rev,
      fuel_efficiency_km_per_liter: fuelEfficiency,
      roi_percent: roi,
    };
  });
  res.json(result);
});

router.get('/fleet-utilization', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  const byStatus = {};
  vehicles.forEach(v => { byStatus[v.status] = (byStatus[v.status] || 0) + 1; });
  const activeVehicles = vehicles.filter(v => v.status !== 'Retired').length;
  const onTrip = vehicles.filter(v => v.status === 'On Trip').length;
  res.json({
    by_status: byStatus,
    total_vehicles: vehicles.length,
    utilization_percent: activeVehicles > 0 ? Math.round((onTrip / activeVehicles) * 1000) / 10 : 0,
  });
});

router.get('/monthly-cost-trend', (req, res) => {
  const fuel = db.prepare(`SELECT strftime('%Y-%m', date) ym, COALESCE(SUM(cost),0) c FROM fuel_logs GROUP BY ym`).all();
  const maint = db.prepare(`SELECT strftime('%Y-%m', created_at) ym, COALESCE(SUM(cost),0) c FROM maintenance_logs GROUP BY ym`).all();
  const exp = db.prepare(`SELECT strftime('%Y-%m', date) ym, COALESCE(SUM(amount),0) c FROM expenses GROUP BY ym`).all();

  const months = new Set([...fuel, ...maint, ...exp].map(r => r.ym));
  const map = {};
  months.forEach(m => { map[m] = { month: m, fuel_cost: 0, maintenance_cost: 0, other_expenses: 0 }; });
  fuel.forEach(r => { map[r.ym].fuel_cost = r.c; });
  maint.forEach(r => { map[r.ym].maintenance_cost = r.c; });
  exp.forEach(r => { map[r.ym].other_expenses = r.c; });

  res.json(Object.values(map).sort((a, b) => a.month.localeCompare(b.month)));
});

module.exports = router;
