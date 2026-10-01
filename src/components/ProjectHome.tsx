import { useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowRight,
  Braces,
  CheckCheck,
  Cloud,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  GitBranch,
  HardDrive,
  Layers3,
  LogOut,
  Mail,
  MoreHorizontal,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useProject } from "../store/useProject";
import type { useAccount } from "../store/useAccount";
import { emptySchema, sampleSchema } from "../domain/sample";
import type { DatabaseEngine } from "../domain/types";
import { engineLabels, projectEngine } from "../lib/engine";
import { downloadFile, isSchema } from "../lib/persistence";
import { supabase } from "../lib/supabase";
import {
  nextUpdatedAt,
  saveWorkspace,
  type ProjectRecord,
} from "../lib/workspace";
import { IconButton, Menu, MenuItem, Modal } from "./ui/primitives";

type Account = ReturnType<typeof useAccount>;
export default function ProjectHome({
  onOpen,
  account,
  missing,
}: {
  onOpen: (id: string) => void;
  account: Account;
  missing: boolean;
}) {
  const store = useProject();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [dialog, setDialog] = useState<
    "new" | "signin" | "rename" | "delete" | null
  >(null);
  const [target, setTarget] = useState<ProjectRecord | null>(null);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<DatabaseEngine>("none");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [mailSent, setMailSent] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const local = store.scope === "local";
  const filtered = [...store.projects]
    .filter((p) =>
      `${p.schema.name} ${p.schema.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.schema.name.localeCompare(b.schema.name)
        : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    );
  function openNew() {
    setName("");
    setEngine("none");
    setDialog("new");
  }
  function action(kind: "rename" | "delete", project: ProjectRecord) {
    setTarget(project);
    setName(project.schema.name);
    setDialog(kind);
  }
  function exportProject(project: ProjectRecord) {
    downloadFile(
      JSON.stringify(project.schema, null, 2),
      `${project.schema.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.schemaforge.json`,
      "application/json",
    );
  }
  async function importProject(file: File) {
    try {
      const schema: unknown = JSON.parse(await file.text());
      if (!isSchema(schema)) throw new Error("Invalid project");
      onOpen(store.createProject(schema));
    } catch {
      store.notify("Choose a valid .schemaforge.json project backup.");
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  async function sendLink() {
    if (!supabase) return;
    setSending(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      setMailSent(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not send a sign-in link. Try again.",
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="project-home">
        <header className="app-header home-header">
          <a className="brand" href="/" aria-label="SchemaForge home">
            <span className="brand-symbol">
              <Layers3 size={21} strokeWidth={1.8} />
            </span>
            <span>
              schema<span className="brand-light">forge</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <div className="header-breadcrumb">
            <span>Workspace</span>
          </div>
          <div className="header-actions">
            <IconButton
              label={
                store.theme === "light" ? "Use dark theme" : "Use light theme"
              }
              onClick={store.toggleTheme}
            >
              {store.theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </IconButton>
            {account.session ? (
              <Menu
                label="Account controls"
                trigger={
                  <>
                    <span className="account-avatar">
                      {account.session.user.email?.[0]?.toUpperCase()}
                    </span>
                    <span className="account-email">
                      {account.session.user.email}
                    </span>
                  </>
                }
              >
                <MenuItem onSelect={() => account.switchWorkspace(false)}>
                  <HardDrive size={15} />
                  Local projects
                </MenuItem>
                <MenuItem onSelect={() => account.switchWorkspace(true)}>
                  <Cloud size={15} />
                  Account projects
                </MenuItem>
                <MenuItem onSelect={() => void account.signOut()}>
                  <LogOut size={15} />
                  Sign out
                </MenuItem>
              </Menu>
            ) : (
              <button
                className="button"
                onClick={() => {
                  setMailSent(false);
                  setMessage("");
                  setDialog("signin");
                }}
              >
                <Mail size={15} />
                Sign in with email
              </button>
            )}
          </div>
        </header>
        <div className="home-layout">
          <aside className="home-sidebar">
            <button
              className={`home-nav ${local ? "active" : ""}`}
              onClick={() => account.switchWorkspace(false)}
            >
              <HardDrive size={17} />
              <span>Local projects</span>
              {local && (
                <span className="home-nav-count">{store.projects.length}</span>
              )}
            </button>
            <button
              className={`home-nav ${!local ? "active" : ""}`}
              onClick={() => {
                if (account.session) account.switchWorkspace(true);
                else {
                  setMailSent(false);
                  setMessage("");
                  setDialog("signin");
                }
              }}
            >
              <Cloud size={17} />
              <span>Account projects</span>
              {!local && (
                <span className="home-nav-count">{store.projects.length}</span>
              )}
            </button>
          </aside>
          <main className="home-main">
            <div className="home-heading">
              <div>
                <h1>Projects</h1>
              </div>
              <button
                className="button primary"
                onClick={openNew}
                disabled={account.loading}
              >
                <Plus size={16} />
                New project
              </button>
            </div>
            {missing && (
              <div className="home-alert" role="status">
                This project is not in the current workspace. Choose a project
                below or switch workspaces.
              </div>
            )}
            {!store.saved && (
              <div className="home-alert" role="alert">
                Device storage is unavailable. Export JSON backups to keep your
                projects.
              </div>
            )}
            {account.error && (
              <div className="home-alert" role="alert">
                <span>{account.error}</span>
                <button className="button small" onClick={account.retry}>
                  Try again
                </button>
              </div>
            )}
            <div className="workspace-banner">
              <span className="banner-icon">
                {local ? <HardDrive size={21} /> : <Cloud size={21} />}
              </span>
              <div>
                <strong>
                  {local ? "Saved on this device" : "Synced to your account"}
                </strong>
                <p>
                  {local
                    ? "Projects are saved in this browser. Export a backup before clearing browser data."
                    : "Changes save on this device and sync to your account."}
                </p>
              </div>
              {local ? (
                account.session ? (
                  <button onClick={() => account.switchWorkspace(true)}>
                    Open account projects
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMailSent(false);
                      setMessage("");
                      setDialog("signin");
                    }}
                  >
                    Connect an account
                    <ArrowRight size={15} />
                  </button>
                )
              ) : (
                <span className="home-sync" role="status">
                  <CheckCheck size={15} />
                  {account.syncStatus}
                </span>
              )}
            </div>
            <div className="project-toolbar">
              <h2>
                All projects <span>{store.projects.length}</span>
              </h2>
              <div className="project-toolbar-actions">
                <label className="home-search">
                  <Search size={15} />
                  <input
                    aria-label="Search projects"
                    placeholder="Search projects…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Sort projects"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="updated">Last edited</option>
                  <option value="name">Name A–Z</option>
                </select>
                <button
                  className="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={account.loading}
                >
                  <Upload size={14} />
                  Import
                </button>
              </div>
            </div>
            {account.loading ? (
              <div className="home-empty" role="status">
                <Cloud size={26} />
                <h3>Opening your workspace…</h3>
                <p>Getting your projects ready.</p>
              </div>
            ) : (
              <div className="project-grid">
                {filtered.map((p) => (
                  <article className="project-card" key={p.id}>
                    <button
                      className="project-card-open"
                      aria-label={`Open ${p.schema.name}`}
                      onClick={() => onOpen(p.id)}
                    >
                      <ProjectPreview project={p} />
                      <div className="project-card-info">
                        <span className="project-card-engine">
                          <Braces size={12} />
                          {engineLabels[projectEngine(p.schema)]}
                        </span>
                        <h3>{p.schema.name}</h3>
                        <p>{p.schema.description || "No description"}</p>
                        <div className="project-card-stats">
                          <span>
                            <Table2 size={13} />
                            {p.schema.entities.length} entities
                          </span>
                          <span>
                            <GitBranch size={13} />
                            {p.schema.relationships.length} relationships
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="project-card-footer">
                      <span>
                        Edited{" "}
                        {new Date(p.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <Menu
                        label={`Actions for ${p.schema.name}`}
                        trigger={<MoreHorizontal size={18} />}
                      >
                        <MenuItem onSelect={() => onOpen(p.id)}>
                          <FolderOpen size={15} />
                          Open project
                        </MenuItem>
                        <MenuItem onSelect={() => action("rename", p)}>
                          <Settings2 size={15} />
                          Rename
                        </MenuItem>
                        <MenuItem
                          onSelect={() =>
                            onOpen(
                              store.createProject({
                                ...structuredClone(p.schema),
                                name: `${p.schema.name} copy`,
                              }),
                            )
                          }
                        >
                          <Copy size={15} />
                          Duplicate
                        </MenuItem>
                        <MenuItem onSelect={() => exportProject(p)}>
                          <Download size={15} />
                          Export JSON backup
                        </MenuItem>
                        <MenuItem danger onSelect={() => action("delete", p)}>
                          <Trash2 size={15} />
                          Delete project
                        </MenuItem>
                      </Menu>
                    </div>
                  </article>
                ))}
                {!search && (
                  <button className="project-create-card" onClick={openNew}>
                    <span>
                      <Plus size={25} />
                    </span>
                    <strong>Create a project</strong>
                    <p>Start with an empty schema.</p>
                  </button>
                )}
              </div>
            )}
            {!account.loading && !filtered.length && (
              <div className="home-empty">
                <FolderOpen size={27} />
                <h3>{search ? "No matching projects" : "No projects yet"}</h3>
                <p>
                  {search
                    ? "Try a different name or description."
                    : "Create a blank project, import a backup, or explore the university sample."}
                </p>
                {!search && (
                  <button
                    className="button"
                    onClick={() => onOpen(store.createProject(sampleSchema()))}
                  >
                    <Layers3 size={15} />
                    Explore starter project
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
        <input
          className="hidden-file"
          type="file"
          accept=".json,application/json"
          ref={fileInput}
          onChange={(e) => {
            if (e.target.files?.[0]) void importProject(e.target.files[0]);
          }}
        />
        {store.toast && (
          <div className="toast" role="status">
            <FileJson size={17} />
            {store.toast}
            <button
              aria-label="Dismiss notification"
              onClick={() => useProject.setState({ toast: "" })}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <Modal
          open={dialog !== null}
          onClose={() => setDialog(null)}
          title={
            dialog === "signin"
              ? account.configured
                ? "Sign in with email"
                : "Coming soon"
              : dialog === "delete"
                ? "Delete this project?"
                : dialog === "rename"
                  ? "Rename your project"
                  : "Create a new project"
          }
          description={
            dialog === "signin"
              ? account.configured
                ? "Sign in with an email link to access your account projects."
                : "Email sign-in and cloud projects are on their way."
              : dialog === "delete"
                ? "This removes the project from this workspace. Export a backup first if you want to keep it."
                : dialog === "rename"
                  ? "Update the project name."
                  : "Choose a name and database engine."
          }
        >
          {dialog === "signin" ? (
            !account.configured ? (
              <>
                <div className="info-callout">
                  <Cloud size={19} />
                  <p>
                    You can keep creating and saving projects on this device.
                  </p>
                </div>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    onClick={() => setDialog(null)}
                  >
                    Continue locally
                  </button>
                </div>
              </>
            ) : mailSent ? (
              <>
                <div className="info-callout" role="status">
                  <Mail size={20} />
                  <p>
                    Check <strong>{email}</strong> for your sign-in link. Open
                    it to access your account workspace.
                  </p>
                </div>
                <div className="modal-actions">
                  <button className="button" onClick={() => setMailSent(false)}>
                    Use another email
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setDialog(null)}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendLink();
                }}
              >
                <label className="field-label" htmlFor="signin-email">
                  EMAIL ADDRESS
                </label>
                <input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {message && (
                  <p className="account-error" role="alert">
                    {message}
                  </p>
                )}
                <p className="account-setup-note">
                  No password to remember. Your local projects stay on this
                  device.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  <button className="button primary" disabled={sending}>
                    {sending ? "Sending…" : "Send sign-in link"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </form>
            )
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (dialog === "new")
                  onOpen(
                    store.createProject({
                      ...emptySchema(),
                      name: name.trim() || "Untitled project",
                      engine,
                    }),
                  );
                else if (dialog === "delete" && target)
                  store.deleteProject(target.id);
                else if (dialog === "rename" && target) {
                  const projects = store.projects.map((p) =>
                    p.id === target.id
                      ? {
                          ...p,
                          schema: {
                            ...p.schema,
                            name: name.trim() || p.schema.name,
                          },
                          updatedAt: nextUpdatedAt(p.updatedAt),
                        }
                      : p,
                  );
                  const saved = saveWorkspace(store.scope, {
                    projects,
                    deletedIds: store.deletedIds,
                  });
                  useProject.setState({ projects, saved });
                }
                setDialog(null);
              }}
            >
              {dialog === "delete" ? (
                <div className="info-callout">
                  <Trash2 size={18} />
                  <p>
                    <strong>{target?.schema.name}</strong> and all its entities
                    and relationships will be removed.
                  </p>
                </div>
              ) : (
                <>
                  <label className="field-label" htmlFor="home-project-name">
                    PROJECT NAME
                  </label>
                  <input
                    id="home-project-name"
                    required
                    autoFocus
                    value={name}
                    placeholder="e.g. Inventory management"
                    onChange={(e) => setName(e.target.value)}
                  />
                  {dialog === "new" && (
                    <div className="home-engine-field">
                      <label className="field-label" htmlFor="home-engine">
                        DATABASE ENGINE
                      </label>
                      <select
                        id="home-engine"
                        value={engine}
                        onChange={(e) =>
                          setEngine(e.target.value as DatabaseEngine)
                        }
                      >
                        <option value="none">Choose later</option>
                        <option value="mysql">MySQL</option>
                        <option value="postgresql">PostgreSQL</option>
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </button>
                <button
                  className={`button ${dialog === "delete" ? "danger" : "primary"}`}
                >
                  {dialog === "delete"
                    ? "Delete project"
                    : dialog === "rename"
                      ? "Save name"
                      : "Create project"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </Tooltip.Provider>
  );
}

function ProjectPreview({ project }: { project: ProjectRecord }) {
  const entities = project.schema.entities.slice(0, 4);
  return (
    <div className="project-preview" aria-hidden="true">
      {entities.length ? (
        <>
          <svg
            className="preview-lines"
            viewBox="0 0 320 140"
            preserveAspectRatio="none"
          >
            <path d="M80 48 H160 V92 H240 M160 48 H240 M80 92 H160" />
          </svg>
          <div className="preview-nodes">
            {entities.map((e) => (
              <div className={`preview-node color-${e.color}`} key={e.id}>
                <strong>
                  <Table2 size={10} />
                  {e.name}
                </strong>
                <span>{e.attributes[0]?.name ?? "Add an attribute"}</span>
                <span>{e.attributes[1]?.name ?? "…"}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <span className="preview-empty">
          <Table2 size={25} strokeWidth={1.3} />
          No entities yet
        </span>
      )}
    </div>
  );
}
