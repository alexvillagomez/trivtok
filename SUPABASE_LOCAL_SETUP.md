# Running TrivTok locally with Supabase

## Current status

The Supabase connection in `.env.local` is configured and working.

Verified database state:

- The `questions`, `users`, `user_interests`, and `interactions` tables exist.
- The `vector` extension is enabled.
- The `questions_embedding_idx` HNSW index exists.
- The bank holds several thousand questions (see `QUESTION_COVERAGE.md` /
  `data/insertion-ledger.json` for the current inventory), each with a
  64-dimensional embedding.
- The application production build completes successfully.

Do not commit `.env.local` or copy its credentials into client-side variables.
`DATABASE_URL` is server-only and must not use a `NEXT_PUBLIC_` prefix.

## Start localhost

From the project directory, run:

```bash
npm run dev
```

Open the URL printed by Next.js, normally:

```text
http://localhost:3000
```

If port 3000 is occupied, Next.js automatically selects another port such as
3001.

## Environment configuration

The required runtime variable is:

```dotenv
DATABASE_URL=postgresql://...
```

Use the Supabase Postgres connection string from the Supabase dashboard. The
existing database client supports a pooled or direct Supabase URL, disables
prepared statements, and requires SSL for remote connections.

The OpenAI key is only needed when generating new embeddings with the import
script. It is not needed to read questions that are already stored in Supabase.

## Supabase question feed

The homepage reads the question bank from Supabase on the server through
`listQuestions()`. The route is dynamic, so refreshing the page performs a new
server-side database read instead of serving a build-time question snapshot.
Before the rows cross the server/client boundary, `toPublicQuestion()` removes
embeddings and aggregate rating counts.

The feed is connected to a Server Action. The browser keeps an anonymous user ID
in local storage and a session ID in session storage. Moving to the next card:

1. Records the answer, like, skip/dislike signal, response time, and session.
2. Updates the user's ability vector and semantic interest clusters.
3. Updates aggregate question difficulty and like/dislike counts.
4. Excludes previously seen questions.
5. Returns the next question selected by semantic priority, difficulty fit, and
   aggregate rating.

If the server update fails, the client shows the next question from its original
server-rendered list and displays an error in the feed hint.

## Database setup for a new Supabase project

For a brand-new empty Supabase project only:

1. Put its Postgres connection string in `.env.local` as `DATABASE_URL`.
2. Run the migration:

   ```bash
   npm run migrate
   ```

3. Seed authored questions when required:

   ```bash
   npx tsx scripts/insert-authored.ts data/authored-1.json
   ```

The import command calls the OpenAI embeddings API and appends rows. Do not run
it repeatedly against the existing configured project unless duplicate question
rows are intended. The existing project is already migrated and seeded, so it
does not need either command.
