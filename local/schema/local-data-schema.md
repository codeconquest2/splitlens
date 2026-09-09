# SplitLens Local Data Schema

The local desktop app stores data in `data/splitlens.local.sqlite`.

Tables:

- `profiles`
- `contacts`
- `groups`
- `group_members`
- `statements`
- `transactions`
- `budgets`
- `manual_expenses`
- `shared_expenses`
- `expense_splits`
- `model_settings`
- `statement_parse_debug`
- `security_settings`
- `import_batches`
- `category_rules`

The runtime schema is enforced by `src/lib/local-db.ts`. Backups are written to
`data/backups/`.

Security notes:

- The live SQLite database and local backup files are written with owner-only file
  permissions (`0600`) when the filesystem supports POSIX modes.
- Plain `.json` backups are portable but not private.
- Encrypted `.splitlens-backup` files are password-based backups using scrypt and
  AES-256-GCM. The password is user-owned and is not stored by SplitLens.
- The app unlock password gates browser-session access to local DB-backed APIs.
  It does not yet encrypt the live SQLite file at rest.
- The remaining encryption target is SQLCipher or equivalent encrypted SQLite.
