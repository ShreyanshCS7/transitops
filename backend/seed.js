const bcrypt = require('bcryptjs');
const db = require('./db');

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (userCount > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)'
  );
  const pw = bcrypt.hashSync('Password123!', 10);
  const users = [
    ['Fiona Fleet', 'fleetmanager@transitops.com', 'FleetManager'],
    ['Derek Driver', 'driver@transitops.com', 'Driver'],
    ['Sasha Safety', 'safety@transitops.com', 'SafetyOfficer'],
    ['Priya Finance', 'finance@transitops.com', 'FinancialAnalyst'],
    ['Ada Admin', 'admin@transitops.com', 'Admin'],
  ];
  for (const [name, email, role] of users) {
    insertUser.run(name, email, pw, role);
  }

  const insertVehicle = db.prepare(`INSERT INTO vehicles
    (registration_number, name, type, max_load_capacity, odometer, acquisition_cost, region, status)
    VALUES (?,?,?,?,?,?,?,?)`);
  const vehicles = [
    ['VAN-05', 'Van-05', 'Van', 500, 12450, 18000, 'North', 'Available'],
    ['TRK-11', 'Heavy Truck 11', 'Truck', 5000, 87200, 65000, 'East', 'Available'],
    ['VAN-02', 'Van-02', 'Van', 750, 34210, 21000, 'West', 'In Shop'],
    ['BIK-01', 'Courier Bike 01', 'Motorbike', 40, 5300, 2500, 'North', 'Available'],
    ['TRK-07', 'Refrigerated Truck 07', 'Truck', 4000, 152000, 72000, 'South', 'Retired'],
  ];
  for (const v of vehicles) insertVehicle.run(...v);

  const insertDriver = db.prepare(`INSERT INTO drivers
    (name, license_number, license_category, license_expiry, contact_number, safety_score, status)
    VALUES (?,?,?,?,?,?,?)`);
  const drivers = [
    ['Alex Morgan', 'LIC-1001', 'LMV', '2027-05-01', '+1-555-0101', 92, 'Available'],
    ['Jordan Lee', 'LIC-1002', 'HMV', '2026-08-15', '+1-555-0102', 88, 'Available'],
    ['Sam Patel', 'LIC-1003', 'HMV', '2025-01-10', '+1-555-0103', 75, 'Available'],
    ['Riley Chen', 'LIC-1004', 'LMV', '2027-11-20', '+1-555-0104', 95, 'Suspended'],
  ];
  for (const d of drivers) insertDriver.run(...d);

  // Example workflow: Van-05 + Alex completed a trip
  const van05 = db.prepare("SELECT id FROM vehicles WHERE registration_number='VAN-05'").get();
  const alex = db.prepare("SELECT id FROM drivers WHERE license_number='LIC-1001'").get();
  const tripStmt = db.prepare(`INSERT INTO trips
    (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, actual_distance, fuel_consumed, revenue, status, dispatched_at, completed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now','-2 day'),datetime('now','-1 day'))`);
  const tripInfo = tripStmt.run('Warehouse A', 'Distribution Center B', van05.id, alex.id, 450, 120, 122, 14, 900, 'Completed');

  db.prepare(`INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, date) VALUES (?,?,?,?,date('now','-1 day'))`)
    .run(van05.id, tripInfo.lastInsertRowid, 14, 22.4);

  // A closed maintenance record for Van-05 (Oil Change) in the past
  db.prepare(`INSERT INTO maintenance_logs (vehicle_id, description, cost, status, created_at, closed_at)
    VALUES (?,?,?,?,datetime('now','-5 day'),datetime('now','-4 day'))`)
    .run(van05.id, 'Oil Change', 65, 'Closed');

  // Active maintenance for VAN-02 (keeps it In Shop)
  const van02 = db.prepare("SELECT id FROM vehicles WHERE registration_number='VAN-02'").get();
  db.prepare(`INSERT INTO maintenance_logs (vehicle_id, description, cost, status, created_at)
    VALUES (?,?,?,?,datetime('now','-1 day'))`)
    .run(van02.id, 'Brake pad replacement', 340, 'Active');

  // Some expenses
  db.prepare(`INSERT INTO expenses (vehicle_id, type, amount, date, description) VALUES (?,?,?,date('now','-1 day'),?)`)
    .run(van05.id, 'Toll', 12.5, 'Highway toll - Warehouse A to DC B');

  console.log('Seed complete.');
  console.log('Demo login (password for all: Password123!):');
  users.forEach(([, email, role]) => console.log(`  ${role.padEnd(18)} ${email}`));
}

seed();
