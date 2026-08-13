import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = resolve(root, 'data', 'hospilot.db');
mkdirSync(dirname(databasePath), { recursive: true });
rmSync(databasePath, { force: true });

const db = new DatabaseSync(databasePath);
db.exec(readFileSync(resolve(root, 'schema.sql'), 'utf8'));

const now = new Date();
const iso = (offsetHours = 0) => new Date(now.getTime() + offsetHours * 3_600_000).toISOString();
const date = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

function insert(table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  );
  for (const row of rows) statement.run(...columns.map((column) => row[column] ?? null));
}

db.exec('BEGIN');
try {
  const departments = [
    ['dept-icu', 'Intensive Care Unit', 'Inpatient', 30, 85],
    ['dept-er', 'Emergency', 'Emergency', 20, 80],
    ['dept-general', 'General Medicine', 'Inpatient', 40, 80],
    ['dept-cardio', 'Cardiology', 'Inpatient', 16, 80],
    ['dept-ortho', 'Orthopedics', 'Inpatient', 16, 80],
    ['dept-peds', 'Pediatrics', 'Inpatient', 16, 75]
  ].map(([id, name, type, capacity, target_occupancy_pct]) => ({ id, name, type, capacity, target_occupancy_pct, synced_at: iso() }));
  insert('departments', departments);

  const wardDefinitions = [
    ['ICU', 'dept-icu', 6, 17, 3, 4, 'Critical Care'],
    ['General Ward', 'dept-general', 4, 6, 9, 0, 'Shared'],
    ['Semi-Private', 'dept-general', 1, 3, 2, 0, 'Semi-Private'],
    ['Private', 'dept-general', 2, 4, 2, 0, 'Private'],
    ['Cardiology', 'dept-cardio', 2, 2, 4, 0, 'Specialty'],
    ['Emergency', 'dept-er', 4, 3, 6, 0, 'Emergency'],
    ['Orthopedics', 'dept-ortho', 1, 1, 6, 0, 'Specialty'],
    ['Pediatrics', 'dept-peds', 2, 2, 4, 0, 'Pediatric']
  ];
  const beds = [];
  const bedDepartment = new Map();
  for (const [ward, departmentId, available, occupied, reserved, dirty, roomType] of wardDefinitions) {
    const slug = ward.toLowerCase().replace(/[^a-z]+/g, '-');
    const statuses = [
      ...Array(available).fill('Available'), ...Array(occupied).fill('Occupied'),
      ...Array(reserved).fill('Reserved'), ...Array(dirty).fill('Dirty')
    ];
    statuses.forEach((status, index) => {
      const id = `bed-${slug}-${String(index + 1).padStart(2, '0')}`;
      bedDepartment.set(id, departmentId);
      beds.push({
        id, branch_id: 'branch-main', ward, bed_number: `${slug.toUpperCase().slice(0, 4)}-${index + 1}`,
        room_type: roomType, status, is_active: 1, synced_at: iso(),
        ventilation: ward === 'ICU' ? 'Mechanical available' : 'Natural/AC',
        room_sharing: roomType, proximity: (index % 5) + 1, floor: ward === 'Emergency' ? 0 : (index % 3) + 1,
        wing: index % 2 ? 'East' : 'West', natural_light: index % 3 ? 1 : 0,
        noise_level: ward === 'Emergency' ? 'High' : index % 2 ? 'Low' : 'Moderate',
        features: ward === 'ICU' ? '["monitor","oxygen","ventilator-ready"]' : '["call-bell","oxygen"]'
      });
    });
  }
  beds.push({ id: 'bed-inactive-01', branch_id: 'branch-main', ward: 'ICU', bed_number: 'ICU-X1', room_type: 'Critical Care', status: 'Available', is_active: 0, synced_at: iso(), ventilation: 'Mechanical available', room_sharing: 'Critical Care', proximity: 1, floor: 2, wing: 'West', natural_light: 0, noise_level: 'Low', features: '[]' });
  insert('beds', beds);

  const patients = Array.from({ length: 50 }, (_, index) => ({
    id: `patient-${index + 1}`, first_name: ['Aarav','Diya','Kabir','Meera','Rohan','Isha'][index % 6],
    last_name: ['Shah','Nair','Patel','Rao','Singh'][index % 5], uhid: `UHID-${1001 + index}`, synced_at: iso()
  }));
  insert('patients', patients);

  const occupiedBeds = beds.filter((bed) => bed.status === 'Occupied' && bed.is_active);
  const admissions = occupiedBeds.map((bed, index) => ({
    id: `adm-${index + 1}`, patient_token: `PT-${String(index + 1).padStart(4, '0')}`,
    bed_id: bed.id, department_id: bedDepartment.get(bed.id), admitted_at: iso(-24 * ((index % 8) + 1)),
    expected_discharge_at: iso(24 * ((index % 4) + 1)), status: 'admitted', synced_at: iso(),
    discharge_ready: index % 9 === 0 ? 1 : 0,
    discharge_blocked_reason: index % 18 === 0 ? 'Pending insurance authorization' : null,
    transfer_pending: index % 13 === 0 ? 1 : 0
  }));
  insert('ipd_admissions', admissions);

  insert('staff_roster', [
    ['roster-1','icu','ICU','Nurse','night',6,17,2],
    ['roster-2','icu','ICU','Doctor','night',3,17,6],
    ['roster-3','er','Emergency','Nurse','night',3,10,3],
    ['roster-4','er','Emergency','Doctor','night',2,10,5],
    ['roster-5','general','General Ward','Nurse','night',5,9,3],
    ['roster-6','cardiology','Cardiology','Nurse','night',2,6,3],
    ['roster-7','pediatrics','Pediatrics','Nurse','night',1,4,3],
    ['roster-8','icu','ICU','Nurse','day',9,17,2],
    ['roster-9','er','Emergency','Nurse','day',5,10,3]
  ].map(([id,area,area_label,role,shift,headcount,assigned_load,load_per_staff]) => ({ id, area, area_label, role, shift, headcount, assigned_load, load_per_staff, branch_id: 'branch-main', synced_at: iso() })));

  insert('visits', Array.from({ length: 18 }, (_, index) => ({
    id: `visit-${index + 1}`, patient_token: `ER-${index + 1}`, department_id: 'dept-er',
    arrived_at: iso(-(index + 1) / 2), status: index < 5 ? 'waiting' : index < 12 ? 'in_progress' : 'completed',
    chief_complaint: ['Chest pain','Fever','Injury','Breathlessness'][index % 4], synced_at: iso(),
    triage_score: (index % 5) + 1, visit_type: 'Emergency', appointment_id: null
  })));

  insert('vitals', admissions.slice(0, 12).map((admission, index) => ({
    id: `vital-${index + 1}`, patient_token: admission.patient_token, admission_id: admission.id,
    recorded_at: iso(-index), temperature: index % 4 === 0 ? 39.1 : 37.0,
    pulse: index % 4 === 0 ? 122 : 82, bp_systolic: index % 5 === 0 ? 88 : 120,
    bp_diastolic: 78, spo2: index % 4 === 0 ? 89 : 97, respiratory_rate: index % 4 === 0 ? 28 : 18,
    gcs: 15, synced_at: iso(), is_critical: index % 4 === 0 ? 1 : 0
  })));

  insert('nursing_tasks', admissions.slice(0, 10).map((admission, index) => ({
    id: `task-${index + 1}`, admission_id: admission.id,
    task: index % 2 ? 'Administer scheduled medication' : 'Record vital signs',
    completed: index < 4 ? 1 : 0, due_at: iso(index - 7), assigned_to: `Nurse ${index % 4 + 1}`, synced_at: iso()
  })));

  insert('appointments', Array.from({ length: 12 }, (_, index) => ({
    id: `appt-${index + 1}`, patient_id: `patient-${index + 1}`, provider_id: `doctor-${index % 4 + 1}`,
    department_id: index % 2 ? 'dept-cardio' : 'dept-general', appointment_time: `${date()}T${String(9 + Math.floor(index / 2)).padStart(2,'0')}:${index % 2 ? '30' : '00'}:00.000Z`,
    status: index < 8 ? 'booked' : 'cancelled', type: 'Consultation', patient_name: `Patient ${index + 1}`,
    phone: `+91-900000${String(index).padStart(4,'0')}`, email: `patient${index + 1}@example.test`,
    specialization: index % 2 ? 'Cardiology' : 'General Medicine', department_name: index % 2 ? 'Cardiology' : 'General Medicine', synced_at: iso()
  })));

  insert('doctor_slots', [
    ['slot-1','doctor-1','09:00','12:00','Cardiology',8,8,'full'],
    ['slot-2','doctor-2','10:00','13:00','General Medicine',10,7,'open'],
    ['slot-3','doctor-3','14:00','17:00','Orthopedics',6,4,'open'],
    ['slot-4','doctor-4','16:00','19:00','Pediatrics',8,8,'full']
  ].map(([id,provider_id,slot_start,slot_end,specialization,max_patients,booked_count,status]) => ({ id, provider_id, slot_date: date(), slot_start, slot_end, slot_type: 'OPD', status, max_patients, booked_count, specialization, synced_at: iso() })));

  insert('waitlist', [
    ['wait-1','Anika Rao','Cardiology','high','Chest pain follow-up'],
    ['wait-2','Vikram Nair','Pediatrics','medium','Routine consultation'],
    ['wait-3','Sana Patel','Cardiology','urgent','Post-operative review']
  ].map(([id,patient_name,specialization,priority,reason], index) => ({ id, patient_id: `patient-${20 + index}`, patient_name, phone: `+91-911111111${index}`, email: null, specialization, priority, requested_date: date(), status: 'waitlisted', reason, created_at: iso(-index), synced_at: iso() })));

  insert('lab_orders', Array.from({ length: 8 }, (_, index) => ({
    id: `lab-order-${index + 1}`, visit_id: `visit-${index + 1}`, patient_token: `ER-${index + 1}`,
    ordered_by: `doctor-${index % 3 + 1}`, status: index < 3 ? 'pending' : 'completed',
    priority: index < 2 ? 'stat' : 'routine', ordered_at: iso(-index), completed_at: index < 3 ? null : iso(-index + 1), synced_at: iso()
  })));
  insert('lab_results', [
    ['result-1','lab-order-4','Hemoglobin','HGB','8.2','low','12-16','g/dL'],
    ['result-2','lab-order-5','Potassium','K','6.1','critical','3.5-5.0','mmol/L'],
    ['result-3','lab-order-6','White Blood Cells','WBC','14500','high','4000-11000','cells/uL'],
    ['result-4','lab-order-7','Creatinine','CREA','1.0','normal','0.6-1.2','mg/dL']
  ].map(([id,order_id,test_name,test_code,result_value,flag,reference_range,unit], index) => ({ id, order_id, patient_token: `ER-${index + 4}`, test_name, test_code, result_value, flag, reference_range, unit, reported_at: iso(-index), synced_at: iso() })));

  insert('infection_cases', [
    { id:'infection-1', patient_token:'PT-0001', admission_id:'adm-1', ward:'ICU', pathogen:'MRSA', severity:'high', isolation_required:1, isolation_confirmed:1, isolation_room:'ISO-1', status:'active', reported_at:iso(-20), notes:'Contact precautions', synced_at:iso() },
    { id:'infection-2', patient_token:'PT-0008', admission_id:'adm-8', ward:'General Ward', pathogen:'C. difficile', severity:'moderate', isolation_required:1, isolation_confirmed:0, isolation_room:null, status:'active', reported_at:iso(-8), notes:'Isolation pending', synced_at:iso() }
  ]);

  insert('ot_surgeries', [
    { id:'surgery-1', admission_id:'adm-4', patient_token:'PT-0004', ward:'ICU', status:'in_progress', created_at:iso(-2), synced_at:iso() },
    { id:'surgery-2', admission_id:'adm-12', patient_token:'PT-0012', ward:'Orthopedics', status:'scheduled', created_at:iso(-5), synced_at:iso() },
    { id:'surgery-3', admission_id:'adm-16', patient_token:'PT-0016', ward:'General Ward', status:'completed', created_at:iso(-10), synced_at:iso() }
  ]);

  insert('claims', [
    ['claim-1','CLM-1001',125000,'submitted',null,'high',82,'review'],
    ['claim-2','CLM-1002',78000,'approved',74000,'low',18,'settled'],
    ['claim-3','CLM-1003',46000,'denied',0,'medium',55,'closed'],
    ['claim-4','CLM-1004',210000,'query',null,'high',91,'insurer_query'],
    ['claim-5','CLM-1005',32000,'submitted',null,'low',20,'review']
  ].map(([id,claim_number,claim_amount,status,approved_amount,risk_level,risk_score,stage], index) => ({ id, patient_token:`PT-${String(index + 1).padStart(4,'0')}`, visit_id:`visit-${index + 1}`, tpa_id:`tpa-${index % 2 + 1}`, tpa_name:index % 2 ? 'MediAssist' : 'HealthTPA', claim_amount, status, created_at:iso(-48 * (index + 1)), submitted_date:date(-index), approved_amount, denial_reason:status === 'denied' ? 'Procedure not covered' : null, claim_number, payer_type:'Insurance', risk_level, risk_score, stage, compliance_status:'complete', diagnosis_code:`DX-${100 + index}`, branch_id:'branch-main', synced_at:iso() })));

  insert('insurance_contracts', [
    { id:'contract-1', insurer_name:'Secure Health', tpa_name:'HealthTPA', contract_type:'Cashless', contract_number:'CON-01', start_date:date(-180), end_date:date(185), status:'active', branch_id:'branch-main', total_claims:120, approved_amount:4500000, rejection_rate:8.5, avg_settlement_days:21, synced_at:iso() },
    { id:'contract-2', insurer_name:'Care Shield', tpa_name:'MediAssist', contract_type:'Cashless', contract_number:'CON-02', start_date:date(-365), end_date:date(30), status:'active', branch_id:'branch-main', total_claims:84, approved_amount:3100000, rejection_rate:14.2, avg_settlement_days:29, synced_at:iso() }
  ]);

  insert('invoices', [
    ['invoice-1','INV-1001',85000,85000,0,'Paid','paid'],
    ['invoice-2','INV-1002',62000,40000,22000,'Issued','partially_paid'],
    ['invoice-3','INV-1003',35000,0,35000,'Issued','unpaid'],
    ['invoice-4','INV-1004',120000,100000,20000,'Issued','partially_paid']
  ].map(([id,invoice_number,grand_total,paid_amount,balance,status,payment_status], index) => ({ id, org_id:'org-demo', invoice_number, patient_id:`patient-${index + 1}`, invoice_date:iso(-24 * index), due_date:iso(24 * (7-index)), invoice_type:'IPD', visit_id:`visit-${index + 1}`, admission_id:`adm-${index + 1}`, package_id:null, insurance_contract_id:index % 2 ? 'contract-2' : 'contract-1', subtotal:grand_total/1.05, discount_amount:0, discount_percentage:0, gst_amount:grand_total-grand_total/1.05, cgst_amount:0, sgst_amount:0, igst_amount:0, grand_total, paid_amount, balance, status, payment_status, is_inter_state:0, notes:null, branch_id:'branch-main', created_at:iso(-24*index), updated_at:iso(), synced_at:iso() })));

  insert('payments', [
    { id:'payment-1', org_id:'org-demo', receipt_number:'REC-1001', invoice_id:'invoice-1', patient_id:'patient-1', payment_date:iso(-3), total_amount:85000, status:'Completed', received_by:'cashier-1', notes:null, branch_id:'branch-main', created_at:iso(-3), updated_at:iso(), synced_at:iso() },
    { id:'payment-2', org_id:'org-demo', receipt_number:'REC-1002', invoice_id:'invoice-2', patient_id:'patient-2', payment_date:iso(-2), total_amount:40000, status:'Completed', received_by:'cashier-1', notes:null, branch_id:'branch-main', created_at:iso(-2), updated_at:iso(), synced_at:iso() }
  ]);
  insert('payment_entries', [
    { id:'entry-1', payment_id:'payment-1', payment_mode:'UPI', amount:50000, transaction_reference:'UPI-DEMO-1', bank_name:null, card_last_four:null, created_at:iso(-3), synced_at:iso() },
    { id:'entry-2', payment_id:'payment-1', payment_mode:'Card', amount:35000, transaction_reference:'CARD-DEMO-1', bank_name:'Demo Bank', card_last_four:'4242', created_at:iso(-3), synced_at:iso() },
    { id:'entry-3', payment_id:'payment-2', payment_mode:'Cash', amount:40000, transaction_reference:null, bank_name:null, card_last_four:null, created_at:iso(-2), synced_at:iso() }
  ]);

  insert('daily_collections', [
    { id:'collection-1', org_id:'org-demo', collection_date:date(), cash_total:40000, upi_total:50000, card_total:35000, bank_transfer_total:0, cheque_total:0, total_collection:125000, invoice_count:4, payment_count:3, is_reconciled:0, reconciled_by:null, reconciled_at:null, variance:0, created_at:iso(), updated_at:iso(), synced_at:iso() },
    { id:'collection-2', org_id:'org-demo', collection_date:date(-1), cash_total:30000, upi_total:42000, card_total:28000, bank_transfer_total:10000, cheque_total:0, total_collection:110000, invoice_count:5, payment_count:6, is_reconciled:1, reconciled_by:'cashier-2', reconciled_at:iso(-12), variance:500, created_at:iso(-24), updated_at:iso(-12), synced_at:iso() }
  ]);

  insert('supplies', [
    ['supply-1','MED-001','N95 Masks','PPE',120,200,'pieces',35],
    ['supply-2','MED-002','Surgical Gloves','PPE',850,500,'pairs',12],
    ['supply-3','MED-003','Normal Saline 500ml','IV Fluids',42,100,'bags',65],
    ['supply-4','MED-004','Paracetamol 500mg','Medication',600,250,'tablets',2],
    ['supply-5','MED-005','Oxygen Cannula','Respiratory',18,30,'pieces',90]
  ].map(([id,item_code,item_name,category,current_stock,min_stock,unit,unit_cost], index) => ({ id,item_code,item_name,category,current_stock,min_stock,unit,unit_cost,last_ordered_at:iso(-72*(index+1)),last_received_at:iso(-48*(index+1)),synced_at:iso() })));
  insert('purchase_orders', [
    { id:'po-1', po_number:'PO-1001', vendor_id:'vendor-1', status:'ordered', total:35000, order_date:date(-2), expected_delivery:date(1), created_at:iso(-48), synced_at:iso() },
    { id:'po-2', po_number:'PO-1002', vendor_id:'vendor-2', status:'delayed', total:18000, order_date:date(-5), expected_delivery:date(-1), created_at:iso(-120), synced_at:iso() }
  ]);

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM beds) AS beds,
    (SELECT COUNT(*) FROM ipd_admissions) AS admissions,
    (SELECT COUNT(*) FROM staff_roster) AS roster_rows,
    (SELECT COUNT(*) FROM supplies) AS supplies`).get();
  console.log(`Seeded ${databasePath}`);
  console.log(counts);
  db.close();
}
