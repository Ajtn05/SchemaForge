# <img src="public/favicon.svg" alt="SchemaForge logo" width="40" height="40"> SchemaForge

**Design your database visually. See the tables. Export the SQL.**

SchemaForge is a browser-based database design app. Keep multiple projects in a local project library, model entities and relationships, inspect the resulting tables, and export MySQL or PostgreSQL SQL.

No account or backend setup required. Projects save locally in your browser.

![SchemaForge project library showing the university sample and a new-project shortcut](artifacts/schemaforge-home.jpg)

[Get started](#get-started) · [Features](#features) · [Design workflow](#design-workflow) · [Development](#development)

## Screenshots

### EER diagram

![EER canvas showing sample entities, crow's-foot relationships, and the entity inspector](artifacts/schemaforge-diagram.jpg)

### Relational schema

![Diagram editor with the generated relational schema and selected entity properties](artifacts/schemaforge-preview.jpg)

### Project settings

![Project settings dialog with the sample project's name, description, and MySQL target](artifacts/schemaforge-project-settings.jpg)

### SQL preview

![Generated MySQL CREATE TABLE statements for the university sample](artifacts/schemaforge-sql.jpg)

## Features

| Capability              | What you can do                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual modeling         | Add, arrange, and connect entities on an interactive enhanced entity–relationship (EER) canvas. Edit names, attributes, keys, and constraints in the inspector. |
| Relationship design     | Model one-to-one, one-to-many, and many-to-many relationships with cardinality, participation, and relationship attributes.                                     |
| Live relational schema  | See tables, primary keys, foreign keys, and associative tables update as you edit the diagram. Composite keys and multivalued attributes are supported.         |
| Supertypes and subtypes | Build nested inheritance hierarchies and describe disjoint or overlapping membership and total or partial completeness.                                         |
| Normalization review    | Declare functional dependencies, inspect candidate keys, and review potential 2NF, 3NF, and BCNF violations.                                                    |
| SQL generation          | Preview and export DDL for MySQL or PostgreSQL. Choose **No engine** to focus on conceptual and relational design.                                              |
| Design validation       | Find modeling errors, engine-specific issues, and constraints that need application-level enforcement before exporting SQL.                                     |
| Local projects          | Autosave in your browser and export or import portable `.schemaforge.json` backups.                                                                             |
| Everyday editing        | Search entities and attributes, undo and redo changes, duplicate entities, and switch between light and dark themes.                                            |

### Understand the rules behind your tables

Use the normalization workspace to record business dependencies and inspect the resulting candidate keys and normal-form findings. Subtypes share their parent's key while keeping their own attributes in separate tables.

![SchemaForge normalization workspace showing candidate keys, normal-form review, and subtype settings](artifacts/schemaforge-subtypes-normalization.jpg)

## Design workflow

1. **Start a project.** The home page lists your projects. Open the included university sample, import a JSON backup, or create a blank project. Click **Workspace** in the editor to return home.
2. **Build the model.** Add entities, edit their attributes, and drag a connection handle between entities. Select a relationship to set its cardinality and participation.
3. **Explore the tables.** Switch to the relational schema to inspect the tables and keys generated from your model.
4. **Review the design.** Check validation findings and declare functional dependencies in **Normalization**.
5. **Export your work.** Choose an engine in **Project settings**, resolve validation errors, and use **Export** to download SQL or a JSON project backup.

## Get started

Install Node.js **22 or newer (even-numbered releases)** and npm, then run these commands from the project folder:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, usually [http://127.0.0.1:5173](http://127.0.0.1:5173).

### Handy shortcuts

| Action                      | Shortcut                                |
| --------------------------- | --------------------------------------- |
| Add an entity               | `N` or double-click the canvas          |
| Search the schema           | `Cmd/Ctrl + K`                          |
| Undo / redo                 | `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z` |
| Duplicate selected entities | `Cmd/Ctrl + D`                          |
| Save locally                | `Cmd/Ctrl + S`                          |
| Delete selection            | `Delete` / `Backspace` outside inputs   |
| View all shortcuts          | `?`                                     |

## Project storage and design scope

- **Local workspace:** Each project saves independently in this browser on this device. Existing single-project data migrates into the library automatically. Export JSON backups to move projects or protect them from cleared browser data.
- **Account workspace:** Optional Supabase email sign-in stores projects under your account, with owner-only database policies. Local projects remain separate; export/import JSON to copy one into your account workspace. Uploads are debounced and serialized. Failed uploads retain a device cache and can be retried. Cached edits use the last edited timestamp when reopening an account. Concurrent edits to the same project use the last upload; live collaboration and conflict merging are not included.
- **SQL output:** SchemaForge generates DDL; it does not connect to a database, execute SQL, or migrate existing data. MySQL output targets 8.0.16 or later; PostgreSQL output targets 10 or later. SQL export requires a selected engine and no validation errors.
- **Normalization:** Findings depend on the business dependencies you declare and assume atomic values. Review 1NF manually. Large candidate-key searches may leave 2NF/3NF unresolved. Suggested decompositions are advisory.
- **Modeling:** Composite keys are supported; composite attributes are not. Some participation and subtype membership rules require application or transactional trigger enforcement, which validation identifies.

## Optional email sign-in and cloud projects

The app works without any environment variables in local mode. To enable an account workspace:

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor. This creates the projects table and owner-only row-level security policies.
2. Copy `.env.example` to `.env.local`, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project Connect dialog. Use the browser-safe publishable key (or legacy anon key), never a secret or service-role key.
3. Enable email authentication. In **Authentication → URL Configuration**, set the Site URL to your production origin and allow redirect URLs for both `http://localhost:5173/` and `http://127.0.0.1:5173/`, plus the exact deployed origin ending in `/`. Add any Vercel preview origins you intend to use for sign-in.
4. Restart Vite. Choose **Sign in with email**, then open the link sent to your inbox. The account workspace loads after sign-in. Use **Local projects** to access the device workspace at any time.

For production email delivery, configure your own SMTP provider in Supabase. See the official [email sign-in guide](https://supabase.com/docs/guides/auth/passwordless-login/auth-magic-link), [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), and [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

## Deploy to Vercel

Import this repository into Vercel with the **Vite** preset. The included [`vercel.json`](vercel.json) builds with `npm run build`, serves `dist`, and routes project URLs back to the SPA so `/projects/<id>` survives refresh. See [Vercel's Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite).

For email sign-in, add the two `VITE_SUPABASE_*` variables to the Vercel project before building and configure the deployed origin in Supabase as described above. Without these variables, the deployed site uses local mode. Browser storage is scoped to each origin, so localhost and your deployed site have separate local libraries. Supabase holds account data; no server filesystem or Vercel database is required. Redeploy after changing build-time environment variables.

## Development

Built with React, TypeScript, Vite, Tailwind CSS, XYFlow, Zustand, Lucide, and Radix UI.

```sh
npm test          # Run the unit tests
npm run build    # Type-check and create a production build in dist/
npm run preview  # Serve the production build locally
```

| Folder                             | Purpose                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| [`src/domain`](src/domain)         | Conceptual and relational models, plus the sample project                        |
| [`src/lib`](src/lib)               | Model transformation, normalization, validation, SQL generation, and persistence |
| [`src/store`](src/store)           | Project state, local saving, and undo/redo history                               |
| [`src/components`](src/components) | Diagram canvas, inspector, output views, and UI primitives                       |
| [`artifacts`](artifacts)           | Product screenshots used in this README                                          |

## Modeling reference

Crow’s foot minimum/maximum symbols, directional readings, association-key refinement for repeated pairs, and conceptual `{Multivalued}` / `[Derived]` labels follow the supplied _ERD and Relational Database Master Study Guide_, particularly sections 12–18, 43, and 54–55. Its remaining topics do not imply every feature is implemented; composite attributes, explicit weak-entity ownership, ternary relationships, and configurable referential actions remain future work.
