# 30 — Secure storage and row-level sync (step 0)

Status: **design, decided by Bryan on 24 Oct 2026; nothing built yet.** Replaces "one JSON document per plugin" (docs/29 decision 4)
with a real encrypted database, synced per row. Common prerequisite of the ERP, etablink and Quotidien.

## Decisions (Bryan, 24 Oct 2026)

1. **Encryption (C1).** The server holds the keys, **one key per company**. Everything is encrypted on disk, in backups and in transit.
   End-to-end encryption comes later, for a few very sensitive fields only (ID documents, bank details).
2. **Engine (C2).** **PostgreSQL**, with Row-Level Security isolating companies and projects inside the database itself; encryption at
   rest with pg_tde, keys in OpenBao; field-level encryption for ultra-sensitive data; SQLCipher for the local copy on devices.
3. **Local copy (C3).** A device receives only the rows its user may read (filtered by the server), encrypted. Offline, nothing changes
   for the user; after two days without network and several people editing the same thing, the truth is restored invisibly.
4. **Conflicts (C4).** See the rules below.
5. **Sync engine.** ElectricSQL (Apache 2.0) streams filtered "shapes" of PostgreSQL tables to devices; **writes go through etable's
   own Rust API**. PowerSync is the fallback. Re-check both with Context7 before coding.

## Architecture

device (encrypted SQLite, queue of writes with hybrid timestamps) → **etable API (Rust)**: rights, C4 rules, transactions, numbering →
**PostgreSQL** (RLS, encryption) → **ElectricSQL** → devices. Plugin logic still runs on the device (docs/16, 29); the server stores,
checks rights and validates writes.

## Conflict rules (C4)

1. Creating never conflicts: ids are UUIDv7 made on the device.
2. Merge **field by field**.
3. Same field edited twice: latest wins by **hybrid logical clock** (correct even if a device clock is wrong); the overwritten value
   stays in the row history. Nobody is interrupted.
4. **Quantities are movements** (stock, hours, counters): store deltas, never absolute values.
5. **Unique operations go through the server** (invoice and police-book numbers, sale of a unique machine, reservations): offline they
   are "pending"; the server validates and numbers without gaps on reconnection.
6. Delete wins over edit, except legal data (never deleted); deletions are recoverable for a while.

## What a plugin declares

Tables (typed columns, keys, indexes, constraints) and migrations. The engine creates and evolves them and refuses a migration that
would lose data. Legacy JSON plugins keep working; migration is progressive (Quotidien last).

## Delivery

- **E0.1** Declared schema + PostgreSQL server base + row API (read, transactional write, rights).
- **E0.2** Encrypted local copy + per-row sync + offline mode.
- **E0.3** Companies, roles, per-project permissions enforced by the server.
- **E0.4** Encrypted daily backups with restore test, key rotation, security review.
- **E0.5** Pilot: one simple Quotidien plugin, then open to the ERP and etablink.

## Tests

Simulated outages of several days, several devices, skewed clocks, replayed identically; restore test of backups; RLS tests (a user
never reads another company's or project's rows).

## Open points for E0.1

- Check pg_tde, OpenBao and ElectricSQL current docs (Context7) and pick versions.
- Docker footprint on the homelab server (PostgreSQL + OpenBao + Electric).
- Key backup and recovery procedure (decision for Bryan: who holds the recovery material).
