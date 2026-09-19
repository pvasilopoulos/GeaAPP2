# SpaceHub — Πλήρης Οδηγός Εφαρμογής

> Αυτό το έγγραφο περιγράφει **όλες τις υλοποιημένες δυνατότητες** της εφαρμογής SpaceHub, βασισμένο
> στον πραγματικό κώδικα του κλάδου `pvasilopoulos-api-import-sync` (backend `backend/src`, frontend
> `frontend/src`, schema `backend/src/db/schema.sql`). Είναι συμπληρωματικό στο [`README.md`](../README.md)
> (γρήγορο ξεκίνημα) και στο [`DEPLOY.md`](../DEPLOY.md) (οδηγός εγκατάστασης σε Plesk) — δεν τα αντικαθιστά.
>
> Σύμβαση: όπου μια δυνατότητα **λειτουργεί ήδη** με τις προεπιλεγμένες ρυθμίσεις σημειώνεται ως
> **"Λειτουργεί εξ ορισμού"**. Όπου απαιτεί **δικές σας ρυθμίσεις/διαπιστευτήρια** (π.χ. SMTP server,
> ERP endpoint, Google Maps API key) σημειώνεται ως **"Απαιτεί ρύθμιση"**. Δεν αναφέρονται δυνατότητες
> που δεν υπάρχουν στον κώδικα.

## Πίνακας περιεχομένων

1. [Αρχιτεκτονική](#1-αρχιτεκτονική)
2. [Πολυ-ενοικίαση, ρόλοι και δικαιώματα](#2-πολυ-ενοικίαση-ρόλοι-και-δικαιώματα)
3. [Οργανισμοί (tenants) και ρυθμίσεις](#3-οργανισμοί-tenants-και-ρυθμίσεις)
4. [Πελάτες, Υποκαταστήματα, Χώροι](#4-πελάτες-υποκαταστήματα-χώροι)
5. [Αναζήτηση, φίλτρα, ταξινόμηση, αποθηκευμένες προβολές](#5-αναζήτηση-φίλτρα-ταξινόμηση-αποθηκευμένες-προβολές)
6. [Προφίλ πελάτη (Customer 360)](#6-προφίλ-πελάτη-customer-360)
7. [Σημειώσεις, ετικέτες, επαφές, follow-ups & υπενθυμίσεις](#7-σημειώσεις-ετικέτες-επαφές-follow-ups--υπενθυμίσεις)
8. [ERP Connectors — Εισαγωγή / Συγχρονισμός](#8-erp-connectors--εισαγωγή--συγχρονισμός)
9. [Προσφορές (Quotes)](#9-προσφορές-quotes)
10. [Dashboard](#10-dashboard)
11. [Δραστηριότητα, Επικοινωνίες, Audit trail](#11-δραστηριότητα-επικοινωνίες-audit-trail)
12. [API — Ευρετήριο endpoints](#12-api--ευρετήριο-endpoints)
13. [Βάση δεδομένων, migrations, seeding](#13-βάση-δεδομένων-migrations-seeding)
14. [Ρύθμιση & Deployment](#14-ρύθμιση--deployment)
15. [Παραδείγματα με JSON](#15-παραδείγματα-με-json)
16. [Αντιμετώπιση προβλημάτων](#16-αντιμετώπιση-προβλημάτων)
17. [Ασφάλεια & απομόνωση tenant](#17-ασφάλεια--απομόνωση-tenant)
18. [Λειτουργικές λίστες ελέγχου (checklists)](#18-λειτουργικές-λίστες-ελέγχου-checklists)
19. [Γνωστοί περιορισμοί](#19-γνωστοί-περιορισμοί)

---

## 1. Αρχιτεκτονική

```
backend/   Express API (Node.js, ESM), raw parameterized SQL (mysql2)
  src/config.js        Ρυθμίσεις από μεταβλητές περιβάλλοντος
  src/db.js            MySQL/MariaDB connection pool + query()/withConnection() helpers
  src/db/schema.sql     Πλήρες σχήμα (drop/create, χρησιμοποιείται από db:schema)
  src/db/ensure-schema.js  Ιδιοδύναμα (idempotent) ALTER TABLE/CREATE TABLE στο boot — «ζωντανά» migrations
  src/db/seed.js, seed-data.js  Demo δεδομένα (tenants, χρήστες, πελάτες, κ.λπ.)
  src/lib/             Επιχειρησιακή λογική χωρίς εξάρτηση στο Express (εύκολα unit-testable)
  src/middleware/auth.js   JWT authentication + RBAC authorize()
  src/routes/          Ένα route module ανά resource, όλα προσαρτημένα στο src/index.js
frontend/  React 18 + Vite SPA
  src/pages/           Σελίδες (Dashboard, Customers, CustomerProfile, Quotes, Settings, Users, …)
  src/components/      Design system + customer-profile components (Overview, HistoryList, …)
  src/store/           zustand store (πολλαπλές καρτέλες ανοιχτού πελάτη)
  src/api.js           Ενιαίος API client (fetch wrapper με JWT header)
```

- **Runtime:** ένα και μοναδικό Node.js process (`backend/src/index.js`) σερβίρει και το REST API
  (`/api/*`) και το built SPA (`frontend/dist`) σε production. Σε development το Vite dev server
  (`:5173`) κάνει proxy το `/api` και `/uploads` στο backend (`:4000`).
- **Βάση δεδομένων:** MariaDB/MySQL, ένα schema, ιεραρχία κυριότητας
  `TENANT → CUSTOMER → BRANCH → SPACE`, με raw SQL (χωρίς ORM) και connection pooling
  (`mysql2/promise`, `config.mysql.connectionLimit`).
- **Εκκίνηση διακομιστή** (`src/index.js`): φορτώνει `.env`, τρέχει `ensureSchema()` (προσθέτει
  ελλείποντα columns/πίνακες/indexes αν λείπουν — «self-healing» migrations σε κάθε boot),
  ξεκινά το `scheduler` (ERP auto-sync) και ανοίγει τον HTTP server μόνο μετά από επιτυχές
  `ensureSchema()`.
- **Στατικά αρχεία:** `/uploads` (έγγραφα/φωτογραφίες πελατών) σερβίρονται στατικά· σε production
  το `frontend/dist` σερβίρεται με fallback `index.html` για client-side routing (deep links όπως
  `/customers/123` λειτουργούν).

---

## 2. Πολυ-ενοικίαση, ρόλοι και δικαιώματα

**Λειτουργεί εξ ορισμού.**

- Κάθε γραμμή στους βασικούς πίνακες (`customers`, `branches`, `spaces`, `quotes`, `connectors`,
  `follow_ups`, `activities`, …) έχει `tenant_id`. Κάθε SQL query στα routes φιλτράρει ρητά με
  `WHERE tenant_id = ?` βάσει του συνδεδεμένου χρήστη (`req.user.tenantId`) — δεν υπάρχει καθολικό
  query χωρίς φίλτρο tenant.
- **JWT authentication** (`backend/src/lib/auth.js`, `middleware/auth.js`): login επιστρέφει token
  (`jsonwebtoken`, `JWT_SECRET`/`JWT_EXPIRES_IN`), το `authenticate` middleware το επαληθεύει σε
  **κάθε** request κάτω από `/api` (εκτός `/api/auth/login`, `/api/auth/register`,
  `/api/auth/public-settings`) και **φορτώνει ξανά τον χρήστη/ρόλο/δικαιώματα από τη ΒΔ σε κάθε
  request** — έτσι μια αλλαγή δικαιωμάτων ή απενεργοποίηση χρήστη ισχύει άμεσα, χωρίς re-login.
- **Ρόλοι ανά tenant** (`roles` table): κάθε νέος οργανισμός παίρνει αντίγραφο 5 προκαθορισμένων
  ρόλων (`ROLE_TEMPLATES` στο `permissions.js`):

  | Ρόλος (key) | Ελληνικό όνομα | Ενδεικτικά δικαιώματα |
  |---|---|---|
  | `owner` | Ιδιοκτήτης | **Όλα** τα δικαιώματα του tenant, πάντα (hard-coded, όχι επεξεργάσιμο) |
  | `admin` | Διαχειριστής | Όλα εκτός `tenant.manage` |
  | `manager` | Manager | Πελάτες (ανάγνωση/εγγραφή/εξαγωγή), υποκαταστήματα/χώροι (ανάγνωση), αναφορές |
  | `agent` | Σύμβουλος | Πελάτες (ανάγνωση/εγγραφή), υποκαταστήματα/χώροι (ανάγνωση) |
  | `viewer` | Θεατής | Μόνο ανάγνωση (πελάτες, υποκαταστήματα, χώροι, αναφορές) |

  Χρήστες με `roles.manage` μπορούν να δημιουργήσουν **προσαρμοσμένους ρόλους** (`POST
  /api/roles`) και να ενεργοποιήσουν/απενεργοποιήσουν μεμονωμένα δικαιώματα από τον πλήρη κατάλογο
  (`PERMISSION_CATALOG`): `customers.*`, `branches.*`, `spaces.*`, `bookings.*`, `payments.*`,
  `communications.*`, `quotes.*`, `reports.*`, `settings.manage`, `users.manage`, `roles.manage`,
  `tenant.manage`. Ο ρόλος `owner` **δεν επεξεργάζεται ούτε διαγράφεται**· δεν μπορεί να μείνει
  tenant χωρίς κανέναν owner (server-side προστασία σε `PATCH/DELETE /api/users/:id`).
- **Επιβολή στον server**: κάθε route προστατεύεται με `authorize(PERMISSION, …)` middleware· το
  UI απλά κρύβει/απενεργοποιεί στοιχεία βάσει `req.user.permissions` — τα δικαιώματα **δεν είναι
  προαιρετικός στολισμός UI**, επιβάλλονται ξανά στον server σε κάθε endpoint.
- **Πλατφόρμα (super-admin)**: το ξεχωριστό δικαίωμα `tenants.platform` (ή flag
  `users.is_platform_admin`) ξεκλειδώνει `GET/POST/PATCH/DELETE /api/tenants` για διαχείριση **όλων**
  των οργανισμών (multi-tenant admin panel) — βλ. `TenantsPanel.jsx` στο Settings. Ο πρώτος
  `owner` που δημιουργείται σε μια καθαρή βάση γίνεται αυτόματα platform admin
  (`ensure-schema.js`).

---

## 3. Οργανισμοί (tenants) και ρυθμίσεις

**Λειτουργεί εξ ορισμού** (οι ρυθμίσεις αποθηκεύονται σε ένα `JSON` column `tenants.settings`,
χωρίς επιπλέον πίνακες· επεκτείνονται με merge-defaults ώστε παλιά tenants να μην σπάνε όταν
προστίθενται νέα κλειδιά).

### 3.1 Στοιχεία οργανισμού (`Settings → Οργανισμός`, `OrgPanel.jsx`)
`GET/PATCH /api/settings/organization` (δικαίωμα `tenant.manage`): επωνυμία, `slug` (μοναδικό,
auto-generated από το όνομα μέσω `slugify()` με αφαίρεση τόνων), locale, timezone, νόμισμα, στοιχεία
επικοινωνίας, σημειώσεις. Η εγγραφή (`/register`) δημιουργεί αυτόματα tenant + owner· ο διαχειριστής
πλατφόρμας μπορεί επίσης να δημιουργήσει tenants χειροκίνητα από το admin panel.

### 3.2 Εφαρμογή (`AppPanel.jsx`) — `GET/PATCH /api/settings/app` (δικαίωμα `settings.manage`)
- Προεπιλεγμένη χώρα, μορφή ημερομηνίας, πρώτη ημέρα εβδομάδας, προεπιλεγμένη κατάσταση πελάτη.
- `require_email` / `strict_duplicates` (αυστηρός έλεγχος διπλοεγγραφών σε email/τηλέφωνο/ΑΦΜ).
- Γλώσσα φωνητικής εισαγωγής (`voice_lang`, π.χ. `el-GR` για το `VoiceFill.jsx`).
- Επιτρέπεται σήμανση VIP (`allow_vip`).
- **Πάροχος χάρτη** (`map_provider`: google/osm/apple/bing) + `google_maps_api_key` — **Απαιτεί
  ρύθμιση**: χωρίς κλειδί εμφανίζεται placeholder/σύνδεσμος αντί για ενσωματωμένο χάρτη στην
  καρτέλα υποκαταστήματος.
- **Προτιμήσεις προβολής (`view_preferences`)**: ποιες καρτέλες/ενότητες εμφανίζονται στο προφίλ
  πελάτη (`customer_profile.tabs`, καθεμία με `key/label/icon/group/enabled/order`), προεπιλεγμένη
  καρτέλα εκκίνησης, **ύψος γραμμής στη λίστα πελατών** (`customer_list_row_height`, 44–180px, για
  πυκνή ή «αναπαυτική» προβολή λίστας) και ρυθμίσεις καρτέλας υποκαταστήματος (ώρες/χάρτης/KPI
  αναπτυγμένα ή όχι).

### 3.3 Επικοινωνίες / Messaging (`MessagingPanel.jsx`) — **Απαιτεί ρύθμιση**
`GET/PATCH /api/settings/messaging` (δικαίωμα `settings.manage`), `GET /api/settings/messaging/channels`
(κατάσταση καναλιών, ανοιχτό σε `customers.read`). Τέσσερα κανάλια, κάθε ένα ενεργό/ανενεργό +
διαπιστευτήρια:

| Κανάλι | Ρυθμίσεις | Απαιτεί για αποστολή |
|---|---|---|
| Email | `from_name`, `from_email`, `smtp_host/port/user/pass`, `smtp_secure` | SMTP server (μέσω `nodemailer`) |
| SMS | `provider`, `sender_id`, `api_url`, `api_key` | Generic HTTP SMS gateway |
| Viber | `sender_name`, `auth_token` | Viber Business Messages API |
| Telegram | `bot_token`, `bot_username` | Telegram Bot API |

Χωρίς έγκυρα διαπιστευτήρια, το backend **καταγράφει το μήνυμα ως `status: "logged"`** αντί να το
στέλνει πραγματικά (fail-soft) — δείτε `messaging.js#deliverMessage`. Τα μυστικά (`smtp_pass`,
`api_key`, `auth_token`, `bot_token`) ποτέ δεν επιστρέφονται ωμά στο API· το UI βλέπει μόνο
`has_<secret>: true/false` (`publicMessaging()`), και ένα input που ξεκινά με `•` αγνοείται κατά
την αποθήκευση (ώστε να μη «σβήνεται» κατά λάθος ένα ήδη αποθηκευμένο μυστικό).

### 3.4 Προχωρημένες υπενθυμίσεις (`RemindersPanel.jsx`) — **Λειτουργεί εξ ορισμού**
`GET/PATCH /api/settings/reminders` (δικαίωμα `settings.manage`, ανάγνωση σε `customers.read`)·
δείτε [§7.3](#73-προχωρημένες-υπενθυμίσεις-reminderssettingsjs).

### 3.5 Πλατφόρμα (`SecurityPanel.jsx`) — μόνο platform admin
`GET/PATCH /api/settings/platform`: `allow_self_register` (απενεργοποιεί το `/register`
public endpoint) και `min_password_length` (6–32, εφαρμόζεται server-side στη δημιουργία χρηστών).

---

## 4. Πελάτες, Υποκαταστήματα, Χώροι

**Λειτουργεί εξ ορισμού.**

### 4.1 Ιεραρχία κυριότητας
`TENANT → CUSTOMER → BRANCH → SPACE`. Κάθε υποκατάστημα ανήκει σε **έναν** πελάτη
(`branches.customer_id`), κάθε χώρος ανήκει σε **ένα** υποκατάστημα (`spaces.branch_id`, με
denormalized `customer_id` για γρήγορα φίλτρα). Ιστορικό (`bookings`, `visits`, `payments`,
`communications`, `documents`, `notes`, `activities`, `follow_ups`) είναι πάντα customer-scoped.

### 4.2 Πελάτης (`customers`)
- Κωδικός (`code`), όνομα/επώνυμο (ή εταιρεία), τύπος (`individual`/`company`), κατάσταση
  (`active`/`inactive`/`prospect`), σήμανση **VIP**, ΑΦΜ, στοιχεία επικοινωνίας, διεύθυνση,
  φωτογραφία (avatar upload), ελεύθερο πεδίο σημειώσεων προφίλ.
- **Πολλαπλές επαφές** (`customer_contacts`): ρόλος (Κύρια επαφή/Διευθυντής/Λογιστήριο/…),
  στοιχεία επικοινωνίας, σήμανση κύριας επαφής.
- **Ζωντανές ετικέτες** (`tags` / `customer_tags`): κοινό λεξιλόγιο ετικετών με χρώμα, πολλά προς
  πολλά με πελάτες.
- **Έλεγχος διπλοεγγραφών** πριν τη δημιουργία (`POST /api/customers/check-duplicates`): εντοπίζει
  υπάρχοντες πελάτες με ίδιο email/τηλέφωνο/ΑΦΜ· αν το `strict_duplicates` είναι ενεργό στις
  ρυθμίσεις, το UI εμποδίζει την αποθήκευση.
- **Denormalized aggregates** στη γραμμή πελάτη (`branches_count`, `spaces_count`,
  `bookings_count`, `visits_count`, `total_value`, `last_visit_at`, `next_booking_at`,
  `next_action_at/note/followup_id`) — κρατά τη λίστα γρήγορη χωρίς JOIN σε 350k+ εγγραφές.
- **`erp_id`**: μοναδικό ανά tenant (`uq_customers_tenant_erp_id`)· κλειδί ταύτισης για το ERP sync
  (§8). Δημιουργία μέσα από το UI δεν απαιτεί `erp_id` (μόνο το ERP sync το γεμίζει/χρησιμοποιεί).

### 4.3 Υποκατάστημα (`branches`)
Κατάσταση (`active`/`renovation`/`closed`), ωράριο λειτουργίας ανά ημέρα (JSON, με προεπιλογή
Δευ–Παρ 09:00–18:00, Σαβ 10:00–16:00 κλειστό, Κυρ κλειστό), υπεύθυνος (employee), συντεταγμένες
χάρτη (`lat/lng`), εικόνα, denormalized KPIs (`spaces_count`, `visits_count`, `total_value`,
`last_visit_at`).

### 4.4 Χώρος (`spaces`)
Τύπος χώρου, χωρητικότητα, όροφος, τιμολόγηση (`hourly_price`, `daily_price`,
`weekend_hourly_price`), κανόνες κράτησης (`min_duration_minutes`, `slot_step_minutes`,
`buffer_minutes`), παροχές (checklist από `AMENITIES` — Wi-Fi, projector, parking, A/C, …),
κατάσταση (`available`/`maintenance`/`inactive`), εικόνα, περιγραφή.

### 4.5 Δυναμικά προσαρμοσμένα πεδία (Custom Fields)
**Λειτουργεί εξ ορισμού** — τυποποιημένη (typed-value) αρχιτεκτονική, χωρίς dynamic ALTER TABLE:
- `custom_field_definitions`: ένα per-tenant σχήμα ανά τύπο οντότητας (`customer`/`branch`/`space`),
  με τύπο πεδίου (`text`, `long_text`, `number`, `date`, `boolean`, `select`, `multiselect`, …),
  `required`/`searchable`/`filterable`/`visible_in_list`, ενότητα (section) εμφάνισης, σειρά, και
  ρυθμίσεις (`settings` JSON — π.χ. επιλογές `select` ή εμφάνιση υπό όρους `showIf`).
  Κάθε νέος tenant παίρνει έτοιμα δείγματα (αριθμός μέλους, τύπος συνδρομής, ΓΕΜΗ, θέσεις parking,
  ηχοσύστημα, …) μέσω `CUSTOM_FIELD_TEMPLATES`.
- Οι **τιμές** αποθηκεύονται σε ξεχωριστούς πίνακες (`customer_custom_field_values`,
  `branch_custom_field_values`, `space_custom_field_values`) με 5 τυποποιημένες στήλες
  (`text_value`, `number_value`, `date_value`, `boolean_value`, `json_value`) — επιτρέπει σωστή
  ταξινόμηση/φιλτράρισμα ανά τύπο δεδομένων χωρίς EAV string-only προβλήματα.
- Διαχείριση από `Settings → Custom Fields` (`CustomFieldsPanel.jsx`, δικαίωμα `settings.manage`):
  δημιουργία, επεξεργασία, αναδιάταξη (`PATCH /reorder`), αντιγραφή, διαγραφή.

---

## 5. Αναζήτηση, φίλτρα, ταξινόμηση, αποθηκευμένες προβολές

**Λειτουργεί εξ ορισμού** — σχεδιασμένο ώστε να **μην φορτώνει ποτέ όλους τους πελάτες**.

### 5.1 Έξυπνη αναζήτηση χωρίς DB extensions
`backend/src/lib/normalize.js`: μετατρέπει ελληνικό κείμενο σε πεζά ASCII λατινικά (π.χ.
«Παπαδόπουλος» → `papadopoylos`), αφαιρώντας τόνους/διαλυτικά, και το ίδιο μετασχηματισμό
εφαρμόζεται στο κείμενο αναζήτησης. Το αποτέλεσμα αποθηκεύεται στη στήλη `search_norm`
(`VARCHAR(768) CHARACTER SET ascii`) πάνω σε **InnoDB FULLTEXT** index
(`ft_customers_search`, `ft_branches_search`, `ft_spaces_search`).
`backend/src/lib/search.js`: χτίζει `MATCH() AGAINST(... IN BOOLEAN MODE)` με prefix wildcard ανά
token (`+token*`) — γρήγορη, index-backed αναζήτηση με **case/accent/script-insensitivity** χωρίς
οποιοδήποτε MySQL plugin. Για πολύ κοντά ερωτήματα (κάτω από το ελάχιστο μήκος token FULLTEXT,
3 χαρακτήρες) γίνεται fallback σε `LIKE '%...%'`.
Global search (`GET /api/search/global?q=`) ομαδοποιεί αποτελέσματα σε πελάτες/υποκαταστήματα/χώρους
(`GlobalSearch.jsx` command-palette στο UI).

### 5.2 Φίλτρα & ταξινόμηση καταλόγου (`GET /api/customers/search`)
Server-side φιλτράρισμα με keyset (cursor-based) **ή** σελιδοποίηση με αριθμό σελίδας, ώστε να μη
χρειάζεται `OFFSET` σε μεγάλους πίνακες. Υποστηριζόμενες παράμετροι: `q`, `branchId`, `spaceId`,
`status`, `customerType`, `tag`, `isVip`, `lastVisitFrom/To`, `sort`, `cursor`, `limit` — πλέον
δυναμικά φίλτρα σε **custom fields** (`customerFilters.js#buildFilters`) όταν είναι σημασμένα
`filterable`. Η ταξινόμηση χρησιμοποιεί σύνθετα (tenant-prefixed) B-tree indexes ώστε το keyset
pagination να μένει γρήγορο ακόμα και σε βαθιές σελίδες (π.χ. `idx_customers_lastvisit_keyset`,
`idx_customers_value_keyset`, `idx_customers_name_keyset`).
Πλευρική μπάρα φίλτρων: `FilterDrawer.jsx` (Customers.jsx).

### 5.3 Αποθηκευμένες προβολές (Saved Views)
`customer_saved_views`: κάθε χρήστης μπορεί να αποθηκεύσει ένα συνδυασμό φίλτρων/ταξινόμησης/
στηλών ως **προσωπική** ή **κοινόχρηστη** (`visibility: personal|shared`) προβολή, να ορίσει μία ως
προεπιλεγμένη (`is_default`), να την αντιγράψει (`POST /:id/duplicate`) ή να τη μετονομάσει/
επεξεργαστεί. Endpoints: `GET/POST/PATCH/DELETE /api/customer-views`.

### 5.4 Ύψος γραμμής λίστας & mobile
- `customer_list_row_height` (44–180px, ρυθμίσιμο ανά tenant στο `AppPanel.jsx`, §3.2) — εναλλαγή
  ανάμεσα σε συμπαγή και «αναπαυτική» προβολή λίστας πελατών.
- Το UI (React + Vite SPA) είναι responsive: `TabBar.jsx`, `FilterDrawer.jsx` και η σελίδα
  `Customers.jsx` προσαρμόζονται σε μικρές οθόνες (mobile browsers)· δεν υπάρχει ξεχωριστή native
  mobile εφαρμογή — είναι η ίδια SPA προσαρμοστική σε κινητό/tablet/desktop.

---

## 6. Προφίλ πελάτη (Customer 360)

**Λειτουργεί εξ ορισμού**, με ρυθμιζόμενη ορατότητα καρτελών (§3.2).

Η σελίδα `CustomerProfile.jsx` οργανώνεται σε **καρτέλες** (tabs), καθεμία ενεργοποιήσιμη/
απενεργοποιήσιμη και αναδιατάξιμη ανά tenant μέσω `view_preferences.customer_profile.tabs`:

| Καρτέλα (`key`) | Περιεχόμενο | Component |
|---|---|---|
| `overview` | Σύνοψη στοιχείων, KPI, γρήγορες ενέργειες | `Overview.jsx` |
| `contacts` | Πολλαπλές επαφές πελάτη | `ContactsPanel.jsx` |
| `branches` | Υποκαταστήματα & χώροι του πελάτη | `BranchesSpaces.jsx` |
| `bookings` | Κρατήσεις | `HistoryList.jsx` |
| `payments` | Πληρωμές | `HistoryList.jsx` |
| `communications` | Ιστορικό επικοινωνιών (email/SMS/Viber/Telegram) | `HistoryList.jsx` |
| `documents` | Έγγραφα/αρχεία πελάτη | `HistoryList.jsx` |
| `notes` | Σημειώσεις, ετικέτες, υπενθυμίσεις (§7) | `CustomerKnowledgePanel.jsx` |
| `activity` | Χρονολόγιο δραστηριότητας (audit) | `HistoryList.jsx` |
| `branch_actions` | Ενέργειες ανά υποκατάστημα | `BranchActivityList.jsx` |
| `branch_invoices` | Τιμολόγια ανά υποκατάστημα | `BranchActivityList.jsx` |

- **Πολλαπλές καρτέλες εργασιακού χώρου (in-app tabs)**: ο χρήστης μπορεί να ανοίξει πολλούς
  πελάτες ταυτόχρονα σε tabs μέσα στην ίδια σελίδα (όχι browser tabs) — διαχειρίζεται με `zustand`
  store (`frontend/src/store`) και εμφανίζεται στο `TabBar.jsx`· η κατάσταση κάθε ανοιχτού πελάτη
  διατηρείται όταν αλλάζετε καρτέλα.
- **Drawer χρήσης χώρου**: `GET /api/customers/:id/spaces/:spaceId/usage` τροφοδοτεί ένα πλευρικό
  panel με ιστορικό χρήσης συγκεκριμένου χώρου από τον πελάτη.
- **Custom fields** εμφανίζονται δυναμικά στο προφίλ (Επισκόπηση) βάσει των οριζόμενων ενοτήτων
  (`section`) και συνθηκών εμφάνισης (`showIf`).

---

## 7. Σημειώσεις, ετικέτες, επαφές, follow-ups & υπενθυμίσεις

**Λειτουργεί εξ ορισμού.**

### 7.1 Σημειώσεις (`notes`, `backend/src/lib/notes.js`)
- Πλούσιο κείμενο (HTML με βασικό sanitization — αφαιρεί `<script>` tags), τίτλος, κατηγορία
  (ελεύθερο κείμενο, π.χ. `general`), **καρφίτσωμα** (`is_pinned`), **αρχειοθέτηση**
  (`is_archived`), έως **8 ετικέτες** ανά σημείωση (`parseNoteTags`, μέχρι 30 χαρακτήρες/ετικέτα,
  case-insensitive dedup).
- **Υπενθύμιση σημείωσης** (`due_at`): κατάσταση badge `none`/`upcoming`/`due_soon`/`overdue`
  (`noteReminderState()`) — μια αρχειοθετημένη σημείωση δεν υπενθυμίζει ποτέ.
- Endpoints: `GET/POST /api/customers/:id/notes`, `PATCH/DELETE /api/customers/:id/notes/:noteId`.
  Στο UI: `CustomerKnowledgePanel.jsx` (αναζήτηση, φίλτρο κατηγορίας/ετικέτας, εμφάνιση
  αρχειοθετημένων).

### 7.2 Follow-ups (`follow_ups`, `backend/src/routes/followUps.js`, `lib/followUps.js`)
Ξεχωριστός πίνακας/entity από τις σημειώσεις — σχεδιασμένος ως **η μοναδική πηγή αλήθειας** για
την «επόμενη ενέργεια» του πελάτη:
- Τίτλος, περιγραφή, ημερομηνία λήξης (`due_at`), υπεύθυνος υπάλληλος (προαιρετικός,
  επικυρώνεται ότι ανήκει στο ίδιο tenant), κατάσταση `open`/`completed`/`cancelled`.
- **`syncCustomerNextAction()`**: μετά από κάθε δημιουργία/επεξεργασία/διαγραφή/ολοκλήρωση follow-up,
  ξαναϋπολογίζει τα `customers.next_action_at/note/followup_id` από το **νωρίτερο ανοιχτό**
  follow-up του πελάτη — διορθώνει παλιό bug όπου το «επόμενο βήμα» έμενε μπαγιάτικο όταν άλλαζε ο
  τίτλος ενός follow-up ή υπήρχαν διπλότυποι τίτλοι.
- **Αναβολή (snooze)**: `PATCH /api/follow-ups/:id/snooze` με λεπτά αναβολής· η νέα ημερομηνία
  υπολογίζεται από `max(now, τρέχον due_at)` + λεπτά, με ανώτατο όριο 4 εβδομάδων ανά αίτημα.
- Φίλτρα λίστας: `scope=today|overdue|open`, ανά πελάτη (`customerId`).
- Endpoints: `GET/POST /api/follow-ups`, `PATCH /:id`, `PATCH /:id/snooze`, `DELETE /:id`,
  `GET /api/customers/:id/follow-ups`.

### 7.3 Προχωρημένες υπενθυμίσεις (`reminderSettings.js`)
Οι ρυθμίσεις υπενθυμίσεων είναι **tenant-scoped** (αποθηκεύονται στο `tenants.settings.reminders`)
και επηρεάζουν πώς υπολογίζεται η κατάσταση ενός follow-up:

| Ρύθμιση | Προεπιλογή | Περιγραφή |
|---|---|---|
| `enabled` | `true` | Γενική ενεργοποίηση συστήματος υπενθυμίσεων |
| `defaultTime` | `09:00` | Ώρα που εφαρμόζεται όταν δίνεται μόνο ημερομηνία (χωρίς ώρα) |
| `defaultLeadMinutes` | `60` | Πόσα λεπτά πριν τη λήξη κάτι θεωρείται «σύντομα» (`due_soon`) |
| `leadMinutesOptions` | `[15,60,240,1440]` | Επιλογές lead time στο UI |
| `workingDays` | Δευ–Παρ (`[1..5]`) | Εργάσιμες ημέρες (0=Κυριακή) |
| `workingHoursStart/End` | `09:00`–`18:00` | Ωράριο εργασίας |
| `overdueBehavior` | `always` | `always` = ληξιπρόθεσμο αμέσως· `respect_working_hours` = παραμένει `due_soon` εκτός ωραρίου εργασίας |
| `snoozeMinutesOptions` | `[15,60,240,1440]` | Επιλογές αναβολής στο UI |
| `channels` | `['in_app']` | Ποια κανάλια ειδοποίησης χρησιμοποιούνται (in-app/email/sms/viber/telegram) |
| `notifyAssigneeOnly` | `true` | Αν `false`, ειδοποιούνται όλοι οι χρήστες αντί μόνο ο ανατεθειμένος |

Η συνάρτηση `computeReminderState(dueAt, status, settings, now, timezone)` υπολογίζει μία από τις
καταστάσεις `completed`/`cancelled`/`due_soon`/`overdue`/`upcoming`, λαμβάνοντας υπόψη το IANA
timezone του tenant (`Intl.DateTimeFormat` ανά ζώνη ώρας) — χρησιμοποιείται στο dashboard, στη λίστα
follow-ups και στο badge του προφίλ πελάτη. **Σημείωση:** τα κανάλια `email`/`sms`/`viber`/
`telegram` για ειδοποιήσεις υπενθυμίσεων απαιτούν τα ίδια διαπιστευτήρια Messaging του §3.3
(**Απαιτεί ρύθμιση** για πραγματική αποστολή· χωρίς αυτά λειτουργούν μόνο in-app badges/λίστες).

### 7.4 Επαφές & Ετικέτες πελάτη
Βλ. §4.2 — `customer_contacts` (`GET/POST/PATCH/DELETE /api/customers/:id/contacts/:contactId`) και
`customer_tags` (`POST/DELETE /api/customers/:id/tags/:tagId`).

### 7.5 Ιστορικό (History)
Κρατήσεις, επισκέψεις, πληρωμές, επικοινωνίες, έγγραφα — read-only λίστες ανά πελάτη
(`GET /api/customers/:id/bookings|visits|payments|communications|documents`), με μεταφόρτωση
εγγράφων μέσω `POST /api/customers/:id/documents` (multipart, αποθήκευση στο `backend/uploads/`).

---

## 8. ERP Connectors — Εισαγωγή / Συγχρονισμός

**Απαιτεί ρύθμιση** (χρειάζεται πραγματικό ERP endpoint)· η μηχανή συγχρονισμού λειτουργεί πλήρως
μόλις οριστεί ένας connector.

### 8.1 Τι είναι ένας connector (`connectors` table, `routes/connectors.js`)
Ένας connector περιγράφει **πώς να διαβαστεί** ένα ERP REST endpoint και **πώς να αντιστοιχιστούν**
τα πεδία του σε πελάτες/υποκαταστήματα/χώρους:

| Πεδίο | Περιγραφή |
|---|---|
| `name`, `base_url` | Όνομα, URL του ERP endpoint |
| `target_entity` | `customers` \| `branches` \| `spaces` — ποια οντότητα συγχρονίζει αυτός ο connector |
| `method` | `GET`/`POST`/… |
| `auth_type` | `bearer` \| `api-key` \| `basic` — τα διαπιστευτήρια κρυπτογραφούνται (§8.5) |
| `body_template` | Σώμα αιτήματος (για POST) |
| `headers` | Επιπλέον HTTP headers (JSON) |
| `response_encoding` | `auto` \| `utf8` \| `windows-1253` \| `windows-1258` (§8.4) |
| `mappings` | JSON path mapping ERP πεδίων → πεδία SpaceHub (§8.2) |
| `schedule_minutes` | Κάθε πόσα λεπτά τρέχει αυτόματα (scheduler, §8.3) |
| `enabled` | Ενεργοποίηση αυτόματου συγχρονισμού |
| `timeout_ms` | Timeout αιτήματος (default 30000) |
| `retry_count` | Αριθμός επαναλήψεων σε αποτυχία (0–5, default 3) |

Διαχείριση από `Settings → ERP Connectors` (`ConnectorsPanel.jsx`, δικαίωμα `settings.manage`):
`GET/POST/PATCH/DELETE /api/connectors`, εκτέλεση χειροκίνητα (`POST /api/connectors/:id/run`),
προβολή ιστορικού τρεξιμάτων (`GET /api/connectors/:id/runs`), επανάληψη αποτυχημένου run
(`POST /api/connectors/:id/runs/:runId/retry`).

### 8.2 Mappings & ERP IDs (`lib/mapping.js`, `lib/sync.js`)
- `mappings.sources.<entity>`: JSON path μέσα στο response όπου βρίσκεται το array εγγραφών (π.χ.
  `"data.customers"`). Αν λείπει, χρησιμοποιείται το όνομα της οντότητας ή, αν το ίδιο το response
  είναι array, ολόκληρο το response.
- `mappings.<entity>`: αντιστοίχιση `{ πεδίο_SpaceHub: "json.path.στο.ERP" }`. Υποχρεωτικά πεδία:
  `erp_id` για κάθε entity, `name` για branches/spaces, `code` ή `name` για customers
  (`validateMappings()` απορρίπτει connector χωρίς αυτά).
  Για πελάτες υπάρχουν **έξυπνα fallback aliases** (`mapEntityRecord()`): αν λείπει το `company`,
  δοκιμάζονται `company_name`/`trade_name`· για `address_line` δοκιμάζονται `address_street`/
  `address`· για `tax_id` δοκιμάζεται `vat_number`· κ.ο.κ.
- **Ταύτιση οντοτήτων (ERP IDs)**: κάθε εγγραφή ταυτοποιείται με `erp_id` (μοναδικό ανά tenant, +
  γονικό ERP ID για branches/spaces — `customer_erp_id`/`branch_erp_id`) και γίνεται **upsert**
  (ενημέρωση αν υπάρχει, εισαγωγή αν όχι) — ποτέ διπλοεγγραφή. Branches πρέπει να αναφέρονται σε
  ήδη-γνωστό `customer_erp_id`, spaces σε ήδη-γνωστό `branch_erp_id` (μέσα στο ίδιο run ή ήδη
  αποθηκευμένο) — αλλιώς το run αποτυγχάνει με σαφές μήνυμα σφάλματος.
- **`mappings.<entity>.custom_fields`**: `{ κλειδί_ή_id_custom_field: "json.path" }` — γεμίζει
  αυτόματα τα typed-value custom fields (§4.5) απευθείας από το ERP response κατά το sync.
- Ο μηχανισμός γράφει επίσης το `search_norm` (transliterated) ώστε οι νέες/ενημερωμένες εγγραφές
  να είναι αμέσως αναζητήσιμες.

### 8.3 Scheduler (`lib/scheduler.js`)
Ένας εσωτερικός `setInterval` κάθε 60 δευτερόλεπτα ελέγχει ποιοι ενεργοποιημένοι connectors
(`enabled = 1`) έχουν περάσει το `schedule_minutes` τους από το τελευταίο `last_run_at` και τους
τρέχει αυτόματα (ένα-τη-φορά ανά connector, με in-memory `Set` που αποτρέπει ταυτόχρονα
τρεξίματα). Ξεκινά αυτόματα με το boot του server και ρίχνει μόνο log σφάλματος αν αποτύχει ένα
run (δεν σταματά τον server).

### 8.4 Retries, encoding, monitoring
- **Retries με exponential backoff** (`schedulerPolicy.js#retryDelay`): `min(30000ms, 250ms · 2^attempt)`,
  μέχρι `retry_count` προσπάθειες.
- **Ανίχνευση encoding** (`responseEncoding.js`): αν το ERP απαντά σε `windows-1253`/`windows-1258`
  (συνηθισμένο σε ελληνικά legacy ERP), το σύστημα δοκιμάζει πολλαπλά charset (ρητό ρυθμισμένο →
  content-type header → `utf8`/`windows-1253`/`windows-1258`) και επιλέγει το αποτέλεσμα με το
  **καλύτερο σκορ** (περισσότεροι έγκυροι ελληνικοί χαρακτήρες, λιγότεροι χαρακτήρες `�`).
- **Παρακολούθηση (`sync_runs` table, `syncMonitoring.js`)**: κάθε run καταγράφεται με
  `status` (`running`/`success`/`failed`), `records_seen`, `records_upserted`, `error_count`,
  `error_message`, χρόνους έναρξης/λήξης. Μόνο ένα `running` run επιτρέπεται ανά connector
  ταυτόχρονα (409 `SYNC_IN_PROGRESS` αλλιώς). Μόνο `failed` runs μπορούν να επαναληφθούν
  (`canRetrySyncRun()`).
- Ολόκληρο το upsert (πελάτες → υποκαταστήματα → χώροι, με σωστή σειρά για foreign keys) τρέχει σε
  **μία transaction** (`withConnection` + `beginTransaction`/`commit`/`rollback`) — αποτυχία σε
  οποιοδήποτε σημείο κάνει πλήρες rollback, όχι μερική εισαγωγή.

### 8.5 Ασφάλεια διαπιστευτηρίων
Τα credentials ενός connector κρυπτογραφούνται με **AES-256-GCM**
(`connectorCrypto.js`, κλειδί = SHA-256 του `CONNECTOR_SECRET`/`JWT_SECRET`) πριν αποθηκευτούν στη
στήλη `credentials_enc`· το API `redactConnector()` **ποτέ δεν επιστρέφει** τα credentials, μόνο
`hasCredentials: true/false`.

---

## 9. Προσφορές (Quotes)

**Λειτουργεί εξ ορισμού** για δημιουργία/επεξεργασία/PDF χειροκίνητων προσφορών· η **αυτόματη
άντληση γραμμών από ERP** (§9.2) **Απαιτεί ρύθμιση**, και η **αποστολή email** απαιτεί τη ρύθμιση
Messaging (§3.3).

### 9.1 Δομή προσφοράς (`quotes`, `quote_lines`)
Σειρά + αριθμός (μοναδικό ζεύγος ανά tenant), ημερομηνία, πελάτης/υποκατάστημα, πρότυπο email,
όροι πληρωμής, ισχύς έως, πωλητής, έτη αναφοράς, ημερομηνία πληρωμής, σημαία αποστολής email.
Κάθε γραμμή: περιγραφή, ποσότητα, τιμή μονάδας, έκπτωση %, ΦΠΑ % (default 24%), υπολογιζόμενο
σύνολο γραμμής, και **`metadata` (JSON)** — βλ. §9.2.
Ο υπολογισμός συνόλων (`totals()` στο `routes/quotes.js`) γίνεται server-side στη δημιουργία/
ενημέρωση: καθαρή αξία = ποσότητα × τιμή × (1 − έκπτωση%), ΦΠΑ = καθαρή × ΦΠΑ%, σύνολο γραμμής =
καθαρή + ΦΠΑ· τα ίδια αθροίζονται σε `subtotal`/`tax_total`/`total` της προσφοράς.

### 9.2 Δυναμική αντιστοίχιση γραμμών από ERP JSON response (`quoteLineMapping.js`)
`POST /api/quotes/resolve-lines` (δικαίωμα `quotes.fetch_lines`): καλεί το **ERP API προσφορών**
που έχει ρυθμιστεί στο tenant (`tenants.settings.quote_api`: `enabled`, `url`, `method`,
`body_template`, `headers`, `auth`, `timeout_ms`, `debug`, `response_path` — προεπιλογή
`"lines"`) και μετατρέπει **κάθε αντικείμενο** του επιστρεφόμενου array σε μία γραμμή προσφοράς.
Ο server εμπλουτίζει τα δεδομένα της φόρμας με πλήρη στοιχεία πελάτη/υποκαταστήματος (lookup στο
DB) πριν κάνει render το `body_template`, οπότε διαθέσιμα placeholders είναι: `{{customerId}}`,
`{{customerErpId}}`, `{{customerCode}}`, `{{customerName}}`, `{{customerCompany}}`,
`{{customerTaxId}}`, `{{customerEmail}}`, `{{customerPhone}}`, `{{branchId}}`, `{{branchErpId}}`,
`{{branchCode}}`, `{{branchName}}`, `{{branchCity}}`, `{{branchAddress}}`, `{{series}}`,
`{{quoteNumber}}`, `{{quoteDate}}`, `{{validUntil}}`, `{{paymentTerms}}`, `{{sellerId}}`,
`{{referenceStartYear}}`, `{{referenceEndYear}}`, `{{paymentDueDate}}` (μοιράζεται τον ίδιο
`renderPushTemplate` μηχανισμό με το §9.6, οπότε το `{{field}}` δουλεύει είτε γραμμένο μέσα σε
εισαγωγικά είτε όχι):

- **Χωρίς προκαθορισμένο σχήμα** — οποιοδήποτε ERP JSON αντικείμενο γίνεται αποδεκτό.
- Γνωστά **aliases** αναγνωρίζουν τα βασικά, υπολογίσιμα πεδία ανεξάρτητα από την ονομασία που
  χρησιμοποιεί το ERP:

  | Πεδίο SpaceHub | Πιθανά ERP κλειδιά (με αυτή τη σειρά προτεραιότητας) |
  |---|---|
  | `description` | `description`, `name`, `title`, `item_name` |
  | `quantity` | `quantity`, `qty` |
  | `unit_price` | `unit_price`, `price`, `unitPrice`, `amount`, `value` |
  | `discount_percent` | `discount_percent`, `discount` |
  | `tax_percent` | `tax_percent`, `tax`, `vat` |

  Αν ένα alias υπάρχει αλλά δεν είναι αριθμητικό, το σύστημα δοκιμάζει το επόμενο alias στη λίστα.
  Ελλείποντα αριθμητικά πεδία παίρνουν λογικές προεπιλογές (ποσότητα 1, τιμή 0, έκπτωση 0%, ΦΠΑ 24%).
- **Πλήρης διατήρηση του αρχικού αντικειμένου ERP** ως `metadata` σε κάθε γραμμή — καμία πληροφορία
  δεν χάνεται ακόμα κι αν δεν αντιστοιχεί σε γνωστό alias· χρήσιμο για custom στήλες/εμφάνιση
  αργότερα ή έλεγχο/debugging.
- Οι γραμμές επιστρέφονται στο UI (`Quotes.jsx`) έτοιμες προς επεξεργασία πριν την οριστική
  αποθήκευση της προσφοράς.

### 9.3 Ροή κατάστασης προσφοράς (`quoteWorkflow.js`)
Πεπερασμένη μηχανή καταστάσεων, επιβεβλημένη server-side στο `POST /api/quotes/:id/status`:

```
draft ──▶ ready ──▶ sent ──▶ accepted
  │          │         ├───▶ rejected
  ▼          ▼         └───▶ expired
cancelled  cancelled         (καμία περαιτέρω μετάβαση)
                    (draft ⇄ ready επιτρέπεται και τα δύο)
```

Μη επιτρεπτή μετάβαση επιστρέφει `409` με μήνυμα `Δεν επιτρέπεται μετάβαση από X σε Y`. Κάθε
αλλαγή κατάστασης καταγράφεται στο audit trail (`quote_status_changed`, §11).

### 9.4 PDF (`GET /api/quotes/:id/pdf`)
Δημιουργεί PDF με `pdfkit` και ενσωματωμένη γραμματοσειρά **DejaVu Sans** (regular + bold) ώστε τα
ελληνικά να αποδίδονται σωστά χωρίς εξωτερικές εξαρτήσεις συστήματος. Καταγράφει
`pdf_generated_at` στην προσφορά για audit σκοπούς.

### 9.5 Αποστολή email (`POST /api/quotes/:id/send`) — **Απαιτεί ρύθμιση Messaging (§3.3)**
Επιτρέπεται μόνο από καταστάσεις `draft`/`ready`/`sent`. Χρησιμοποιεί το configured κανάλι email
(`deliverMessage('email', …)`)· καταγράφει την απόπειρα στο `communications` table
(κανάλι `email`, κατεύθυνση `outbound`) ανεξαρτήτως επιτυχίας, ενημερώνει
`email_sent`/`email_sent_at`/`status` (→ `sent` αν πετύχει, αλλιώς παραμένει με `status_error`), και
γράφει activity `quote_email_sent` με το αποτέλεσμα παράδοσης. Χωρίς SMTP διαπιστευτήρια το
μήνυμα καταγράφεται ως `logged`/αποτυγχάνει με σαφές σφάλμα αντί να αποτυγχάνει σιωπηλά.

### 9.6 Αποστολή προσφοράς στο ERP (`POST /api/quotes/:id/push-erp`) — **Απαιτεί ρύθμιση, δικαίωμα `quotes.send_erp`**
Χειροκίνητο κουμπί **«Αποστολή στο ERP»** στη σελίδα προσφοράς· αντίστροφη κατεύθυνση από το §9.2
(εκεί το ERP δίνει τις γραμμές, εδώ ολόκληρη η προσφορά — header + array γραμμών — στέλνεται προς
τα έξω). Ρυθμίζεται στο **Ρυθμίσεις → Προσφορές / ERP API** (`tenants.settings.quote_push_api`:
`enabled`, `url`, `method`, `headers`, `body_template`, `auth`, `timeout_ms`, `debug`,
`response_id_path` — προεπιλογή `"id"`).

- Το `body_template` χρησιμοποιεί το ίδιο μηχανισμό `{{field}}` → `JSON.stringify(value)` με το
  two-way sync των connectors (`renderPushTemplate` σε `lib/pushSync.js`, reused εδώ) — γράφεται
  **χωρίς εισαγωγικά** γύρω από τα placeholders ώστε strings/αριθμοί/arrays να βγαίνουν σωστά
  τυποποιημένα. Διαθέσιμα scalar πεδία: `quoteId`, `series`, `quoteNumber`, `quoteDate`,
  `validUntil`, `status`, `customerId`, `customerErpId`, `customerName`, `customerCompany`,
  `branchId`, `branchErpId`, `branchName`, `sellerId`, `paymentTerms`, `paymentDueDate`,
  `referenceStartYear`, `referenceEndYear`, `subtotal`, `taxTotal`, `total`. Το `{{lines}}`
  επεκτείνεται σε **ολόκληρο JSON array** με ανά γραμμή: `description`, `quantity`, `unitPrice`,
  `discountPercent`, `taxPercent`, `lineTotal`.
- `POST /api/quotes/push-preview` κάνει dry-run rendering του template πάνω σε δείγμα δεδομένων
  (χωρίς πραγματικό HTTP call) — χρησιμοποιείται από το κουμπί «Δοκιμή template με δείγμα» στις
  ρυθμίσεις για επαλήθευση πριν αποθηκευτεί.
- Με επιτυχία (`2xx`): προαιρετική εξαγωγή του ERP ID της απάντησης μέσω `response_id_path`
  (`getPath`, ίδιο helper με τους connectors) και αποθήκευση σε `quotes.erp_id`· ενημερώνει επίσης
  `erp_pushed_at`/`erp_push_status = 'sent'`, καθαρίζει το `erp_push_error`, γράφει activity
  `quote_pushed_erp` και audit entry.
- Με αποτυχία (network error ή μη-2xx): `erp_push_status = 'failed'` + `erp_push_error` με το
  μήνυμα/HTTP status, εμφανίζεται στο UI της προσφοράς.

### 9.7 Κοινό ERP HTTP client (`lib/erpClient.js`) — αυθεντικοποίηση, timeout, debug
Και τα δύο endpoints του §9.2/§9.6 (και το dry-run `POST /api/quotes/fetch-preview` του §9.2)
καλούν το ERP μέσω κοινού helper (`callConfiguredErp`) που προσθέτει στα δύο tenant configs
(`quote_api`, `quote_push_api`) τα εξής παραμετρικά πεδία:

- **`enabled`** (boolean, default `true`) — απενεργοποιεί προσωρινά την ενσωμάτωση χωρίς να
  χρειάζεται να σβηστεί το URL/template· επιστρέφει `422` αν κάποιος προσπαθήσει να τη
  χρησιμοποιήσει ενώ είναι ανενεργή.
- **`auth`** (`{ type: 'none'|'bearer'|'basic'|'apikey', token, username, password,
  api_key_name, api_key_value, api_key_in: 'header'|'query' }`) — αντί να γράφεις χειροκίνητα
  `Authorization` header μέσα στο πεδίο Headers, επιλέγεις τύπο αυθεντικοποίησης και ο server
  φτιάχνει μόνος του το σωστό header (ή query param για API key).
- **`timeout_ms`** (default `30000`, όρια `2000`–`120000`) — configurable timeout ανά endpoint.
- **`debug`** (boolean, default `false`) — όταν ενεργό, η απάντηση του API (`resolve-lines` ή
  `push-erp`) περιλαμβάνει επιπλέον πεδίο `debug: { request, response }` με το ακριβές αίτημα
  (URL, method, headers — με τα secrets masked, body) και την ακριβή απάντηση του ERP (status,
  headers, body). Το frontend (`Quotes.jsx`) εμφανίζει αυτό αυτόματα σε αναδυόμενο panel μετά από
  κάθε κλήση («Λήψη γραμμών» ή «Αποστολή στο ERP»), ώστε να μπορεί κανείς να διαγνώσει προβλήματα
  template/αυθεντικοποίησης χωρίς πρόσβαση στα server logs.
- **GET requests**: το rendered body μετατρέπεται αυτόματα σε query string και προστίθεται στο
  URL (πριν αυτό αγνοούνταν σιωπηλά σε GET requests).

---

## 10. Dashboard

**Λειτουργεί εξ ορισμού.** `GET /api/stats/overview` (δικαίωμα `customers.read` ή `reports.read`),
σελίδα `Dashboard.jsx`:

- **KPIs**: σύνολο πελατών, ενεργοί πελάτες, συνολική αξία (`total_value` άθροισμα), πελάτες VIP,
  επερχόμενες κρατήσεις.
- **Top πόλεις**: αριθμός μοναδικών πελατών ανά πόλη υποκαταστήματος (top 6).
- **Πρόσφατη δραστηριότητα**: τελευταία 8 audit events (§11) σε όλο τον tenant.
- **Follow-ups**: 12 πλησιέστερα ανοιχτά follow-ups με υπολογισμένη κατάσταση υπενθύμισης
  (`computeReminderState`, timezone-aware), και **συνολικοί μετρητές** «σήμερα»/«ληξιπρόθεσμα» —
  υπολογισμένοι πάνω σε **όλα** τα ανοιχτά follow-ups (όχι μόνο τα 12 της λίστας), ώστε τα badges
  να μην υποεκτιμούν όταν υπάρχουν πάνω από 12 ανοιχτές υπενθυμίσεις.
- Μέτρηση αν οι υπενθυμίσεις είναι ενεργές (`remindersEnabled`) βάσει tenant settings.

Μετρημένη απόδοση (350k πελάτες, ~9M σχετικές γραμμές, MariaDB 10.11 — βλ. README): σελίδα
καταλόγου (keyset, χωρίς query) ~6ms, επιλεκτική αναζήτηση ~60–260ms, ευρεία αναζήτηση ~400ms,
dashboard KPIs ~0.6s.

---

## 11. Δραστηριότητα, Επικοινωνίες, Audit trail

**Λειτουργεί εξ ορισμού.**

### 11.1 Activities (`activities` table, `lib/activity.js`)
Κάθε σημαντική ενέργεια καταγράφεται μέσω `logActivity({ tenantId, customerId, type, description,
branchId, spaceId, details })`: τύπος συμβάντος (π.χ. `follow_up_created`, `follow_up_completed`,
`follow_up_snoozed`, `quote_status_changed`, `quote_email_sent`), περιγραφή στα ελληνικά, και
προαιρετικό `details` JSON (π.χ. ταυτότητα ενεργούντος χρήστη — `packDetails()`, `activityDiff.js`
για υπολογισμό διαφορών πριν/μετά όπου εφαρμόζεται). Εμφανίζεται στην καρτέλα «Δραστηριότητα» του
προφίλ πελάτη και στο dashboard.

### 11.2 Επικοινωνίες (`communications` table)
Ιστορικό εξερχόμενων/εισερχόμενων μηνυμάτων ανά κανάλι (`email`/`sms`/`viber`/`telegram`), με
θέμα, σώμα, παραλήπτη, `delivery_status` (`sent`/`failed`/`logged`) και υπάλληλο αποστολέα.
Τροφοδοτείται τόσο από το `POST /api/customers/:id/messages` (χειροκίνητο μήνυμα προς πελάτη) όσο
και από την αποστολή email προσφοράς (§9.5).

### 11.3 Audit σχεδιασμού
Το audit trail είναι **customer-scoped και tenant-scoped**: κάθε εγγραφή έχει `tenant_id`/
`customer_id`, εμφανίζεται μόνο μέσα από routes που ήδη επιβάλλουν τον έλεγχο tenant/permission —
δεν υπάρχει ξεχωριστό «global audit log» endpoint πέρα από τη δραστηριότητα ανά πελάτη/dashboard.

---

## 12. API — Ευρετήριο endpoints

Όλα κάτω από `/api`, με JWT (`Authorization: Bearer <token>`) εκτός από τα ρητά δημόσια. Βασικό
prefix ανά resource (βλ. `backend/src/index.js` για την πλήρη σύνδεση routers):

| Prefix | Resource | Σημειώσεις |
|---|---|---|
| `POST /api/auth/register`, `/login` | Auth | Δημόσια. `register` δημιουργεί tenant + owner |
| `GET /api/auth/me`, `/public-settings` | Auth | `me` απαιτεί token· `public-settings` δημόσιο (self-register on/off) |
| `GET/POST/PATCH/DELETE /api/customers` | Πελάτες | `+ /search`, `/count`, `/check-duplicates`, sub-resources `:id/branches`, `:id/activities`, `:id/follow-ups`, `:id/bookings`, `:id/visits`, `:id/payments`, `:id/communications`, `:id/messages`, `:id/documents`, `:id/notes`, `:id/tags`, `:id/contacts`, `:id/custom-fields`, `:id/spaces/:spaceId/usage` |
| `GET /api/customers/export` | Εξαγωγή | `format=csv|xlsx|pdf`, ίδια φίλτρα με `/search` |
| `GET/POST/PATCH/DELETE /api/branches` | Υποκαταστήματα | `+ /:id/custom-fields` |
| `GET/POST/PATCH/DELETE /api/spaces` | Χώροι | `+ /:id/custom-fields` |
| `GET/POST/PATCH/DELETE /api/follow-ups` | Follow-ups | `+ /:id/snooze` |
| `GET/POST/PATCH/DELETE /api/customer-views` | Αποθηκευμένες προβολές | `+ /:id/duplicate` |
| `GET/POST/PATCH/DELETE /api/custom-fields` | Ορισμοί custom fields | `+ /reorder`, `/:id/duplicate` |
| `GET /api/meta`, `/meta/custom-fields` | Μεταδεδομένα για φίλτρα/επιλογείς | — |
| `GET /api/search/global` | Καθολική αναζήτηση | Ομαδοποιημένη ανά entity |
| `GET /api/stats/overview` | Dashboard KPIs | — |
| `GET/POST/PATCH/DELETE /api/quotes` | Προσφορές | `+ /resolve-lines`, `/:id/status`, `/:id/pdf`, `/:id/send` |
| `GET/POST/PATCH/DELETE /api/connectors` | ERP connectors | `+ /:id/run`, `/:id/runs`, `/:id/runs/:runId/retry` |
| `GET /api/geo/lookup` | Γεωκωδικοποίηση | Βοηθητικό για χάρτη υποκαταστήματος |
| `POST /api/uploads` | Μεταφόρτωση αρχείων | Φωτογραφίες/έγγραφα |
| `GET/PATCH /api/settings/organization`, `/app` | Ρυθμίσεις tenant | §3 |
| `GET/PATCH /api/settings/messaging`, `/messaging/channels` | Ρυθμίσεις καναλιών | §3.3 |
| `GET/PATCH /api/settings/reminders` | Ρυθμίσεις υπενθυμίσεων | §3.4/§7.3 |
| `GET/PATCH /api/settings/platform` | Ρυθμίσεις πλατφόρμας | Μόνο platform admin |
| `GET/POST/PATCH/DELETE /api/tenants` | Οργανισμοί (πλατφόρμα) | Μόνο platform admin |
| `GET/POST/PATCH/DELETE /api/users`, `/roles` | Χρήστες & ρόλοι | §2 |
| `GET /api/health` | Health check | Δημόσιο, ελέγχει σύνδεση ΒΔ |

Άγνωστα `/api/*` επιστρέφουν πάντα JSON `404` (ποτέ το SPA shell) — βλ. `index.js`.

---

## 13. Βάση δεδομένων, migrations, seeding

- **Σχήμα** (`backend/src/db/schema.sql`, εντολή `npm run db:schema` → `apply-schema.js`): πλήρες
  `DROP TABLE IF EXISTS` + `CREATE TABLE` — **καταστροφικό**, σχεδιασμένο για αρχική εγκατάσταση ή
  πλήρες reset, όχι για ενημέρωση παραγωγής με δεδομένα.
  Πίνακες: `tenants`, `quotes`, `quote_lines`, `platform_settings`, `roles`, `users`, `employees`,
  `customers`, `customer_saved_views`, `customer_contacts`, `branches`, `spaces`, `connectors`,
  `sync_runs`, `tags`, `customer_tags`, `bookings`, `visits`, `payments`, `communications`,
  `documents`, `notes`, `activities`, `follow_ups`, `custom_field_definitions`,
  `customer_custom_field_values`, `branch_custom_field_values`, `space_custom_field_values`.
- **«Ζωντανά» migrations** (`ensure-schema.js`, τρέχει σε **κάθε boot** του backend): ιδιοδύναμα
  (idempotent) `ALTER TABLE ADD COLUMN`/`ADD INDEX`/`CREATE TABLE IF NOT EXISTS` — επιτρέπει σε ένα
  υπάρχον production deployment με δεδομένα να ενημερωθεί **χωρίς data loss** όταν προστίθεται νέο
  χαρακτηριστικό (π.χ. τα `follow_ups`, `quotes`, `connectors`, `customer_saved_views` προστέθηκαν
  έτσι χωρίς να απαιτηθεί χειροκίνητο SQL migration script). Επίσης μεταναστεύει ιστορικά δεδομένα
  (π.χ. συμπληρώνει `customer_erp_id`/`branch_erp_id` από τα γονικά ERP IDs) και εξασφαλίζει ότι
  υπάρχει τουλάχιστον ένας platform admin.
- **Seeding** (`seed.js`, `seed-data.js`, εντολή `npm run db:seed`, `SEED_CUSTOMERS` env var,
  προεπιλογή 350.000): δημιουργεί demo tenants («Demo Α.Ε.» και «Acme Ε.Π.Ε.» για επίδειξη
  απομόνωσης tenant), demo χρήστες (owner/admin/manager/agent/viewer, κωδικός `password123`),
  batched inserts για ρεαλιστικό όγκο δεδομένων/απόδοση.
- **Πλήρες reset**: `npm run db:reset` = `db:schema` + `db:seed` σε σειρά.
- **Πρόσβαση ΒΔ**: `backend/src/db.js` εκθέτει `query(sql, params)` (επιστρέφει `{ rows }`) και
  `withConnection(fn)` (αποκτά αποκλειστική σύνδεση από το pool για transactions — χρησιμοποιείται
  στο ERP sync ώστε ολόκληρο το upsert customers/branches/spaces να γίνεται ατομικά).

---

## 14. Ρύθμιση & Deployment

### 14.1 Μεταβλητές περιβάλλοντος (`backend/.env`, βλ. `backend/.env.example`, `config.js`)

| Μεταβλητή | Προεπιλογή | Σκοπός |
|---|---|---|
| `MYSQL_HOST/PORT/USER/PASSWORD/DATABASE` | `127.0.0.1:3306`, `spacehub/spacehub/spacehub` | Σύνδεση ΒΔ |
| `MYSQL_POOL_MAX` | `10` | Μέγιστες συνδέσεις pool |
| `PORT` | `4000` | Θύρα API (μην ορίζεται σε Plesk/Passenger — παρέχεται αυτόματα) |
| `SEED_CUSTOMERS` | `350000` | Μέγεθος demo seed |
| `NODE_ENV` | `development` | `production` ενεργοποιεί το static serving του SPA και απενεργοποιεί CORS |
| `JWT_SECRET` | insecure dev default | **Πρέπει** να οριστεί σε production — υπογράφει τα auth tokens |
| `JWT_EXPIRES_IN` | `7d` | Διάρκεια ισχύος token |
| `CONNECTOR_SECRET` | = `JWT_SECRET` αν λείπει | Κλειδί κρυπτογράφησης credentials ERP connectors (§8.5) |

### 14.2 Ανάπτυξη (development)
```bash
npm install
cp backend/.env.example backend/.env
SEED_CUSTOMERS=350000 npm run db:reset
npm run dev:backend     # API στο :4000 (node --watch)
npm run dev:frontend    # Vite dev server στο :5173, proxy /api & /uploads
```

### 14.3 Production (single-app)
```bash
npm run build:frontend           # παράγει frontend/dist
NODE_ENV=production npm start    # backend σερβίρει API + SPA στο :4000
```

### 14.4 Plesk deployment
Πλήρης οδηγός βήμα-βήμα (χωρίς SSH, με MariaDB): [`DEPLOY.md`](../DEPLOY.md). Συνοπτικά: Application
Startup File `backend/src/index.js`, Document Root `frontend/dist` (**μετά** το build), μεταβλητές
περιβάλλοντος όπως στο §14.1, `npm run db:schema && npm run db:seed` από το «Run Node.js commands».

---

## 15. Παραδείγματα με JSON

### 15.1 Δημιουργία ERP connector για πελάτες
```json
POST /api/connectors
{
  "name": "ERP Πελατών",
  "base_url": "https://erp.example.gr/api/customers",
  "target_entity": "customers",
  "method": "GET",
  "auth_type": "bearer",
  "credentials": { "token": "***" },
  "response_encoding": "windows-1253",
  "mappings": {
    "sources": { "customers": "data.items" },
    "customers": {
      "erp_id": "id",
      "code": "code",
      "first_name": "firstName",
      "last_name": "lastName",
      "company": "companyName",
      "email": "email",
      "phone": "phone",
      "tax_id": "vatNumber",
      "custom_fields": { "member_no": "membershipNumber" }
    }
  },
  "schedule_minutes": 60,
  "enabled": true,
  "retry_count": 3
}
```

Αναμενόμενο σχήμα απάντησης ERP (για το παραπάνω mapping):
```json
{ "data": { "items": [
  { "id": "C-1001", "code": "PEL-1001", "firstName": "Γιώργος", "lastName": "Παπαδόπουλος",
    "companyName": null, "email": "g.pap@example.gr", "phone": "2101234567",
    "vatNumber": "123456789", "membershipNumber": "M-42" }
] } }
```

### 15.2 Άντληση γραμμών προσφοράς από ERP (`quote_api`, ρύθμιση tenant)
```json
PATCH /api/settings/app
{ "quote_api": {
  "url": "https://erp.example.gr/api/quotes/resolve",
  "method": "POST",
  "body_template": "{\"customerId\":\"{{customerId}}\",\"branchId\":\"{{branchId}}\",\"referenceStartYear\":\"{{referenceStartYear}}\",\"referenceEndYear\":\"{{referenceEndYear}}\",\"paymentDueDate\":\"{{paymentDueDate}}\"}",
  "headers": "{\"X-Api-Key\":\"***\"}",
  "response_path": "lines"
} }
```

Το ERP επιστρέφει (τυχαία δομή, χωρίς σταθερό σχήμα):
```json
{ "lines": [
  { "item_name": "Ενοικίαση αίθουσας", "qty": 3, "unitPrice": 120, "vat": 24, "cost_center": "GR-01" },
  { "description": "Catering", "quantity": 1, "amount": 300, "discount": 10 }
] }
```

`POST /api/quotes/resolve-lines` επιστρέφει (κάθε πεδίο ERP διατηρείται στο `metadata`):
```json
{ "lines": [
  { "description": "Ενοικίαση αίθουσας", "quantity": 3, "unit_price": 120,
    "discount_percent": 0, "tax_percent": 24,
    "metadata": { "item_name": "Ενοικίαση αίθουσας", "qty": 3, "unitPrice": 120, "vat": 24, "cost_center": "GR-01" } },
  { "description": "Catering", "quantity": 1, "unit_price": 300,
    "discount_percent": 10, "tax_percent": 24,
    "metadata": { "description": "Catering", "quantity": 1, "amount": 300, "discount": 10 } }
] }
```

### 15.3 Δημιουργία follow-up με αναβολή
```json
POST /api/follow-ups
{ "customerId": 4821, "title": "Τηλεφωνική επαφή για ανανέωση", "dueAt": "2026-09-20T10:00:00Z",
  "assignedEmployeeId": 7 }

PATCH /api/follow-ups/91/snooze
{ "minutes": 1440 }
```

### 15.4 Ρύθμιση καναλιού email (Messaging)
```json
PATCH /api/settings/messaging
{ "email": { "enabled": true, "from_name": "SpaceHub Demo", "from_email": "no-reply@example.gr",
  "smtp_host": "smtp.example.gr", "smtp_port": 587, "smtp_user": "no-reply@example.gr",
  "smtp_pass": "app-password", "smtp_secure": false } }
```

---

## 16. Αντιμετώπιση προβλημάτων

| Σύμπτωμα | Πιθανή αιτία | Λύση |
|---|---|---|
| `Ο συγχρονισμός απέτυχε` / `A sync is already running` | Υπάρχει ήδη ενεργό (`running`) run για τον ίδιο connector | Περιμένετε να ολοκληρωθεί ή ελέγξτε το `sync_runs` για κολλημένο run |
| `Το response δεν περιέχει records` | Λάθος `mappings.sources.<entity>` JSON path | Επιβεβαιώστε το πραγματικό σχήμα του ERP response και διορθώστε το path |
| `Branch X references unknown customer Y` | Ο connector branches έτρεξε πριν υπάρξει ο αντίστοιχος πελάτης | Ελέγξτε ότι ο πελάτης με αυτό το `erp_id` υπάρχει ήδη ή τρέξτε πρώτα τον connector πελατών |
| Ελληνικά εμφανίζονται ως `?`/`�` στο ERP response | Λάθος `response_encoding` | Δοκιμάστε `windows-1253` ρητά αντί για `auto`, ή ελέγξτε το πραγματικό encoding του ERP |
| Το email προσφοράς αποτυγχάνει (`delivery_status: failed`) | Λείπουν/λάθος SMTP διαπιστευτήρια | Ρυθμίστε `Settings → Επικοινωνίες → Email` (§3.3) |
| Ο χάρτης υποκαταστήματος δεν εμφανίζεται | Λείπει `google_maps_api_key` | Ρυθμίστε το κλειδί στο `Settings → Εφαρμογή` |
| `vite: not found` κατά το build σε Plesk | NPM install έγινε σε production mode | Βλ. `DEPLOY.md` §5 — προσωρινά development mode για install |
| Build warning `Some chunks are larger than 500 kB` | Το SPA δεν κάνει code-splitting (§19) | Αγνοήστε ή προσθέστε `React.lazy`/`manualChunks` (δεν εμποδίζει τη λειτουργία) |
| `403 Δεν έχετε δικαίωμα` | Ο ρόλος του χρήστη δεν έχει το απαιτούμενο permission | Δώστε το δικαίωμα από `Settings → Ρόλοι` (χρειάζεται `roles.manage`) |
| `Ο οργανισμός έχει ανασταλεί` | `tenants.status = 'suspended'` | Ενεργοποιήστε τον οργανισμό από το platform admin panel |

---

## 17. Ασφάλεια & απομόνωση tenant

- **Tenant isolation**: κάθε SQL query σε δεδομένα πελάτη περιλαμβάνει ρητό `tenant_id = ?`
  δεσμευμένο στον συνδεδεμένο χρήστη — δεν υπάρχει τρόπος από το API να διαβαστούν/τροποποιηθούν
  δεδομένα άλλου tenant, ακόμα κι αν μαντέψει κανείς ένα αριθμητικό `id`. Η demo βάση περιλαμβάνει
  δεύτερο tenant («Acme Ε.Π.Ε.») ειδικά για να αποδεικνύει αυτή την απομόνωση.
- **Passwords**: `bcryptjs` hashing (`hashPassword`/`verifyPassword`), ελάχιστο μήκος
  ρυθμιζόμενο ανά πλατφόρμα (`min_password_length`, 6–32).
- **JWT**: υπογεγραμμένο με `JWT_SECRET`, λήξη `JWT_EXPIRES_IN` (default 7 ημέρες). Ο χρήστης/ρόλος
  φορτώνονται **ξανά από τη ΒΔ σε κάθε request** — απενεργοποίηση χρήστη ή αλλαγή ρόλου ισχύει
  αμέσως, χωρίς να χρειάζεται να λήξει το token.
- **RBAC σε server-side**: κάθε route προστατεύεται με `authorize()`· το UI είναι απλώς αντανάκλαση
  των δικαιωμάτων, όχι το σημείο επιβολής.
- **Κρυπτογράφηση μυστικών ERP connectors**: AES-256-GCM (§8.5), ποτέ δεν επιστρέφονται ωμά μέσω API.
- **Μυστικά Messaging** (SMTP/API keys/tokens): δεν επιστρέφονται ωμά, μόνο `has_<secret>` flags·
  τιμές με `•` στην αρχή αγνοούνται κατά την αποθήκευση ώστε να μη διαγράφονται κατά λάθος.
- **Πλατφόρμα vs tenant admin**: το δικαίωμα `tenants.platform`/`is_platform_admin` είναι ξεχωριστό
  από τα ανά-tenant δικαιώματα και προστατεύει ρητά τα `/api/tenants` και `/api/settings/platform`.
  Ο owner ενός tenant **δεν** μπορεί να διαχειριστεί άλλους tenants παρά μόνο αν έχει και αυτό το
  ξεχωριστό δικαίωμα.
- **Προστασία «τελευταίου owner»**: το API εμποδίζει διαγραφή/υποβιβασμό του τελευταίου owner ενός
  tenant, και διαγραφή/απενεργοποίηση του ίδιου του συνδεδεμένου χρήστη.
- **CORS**: ενεργό μόνο εκτός production (dev split-origin setup)· σε production η SPA σερβίρεται
  same-origin από το ίδιο process.

---

## 18. Λειτουργικές λίστες ελέγχου (checklists)

### 18.1 Πριν πάτε σε production
- [ ] Ορίστε ισχυρό, τυχαίο `JWT_SECRET` (και `CONNECTOR_SECRET` αν διαφορετικό).
- [ ] `NODE_ENV=production`.
- [ ] `npm run build:frontend` έχει τρέξει **πριν** ρυθμίσετε το Document Root.
- [ ] `npm run db:schema && npm run db:seed` (ή μόνο `db:schema` αν δεν θέλετε demo δεδομένα).
- [ ] Αλλάξτε/απενεργοποιήστε τους demo λογαριασμούς (`password123`) πριν δώσετε πρόσβαση σε
      πραγματικούς χρήστες.
- [ ] Αν χρησιμοποιείτε ERP sync: ρυθμίστε connectors με πραγματικά credentials, δοκιμάστε πρώτα
      χειροκίνητο `run` πριν ενεργοποιήσετε το `schedule_minutes`.
- [ ] Αν χρειάζεστε αποστολή email/SMS/Viber/Telegram: συμπληρώστε τα αντίστοιχα διαπιστευτήρια
      στο `Settings → Επικοινωνίες`.
- [ ] Αν χρειάζεστε χάρτη υποκαταστήματος: ρυθμίστε `google_maps_api_key`.
- [ ] Ελέγξτε ότι μόνο ο επιθυμητός αριθμός χρηστών έχει `tenants.platform`/`is_platform_admin`.

### 18.2 Προσθήκη νέου ERP connector
- [ ] Επιβεβαιώστε το πραγματικό JSON σχήμα του ERP endpoint (Postman/curl) πριν ρυθμίσετε mapping.
- [ ] Ρυθμίστε `mappings.sources.<entity>` στο σωστό JSON path του array εγγραφών.
- [ ] Ρυθμίστε τουλάχιστον `erp_id` + (`code`/`name` για customers, `name` για branches/spaces).
- [ ] Αν το ERP απαντά σε ελληνικά legacy encoding, δοκιμάστε πρώτα `auto`· αν εμφανιστούν
      προβλήματα, ορίστε ρητά `windows-1253`/`windows-1258`.
- [ ] Τρέξτε χειροκίνητα (`Run now`) και ελέγξτε το `sync_runs` (records seen/upserted, σφάλματα)
      πριν ενεργοποιήσετε το `schedule_minutes`.
- [ ] Για branches/spaces, βεβαιωθείτε ότι ο connector πελατών (ή τα ήδη αποθηκευμένα δεδομένα)
      περιέχει τα αντίστοιχα γονικά `erp_id` πριν τρέξετε.

### 18.3 Δημιουργία νέου ρόλου
- [ ] `Settings → Ρόλοι` (χρειάζεται `roles.manage`).
- [ ] Επιλέξτε μόνο τα απαραίτητα δικαιώματα από τον κατάλογο (αρχή ελάχιστου προνομίου).
- [ ] Δοκιμάστε με δοκιμαστικό χρήστη πριν το εκχωρήσετε ευρέως.

---

## 19. Γνωστοί περιορισμοί

- **Εξωτερικοί πάροχοι απαιτούν δικές σας ρυθμίσεις.** Οι δυνατότητες ERP sync (§8), αποστολή
  προσφοράς μέσω email (§9.5), κανάλια Messaging (§3.3) και ο χάρτης Google Maps (§3.2) **δεν
  λειτουργούν από μόνες τους** — χρειάζονται πραγματικό ERP endpoint, SMTP server/API keys
  παρόχων SMS-Viber-Telegram, και Google Maps API key αντίστοιχα. Χωρίς αυτά, το σύστημα
  υποβαθμίζεται χαριτωμένα (fail-soft): τα μηνύματα καταγράφονται ως `logged` αντί να σταλούν, ο
  χάρτης εμφανίζει placeholder, και ο συγχρονισμός ERP απλά δεν έχει connector να τρέξει.
- **Προειδοποίηση μεγέθους πακέτου (bundle) frontend.** Το `npm run build:frontend` παράγει ένα
  και μόνο JS bundle **~523 kB** (μη-συμπιεσμένο· ~154 kB μετά από gzip) και το Vite εμφανίζει την
  προειδοποίηση `Some chunks are larger than 500 kB after minification`, επειδή όλες οι σελίδες
  (`App.jsx`) εισάγονται στατικά, χωρίς `React.lazy()`/`manualChunks` code-splitting. Δεν εμποδίζει
  τη λειτουργία της εφαρμογής, αλλά σημαίνει μεγαλύτερο αρχικό χρόνο φόρτωσης σε αργές συνδέσεις·
  αντιμετωπίζεται μόνο αν χρειαστεί με code-splitting ανά σελίδα.
- **Το ERP quote API mapping δεν έχει σταθερό σχήμα** (σκόπιμα, §9.2) — αν το ERP αλλάξει ονόματα
  πεδίων εκτός των γνωστών aliases, τα πεδία θα εμφανιστούν μόνο στο `metadata`, όχι στα βασικά
  (ποσότητα/τιμή/κ.λπ.) του line item.
- **Το `db:schema` κάνει πλήρες DROP/CREATE** — δεν είναι ασφαλές να τρέξει ξανά πάνω σε
  παραγωγική βάση με δεδομένα. Ενημερώσεις σχήματος σε ήδη-λειτουργικά περιβάλλοντα γίνονται μέσω
  του αυτόματου `ensure-schema.js` στο boot, όχι μέσω επανεκτέλεσης του `schema.sql`.
- **Δεν υπάρχει ξεχωριστό MFA/SSO** (μόνο email+password με bcrypt/JWT) στον τρέχοντα κώδικα.
