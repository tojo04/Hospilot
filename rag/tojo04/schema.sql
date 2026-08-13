PRAGMA foreign_keys = ON;

CREATE TABLE departments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT, capacity INTEGER,
  target_occupancy_pct INTEGER, synced_at TEXT NOT NULL
);

CREATE TABLE beds (
  id TEXT PRIMARY KEY, branch_id TEXT, ward TEXT NOT NULL, bed_number TEXT NOT NULL,
  room_type TEXT, status TEXT NOT NULL CHECK(status IN ('Available','Occupied','Reserved','Dirty')),
  is_active INTEGER NOT NULL CHECK(is_active IN (0,1)), synced_at TEXT NOT NULL,
  ventilation TEXT, room_sharing TEXT, proximity INTEGER, floor INTEGER, wing TEXT,
  natural_light INTEGER, noise_level TEXT, features TEXT
);

CREATE TABLE ipd_admissions (
  id TEXT PRIMARY KEY, patient_token TEXT, bed_id TEXT, department_id TEXT,
  admitted_at TEXT, expected_discharge_at TEXT, status TEXT, synced_at TEXT NOT NULL,
  discharge_ready INTEGER DEFAULT 0, discharge_blocked_reason TEXT,
  transfer_pending INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (bed_id) REFERENCES beds(id), FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE patients (
  id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, uhid TEXT, synced_at TEXT
);

CREATE TABLE visits (
  id TEXT PRIMARY KEY, patient_token TEXT, department_id TEXT, arrived_at TEXT,
  status TEXT, chief_complaint TEXT, synced_at TEXT NOT NULL, triage_score INTEGER,
  visit_type TEXT, appointment_id TEXT, FOREIGN KEY (department_id) REFERENCES departments(id)
);

CREATE TABLE vitals (
  id TEXT PRIMARY KEY, patient_token TEXT, admission_id TEXT, recorded_at TEXT NOT NULL,
  temperature REAL, pulse INTEGER, bp_systolic INTEGER, bp_diastolic INTEGER,
  spo2 INTEGER, respiratory_rate INTEGER, gcs INTEGER, synced_at TEXT NOT NULL,
  is_critical INTEGER, FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

CREATE TABLE staff_roster (
  id TEXT PRIMARY KEY, area TEXT, area_label TEXT, role TEXT, shift TEXT,
  headcount INTEGER DEFAULT 0, assigned_load INTEGER DEFAULT 0,
  load_per_staff INTEGER DEFAULT 1, branch_id TEXT, synced_at TEXT
);

CREATE TABLE nursing_tasks (
  id TEXT PRIMARY KEY, admission_id TEXT, task TEXT NOT NULL, completed INTEGER,
  due_at TEXT, assigned_to TEXT, synced_at TEXT NOT NULL,
  FOREIGN KEY (admission_id) REFERENCES ipd_admissions(id)
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY, patient_id TEXT, provider_id TEXT, department_id TEXT,
  appointment_time TEXT, status TEXT, type TEXT, patient_name TEXT, phone TEXT,
  email TEXT, specialization TEXT, department_name TEXT, synced_at TEXT
);

CREATE TABLE doctor_slots (
  id TEXT PRIMARY KEY, provider_id TEXT, slot_date TEXT, slot_start TEXT, slot_end TEXT,
  slot_type TEXT, status TEXT, max_patients INTEGER, booked_count INTEGER,
  specialization TEXT, synced_at TEXT
);

CREATE TABLE waitlist (
  id TEXT PRIMARY KEY, patient_id TEXT, patient_name TEXT, phone TEXT, email TEXT,
  specialization TEXT, priority TEXT DEFAULT 'medium', requested_date TEXT,
  status TEXT DEFAULT 'waitlisted', reason TEXT, created_at TEXT, synced_at TEXT
);

CREATE TABLE service_slots (
  id TEXT PRIMARY KEY, slot_type TEXT, slot_date TEXT, slot_start TEXT, slot_end TEXT,
  location TEXT, specialization TEXT, max_patients INTEGER DEFAULT 1,
  booked_count INTEGER DEFAULT 0, status TEXT DEFAULT 'open', synced_at TEXT
);

CREATE TABLE lab_orders (
  id TEXT PRIMARY KEY, visit_id TEXT, patient_token TEXT, ordered_by TEXT, status TEXT,
  priority TEXT, ordered_at TEXT, completed_at TEXT, synced_at TEXT
);

CREATE TABLE lab_results (
  id TEXT PRIMARY KEY, order_id TEXT, patient_token TEXT, test_name TEXT, test_code TEXT,
  result_value TEXT, flag TEXT, reference_range TEXT, unit TEXT, reported_at TEXT, synced_at TEXT
);

CREATE TABLE infection_cases (
  id TEXT PRIMARY KEY, patient_token TEXT, admission_id TEXT, ward TEXT, pathogen TEXT,
  severity TEXT, isolation_required INTEGER, isolation_confirmed INTEGER,
  isolation_room TEXT, status TEXT, reported_at TEXT, notes TEXT, synced_at TEXT
);

CREATE TABLE ot_surgeries (
  id TEXT PRIMARY KEY, admission_id TEXT, patient_token TEXT, ward TEXT,
  status TEXT, created_at TEXT, synced_at TEXT
);

CREATE TABLE discharge_summaries (
  id TEXT PRIMARY KEY, admission_id TEXT, summary_text TEXT, created_at TEXT,
  synced_at TEXT NOT NULL, ai_generated_note TEXT
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY, patient_token TEXT, visit_id TEXT, tpa_id TEXT, tpa_name TEXT,
  claim_amount REAL, status TEXT, created_at TEXT, submitted_date TEXT,
  approved_amount REAL, denial_reason TEXT, claim_number TEXT, payer_type TEXT,
  risk_level TEXT, risk_score REAL, stage TEXT, compliance_status TEXT,
  diagnosis_code TEXT, branch_id TEXT, synced_at TEXT
);

CREATE TABLE claim_line_items (
  id TEXT PRIMARY KEY, claim_id TEXT, service_code TEXT, service_name TEXT,
  description TEXT, quantity REAL, rate REAL, amount REAL, approved_amount REAL,
  approved_quantity REAL, approved_rate REAL, status TEXT, category TEXT, unit TEXT,
  rejection_reason TEXT, synced_at TEXT
);

CREATE TABLE claim_history (
  id TEXT PRIMARY KEY, claim_id TEXT, from_status TEXT, to_status TEXT, action TEXT,
  changed_at TEXT, changed_by TEXT, remarks TEXT, synced_at TEXT
);

CREATE TABLE claim_queries (
  id TEXT PRIMARY KEY, claim_id TEXT, query_type TEXT, query_text TEXT, status TEXT,
  raised_at TEXT, raised_by TEXT, responded_by TEXT, response_date TEXT,
  response_text TEXT, created_at TEXT, synced_at TEXT
);

CREATE TABLE insurance_contracts (
  id TEXT PRIMARY KEY, insurer_name TEXT, tpa_name TEXT, contract_type TEXT,
  contract_number TEXT, start_date TEXT, end_date TEXT, status TEXT, branch_id TEXT,
  total_claims INTEGER, approved_amount REAL, rejection_rate REAL,
  avg_settlement_days REAL, synced_at TEXT
);

CREATE TABLE contract_service_rates (
  id TEXT PRIMARY KEY, contract_id TEXT, service_id TEXT, service_code TEXT,
  service_name TEXT, contract_rate REAL, hospital_rate REAL,
  discount_percentage REAL, is_active INTEGER, synced_at TEXT
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY, org_id TEXT, invoice_number TEXT, patient_id TEXT,
  invoice_date TEXT, due_date TEXT, invoice_type TEXT, visit_id TEXT,
  admission_id TEXT, package_id TEXT, insurance_contract_id TEXT, subtotal REAL,
  discount_amount REAL, discount_percentage REAL, gst_amount REAL, cgst_amount REAL,
  sgst_amount REAL, igst_amount REAL, grand_total REAL, paid_amount REAL,
  balance REAL, status TEXT, payment_status TEXT, is_inter_state INTEGER,
  notes TEXT, branch_id TEXT, created_at TEXT, updated_at TEXT, synced_at TEXT
);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY, invoice_id TEXT, service_id TEXT, service_code TEXT,
  service_name TEXT, description TEXT, quantity REAL, rate REAL, amount REAL,
  total REAL, gst_rate REAL, gst_amount REAL, discount_amount REAL,
  source_type TEXT, source_id TEXT, synced_at TEXT
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY, org_id TEXT, receipt_number TEXT, invoice_id TEXT,
  patient_id TEXT, payment_date TEXT, total_amount REAL, status TEXT,
  received_by TEXT, notes TEXT, branch_id TEXT, created_at TEXT,
  updated_at TEXT, synced_at TEXT
);

CREATE TABLE payment_entries (
  id TEXT PRIMARY KEY, payment_id TEXT, payment_mode TEXT, amount REAL,
  transaction_reference TEXT, bank_name TEXT, card_last_four TEXT,
  created_at TEXT, synced_at TEXT
);

CREATE TABLE daily_collections (
  id TEXT PRIMARY KEY, org_id TEXT, collection_date TEXT NOT NULL,
  cash_total REAL DEFAULT 0, upi_total REAL DEFAULT 0, card_total REAL DEFAULT 0,
  bank_transfer_total REAL DEFAULT 0, cheque_total REAL DEFAULT 0,
  total_collection REAL DEFAULT 0, invoice_count INTEGER DEFAULT 0,
  payment_count INTEGER DEFAULT 0, is_reconciled INTEGER DEFAULT 0,
  reconciled_by TEXT, reconciled_at TEXT, variance REAL DEFAULT 0,
  created_at TEXT, updated_at TEXT, synced_at TEXT
);

CREATE TABLE payment_reconciliation (
  id TEXT PRIMARY KEY, reconciliation_date TEXT NOT NULL, total_expected REAL,
  total_actual REAL, total_variance REAL, actual_cash REAL, actual_card REAL,
  actual_upi REAL, actual_bank REAL, cash_variance REAL, card_variance REAL,
  upi_variance REAL, bank_variance REAL, status TEXT, created_at TEXT, synced_at TEXT
);

CREATE TABLE refunds (
  id TEXT PRIMARY KEY, invoice_id TEXT, payment_id TEXT, refund_amount REAL,
  reason TEXT, status TEXT, refund_date TEXT, refund_mode TEXT,
  refund_number TEXT, created_at TEXT, synced_at TEXT
);

CREATE TABLE supplies (
  id TEXT PRIMARY KEY, item_code TEXT, item_name TEXT, category TEXT,
  current_stock REAL, min_stock REAL, unit TEXT, unit_cost REAL,
  last_ordered_at TEXT, last_received_at TEXT, synced_at TEXT
);

CREATE TABLE purchase_orders (
  id TEXT PRIMARY KEY, po_number TEXT, vendor_id TEXT, status TEXT, total REAL,
  order_date TEXT, expected_delivery TEXT, created_at TEXT, synced_at TEXT
);

CREATE INDEX idx_beds_ward_status ON beds(ward, status, is_active);
CREATE INDEX idx_admissions_status ON ipd_admissions(status, bed_id);
CREATE INDEX idx_roster_area_shift ON staff_roster(area, shift);
CREATE INDEX idx_visits_status ON visits(status, arrived_at);
CREATE INDEX idx_claims_status ON claims(status);
CREATE INDEX idx_supplies_stock ON supplies(current_stock, min_stock);
