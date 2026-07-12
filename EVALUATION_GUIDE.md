# TransitOps — Project Evaluation & Testing Guide

This guide outlines a step-by-step walkthrough to test and evaluate the TransitOps platform. It verifies authentication, role-based access control (RBAC), and key operational workflows (Fleet Registry, Trips, Maintenance, and Finance).

---

## Part 1: Testing Role-Based Access Control (RBAC)

Verify that the system hides/shows pages and menu items based on the user's role:

| Log in as... | Expected Navigation Sidebar Options | Expected Restrictions |
| :--- | :--- | :--- |
| **Fleet Manager / Admin** | All links visible | Full access to create, edit, delete, and view everything. |
| **Driver** | `Dashboard`, `Trips` | Cannot see or access Vehicles, Drivers, Maintenance, Fuel/Expenses, or Reports. |
| **Safety Officer** | `Dashboard`, `Drivers`, `Reports` | Cannot see or access Vehicles, Trips, Maintenance, or Fuel/Expenses. |
| **Financial Analyst** | `Dashboard`, `Fuel & Expenses`, `Reports` | Cannot see or access Vehicles, Drivers, Trips, or Maintenance. |

### Test Steps:
1. Go to **http://localhost:4000** and click the **Driver** demo login button. Sign in.
   * *Verify:* The sidebar should ONLY show **Dashboard** and **Trips**.
2. Sign out, and click **Safety Officer**. Sign in.
   * *Verify:* The sidebar should ONLY show **Dashboard**, **Drivers**, and **Reports**.
3. Sign out, and click **Fleet Manager** (this role has full operational access).

---

## Part 2: End-to-End Operational Workflow

Log in as **Fleet Manager** (or Admin) to execute the complete transport dispatch workflow:

### Step 1: Register a Vehicle
1. Go to **Vehicle Registry** -> Click **+ Register Vehicle**.
2. Enter the following details:
   * **Registration Number:** `VAN-99`
   * **Name/Model:** `Ford Transit 2026`
   * **Type:** `Van`
   * **Max Load Capacity:** `1000` (kg)
   * **Odometer:** `1500` (km)
   * **Acquisition Cost:** `35000`
   * **Region:** `North`
3. Click **Register Vehicle**.
   * *Verify:* The vehicle appears in the registry table with status **Available**.

### Step 2: Add a Driver
1. Go to **Drivers** -> Click **+ Add Driver**.
2. Enter the following details:
   * **Full Name:** `Sarah Connor`
   * **License Number:** `LIC-9999`
   * **License Category:** `LMV`
   * **License Expiry:** Select a future date.
   * **Safety Score:** `95`
3. Click **Add Driver**.
   * *Verify:* The driver appears in the list with status **Available**.

### Step 3: Create & Validate a Trip (Capacity Check)
1. Go to **Trips** -> Click **+ Create Trip**.
2. Fill out the fields:
   * **Source:** `Warehouse C`
   * **Destination:** `Retail Outlet D`
   * **Vehicle:** Select `VAN-99` (capacity 1000kg)
   * **Driver:** Select `Sarah Connor`
   * **Cargo Weight:** Enter `1200` (kg) *(This exceeds the 1000kg vehicle limit)*
   * **Planned Distance:** `80` (km)
3. Click **Create Trip**.
   * *Verify (Business Rule):* The system should block creation and display an error: **"Cargo weight exceeds vehicle capacity"** (server-side rule validation).
4. Lower the **Cargo Weight** to `850` (kg) and click **Create Trip**.
   * *Verify:* The trip is successfully created with status **Draft**.

### Step 4: Dispatch the Trip
1. In the **Trips** table, find the new trip and click **Dispatch**.
   * *Verify:*
     * Trip status changes to **Dispatched**.
     * Go to **Vehicle Registry** -> `VAN-99` status is now **On Trip**.
     * Go to **Drivers** -> `Sarah Connor` status is now **On Trip**.

### Step 5: Complete the Trip & Log Expenses
1. Go to **Trips** -> click **Complete** on the dispatched trip.
2. Enter the final details:
   * **Final Odometer:** `1585` (km) *(85km actual distance)*
   * **Fuel Consumed:** `10` (liters)
   * **Fuel Cost:** `20` ($)
   * **Trip Revenue:** `250` ($)
3. Click **Mark Completed**.
   * *Verify:*
     * Trip status changes to **Completed**.
     * Go to **Vehicle Registry** -> `VAN-99` odometer updated to `1585`, status back to **Available**.
     * Go to **Drivers** -> `Sarah Connor` status back to **Available**.

---

## Part 3: Maintenance Workflow (Dispatch Protection)

Verify that vehicles undergoing maintenance cannot be assigned to trips:

1. Go to **Maintenance** -> Click **+ New Record**.
2. Select vehicle `VAN-99`, enter Description `Yearly Inspection`, Cost `150`, and click **Create Record**.
3. Go to **Vehicle Registry**.
   * *Verify:* `VAN-99` status is now **In Shop**.
4. Go to **Trips** -> Click **+ Create Trip**.
5. Check the **Vehicle** dropdown list.
   * *Verify:* `VAN-99` is **not visible** in the dropdown (vehicles in maintenance are automatically filtered out).
6. Go back to **Maintenance** -> click **Close** on the active record, enter Final Cost `150`, and submit.
   * *Verify:* `VAN-99` status returns to **Available** in the registry, and is now selectable for new trips again.

---

## Part 4: Reports and Exports

1. Go to **Reports & Analytics**.
   * *Verify:* The charts display correct metrics, including the new fuel and maintenance costs.
2. Go to **Fuel & Expenses** -> Click **Export CSV** on any table.
   * *Verify:* A `.csv` file is successfully downloaded containing all matching logs.
