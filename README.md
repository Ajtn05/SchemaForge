# SchemaForge

**Design your database visually. See the tables. Export the SQL.**

SchemaForge is a browser-based database design workspace that connects your conceptual model to a relational schema and MySQL or PostgreSQL SQL. Build a diagram, explore how relationships become tables, and review your design before implementation—all in one workspace.

No account or backend setup required. Projects save locally in your browser.

![SchemaForge workspace with an editable entity diagram, attribute inspector, and live relational schema](artifacts/schemaforge-preview.jpg)

[Get started](#get-started) · [Features](#features) · [Design workflow](#design-workflow) · [Development](#development)

## From an idea to a database design

Whether you are learning database modeling, planning an application, or explaining a schema to your team, SchemaForge makes the connection between entities, relationships, and tables visible. Start with the university sample or create a blank project and build your own model.

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

1. **Start a project.** Open the included university sample or create a blank project from the project menu.
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

- **Local storage:** Projects save to this browser on this device. Export JSON backups to move a project or protect it from cleared browser data. Cloud sync and collaboration are not included.
- **SQL output:** SchemaForge generates DDL; it does not connect to a database, execute SQL, or migrate existing data. MySQL output targets 8.0.16 or later; PostgreSQL output targets 10 or later. SQL export requires a selected engine and no validation errors.
- **Normalization:** Findings depend on the business dependencies you declare and assume atomic values. Review 1NF manually. Large candidate-key searches may leave 2NF/3NF unresolved. Suggested decompositions are advisory.
- **Modeling:** Composite keys are supported; composite attributes are not. Some participation and subtype membership rules require application or transactional trigger enforcement, which validation identifies.

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
