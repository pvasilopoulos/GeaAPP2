import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { normalizeFields } from '../lib/normalize.js';
import {
  maleFirst, femaleFirst, lastNames, companies, companySuffix, cities, streets,
  spaceTypes, spaceImages, branchImages, tags as tagDefs, employees as employeeDefs,
  customFieldDefs, pick, randInt, chance, greeklish,
} from './seed-data.js';

const N = config.seedCustomers;
const now = Date.now();
const DAY = 86400000;

function pastDate(maxDaysAgo, minDaysAgo = 0) {
  const days = randInt(minDaysAgo, maxDaysAgo);
  return new Date(now - days * DAY - randInt(0, 86399) * 1000);
}
function futureDate(maxDaysAhead, minDaysAhead = 1) {
  const days = randInt(minDaysAhead, maxDaysAhead);
  return new Date(now + days * DAY + randInt(0, 86399) * 1000);
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
function sample(arr, k) {
  const copy = arr.slice();
  const out = [];
  const n = Math.min(k, copy.length);
  for (let i = 0; i < n; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
}

// Batched multi-row INSERT helper.
class Inserter {
  constructor(conn, table, columns, batchSize = 2000) {
    this.conn = conn;
    this.sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ?`;
    this.buffer = [];
    this.batchSize = batchSize;
    this.count = 0;
  }
  async push(row) {
    this.buffer.push(row);
    if (this.buffer.length >= this.batchSize) await this.flush();
  }
  async flush() {
    if (!this.buffer.length) return;
    const rows = this.buffer;
    this.buffer = [];
    await this.conn.query(this.sql, [rows]);
    this.count += rows.length;
  }
}

async function seedReference(conn) {
  // Employees (explicit ids)
  const empIds = [];
  const empRows = employeeDefs.map((e, i) => {
    empIds.push(i + 1);
    return [i + 1, e.first, e.last, `${greeklish(e.first)}.${greeklish(e.last)}@spacehub.gr`, e.role];
  });
  await conn.query('INSERT INTO employees (id, first_name, last_name, email, role) VALUES ?', [empRows]);

  // Tags (explicit ids)
  const tagIds = {};
  const tagRows = tagDefs.map((t, i) => { tagIds[t.slug] = i + 1; return [i + 1, t.name, t.slug, t.color]; });
  await conn.query('INSERT INTO tags (id, name, slug, color) VALUES ?', [tagRows]);

  // Branches + spaces (explicit ids)
  const branches = [];
  const spacesByBranch = {};
  const branchRows = [];
  const spaceRows = [];
  let branchSeq = 0;
  let spaceSeq = 0;
  for (const c of cities) {
    const nBranches = randInt(2, Math.min(5, c.areas.length + 1));
    for (let b = 0; b < nBranches; b++) {
      branchSeq++;
      const id = branchSeq;
      const area = c.areas[b % c.areas.length];
      const code = `B-${100 + branchSeq}`;
      const name = b === 0 ? c.city : `${c.city} — ${area}`;
      const addr = `${pick(streets)} ${randInt(1, 180)}`;
      branches.push({ id, city: c.city, area, name });
      spacesByBranch[id] = [];
      branchRows.push([
        id, code, name, addr, c.city, area, String(randInt(10000, 85000)),
        `+30 2${randInt(1, 8)}${randInt(1000000, 9999999)}`,
        `${greeklish(c.city)}${b || ''}@spacehub.gr`,
        branchImages[branchSeq % branchImages.length], 37 + Math.random() * 3, 21 + Math.random() * 4,
        0, normalizeFields(name, c.city, area, code, addr),
      ]);
      const nSpaces = randInt(3, 8);
      branchRows[branchRows.length - 1][12] = nSpaces; // spaces_count
      for (let s = 0; s < nSpaces; s++) {
        spaceSeq++;
        const sid = spaceSeq;
        const type = pick(spaceTypes);
        const labels = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ'];
        const spaceName = chance(0.5)
          ? `Αίθουσα ${labels[s % labels.length]}`
          : `${pick(['Γραφείο', 'Studio', 'Lounge', 'Room'])} ${s + 1}`;
        const scode = `S-${1000 + spaceSeq}`;
        spacesByBranch[id].push({ id: sid, name: spaceName, type });
        spaceRows.push([
          sid, id, scode, spaceName, type, randInt(2, 40), `${randInt(0, 4)}ος`,
          randInt(10, 80), spaceImages[spaceSeq % spaceImages.length],
          `${type} στο υποκατάστημα ${name}.`, normalizeFields(spaceName, type, scode, name),
        ]);
      }
    }
  }
  await conn.query(
    `INSERT INTO branches (id, code, name, address_line, city, area, postal_code, phone, email, image_url, lat, lng, spaces_count, search_norm) VALUES ?`,
    [branchRows]);
  await conn.query(
    `INSERT INTO spaces (id, branch_id, code, name, space_type, capacity, floor, hourly_price, image_url, description, search_norm) VALUES ?`,
    [spaceRows]);

  // Custom field definitions (explicit ids) — note reserved word \`key\`.
  const cfd = {};
  const cfdRows = customFieldDefs.map((d, i) => {
    cfd[`${d.entity_type}:${d.key}`] = i + 1;
    return [i + 1, d.entity_type, d.name, d.key, d.field_type, !!d.required, !!d.searchable,
      !!d.filterable, !!d.visible_in_list, JSON.stringify(d.settings || {}), d.section, d.sort_order, true];
  });
  await conn.query(
    'INSERT INTO custom_field_definitions (id, entity_type, name, `key`, field_type, required, searchable, filterable, visible_in_list, settings, section, sort_order, active) VALUES ?',
    [cfdRows]);

  // Branch/space custom field values
  const bcfv = [];
  for (const br of branches) {
    bcfv.push([br.id, cfd['branch:opening_hours'], '09:00 - 21:00', null, null, null, null]);
    bcfv.push([br.id, cfd['branch:parking'], null, randInt(0, 60), null, null, null]);
  }
  await conn.query('INSERT INTO branch_custom_field_values (branch_id, field_definition_id, text_value, number_value, date_value, boolean_value, json_value) VALUES ?', [bcfv]);
  const scfv = [];
  for (const bId of Object.keys(spacesByBranch)) {
    for (const sp of spacesByBranch[bId]) {
      scfv.push([sp.id, cfd['space:capacity'], null, randInt(2, 40), null, null, null]);
      scfv.push([sp.id, cfd['space:video_conf'], null, null, null, chance(0.5), null]);
    }
  }
  await conn.query('INSERT INTO space_custom_field_values (space_id, field_definition_id, text_value, number_value, date_value, boolean_value, json_value) VALUES ?', [scfv]);

  return { empIds, tagIds, branches, spacesByBranch, cfd };
}

async function seedCustomers(conn, ref) {
  const { empIds, tagIds, branches, spacesByBranch, cfd } = ref;

  const I = {
    customers: new Inserter(conn, 'customers', [
      'id', 'code', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'company', 'tax_id',
      'customer_type', 'status', 'is_vip', 'date_of_birth', 'address_line', 'city', 'postal_code',
      'country', 'avatar_url', 'profile_note', 'assigned_employee_id', 'registered_at',
      'branches_count', 'spaces_count', 'bookings_count', 'visits_count', 'total_value',
      'last_visit_at', 'next_booking_at', 'last_visit_sort', 'search_norm'], 1500),
    cb: new Inserter(conn, 'customer_branches', ['customer_id', 'branch_id', 'is_primary', 'visits_count', 'spaces_count', 'total_value', 'first_visit_at', 'last_visit_at'], 3000),
    cs: new Inserter(conn, 'customer_spaces', ['customer_id', 'space_id', 'branch_id', 'visits_count', 'bookings_count', 'last_visit_at'], 3000),
    bookings: new Inserter(conn, 'bookings', ['id', 'customer_id', 'branch_id', 'space_id', 'employee_id', 'starts_at', 'ends_at', 'status', 'amount'], 3000),
    visits: new Inserter(conn, 'visits', ['customer_id', 'branch_id', 'space_id', 'visited_at', 'duration_minutes', 'visit_type', 'status'], 4000),
    payments: new Inserter(conn, 'payments', ['customer_id', 'booking_id', 'amount', 'method', 'status', 'paid_at'], 4000),
    activities: new Inserter(conn, 'activities', ['customer_id', 'type', 'description', 'branch_id', 'space_id', 'created_at'], 4000),
    comms: new Inserter(conn, 'communications', ['customer_id', 'channel', 'direction', 'subject', 'body', 'employee_id', 'created_at'], 4000),
    docs: new Inserter(conn, 'documents', ['customer_id', 'name', 'mime_type', 'size_bytes', 'url', 'created_at'], 4000),
    notes: new Inserter(conn, 'notes', ['customer_id', 'body', 'employee_id', 'created_at'], 4000),
    ctags: new Inserter(conn, 'customer_tags', ['customer_id', 'tag_id'], 5000),
    ccfv: new Inserter(conn, 'customer_custom_field_values', ['customer_id', 'field_definition_id', 'text_value', 'number_value', 'date_value', 'boolean_value', 'json_value'], 4000),
  };

  const membershipTypes = ['Basic', 'Premium', 'Business', 'Enterprise'];
  const methods = ['card', 'cash', 'transfer'];
  const docTypes = [['Σύμβαση συνεργασίας.pdf', 'application/pdf'], ['Ταυτότητα.jpg', 'image/jpeg'], ['Τιμολόγιο.pdf', 'application/pdf'], ['Συμφωνητικό.pdf', 'application/pdf']];
  const notesPool = ['Προτιμά πρωινές ώρες.', 'Ενδιαφέρεται για μακροχρόνια συνεργασία.', 'Ζήτησε προσφορά για εταιρικό πακέτο.', 'Χρειάζεται τιμολόγιο.', 'Συνήθως κλείνει αίθουσα συνεδριάσεων.'];

  let bookingId = 0;
  const startTime = Date.now();

  for (let i = 1; i <= N; i++) {
    const isCompany = chance(0.18);
    const isFemale = !isCompany && chance(0.5);
    const first = isFemale ? pick(femaleFirst) : pick(maleFirst);
    const last = pick(lastNames);
    const cityObj = pick(cities);
    const isVip = chance(0.05);
    const status = chance(0.8) ? 'active' : chance(0.5) ? 'inactive' : 'prospect';
    const company = isCompany ? `${pick(companies)} ${pick(companySuffix)}` : null;
    const taxId = isCompany ? String(randInt(100000000, 999999999)) : null;
    const emailUser = `${greeklish(first)}.${greeklish(last)}${randInt(1, 999)}`;
    const email = `${emailUser}@${pick(['gmail.com', 'email.gr', 'yahoo.gr', 'hotmail.com'])}`;
    const phone = `+30 21${randInt(1000000, 9999999)}`;
    const mobile = `+30 69${randInt(10000000, 99999999)}`;
    const code = `C-${100000 + i}`;

    const chosenBranches = sample(branches, randInt(1, 3));
    const csRows = [];
    const cbAgg = new Map();
    const pairs = [];
    for (const br of chosenBranches) {
      const spacesHere = spacesByBranch[br.id] || [];
      const chosenSpaces = sample(spacesHere, randInt(1, Math.min(3, spacesHere.length || 1)));
      cbAgg.set(br.id, { visits: 0, value: 0, spaces: chosenSpaces.length, first: null, last: null });
      for (const sp of chosenSpaces) {
        pairs.push({ br, sp });
        csRows.push({ br, sp, visits: 0, bookings: 0, last: null });
      }
    }
    if (pairs.length === 0) continue;

    const nVisits = randInt(0, 12);
    let lastVisitAt = null;
    const visitRows = [];
    for (let v = 0; v < nVisits; v++) {
      const p = pick(pairs);
      const at = pastDate(365);
      const vtype = chance(0.6) ? 'booking' : 'visit';
      const st = chance(0.85) ? 'completed' : chance(0.5) ? 'cancelled' : 'no_show';
      visitRows.push([i, p.br.id, p.sp.id, at, randInt(30, 240), vtype, st]);
      if (st === 'completed') {
        if (!lastVisitAt || at > lastVisitAt) lastVisitAt = at;
        const cs = csRows.find((r) => r.sp.id === p.sp.id);
        if (cs) { cs.visits++; cs.last = !cs.last || at > cs.last ? at : cs.last; }
        const agg = cbAgg.get(p.br.id);
        agg.visits++;
        if (!agg.first || at < agg.first) agg.first = at;
        if (!agg.last || at > agg.last) agg.last = at;
      }
    }

    const nBookings = randInt(0, 6);
    let totalValue = 0;
    let nextBookingAt = null;
    for (let b = 0; b < nBookings; b++) {
      const p = pick(pairs);
      const future = chance(0.25);
      const starts = future ? futureDate(45) : pastDate(300, 1);
      const ends = new Date(starts.getTime() + randInt(1, 4) * 3600000);
      const st = future ? (chance(0.5) ? 'confirmed' : 'pending') : (chance(0.85) ? 'completed' : 'cancelled');
      const amount = randInt(4, 60) * 10;
      bookingId++;
      await I.bookings.push([bookingId, i, p.br.id, p.sp.id, pick(empIds), starts, ends, st, amount]);
      const cs = csRows.find((r) => r.sp.id === p.sp.id);
      if (cs) cs.bookings++;
      if (future) {
        if (!nextBookingAt || starts < nextBookingAt) nextBookingAt = starts;
        await I.activities.push([i, 'booking_created', `Νέα κράτηση – ${p.sp.name} (${p.br.name})`, p.br.id, p.sp.id, pastDate(20)]);
      } else if (st === 'completed') {
        totalValue += amount;
        cbAgg.get(p.br.id).value += amount;
        const paidAt = new Date(starts.getTime() + 3600000);
        await I.payments.push([i, bookingId, amount, pick(methods), 'paid', paidAt]);
        await I.activities.push([i, 'booking_completed', `Ολοκληρωμένη κράτηση – ${p.sp.name}`, p.br.id, p.sp.id, starts]);
        await I.activities.push([i, 'payment_received', `Πληρωμή €${amount}`, p.br.id, null, paidAt]);
      }
    }
    for (const r of visitRows) await I.visits.push(r);
    if (lastVisitAt) await I.activities.push([i, 'visit', `Επίσκεψη – ${chosenBranches[0].name}`, chosenBranches[0].id, null, lastVisitAt]);

    const nComms = randInt(0, 3);
    for (let c = 0; c < nComms; c++) {
      const ch = pick(['email', 'sms', 'call']);
      const created = pastDate(200);
      await I.comms.push([i, ch, chance(0.7) ? 'outbound' : 'inbound', ch === 'call' ? 'Τηλεφωνική επικοινωνία' : 'Ενημέρωση πελάτη', 'Επικοινωνία σχετικά με κράτηση/υπηρεσίες.', pick(empIds), created]);
      await I.activities.push([i, 'message_sent', 'Αποστολή μηνύματος', null, null, created]);
    }
    const nDocs = randInt(0, 2);
    for (let d = 0; d < nDocs; d++) {
      const [dn, mt] = pick(docTypes);
      const created = pastDate(500);
      await I.docs.push([i, dn, mt, randInt(50000, 5000000), `/files/customer/${i}/${d}`, created]);
      await I.activities.push([i, 'document_uploaded', `Ανέβηκε έγγραφο: ${dn}`, null, null, created]);
    }
    const nNotes = randInt(0, 2);
    let profileNote = null;
    if (chance(0.4)) profileNote = pick(notesPool);
    for (let nt = 0; nt < nNotes; nt++) {
      const created = pastDate(400);
      await I.notes.push([i, pick(notesPool), pick(empIds), created]);
      await I.activities.push([i, 'note_added', 'Προστέθηκε σημείωση', null, null, created]);
    }

    const dob = ymd(new Date(randInt(1955, 2003), randInt(0, 11), randInt(1, 28)));
    const distinctSpaces = new Set(csRows.map((r) => r.sp.id)).size;
    const search_norm = normalizeFields(first, last, email, phone, mobile, company, taxId, code);
    await I.customers.push([
      i, code, first, last, email, phone, mobile, company, taxId,
      isCompany ? 'company' : 'individual', status, isVip, dob,
      `${pick(streets)} ${randInt(1, 180)}`, cityObj.city, String(randInt(10000, 85000)), 'Ελλάδα',
      null, profileNote, pick(empIds), pastDate(1460, 30),
      chosenBranches.length, distinctSpaces, nBookings, nVisits, totalValue, lastVisitAt, nextBookingAt,
      lastVisitAt || '1000-01-01 00:00:00', search_norm,
    ]);

    for (const [bid, agg] of cbAgg.entries()) {
      await I.cb.push([i, bid, bid === chosenBranches[0].id, agg.visits, agg.spaces, agg.value, agg.first, agg.last]);
    }
    for (const cs of csRows) await I.cs.push([i, cs.sp.id, cs.br.id, cs.visits, cs.bookings, cs.last]);

    const tagSlugs = new Set();
    if (isVip) tagSlugs.add('vip');
    if (isCompany) tagSlugs.add('corporate');
    if (totalValue > 800) tagSlugs.add('high-value');
    if (nVisits > 6) tagSlugs.add('frequent');
    if (chance(0.2)) tagSlugs.add('new');
    if (chance(0.15)) tagSlugs.add('gym');
    for (const slug of tagSlugs) await I.ctags.push([i, tagIds[slug]]);

    await I.ccfv.push([i, cfd['customer:member_no'], `M-${200000 + i}`, null, null, null, null]);
    if (chance(0.85)) await I.ccfv.push([i, cfd['customer:membership_type'], pick(membershipTypes), null, null, null, null]);
    if (chance(0.6)) await I.ccfv.push([i, cfd['customer:expiry_date'], null, null, ymd(futureDate(700, 30)), null, null]);
    if (isCompany) {
      await I.ccfv.push([i, cfd['customer:legal_rep'], `${pick(maleFirst)} ${pick(lastNames)}`, null, null, null, null]);
      await I.ccfv.push([i, cfd['customer:gemi'], String(randInt(100000000000, 999999999999)), null, null, null, null]);
    }

    if (i % 25000 === 0) {
      const rate = Math.round(i / ((Date.now() - startTime) / 1000));
      console.log(`  …${i.toLocaleString()} / ${N.toLocaleString()} customers (${rate}/s)`);
    }
  }

  for (const ins of Object.values(I)) await ins.flush();
  return { bookingCount: bookingId };
}

async function main() {
  const t0 = Date.now();
  console.log(`Seeding SpaceHub (MariaDB) with ${N.toLocaleString()} customers…`);
  const conn = await mysql.createConnection({ ...config.mysql, multipleStatements: true });
  await conn.query('SET SESSION FOREIGN_KEY_CHECKS=0');
  await conn.query('SET SESSION UNIQUE_CHECKS=0');

  console.log('1/3 Reference data (employees, tags, branches, spaces, custom fields)…');
  const ref = await seedReference(conn);
  console.log(`   ${ref.branches.length} branches, ${Object.values(ref.spacesByBranch).flat().length} spaces.`);

  console.log('2/3 Customers + relations (batched inserts)…');
  await seedCustomers(conn, ref);

  console.log('3/3 ANALYZE TABLE…');
  await conn.query('SET SESSION FOREIGN_KEY_CHECKS=1');
  await conn.query('ANALYZE TABLE customers, customer_branches, customer_spaces, visits, bookings');

  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
