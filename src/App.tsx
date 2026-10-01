import { useEffect, useMemo, useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useReactFlow } from "@xyflow/react";
import {
  Layers3,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Undo2,
  Redo2,
  Download,
  Plus,
  Search,
  Table2,
  GitBranch,
  ShieldCheck,
  CircleHelp,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Sun,
  Moon,
  Braces,
  FolderOpen,
  FilePlus2,
  FileJson,
  RotateCcw,
  Keyboard,
  X,
  Sparkles,
  ListTree,
  Link2,
  CircleCheck,
  AlertTriangle,
  HardDrive,
  CheckCheck,
  Settings2,
} from "lucide-react";
import { useProject } from "./store/useProject";
import { emptySchema, sampleSchema } from "./domain/sample";
import { toRelational } from "./lib/transform";
import { validateSchema } from "./lib/validation";
import { generateSQL } from "./lib/sql";
import { projectEngine, engineLabels } from "./lib/engine";
import ProjectSettings from "./components/ProjectSettings";
import { downloadFile, isSchema } from "./lib/persistence";
import Diagram from "./components/canvas/Diagram";
import Inspector from "./components/inspector/Inspector";
import Output, { ModelView } from "./components/schema/Output";
import { IconButton, Menu, MenuItem, Modal } from "./components/ui/primitives";

type DialogKind =
  "new" | "rename" | "reset" | "clear" | "help" | "settings" | null;
export default function App({
  onHome,
  onOpenProject,
  cloudStatus,
}: {
  onHome: () => void;
  onOpenProject: (id: string) => void;
  cloudStatus: string;
}) {
  const store = useProject();
  const {
    schema,
    selection,
    select,
    addEntity,
    undo,
    redo,
    past,
    future,
    setMode,
    mode,
    theme,
    toggleTheme,
    notify,
    toast,
    saved,
    removeSelection,
    duplicate,
    replaceProject,
  } = store;
  const flow = useReactFlow();
  const engine = projectEngine(schema);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [projectName, setProjectName] = useState("");
  const [search, setSearch] = useState("");
  const [sideOpen, setSideOpen] = useState(true);
  const [entityOpen, setEntityOpen] = useState(true);
  const [relationshipOpen, setRelationshipOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState("explorer");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const viewTabs = useRef<HTMLDivElement>(null);
  const issues = useMemo(() => validateSchema(schema), [schema]);
  const errors = issues.filter((i) => i.severity === "error");
  const relational = useMemo(() => toRelational(schema), [schema]);
  useEffect(() => {
    const tabs = viewTabs.current;
    if (!tabs) return;
    const revealActiveTab = () => {
      const active = tabs.querySelector<HTMLButtonElement>("button.active");
      if (!active) return;
      const tabBounds = active.getBoundingClientRect();
      const visibleBounds = tabs.getBoundingClientRect();
      if (tabBounds.left < visibleBounds.left) {
        tabs.scrollLeft -= Math.ceil(visibleBounds.left - tabBounds.left);
      } else if (tabBounds.right > visibleBounds.right) {
        tabs.scrollLeft += Math.ceil(tabBounds.right - visibleBounds.right);
      }
    };
    revealActiveTab();
    const resize = new ResizeObserver(revealActiveTab);
    resize.observe(tabs);
    return () => resize.disconnect();
  }, [mode]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const input =
        e.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
          e.target.isContentEditable);
      const modifier = e.metaKey || e.ctrlKey;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("[role=dialog], [role=menu]")
      )
        return;
      if (modifier && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSideOpen(true);
        setMobileSidebar(true);
        setSidebarTab("explorer");
        setTimeout(() => searchInput.current?.focus(), 50);
        return;
      }
      if (input) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (modifier && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (modifier && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (modifier && e.key.toLowerCase() === "s") {
        e.preventDefault();
        notify(
          useProject.getState().persistSchema(useProject.getState().schema)
            ? "Project saved on this device."
            : "Local storage is unavailable. Export a JSON backup.",
        );
      } else if (e.key === "Escape") select(null);
      else if (["Delete", "Backspace"].includes(e.key)) {
        e.preventDefault();
        removeSelection();
      } else if (e.key.toLowerCase() === "n") addEntity();
      else if (e.key === "?") setDialog("help");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [addEntity, duplicate, notify, redo, removeSelection, select, undo]);
  function focusEntity(id: string) {
    select({ kind: "entity", id });
    setMode("diagram");
    setTimeout(
      () =>
        flow.fitView({
          nodes: [{ id }],
          padding: 0.6,
          duration: 350,
          maxZoom: 1,
        }),
      60,
    );
  }
  function openDialog(kind: DialogKind) {
    setProjectName(kind === "rename" ? schema.name : "");
    setDialog(kind);
  }
  function exportJSON() {
    downloadFile(
      JSON.stringify(schema, null, 2),
      `${schema.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.schemaforge.json`,
      "application/json",
    );
    notify("Project backup downloaded.");
  }
  function exportSQL() {
    if (engine === "none") {
      openDialog("settings");
      return;
    }
    if (errors.length) {
      store.setTab("validation");
      setMode("diagram");
      notify("Resolve validation errors before exporting SQL.");
      return;
    }
    downloadFile(
      generateSQL(relational, engine, schema.name),
      "schema.sql",
      "application/sql",
    );
    notify(`${engineLabels[engine]} file downloaded.`);
  }
  async function importJSON(file: File) {
    try {
      const input: unknown = JSON.parse(await file.text());
      if (!isSchema(input)) throw new Error("Invalid project");
      onOpenProject(store.createProject(input));
      setTimeout(() => flow.fitView({ padding: 0.13, duration: 300 }), 100);
    } catch {
      notify(
        "This file is not a valid SchemaForge project. Choose a .schemaforge.json backup.",
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  }
  function submitDialog() {
    if (dialog === "new") {
      onOpenProject(
        store.createProject({
          ...emptySchema(),
          name: projectName.trim() || "Untitled project",
        }),
      );
    } else if (dialog === "rename") {
      store.mutate((s) => {
        s.name = projectName.trim() || s.name;
      });
    } else if (dialog === "clear") {
      replaceProject({
        ...emptySchema(),
        name: schema.name,
        description: schema.description,
        engine,
      });
    } else if (dialog === "reset") {
      replaceProject(sampleSchema());
      setTimeout(() => flow.fitView({ padding: 0.13, duration: 300 }), 100);
    }
    setDialog(null);
  }
  const filteredEntities = schema.entities.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.attributes.some((a) =>
        a.name.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const filteredRelationships = schema.relationships.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="app-shell">
        <header className="app-header">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onHome();
            }}
            aria-label="SchemaForge home"
          >
            <span className="brand-symbol">
              <Layers3 size={21} strokeWidth={1.8} />
            </span>
            <span>
              schema<span className="brand-light">forge</span>
              <span className="brand-dot">.</span>
            </span>
          </a>
          <div className="header-breadcrumb">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onHome();
              }}
            >
              Workspace
            </a>
            <ChevronRight size={13} />
            <button onClick={() => openDialog("settings")}>
              {schema.name}
            </button>
            <span className="local-badge">
              <HardDrive size={11} />
              {store.scope === "local" ? "Local project" : "Account project"}
            </span>
          </div>
          <div className="header-actions">
            <span className={`save-status ${!saved ? "save-error" : ""}`}>
              <CheckCheck size={14} />
              {saved
                ? store.scope === "local"
                  ? "All changes saved"
                  : cloudStatus
                : "Save unavailable"}
            </span>
            <span className="header-divider" />
            <IconButton
              label="Undo · ⌘Z"
              disabled={!past.length}
              onClick={undo}
            >
              <Undo2 size={16} />
            </IconButton>
            <IconButton
              label="Redo · ⌘⇧Z"
              disabled={!future.length}
              onClick={redo}
            >
              <Redo2 size={16} />
            </IconButton>
            <span className="header-divider" />
            <IconButton
              label="Project settings"
              onClick={() => openDialog("settings")}
            >
              <Settings2 size={17} />
            </IconButton>
            <Menu
              label="Export project"
              className="header-export"
              trigger={
                <>
                  <Download size={15} />
                  Export
                  <ChevronDown size={12} />
                </>
              }
            >
              <MenuItem
                onSelect={exportSQL}
                disabled={engine === "none" || errors.length > 0}
              >
                <Braces size={15} />
                {engine === "none"
                  ? "Choose an engine for SQL export"
                  : `${engineLabels[engine]} file (.sql)`}
              </MenuItem>
              <MenuItem onSelect={exportJSON}>
                <FileJson size={15} />
                Project backup (.json)
              </MenuItem>
            </Menu>
          </div>
        </header>
        <div className="workspace">
          {sideOpen && (
            <aside className={`sidebar ${mobileSidebar ? "mobile-open" : ""}`}>
              <div className="sidebar-project">
                <div className="eyebrow">
                  YOUR WORKSPACE
                  <IconButton
                    label="Collapse sidebar"
                    onClick={() => {
                      if (window.innerWidth <= 850) setMobileSidebar(false);
                      else setSideOpen(false);
                    }}
                  >
                    <PanelLeftClose size={15} />
                  </IconButton>
                </div>
                <Menu
                  label="Project controls"
                  trigger={
                    <>
                      <span className="project-icon">
                        <FolderOpen size={19} />
                      </span>
                      <span className="project-button-label">
                        <strong>{schema.name}</strong>
                        <small>Database project</small>
                      </span>
                      <ChevronDown size={14} />
                    </>
                  }
                >
                  <MenuItem onSelect={onHome}>
                    <FolderOpen size={15} />
                    All projects
                  </MenuItem>
                  <MenuItem onSelect={() => openDialog("new")}>
                    <FilePlus2 size={15} />
                    New project
                  </MenuItem>
                  <MenuItem onSelect={() => openDialog("settings")}>
                    <Settings2 size={15} />
                    Project settings
                  </MenuItem>
                  <MenuItem onSelect={() => openDialog("rename")}>
                    Rename project
                  </MenuItem>
                  <MenuItem onSelect={undo}>
                    <Undo2 size={15} />
                    Undo
                  </MenuItem>
                  <MenuItem onSelect={redo}>
                    <Redo2 size={15} />
                    Redo
                  </MenuItem>
                  <MenuItem onSelect={() => fileInput.current?.click()}>
                    <FileJson size={15} />
                    Import JSON backup
                  </MenuItem>
                  <MenuItem onSelect={exportJSON}>
                    <Download size={15} />
                    Export JSON backup
                  </MenuItem>
                  <MenuItem danger onSelect={() => openDialog("clear")}>
                    <RotateCcw size={15} />
                    Reset project
                  </MenuItem>
                  <MenuItem onSelect={() => openDialog("reset")}>
                    <RotateCcw size={15} />
                    Load starter project
                  </MenuItem>
                </Menu>
                <div className="sidebar-tabs">
                  <button
                    className={sidebarTab === "explorer" ? "active" : ""}
                    onClick={() => setSidebarTab("explorer")}
                  >
                    <Layers3 size={14} />
                    Explorer
                  </button>
                  <button
                    className={sidebarTab === "issues" ? "active" : ""}
                    onClick={() => {
                      setSidebarTab("issues");
                      store.setTab("validation");
                    }}
                  >
                    <ShieldCheck size={14} />
                    Issues<span>{issues.length}</span>
                  </button>
                </div>
              </div>
              <div className="sidebar-search">
                <Search size={14} />
                <input
                  ref={searchInput}
                  aria-label="Search entities and relationships"
                  placeholder="Search your schema..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search ? (
                  <button
                    aria-label="Clear search"
                    onClick={() => setSearch("")}
                  >
                    <X size={12} />
                  </button>
                ) : (
                  <kbd>⌘ K</kbd>
                )}
              </div>
              <div className="sidebar-scroll">
                {sidebarTab === "explorer" ? (
                  <>
                    <div className="sidebar-section-title">
                      <button onClick={() => setEntityOpen((v) => !v)}>
                        {entityOpen ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        ENTITIES <span>{schema.entities.length}</span>
                      </button>
                      <IconButton
                        label="Add entity"
                        onClick={() => addEntity()}
                      >
                        <Plus size={14} />
                      </IconButton>
                    </div>
                    {entityOpen && (
                      <div className="entity-navigation">
                        {filteredEntities.map((e) => (
                          <div key={e.id}>
                            <button
                              className={`entity-nav-row ${selection?.kind === "entity" && selection.id === e.id ? "active" : ""}`}
                              onClick={() => focusEntity(e.id)}
                            >
                              <span
                                className={`nav-entity-icon color-${e.color}`}
                              >
                                <Table2 size={15} />
                              </span>
                              <span>{e.name}</span>
                              <small>{e.attributes.length}</small>
                              <ChevronRight size={12} />
                            </button>
                            {selection?.kind === "entity" &&
                              selection.id === e.id && (
                                <div className="nav-attributes">
                                  {e.attributes.slice(0, 5).map((a) => (
                                    <button
                                      key={a.id}
                                      className={
                                        selection.attributeId === a.id
                                          ? "active"
                                          : ""
                                      }
                                      onClick={() =>
                                        select({
                                          kind: "entity",
                                          id: e.id,
                                          attributeId: a.id,
                                        })
                                      }
                                    >
                                      <span
                                        className={`nav-attr-dot ${a.primaryKey ? "primary" : ""}`}
                                      />
                                      {a.name}
                                      {a.primaryKey && <span>PK</span>}
                                    </button>
                                  ))}
                                  {e.attributes.length > 5 && (
                                    <span className="nav-more">
                                      +{e.attributes.length - 5} more attribute
                                      {e.attributes.length > 6 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                        {filteredEntities.length === 0 && (
                          <p className="nav-empty">
                            {search
                              ? "No matching entities"
                              : "No entities yet"}
                          </p>
                        )}
                        <button
                          className="sidebar-add"
                          onClick={() => addEntity()}
                        >
                          <Plus size={14} />
                          Add entity<span>N</span>
                        </button>
                      </div>
                    )}
                    <div className="sidebar-section-title relationship-title">
                      <button onClick={() => setRelationshipOpen((v) => !v)}>
                        {relationshipOpen ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronRight size={13} />
                        )}
                        RELATIONSHIPS <span>{schema.relationships.length}</span>
                      </button>
                      <IconButton
                        label="How to create a relationship"
                        onClick={() =>
                          notify(
                            "Drag a circle on an entity to another entity. Then edit its cardinality in the inspector.",
                          )
                        }
                      >
                        <Plus size={14} />
                      </IconButton>
                    </div>
                    {relationshipOpen && (
                      <div className="relationship-navigation">
                        {filteredRelationships.map((r) => (
                          <button
                            className={`relationship-nav-row ${selection?.kind === "relationship" && selection.id === r.id ? "active" : ""}`}
                            key={r.id}
                            onClick={() => {
                              select({ kind: "relationship", id: r.id });
                              setMode("diagram");
                            }}
                          >
                            <GitBranch size={14} />
                            <span>{r.name}</span>
                            <small>{r.cardinality}</small>
                          </button>
                        ))}
                        {filteredRelationships.length === 0 && (
                          <p className="nav-empty">
                            {search
                              ? "No matching relationships"
                              : "Connect entities to begin"}
                          </p>
                        )}
                      </div>
                    )}
                    {(schema.specializations ?? []).length > 0 && (
                      <>
                        <div className="sidebar-section-title relationship-title">
                          <button>
                            SUBTYPES{" "}
                            <span>{schema.specializations?.length}</span>
                          </button>
                        </div>
                        <div className="relationship-navigation">
                          {schema.specializations?.map((g) => (
                            <button
                              className={`relationship-nav-row ${selection?.kind === "specialization" && selection.id === g.id ? "active" : ""}`}
                              key={g.id}
                              onClick={() => {
                                select({ kind: "specialization", id: g.id });
                                setMode("diagram");
                              }}
                            >
                              <GitBranch size={14} />
                              <span>
                                {
                                  schema.entities.find(
                                    (e) => e.id === g.supertypeId,
                                  )?.name
                                }
                              </span>
                              <small>
                                {g.exclusivity === "disjoint" ? "d" : "o"}
                              </small>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="sidebar-issues">
                    {issues.length ? (
                      issues.map((i) => (
                        <button
                          key={i.id}
                          onClick={() => {
                            if (i.entityId) focusEntity(i.entityId);
                            else if (i.relationshipId)
                              select({
                                kind: "relationship",
                                id: i.relationshipId,
                              });
                            store.setTab("validation");
                          }}
                        >
                          {i.severity === "error" ? (
                            <AlertTriangle size={15} />
                          ) : (
                            <Sparkles size={15} />
                          )}
                          <span>
                            <strong>{i.title}</strong>
                            <small>{i.severity}</small>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="nav-empty">No issues found.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="sidebar-bottom">
                <div className="sidebar-footer">
                  <button onClick={() => setDialog("help")}>
                    <CircleHelp size={15} />
                    Help & shortcuts
                  </button>
                  <IconButton
                    label={
                      theme === "light"
                        ? "Switch to dark theme"
                        : "Switch to light theme"
                    }
                    onClick={toggleTheme}
                  >
                    {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
                  </IconButton>
                </div>
              </div>
            </aside>
          )}
          <button
            className={`sidebar-backdrop ${mobileSidebar ? "visible" : ""}`}
            aria-label="Close explorer"
            onClick={() => setMobileSidebar(false)}
          />
          <main className="main-workspace">
            <div className="workspace-heading">
              <div>
                <button
                  className="mobile-sidebar-toggle icon-button"
                  aria-label="Open project explorer"
                  onClick={() => {
                    setSideOpen(true);
                    setMobileSidebar(true);
                  }}
                >
                  <Layers3 size={17} />
                </button>
                {!sideOpen && (
                  <IconButton
                    label="Expand sidebar"
                    onClick={() => setSideOpen(true)}
                  >
                    <ChevronRight size={17} />
                  </IconButton>
                )}
                <div>
                  <h1>
                    Database design <span className="tag">DRAFT</span>
                  </h1>
                  <p>Good databases start with a clear picture.</p>
                </div>
              </div>
              <span
                className="engine-status"
                aria-label={`Database engine: ${engineLabels[engine]}`}
              >
                {engineLabels[engine]}
                {engine !== "none" && <span className="tag">DDL</span>}
              </span>
            </div>
            <div className="workspace-viewbar">
              <div className="view-tabs" ref={viewTabs}>
                <button
                  className={mode === "diagram" ? "active" : ""}
                  onClick={() => setMode("diagram")}
                >
                  <GitBranch size={15} />
                  EER diagram
                </button>
                <button
                  className={mode === "schema" ? "active" : ""}
                  onClick={() => setMode("schema")}
                >
                  <Table2 size={15} />
                  Relational schema
                </button>
                <button
                  className={mode === "normalization" ? "active" : ""}
                  onClick={() => setMode("normalization")}
                >
                  <ListTree size={15} />
                  Normalization
                </button>
                <button
                  className={mode === "sql" ? "active" : ""}
                  onClick={() => setMode("sql")}
                >
                  <Braces size={15} />
                  SQL editor
                </button>
              </div>
              <div className="viewbar-actions">
                <span className="desktop-inspector-toggle">
                  <IconButton
                    label={store.inspectorCollapsed ? "Show inspector" : "Minimize inspector"}
                    aria-expanded={!store.inspectorCollapsed}
                    aria-controls="properties-inspector"
                    onClick={() => store.setInspectorCollapsed(!store.inspectorCollapsed)}
                  >
                    {store.inspectorCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
                  </IconButton>
                </span>
                <button
                  className="mobile-inspector-toggle button small"
                  aria-label={store.inspectorOpen ? "Close inspector" : "Open inspector"}
                  aria-expanded={store.inspectorOpen}
                  aria-controls="properties-inspector"
                  onClick={() => store.setInspectorOpen(!store.inspectorOpen)}
                >
                  <PanelRightOpen size={14} />
                  Properties
                </button>
                {mode === "diagram" ? (
                  <button className="button small" onClick={() => addEntity()}>
                    <Plus size={14} />
                    Add entity
                  </button>
                ) : (
                  <button
                    className="button small"
                    onClick={() => setMode("diagram")}
                  >
                    <ChevronLeft size={14} />
                    Back to diagram
                  </button>
                )}
              </div>
            </div>
            <div className="canvas-and-output">
              {mode === "diagram" ? (
                <>
                  <Diagram />
                  <Output onOpenSettings={() => openDialog("settings")} />
                </>
              ) : (
                <div className="full-model">
                  <div className="full-model-title">
                    <span className="section-kicker">
                      {mode === "schema"
                        ? "RELATIONAL MODEL"
                        : mode === "normalization"
                          ? "DEPENDENCY ANALYSIS"
                          : engine === "none"
                            ? "SQL TARGET"
                            : `${engineLabels[engine].toUpperCase()} IMPLEMENTATION`}
                    </span>
                    <h2>
                      {mode === "schema"
                        ? "From concepts to tables."
                        : mode === "normalization"
                          ? "Check the rules behind your tables."
                          : "Your design, ready to build."}
                    </h2>
                    <p>
                      {mode === "schema"
                        ? `${relational.tables.length} tables derived from ${schema.entities.length} ${schema.entities.length === 1 ? "entity" : "entities"}. Generated foreign keys and associative tables are highlighted.`
                        : mode === "normalization"
                          ? "Review atomic values and functional dependencies before implementing your design."
                          : engine === "none"
                            ? "Select a database engine in Project settings to generate SQL."
                            : "Deterministic SQL generated from your relational schema. Every change to your diagram is reflected here."}
                    </p>
                  </div>
                  <ModelView
                    view={mode}
                    full
                    onOpenSettings={() => openDialog("settings")}
                  />
                </div>
              )}
            </div>
            <footer className="workspace-status">
              <div>
                <span
                  className={`status-dot ${errors.length ? "error" : ""}`}
                />
                <button
                  onClick={() => {
                    store.setTab("validation");
                    setMode("diagram");
                  }}
                >
                  {errors.length
                    ? `${errors.length} design error${errors.length > 1 ? "s" : ""}`
                    : "All checks passed"}
                </button>
                <span className="status-divider" />
                <span>
                  {schema.entities.length}{" "}
                  {schema.entities.length === 1 ? "entity" : "entities"}
                </span>
                <span className="status-bullet">·</span>
                <span>
                  {schema.relationships.length}{" "}
                  {schema.relationships.length === 1
                    ? "relationship"
                    : "relationships"}
                </span>
              </div>
              <button onClick={() => setDialog("help")}>
                <Keyboard size={13} />
                <span>Keyboard shortcuts</span>
                <kbd>?</kbd>
              </button>
            </footer>
          </main>
          <Inspector />
        </div>
        <input
          type="file"
          accept=".json,application/json"
          ref={fileInput}
          className="hidden-file"
          onChange={(e) => {
            if (e.target.files?.[0]) void importJSON(e.target.files[0]);
          }}
        />
        {toast && (
          <div className="toast" role="status">
            <CircleCheck size={17} />
            {toast}
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
            dialog === "settings"
              ? "Project settings"
              : dialog === "help"
                ? "Make yourself at home."
                : dialog === "new"
                  ? "Create a new project"
                  : dialog === "rename"
                    ? "Rename your project"
                    : dialog === "clear"
                      ? "Reset your project?"
                      : "Load the starter project?"
          }
          description={
            dialog === "settings"
              ? "Configure your project, diagram, and SQL target."
              : dialog === "help"
                ? "A few shortcuts for a faster design workflow."
                : dialog === "clear"
                  ? "This clears all entities and relationships. Your project name is kept, and you can undo this action."
                  : dialog === "reset"
                    ? "This replaces your current diagram with the university sample. You can undo this action."
                    : dialog === "new"
                      ? "Start with a blank canvas. Your existing projects stay in your workspace."
                      : "A clear name keeps your workspace organized."
          }
        >
          {dialog === "settings" ? (
            <ProjectSettings onClose={() => setDialog(null)} />
          ) : dialog === "help" ? (
            <>
              <div className="shortcuts-grid">
                {[
                  ["Add entity", "N"],
                  ["Search schema", "⌘ / Ctrl + K"],
                  ["Undo", "⌘ / Ctrl + Z"],
                  ["Redo", "⌘ / Ctrl + Shift + Z"],
                  ["Duplicate entity", "⌘ / Ctrl + D"],
                  ["Save locally", "⌘ / Ctrl + S"],
                  ["Delete selection", "Delete"],
                  ["Clear selection", "Esc"],
                  ["Multi-select", "Shift + click"],
                  ["Pan canvas", "Space + drag"],
                  ["Create on canvas", "Double-click"],
                  ["Rename entity", "Double-click name"],
                  ["Next attribute", "Enter in name field"],
                ].map(([label, key]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
              </div>
              <div className="info-callout">
                <Link2 size={16} />
                <p>
                  Drag any circle on an entity to another entity to create a
                  relationship. Click a relationship to set cardinality and
                  participation.
                </p>
              </div>
              <div className="modal-actions">
                <button
                  className="button primary"
                  onClick={() => setDialog(null)}
                >
                  Got it
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitDialog();
              }}
            >
              {dialog !== "reset" && dialog !== "clear" && (
                <>
                  <label className="field-label" htmlFor="project-name">
                    PROJECT NAME
                  </label>
                  <input
                    id="project-name"
                    autoFocus
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. University management"
                    required
                  />
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
                <button type="submit" className="button primary">
                  {dialog === "new"
                    ? "Create project"
                    : dialog === "rename"
                      ? "Save name"
                      : dialog === "clear"
                        ? "Reset project"
                        : "Load sample"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </Tooltip.Provider>
  );
}
