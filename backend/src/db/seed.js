import { once } from 'node:events';
import pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { config } from '../config.js';
import { pool } from '../db.js';
import {
  maleFirst, femaleFirst, lastNames, companies, companySuffix, cities, streets,
  spaceTypes, spaceImages, branchImages, tags as tagDefs, employees as employeeDefs,
  customFieldDefs, pick, randInt, chance, greeklish,
} from './seed-data.js';

const N = config.seedCustomers;

// ---- COPY helpers ---------------------------------------------------------

function esc(v) {
  if (v === null || v === undefined) return '\\N';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (typeof v === 'number') return String(v);
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

class CopyWriter {
  constructor(sql) {
    this.sql = sql;
    this.client = new pg.Client(config.pg);
    this.count = 0;
  }
  async start() {
    await this.client.connect();
    this.stream = this.client.query(copyFrom(this.sql));
  }
  async write(values) {
    this.count++;
    const line = values.map(esc).join('\t') + '\n';
    if (!this.stream.write(line)) {
      await once(this.stream, 'drain');
    }
  }
  async finish() {
    this.stream.end();
    await once(this.stream, 'finish');
    await this.client.end();
  }
}

// ---- date helpers ---------------------------------------------------------

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

// ---- reference data -------------------------------------------------------

async function seedReference() {
  // Employees
  const empIds = [];
  for (const e of employeeDefs) {
    const r = await pool.query(
      'INSERT INTO employees (first_name, last_name, email, role) VALUES ($1,$2,$3,$4) RETURNING id',
      [e.first, e.last, `${greeklish(e.first)}.${greeklish(e.last)}@spacehub.gr`, e.role],
    );
    empIds.push(r.rows[0].id);
  }

  // Tags
  const tagIds = {};
  for (const t of tagDefs) {
    const r = await pool.query(
      'INSERT INTO tags (name, slug, color) VALUES ($1,$2,$3) RETURNING id',
      [t.name, t.slug, t.color],
    );
    tagIds[t.slug] = r.rows[0].id;
  }

  // Branches (2-5 per city) + spaces
  const branches = [];
  const spacesByBranch = {};
  let branchSeq = 0;
  let spaceSeq = 0;
  for (const c of cities) {
    const nBranches = randInt(2, Math.min(5, c.areas.length + 1));
    for (let b = 0; b < nBranches; b++) {
      branchSeq++;
      const area = c.areas[b % c.areas.length];
      const code = `B-${String(100 + branchSeq)}`;
      const name = b === 0 ? c.city : `${c.city} — ${area}`;
      const addr = `${pick(streets)} ${randInt(1, 180)}`;
      const r = await pool.query(
        `INSERT INTO branches (code, name, address_line, city, area, postal_code, phone, email, image_url, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [code, name, addr, c.city, area, String(randInt(10000, 85000)),
          `+30 2${randInt(1, 8)}${randInt(1000000, 9999999)}`,
          `${greeklish(c.city)}${b || ''}@spacehub.gr`,
          branchImages[branchSeq % branchImages.length],
          37 + Math.random() * 3, 21 + Math.random() * 4],
      );
      const branchId = r.rows[0].id;
      const branch = { id: branchId, city: c.city, area, name };
      branches.push(branch);
      spacesByBranch[branchId] = [];

      const nSpaces = randInt(3, 8);
      for (let s = 0; s < nSpaces; s++) {
        spaceSeq++;
        const type = pick(spaceTypes);
        const labels = ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ'];
        const spaceName = chance(0.5)
          ? `Αίθουσα ${labels[s % labels.length]}`
          : `${pick(['Γραφείο', 'Studio', 'Lounge', 'Room'])} ${s + 1}`;
        const sr = await pool.query(
          `INSERT INTO spaces (branch_id, code, name, space_type, capacity, floor, hourly_price, image_url, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [branchId, `S-${String(1000 + spaceSeq)}`, spaceName, type, randInt(2, 40),
            `${randInt(0, 4)}ος`, randInt(10, 80), spaceImages[spaceSeq % spaceImages.length],
            `${type} στο υποκατάστημα ${branch.name}.`],
        );
        spacesByBranch[branchId].push({ id: sr.rows[0].id, name: spaceName, type });
      }
      await pool.query('UPDATE branches SET spaces_count=$1 WHERE id=$2', [nSpaces, branchId]);
    }
  }

  // Custom field definitions
  const cfd = {};
  for (const d of customFieldDefs) {
    const r = await pool.query(
      `INSERT INTO custom_field_definitions
         (entity_type, name, key, field_type, required, searchable, filterable, visible_in_list, settings, section, sort_order, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING id`,
      [d.entity_type, d.name, d.key, d.field_type, !!d.required, !!d.searchable,
        !!d.filterable, !!d.visible_in_list, JSON.stringify(d.settings || {}), d.section, d.sort_order],
    );
    cfd[`${d.entity_type}:${d.key}`] = r.rows[0].id;
  }

  // A few branch/space custom field values
  for (const br of branches) {
    await pool.query(
      `INSERT INTO branch_custom_field_values (branch_id, field_definition_id, text_value) VALUES ($1,$2,$3)`,
      [br.id, cfd['branch:opening_hours'], '09:00 - 21:00'],
    );
    await pool.query(
      `INSERT INTO branch_custom_field_values (branch_id, field_definition_id, number_value) VALUES ($1,$2,$3)`,
      [br.id, cfd['branch:parking'], randInt(0, 60)],
    );
  }
  for (const bId of Object.keys(spacesByBranch)) {
    for (const sp of spacesByBranch[bId]) {
      await pool.query(
        `INSERT INTO space_custom_field_values (space_id, field_definition_id, number_value) VALUES ($1,$2,$3)`,
        [sp.id, cfd['space:capacity'], randInt(2, 40)],
      );
      await pool.query(
        `INSERT INTO space_custom_field_values (space_id, field_definition_id, boolean_value) VALUES ($1,$2,$3)`,
        [sp.id, cfd['space:video_conf'], chance(0.5)],
      );
    }
  }

  return { empIds, tagIds, branches, spacesByBranch, cfd };
}

// ---- customers + relations ------------------------------------------------

function sample(arr, k) {
  const copy = arr.slice();
  const out = [];
  const n = Math.min(k, copy.length);
  for (let i = 0; i < n; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

async function seedCustomers(ref) {
  const { empIds, tagIds, branches, spacesByBranch, cfd } = ref;

  const writers = {
    customers: new CopyWriter(`COPY customers
      (id, code, first_name, last_name, email, phone, mobile, company, tax_id, customer_type, status,
       is_vip, date_of_birth, address_line, city, postal_code, profile_note, assigned_employee_id,
       registered_at, branches_count, spaces_count, bookings_count, visits_count, total_value,
       last_visit_at, next_booking_at) FROM STDIN`),
    cb: new CopyWriter(`COPY customer_branches
      (customer_id, branch_id, is_primary, visits_count, spaces_count, total_value, first_visit_at, last_visit_at) FROM STDIN`),
    cs: new CopyWriter(`COPY customer_spaces
      (customer_id, space_id, branch_id, visits_count, bookings_count, last_visit_at) FROM STDIN`),
    bookings: new CopyWriter(`COPY bookings
      (id, customer_id, branch_id, space_id, employee_id, starts_at, ends_at, status, amount) FROM STDIN`),
    visits: new CopyWriter(`COPY visits
      (customer_id, branch_id, space_id, visited_at, duration_minutes, visit_type, status) FROM STDIN`),
    payments: new CopyWriter(`COPY payments
      (customer_id, booking_id, amount, method, status, paid_at) FROM STDIN`),
    activities: new CopyWriter(`COPY activities
      (customer_id, type, description, branch_id, space_id, created_at) FROM STDIN`),
    comms: new CopyWriter(`COPY communications
      (customer_id, channel, direction, subject, body, employee_id, created_at) FROM STDIN`),
    docs: new CopyWriter(`COPY documents
      (customer_id, name, mime_type, size_bytes, url, created_at) FROM STDIN`),
    notes: new CopyWriter(`COPY notes (customer_id, body, employee_id, created_at) FROM STDIN`),
    ctags: new CopyWriter(`COPY customer_tags (customer_id, tag_id) FROM STDIN`),
    ccfv: new CopyWriter(`COPY customer_custom_field_values
      (customer_id, field_definition_id, text_value, number_value, date_value, boolean_value, json_value) FROM STDIN`),
  };
  for (const w of Object.values(writers)) await w.start();

  const membershipTypes = ['Basic', 'Premium', 'Business', 'Enterprise'];
  const methods = ['card', 'cash', 'transfer'];
  const docTypes = [
    ['Σύμβαση συνεργασίας.pdf', 'application/pdf'],
    ['Ταυτότητα.jpg', 'image/jpeg'],
    ['Τιμολόγιο.pdf', 'application/pdf'],
    ['Συμφωνητικό.pdf', 'application/pdf'],
  ];
  const notesPool = [
    'Προτιμά πρωινές ώρες.', 'Ενδιαφέρεται για μακροχρόνια συνεργασία.',
    'Ζήτησε προσφορά για εταιρικό πακέτο.', 'Χρειάζεται τιμολόγιο.',
    'Συνήθως κλείνει αίθουσα συνεδριάσεων.',
  ];

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
    const emailUser = `${greeklish(first)}.${greeklish(last)}${randInt(1, 999)}`;
    const email = `${emailUser}@${pick(['gmail.com', 'email.gr', 'yahoo.gr', 'hotmail.com'])}`;

    // relations
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

    // visits
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

    // bookings
    const nBookings = randInt(0, 6);
    let totalValue = 0;
    let nextBookingAt = null;
    const bookingRows = [];
    const paymentRows = [];
    const activityRows = [];
    for (let b = 0; b < nBookings; b++) {
      const p = pick(pairs);
      const future = chance(0.25);
      const starts = future ? futureDate(45) : pastDate(300, 1);
      const ends = new Date(starts.getTime() + randInt(1, 4) * 3600000);
      const st = future ? (chance(0.5) ? 'confirmed' : 'pending') : (chance(0.85) ? 'completed' : 'cancelled');
      const amount = randInt(4, 60) * 10;
      bookingId++;
      bookingRows.push([bookingId, i, p.br.id, p.sp.id, pick(empIds), starts, ends, st, amount]);
      const cs = csRows.find((r) => r.sp.id === p.sp.id);
      if (cs) cs.bookings++;
      if (future) {
        if (!nextBookingAt || starts < nextBookingAt) nextBookingAt = starts;
        activityRows.push([i, 'booking_created', `Νέα κράτηση – ${p.sp.name} (${p.br.name})`, p.br.id, p.sp.id, pastDate(20)]);
      } else if (st === 'completed') {
        totalValue += amount;
        cbAgg.get(p.br.id).value += amount;
        const paidAt = new Date(starts.getTime() + 3600000);
        paymentRows.push([i, bookingId, amount, pick(methods), 'paid', paidAt]);
        activityRows.push([i, 'booking_completed', `Ολοκληρωμένη κράτηση – ${p.sp.name}`, p.br.id, p.sp.id, starts]);
        activityRows.push([i, 'payment_received', `Πληρωμή €${amount}`, p.br.id, null, paidAt]);
      }
    }

    // extra activities from visits
    if (lastVisitAt) activityRows.push([i, 'visit', `Επίσκεψη – ${chosenBranches[0].name}`, chosenBranches[0].id, null, lastVisitAt]);

    // communications
    const nComms = randInt(0, 3);
    for (let c = 0; c < nComms; c++) {
      const ch = pick(['email', 'sms', 'call']);
      const created = pastDate(200);
      await writers.comms.write([i, ch, chance(0.7) ? 'outbound' : 'inbound',
        ch === 'call' ? 'Τηλεφωνική επικοινωνία' : 'Ενημέρωση πελάτη',
        'Επικοινωνία σχετικά με κράτηση/υπηρεσίες.', pick(empIds), created]);
      activityRows.push([i, 'message_sent', 'Αποστολή μηνύματος', null, null, created]);
    }

    // documents
    const nDocs = randInt(0, 2);
    for (let d = 0; d < nDocs; d++) {
      const [dn, mt] = pick(docTypes);
      const created = pastDate(500);
      await writers.docs.write([i, dn, mt, randInt(50000, 5000000), `/files/customer/${i}/${d}`, created]);
      activityRows.push([i, 'document_uploaded', `Ανέβηκε έγγραφο: ${dn}`, null, null, created]);
    }

    // notes
    const nNotes = randInt(0, 2);
    let profileNote = null;
    if (chance(0.4)) profileNote = pick(notesPool);
    for (let nt = 0; nt < nNotes; nt++) {
      const created = pastDate(400);
      await writers.notes.write([i, pick(notesPool), pick(empIds), created]);
      activityRows.push([i, 'note_added', 'Προστέθηκε σημείωση', null, null, created]);
    }

    // write customer row
    const dob = new Date(randInt(1955, 2003), randInt(0, 11), randInt(1, 28));
    const distinctSpaces = new Set(csRows.map((r) => r.sp.id)).size;
    await writers.customers.write([
      i, `C-${100000 + i}`, first, last, email,
      `+30 21${randInt(1000000, 9999999)}`, `+30 69${randInt(10000000, 99999999)}`,
      company, isCompany ? String(randInt(100000000, 999999999)) : null,
      isCompany ? 'company' : 'individual', status, isVip, dob,
      `${pick(streets)} ${randInt(1, 180)}`, cityObj.city, String(randInt(10000, 85000)),
      profileNote, pick(empIds), pastDate(1460, 30),
      chosenBranches.length, distinctSpaces, nBookings, nVisits, totalValue,
      lastVisitAt, nextBookingAt,
    ]);

    // relation rows
    for (const [bid, agg] of cbAgg.entries()) {
      const isPrimary = bid === chosenBranches[0].id;
      await writers.cb.write([i, bid, isPrimary, agg.visits, agg.spaces, agg.value, agg.first, agg.last]);
    }
    for (const cs of csRows) {
      await writers.cs.write([i, cs.sp.id, cs.br.id, cs.visits, cs.bookings, cs.last]);
    }
    for (const r of visitRows) await writers.visits.write(r);
    for (const r of bookingRows) await writers.bookings.write(r);
    for (const r of paymentRows) await writers.payments.write(r);
    for (const r of activityRows) await writers.activities.write(r);

    // tags
    const tagSlugs = new Set();
    if (isVip) tagSlugs.add('vip');
    if (isCompany) tagSlugs.add('corporate');
    if (totalValue > 800) tagSlugs.add('high-value');
    if (nVisits > 6) tagSlugs.add('frequent');
    if (chance(0.2)) tagSlugs.add('new');
    if (chance(0.15)) tagSlugs.add('gym');
    for (const slug of tagSlugs) await writers.ctags.write([i, tagIds[slug]]);

    // custom field values
    await writers.ccfv.write([i, cfd['customer:member_no'], `M-${String(200000 + i)}`, null, null, null, null]);
    if (chance(0.85)) {
      await writers.ccfv.write([i, cfd['customer:membership_type'], pick(membershipTypes), null, null, null, null]);
    }
    if (chance(0.6)) {
      await writers.ccfv.write([i, cfd['customer:expiry_date'], null, null, futureDate(700, 30).toISOString().slice(0, 10), null, null]);
    }
    if (isCompany) {
      await writers.ccfv.write([i, cfd['customer:legal_rep'], `${pick(maleFirst)} ${pick(lastNames)}`, null, null, null, null]);
      await writers.ccfv.write([i, cfd['customer:gemi'], String(randInt(100000000000, 999999999999)), null, null, null, null]);
    }

    if (i % 25000 === 0) {
      const rate = Math.round(i / ((Date.now() - startTime) / 1000));
      console.log(`  …${i.toLocaleString()} / ${N.toLocaleString()} customers (${rate}/s)`);
    }
  }

  for (const w of Object.values(writers)) await w.finish();
  return { bookingCount: bookingId };
}

async function main() {
  const t0 = Date.now();
  console.log(`Seeding SpaceHub with ${N.toLocaleString()} customers…`);

  console.log('1/3 Reference data (employees, tags, branches, spaces, custom fields)…');
  const ref = await seedReference();
  console.log(`   ${ref.branches.length} branches, ${Object.values(ref.spacesByBranch).flat().length} spaces.`);

  console.log('2/3 Customers + relations (streaming COPY)…');
  const { bookingCount } = await seedCustomers(ref);

  console.log('3/3 Fixing identity sequences + ANALYZE…');
  await pool.query("SELECT setval(pg_get_serial_sequence('customers','id'), (SELECT COALESCE(MAX(id),1) FROM customers))");
  if (bookingCount > 0) {
    await pool.query("SELECT setval(pg_get_serial_sequence('bookings','id'), (SELECT COALESCE(MAX(id),1) FROM bookings))");
  }
  await pool.query('ANALYZE');

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done in ${secs}s.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
