import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { normalizeFields } from '../lib/normalize.js';
import { insertTenantRoles } from '../lib/roles.js';
import {
  maleFirst, femaleFirst, lastNames, companies, companySuffix, cities, streets,
  spaceTypes, spaceImages, branchImages, tags as tagDefs, employees as employeeDefs,
  customFieldDefs, pick, randInt, chance, greeklish,
} from './seed-data.js';

const TENANT1_CUSTOMERS = config.seedCustomers;
const TENANT2_CUSTOMERS = Number(process.env.SEED_CUSTOMERS_T2 || 800);
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'password123';
const now = Date.now();
const DAY = 86400000;
const LABELS = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ'];

function pastDate(maxDaysAgo, minDaysAgo = 0) {
  return new Date(now - randInt(minDaysAgo, maxDaysAgo) * DAY - randInt(0, 86399) * 1000);
}
function futureDate(maxDaysAhead, minDaysAhead = 1) {
  return new Date(now + randInt(minDaysAhead, maxDaysAhead) * DAY + randInt(0, 86399) * 1000);
}
function ymd(d) { return d.toISOString().slice(0, 10); }

class Inserter {
  constructor(conn, table, columns, batchSize = 1500) {
    this.conn = conn;
    this.sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`;
    this.buffer = [];
    this.batchSize = batchSize;
  }
  async push(row) { this.buffer.push(row); if (this.buffer.length >= this.batchSize) await this.flush(); }
  async flush() {
    if (!this.buffer.length) return;
    const rows = this.buffer; this.buffer = [];
    await this.conn.query(this.sql, [rows]);
  }
}

async function seedTenant(conn, C, I, { tenantId, count, empIds, cfd, tagIds }) {
  const membershipTypes = ['Basic', 'Premium', 'Business', 'Enterprise'];
  const methods = ['card', 'cash', 'transfer'];
  const docTypes = [['Σύμβαση συνεργασίας.pdf', 'application/pdf'], ['Ταυτότητα.jpg', 'image/jpeg'], ['Τιμολόγιο.pdf', 'application/pdf']];
  const notesPool = ['Προτιμά πρωινές ώρες.', 'Ενδιαφέρεται για μακροχρόνια συνεργασία.', 'Ζήτησε προσφορά για εταιρικό πακέτο.', 'Χρειάζεται τιμολόγιο.'];
  const t0 = Date.now();

  for (let n = 1; n <= count; n++) {
    C.cust++;
    const id = C.cust;
    const isCompany = chance(0.18);
    const isFemale = !isCompany && chance(0.5);
    const first = isFemale ? pick(femaleFirst) : pick(maleFirst);
    const last = pick(lastNames);
    const homeCity = pick(cities);
    const isVip = chance(0.05);
    const status = chance(0.8) ? 'active' : chance(0.5) ? 'inactive' : 'prospect';
    const company = isCompany ? `${pick(companies)} ${pick(companySuffix)}` : null;
    const taxId = isCompany ? String(randInt(100000000, 999999999)) : null;
    const email = `${greeklish(first)}.${greeklish(last)}${randInt(1, 999)}@${pick(['gmail.com', 'email.gr', 'yahoo.gr', 'hotmail.com'])}`;
    const phone = `+30 21${randInt(1000000, 9999999)}`;
    const mobile = `+30 69${randInt(10000000, 99999999)}`;
    const code = `C-${100000 + id}`;

    // The customer's own branches, each with its own spaces.
    const branchList = [];
    const nBranches = randInt(1, 4);
    for (let bi = 0; bi < nBranches; bi++) {
      C.branch++;
      const bid = C.branch;
      const cityObj = pick(cities);
      const area = pick(cityObj.areas);
      const bname = bi === 0 ? cityObj.city : `${cityObj.city} — ${area}`;
      const addr = `${pick(streets)} ${randInt(1, 180)}`;
      const spaces = [];
      const nSpaces = randInt(2, 6);
      for (let si = 0; si < nSpaces; si++) {
        C.space++;
        const sid = C.space;
        const type = pick(spaceTypes);
        const sname = chance(0.5) ? `Αίθουσα ${LABELS[si % LABELS.length]}` : `${pick(['Γραφείο', 'Studio', 'Lounge', 'Room'])} ${si + 1}`;
        spaces.push({
          id: sid, name: sname, type, code: `S-${1000000 + sid}`, capacity: randInt(2, 40),
          floor: `${randInt(0, 4)}ος`, hourly: randInt(10, 80), img: spaceImages[sid % spaceImages.length],
          visits: 0, bookings: 0, last: null,
        });
      }
      branchList.push({
        id: bid, name: bname, city: cityObj.city, area, addr, code: `B-${100000 + bid}`,
        img: branchImages[bid % branchImages.length], isPrimary: bi === 0,
        spaces, visits: 0, value: 0, last: null,
      });
    }
    const pairs = [];
    for (const b of branchList) for (const s of b.spaces) pairs.push({ b, s });

    // Visits
    let lastVisitAt = null;
    const nVisits = randInt(0, 12);
    for (let v = 0; v < nVisits; v++) {
      const p = pick(pairs);
      const at = pastDate(365);
      const st = chance(0.85) ? 'completed' : chance(0.5) ? 'cancelled' : 'no_show';
      await I.visits.push([id, p.b.id, p.s.id, at, randInt(30, 240), chance(0.6) ? 'booking' : 'visit', st]);
      if (st === 'completed') {
        if (!lastVisitAt || at > lastVisitAt) lastVisitAt = at;
        p.s.visits++; if (!p.s.last || at > p.s.last) p.s.last = at;
        p.b.visits++; if (!p.b.last || at > p.b.last) p.b.last = at;
      }
    }

    // Bookings + payments + activities
    let totalValue = 0;
    let nextBookingAt = null;
    const nBookings = randInt(0, 6);
    for (let b = 0; b < nBookings; b++) {
      const p = pick(pairs);
      const future = chance(0.25);
      const starts = future ? futureDate(45) : pastDate(300, 1);
      const ends = new Date(starts.getTime() + randInt(1, 4) * 3600000);
      const st = future ? (chance(0.5) ? 'confirmed' : 'pending') : (chance(0.85) ? 'completed' : 'cancelled');
      const amount = randInt(4, 60) * 10;
      C.booking++;
      await I.bookings.push([C.booking, tenantId, id, p.b.id, p.s.id, pick(empIds), starts, ends, st, amount]);
      p.s.bookings++;
      if (future) {
        if (!nextBookingAt || starts < nextBookingAt) nextBookingAt = starts;
        await I.activities.push([tenantId, id, 'booking_created', `Νέα κράτηση – ${p.s.name} (${p.b.name})`, p.b.id, p.s.id, pastDate(20)]);
      } else if (st === 'completed') {
        totalValue += amount; p.b.value += amount;
        const paidAt = new Date(starts.getTime() + 3600000);
        await I.payments.push([id, C.booking, amount, pick(methods), 'paid', paidAt]);
        await I.activities.push([tenantId, id, 'booking_completed', `Ολοκληρωμένη κράτηση – ${p.s.name}`, p.b.id, p.s.id, starts]);
        await I.activities.push([tenantId, id, 'payment_received', `Πληρωμή €${amount}`, p.b.id, null, paidAt]);
      }
    }
    if (lastVisitAt) await I.activities.push([tenantId, id, 'visit', `Επίσκεψη – ${branchList[0].name}`, branchList[0].id, null, lastVisitAt]);

    const nComms = randInt(0, 3);
    for (let c = 0; c < nComms; c++) {
      const ch = pick(['email', 'sms', 'call']);
      const created = pastDate(200);
      await I.comms.push([id, ch, chance(0.7) ? 'outbound' : 'inbound', ch === 'call' ? 'Τηλεφωνική επικοινωνία' : 'Ενημέρωση πελάτη', 'Επικοινωνία σχετικά με κράτηση/υπηρεσίες.', pick(empIds), created]);
      await I.activities.push([tenantId, id, 'message_sent', 'Αποστολή μηνύματος', null, null, created]);
    }
    const nDocs = randInt(0, 2);
    for (let d = 0; d < nDocs; d++) {
      const [dn, mt] = pick(docTypes);
      const created = pastDate(500);
      await I.docs.push([id, dn, mt, randInt(50000, 5000000), `/files/customer/${id}/${d}`, created]);
      await I.activities.push([tenantId, id, 'document_uploaded', `Ανέβηκε έγγραφο: ${dn}`, null, null, created]);
    }
    let profileNote = null;
    const nNotes = randInt(0, 2);
    if (chance(0.4)) profileNote = pick(notesPool);
    for (let nt = 0; nt < nNotes; nt++) {
      const created = pastDate(400);
      await I.notes.push([id, pick(notesPool), pick(empIds), created]);
      await I.activities.push([tenantId, id, 'note_added', 'Προστέθηκε σημείωση', null, null, created]);
    }

    // Customer row
    const spacesCount = branchList.reduce((a, b) => a + b.spaces.length, 0);
    const dob = ymd(new Date(randInt(1955, 2003), randInt(0, 11), randInt(1, 28)));
    const searchNorm = normalizeFields(first, last, email, phone, mobile, company, taxId, code);
    await I.customers.push([
      id, tenantId, code, first, last, email, phone, mobile, company, taxId,
      isCompany ? 'company' : 'individual', status, isVip, dob,
      `${pick(streets)} ${randInt(1, 180)}`, homeCity.city, String(randInt(10000, 85000)), 'Ελλάδα',
      null, profileNote, pick(empIds), pastDate(1460, 30),
      nBranches, spacesCount, nBookings, nVisits, totalValue, lastVisitAt, nextBookingAt,
      lastVisitAt || '1000-01-01 00:00:00', searchNorm,
    ]);

    // Branch + space rows (with computed aggregates)
    for (const b of branchList) {
      await I.branches.push([
        b.id, tenantId, id, b.code, b.name, b.addr, b.city, b.area, String(randInt(10000, 85000)),
        `+30 2${randInt(1, 8)}${randInt(1000000, 9999999)}`, `${greeklish(b.city)}@${greeklish(last)}.gr`,
        b.img, 37 + Math.random() * 3, 21 + Math.random() * 4, b.isPrimary, b.spaces.length, b.visits, b.value, b.last,
        normalizeFields(b.name, b.city, b.area, b.code, b.addr),
      ]);
      for (const s of b.spaces) {
        await I.spaces.push([
          s.id, tenantId, id, b.id, s.code, s.name, s.type, s.capacity, s.floor, s.hourly, s.img,
          `${s.type} στο υποκατάστημα ${b.name}.`, s.visits, s.bookings, s.last,
          normalizeFields(s.name, s.type, s.code, b.name),
        ]);
      }
    }

    // Tags
    const slugs = new Set();
    if (isVip) slugs.add('vip');
    if (isCompany) slugs.add('corporate');
    if (totalValue > 800) slugs.add('high-value');
    if (nVisits > 6) slugs.add('frequent');
    if (chance(0.2)) slugs.add('new');
    for (const slug of slugs) await I.ctags.push([id, tagIds[slug]]);

    // Customer custom field values
    await I.ccfv.push([id, cfd['customer:member_no'], `M-${200000 + id}`, null, null, null, null]);
    if (chance(0.85)) await I.ccfv.push([id, cfd['customer:membership_type'], pick(membershipTypes), null, null, null, null]);
    if (chance(0.6)) await I.ccfv.push([id, cfd['customer:expiry_date'], null, null, ymd(futureDate(700, 30)), null, null]);
    if (isCompany) {
      await I.ccfv.push([id, cfd['customer:legal_rep'], `${pick(maleFirst)} ${pick(lastNames)}`, null, null, null, null]);
      await I.ccfv.push([id, cfd['customer:gemi'], String(randInt(100000000000, 999999999999)), null, null, null, null]);
    }

    if (n % 25000 === 0) {
      const rate = Math.round(n / ((Date.now() - t0) / 1000));
      console.log(`   tenant ${tenantId}: ${n.toLocaleString()} / ${count.toLocaleString()} (${rate}/s)`);
    }
  }
}

async function main() {
  const t0 = Date.now();
  console.log(`Seeding SpaceHub (MariaDB, multi-tenant). Tenant1=${TENANT1_CUSTOMERS.toLocaleString()}, Tenant2=${TENANT2_CUSTOMERS}`);
  const conn = await mysql.createConnection({ ...config.mysql, multipleStatements: true });
  await conn.query('SET SESSION FOREIGN_KEY_CHECKS=0');
  await conn.query('SET SESSION UNIQUE_CHECKS=0');

  console.log('1/4 Tenants, roles, users…');
  const q = async (sql, params) => { const [rows] = await conn.query(sql, params); return { rows }; };

  // Tenants
  await conn.query('INSERT INTO tenants (id, name, slug) VALUES ?', [[[1, 'Demo Α.Ε.', 'demo'], [2, 'Acme Ε.Π.Ε.', 'acme']]]);

  // Default roles cloned per tenant.
  const roleMap = { 1: await insertTenantRoles(q, 1), 2: await insertTenantRoles(q, 2) };

  // Users (bcrypt). Same demo password for all accounts.
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    [1, roleMap[1].owner, 'owner@demo.gr', hash, 'Αναστασία', 'Κωνσταντίνου'],
    [1, roleMap[1].admin, 'admin@demo.gr', hash, 'Νίκος', 'Παπαδόπουλος'],
    [1, roleMap[1].manager, 'manager@demo.gr', hash, 'Ελένη', 'Γεωργίου'],
    [1, roleMap[1].agent, 'agent@demo.gr', hash, 'Γιώργος', 'Δημητρίου'],
    [1, roleMap[1].viewer, 'viewer@demo.gr', hash, 'Μαρία', 'Νικολάου'],
    [2, roleMap[2].owner, 'owner@acme.gr', hash, 'Κώστας', 'Βασιλείου'],
  ];
  await conn.query('INSERT INTO users (tenant_id, role_id, email, password_hash, first_name, last_name) VALUES ?', [users]);

  console.log('2/4 Employees, tags, custom fields…');
  // Employees per tenant
  const empByTenant = { 1: [], 2: [] };
  const empRows = [];
  let empSeq = 0;
  for (const tId of [1, 2]) {
    for (const e of employeeDefs) {
      empSeq++;
      empByTenant[tId].push(empSeq);
      empRows.push([empSeq, tId, e.first, e.last, `${greeklish(e.first)}.${greeklish(e.last)}@spacehub.gr`, e.role]);
    }
  }
  await conn.query('INSERT INTO employees (id, tenant_id, first_name, last_name, email, role) VALUES ?', [empRows]);

  // Tags (global)
  const tagIds = {};
  const tagRows = tagDefs.map((t, i) => { tagIds[t.slug] = i + 1; return [i + 1, t.name, t.slug, t.color]; });
  await conn.query('INSERT INTO tags (id, name, slug, color) VALUES ?', [tagRows]);

  // Custom field definitions (global)
  const cfd = {};
  const cfdRows = customFieldDefs.map((d, i) => {
    cfd[`${d.entity_type}:${d.key}`] = i + 1;
    return [i + 1, d.entity_type, d.name, d.key, d.field_type, !!d.required, !!d.searchable,
      !!d.filterable, !!d.visible_in_list, JSON.stringify(d.settings || {}), d.section, d.sort_order, true];
  });
  await conn.query(
    'INSERT INTO custom_field_definitions (id, entity_type, name, `key`, field_type, required, searchable, filterable, visible_in_list, settings, section, sort_order, active) VALUES ?',
    [cfdRows]);

  console.log('3/4 Customers + branches + spaces + history…');
  const I = {
    customers: new Inserter(conn, 'customers', ['id', 'tenant_id', 'code', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'company', 'tax_id', 'customer_type', 'status', 'is_vip', 'date_of_birth', 'address_line', 'city', 'postal_code', 'country', 'avatar_url', 'profile_note', 'assigned_employee_id', 'registered_at', 'branches_count', 'spaces_count', 'bookings_count', 'visits_count', 'total_value', 'last_visit_at', 'next_booking_at', 'last_visit_sort', 'search_norm'], 1000),
    branches: new Inserter(conn, 'branches', ['id', 'tenant_id', 'customer_id', 'code', 'name', 'address_line', 'city', 'area', 'postal_code', 'phone', 'email', 'image_url', 'lat', 'lng', 'is_primary', 'spaces_count', 'visits_count', 'total_value', 'last_visit_at', 'search_norm'], 2000),
    spaces: new Inserter(conn, 'spaces', ['id', 'tenant_id', 'customer_id', 'branch_id', 'code', 'name', 'space_type', 'capacity', 'floor', 'hourly_price', 'image_url', 'description', 'visits_count', 'bookings_count', 'last_visit_at', 'search_norm'], 3000),
    bookings: new Inserter(conn, 'bookings', ['id', 'tenant_id', 'customer_id', 'branch_id', 'space_id', 'employee_id', 'starts_at', 'ends_at', 'status', 'amount'], 3000),
    visits: new Inserter(conn, 'visits', ['customer_id', 'branch_id', 'space_id', 'visited_at', 'duration_minutes', 'visit_type', 'status'], 4000),
    payments: new Inserter(conn, 'payments', ['customer_id', 'booking_id', 'amount', 'method', 'status', 'paid_at'], 4000),
    activities: new Inserter(conn, 'activities', ['tenant_id', 'customer_id', 'type', 'description', 'branch_id', 'space_id', 'created_at'], 4000),
    comms: new Inserter(conn, 'communications', ['customer_id', 'channel', 'direction', 'subject', 'body', 'employee_id', 'created_at'], 4000),
    docs: new Inserter(conn, 'documents', ['customer_id', 'name', 'mime_type', 'size_bytes', 'url', 'created_at'], 4000),
    notes: new Inserter(conn, 'notes', ['customer_id', 'body', 'employee_id', 'created_at'], 4000),
    ctags: new Inserter(conn, 'customer_tags', ['customer_id', 'tag_id'], 5000),
    ccfv: new Inserter(conn, 'customer_custom_field_values', ['customer_id', 'field_definition_id', 'text_value', 'number_value', 'date_value', 'boolean_value', 'json_value'], 4000),
  };

  const C = { cust: 0, branch: 0, space: 0, booking: 0 };
  await seedTenant(conn, C, I, { tenantId: 1, count: TENANT1_CUSTOMERS, empIds: empByTenant[1], cfd, tagIds });
  await seedTenant(conn, C, I, { tenantId: 2, count: TENANT2_CUSTOMERS, empIds: empByTenant[2], cfd, tagIds });
  for (const ins of Object.values(I)) await ins.flush();

  console.log('4/4 ANALYZE…');
  await conn.query('SET SESSION FOREIGN_KEY_CHECKS=1');
  await conn.query('ANALYZE TABLE customers, branches, spaces, bookings, visits, activities');

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. Login: owner@demo.gr / ${DEMO_PASSWORD}`);
  await conn.end();
}

main().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
