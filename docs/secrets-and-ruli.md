# Secrets, the RULI, and how the coat-check works

A plain-language guide to how this app hides identities, and the crypto words
behind it (salt, **pepper**, random token, hash). Written to *learn from* —
every part points at the real code in this repo.

---

## 1. The mental model: a coat-check

When you hand your coat to a coat-check, you get a numbered ticket. The ticket
says nothing about your coat. Only the coat-check's **book** knows that
ticket #47 = your blue coat.

- Lose the ticket on the street → finder learns nothing. It's just a number.
- The secret isn't in the ticket. It's in the book, locked behind the counter.

That is exactly what this app does.

| Coat-check | This app |
|------------|----------|
| Ticket number | **RULI** (random token) |
| The coat (real person) | sensitive fields (name, DOB, …) |
| The book under the counter | `student_mapping` table in Postgres |

The shareable dashboard record carries only the RULI + non-identifying fields.
The real identity lives in a separate table. A leaked RULI is a meaningless
number unless you also breach the database.

---

## 2. The four words

### Random token (the RULI)
A long, meaningless, unguessable number. **This is the security.** Because it's
random, no one can derive it from a person's name — and no one can guess a valid
one (too many possibilities).

In this repo → [lib/ruli.js](../lib/ruli.js), `generateCode()`:
```js
crypto.randomBytes(16).toString("hex")  // 16 random bytes -> 32 hex chars
```
16 bytes = 128 bits = 2^128 possibilities. Unguessable by brute force.

### Salt — *a public anti-shortcut*
A salt is a **non-secret** random value mixed in *before* hashing. Its only job:
stop attackers from using precomputed tables ("rainbow tables") and make two
identical inputs hash differently. It is stored *right next to* the hash — hiding
it buys nothing.

In this repo → `generateSalt()` in [lib/ruli.js](../lib/ruli.js); stored in
`student_mapping.salt`. Think *sticker on the coat so two identical coats differ*.

### Pepper — *the one master secret* (you just learned this)
A pepper is **one secret key, kept on the server, that never leaves it** and is
*never* stored next to the data. Salt is public; pepper is secret. The pepper is
the real lock — if an attacker steals the whole database but not the pepper, they
still can't unscramble anything that was peppered.

> **Salt vs pepper in one line:**
> Salt = unique per record, stored with the data, **public**.
> Pepper = one value for the whole system, kept apart, **secret**.

This app does **not** use a pepper yet — and with the coat-check design it
doesn't strictly need one (security already lives in the DB, not in a key). You'd
add a pepper only if you switched to *self-contained* tokens that must be decoded
without a database. See §5.

### Hash — *a one-way fingerprint*
A hash turns any input into a fixed-length fingerprint that you **cannot reverse**.
Same input → same fingerprint, always; but you can't go fingerprint → input.

Two different hashes are used here, for two different jobs:

- **Verification hash** — `hashCode(code, salt)` in [lib/ruli.js](../lib/ruli.js),
  uses **scrypt** (a deliberately *slow* hash that resists brute force). Lets you
  check a presented RULI without storing the raw RULI.
- **Identity fingerprint** — `identityHash()` in
  [lib/ingestPipeline.js](../lib/ingestPipeline.js#L56), uses **sha256** over the
  sensitive fields. Its job is dedup: the same person re-uploaded produces the
  same fingerprint, so you skip duplicates — *without* storing the name to compare.

> Why two? scrypt is slow *on purpose* (good against guessing a secret). sha256 is
> fast (fine for a dedup key that isn't a secret). Right tool per job.

---

## 3. Where each thing lives (this repo)

```
Upload row  ──►  processRows()  [lib/ingestPipeline.js]
                   │
                   ├─ generateCode()  ─► RULI (random token)
                   ├─ generateSalt()  ─► salt  (public)
                   ├─ hashCode()      ─► verification hash (scrypt)
                   ├─ identityHash()  ─► dedup fingerprint (sha256)
                   └─ splitSensitive()─► { safe, sensitive }
                                          │
        ┌─────────────────────────────────┴───────────────┐
        ▼                                                  ▼
  students  (shareable)                         student_mapping (the "book")
  ┌──────────────────────┐                      ┌────────────────────────────┐
  │ ruli  (the ticket)   │   same ruli links    │ ruli                       │
  │ class, gender, age   │ ───────────────────► │ salt                       │
  │ identity_hash (dedup)│                      │ sensitive (name, DOB, …)   │
  └──────────────────────┘                      └────────────────────────────┘
     goes to dashboards                            locked behind RLS / admin
```

Insert logic: `insertItems()` in [lib/db.js](../lib/db.js#L53).

---

## 4. Generate + look up (the whole flow)

**Generate (on ingest)** — already done in `processRows()`:
```js
const code = generateCode();   // RULI — the ticket
const salt = generateSalt();   // public sticker
const hash = hashCode(code, salt);  // slow verification fingerprint
// safe fields -> students ; sensitive fields + salt -> student_mapping
```

**Look up (institution sends a RULI back to you)** — the coat-check book lookup:
```sql
-- "what real record does this ticket point to?"
select sensitive
  from student_mapping
 where ruli = $1;
```
That's it. No un-splitting, no un-hashing. The RULI is a key into the book.

**Verify a RULI is genuine (optional)** — without storing the raw code:
```js
// recompute the fingerprint from the presented code + stored salt
hashCode(presentedCode, storedSalt) === storedHash
```

---

## 5. When you *would* need a pepper

Only if you drop the coat-check book and make the token **carry its own meaning**
(decodable with no database). Then the design changes:

- **Reversible, self-contained:** `ruli = AES-256-GCM(identity, PEPPER)`. The
  pepper is the only thing that can decode it; GCM's built-in auth tag replaces a
  hand-made hash. Lose the pepper-less database = attacker gets nothing.
- **Match-only, self-contained:** `ruli = HMAC-SHA256(PEPPER, identity)`. Same
  person → same token (linkable), but irreversible.

You chose the coat-check (DB lookup), so you're **not** in this case today. Keep
the pepper idea in your pocket for if a partner ever says "the code must work
offline with no call back to your server."

---

## 6. The one rule to remember

> Don't hide the algorithm — hide the **key** (or, here, the **book**).
> Splitting/interleaving a token into 10 pieces only hides the *algorithm*, which
> any leak undoes. Randomness + a locked database (or a secret pepper) is what
> actually protects people.

---

*Next: see the randomness deep-dive (how `crypto.randomBytes` actually produces
unguessable numbers — entropy, CSPRNGs, and why it's not just "time-based").*
