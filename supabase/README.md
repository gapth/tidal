# Supabase Database

Place all schema changes in `supabase/migrations/` as ordered SQL files.

Naming convention:

- `20260416150000_initial.sql`
- `20260416153000_add_indexes.sql`

Use the format `yyyymmddhhmmss_description.sql`.

Apply them in timestamp order inside the Supabase SQL Editor, or through the Supabase CLI later if you add it to the project workflow.

Local refresh workflow:

```bash
supabase db dump --local --data-only > supabase/seed.sql
supabase db reset
```

Use this when you want to snapshot the current local data set into `supabase/seed.sql` and then rebuild the local database from migrations plus that seed file.

Schema guidance:

- Use `uuid` for internal row identifiers that the database owns.
- Use `text` plus `not null` and `unique` constraints for external YouTube identifiers.
