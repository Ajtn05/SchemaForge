import { useMemo, useState } from "react";
import {
  Braces,
  Table2,
  ShieldCheck,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  Sparkles,
  KeyRound,
  Link2,
  CircleCheck,
  TriangleAlert,
  CircleX,
  ExternalLink,
} from "lucide-react";
import { useProject, type OutputTab } from "../../store/useProject";
import { toRelational } from "../../lib/transform";
import { sqlType } from "../../lib/mysql";
import { generateSQL } from "../../lib/sql";
import { projectEngine, engineLabels } from "../../lib/engine";
import { validateSchema } from "../../lib/validation";
import { downloadFile } from "../../lib/persistence";
import type { RelationalTable } from "../../domain/types";
import Normalization from "./Normalization";
import { IconButton } from "../ui/primitives";
export function SQLCode({ sql }: { sql: string }) {
  return (
    <pre className="sql-code">
      <code>
        {sql.split("\n").map((line, index) => (
          <div className="code-line" key={index}>
            <span className="line-number">{index + 1}</span>
            <span>
              {line.startsWith("--") ? (
                <span className="sql-comment">{line}</span>
              ) : (
                line
                  .split(
                    /(`[^`]*`|"(?:""|[^"])*"|'(?:''|[^'])*'|\b(?:CREATE|TABLE|ALTER|ADD|CONSTRAINT|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|GENERATED|BY|AS|IDENTITY|AUTO_INCREMENT|UNIQUE|ENGINE|CHARSET|INT|BIGINT|VARCHAR|DECIMAL|NUMERIC|TEXT|BOOLEAN|DATE|DATETIME|TIMESTAMP|CURRENT_DATE|InnoDB)\b)/g,
                  )
                  .map((part, i) => (
                    <span
                      key={i}
                      className={
                        part.startsWith("`") || part.startsWith('"')
                          ? "sql-identifier"
                          : part.startsWith("'")
                            ? "sql-string"
                            : /^[A-Z_]+$/.test(part)
                              ? "sql-keyword"
                              : ""
                      }
                    >
                      {part}
                    </span>
                  ))
              )}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}
function TableCard({
  table: t,
  expanded,
}: {
  table: RelationalTable;
  expanded: boolean;
}) {
  const { schema, select, setMode } = useProject();
  const [showAll, setShowAll] = useState(expanded);
  const prioritized = [
    ...t.columns.filter((c) => c.primaryKey),
    ...t.columns.filter((c) => !c.primaryKey && c.references),
    ...t.columns.filter((c) => !c.primaryKey && !c.references),
  ];
  const cols = showAll ? t.columns : prioritized.slice(0, 4);
  return (
    <div
      className={`relation-card ${t.kind !== "entity" && t.kind !== "subtype" ? "generated" : ""}`}
    >
      <div className="relation-card-heading">
        <Table2 size={14} />
        <strong>{t.name}</strong>
        {t.kind !== "entity" && t.kind !== "subtype" && (
          <span className="generated-label">
            <Sparkles size={10} />
            GENERATED
          </span>
        )}
        <IconButton
          label={`Inspect ${t.name}`}
          onClick={() => {
            select({
              kind: t.kind === "associative" ? "relationship" : "entity",
              id: t.sourceId,
            });
            setMode("diagram");
          }}
        >
          <ExternalLink size={12} />
        </IconButton>
      </div>
      {cols.map((c) => (
        <div className="relation-column" key={c.id}>
          <span
            className={`column-marker ${c.primaryKey ? "pk" : c.generated ? "fk" : ""}`}
          >
            {c.primaryKey ? "PK" : c.references ? "FK" : "·"}
          </span>
          <span
            title={
              c.references
                ? `${c.name} → ${c.references.table}.${c.references.column}`
                : c.name
            }
          >
            {c.name}
            {c.references && <Link2 size={10} />}
          </span>
          <small>{sqlType(c, projectEngine(schema))}</small>
        </div>
      ))}
      {!showAll && t.columns.length > 4 && (
        <button className="more-columns" onClick={() => setShowAll(true)}>
          +{t.columns.length - 4} more columns
        </button>
      )}
      {expanded && t.explanation && (
        <div className="transformation-note">
          <Sparkles size={13} />
          <p>{t.explanation}</p>
        </div>
      )}
      {expanded && t.foreignKeys.length > 0 && (
        <div className="relation-foreign-keys">
          {t.foreignKeys.map((fk) => (
            <p key={fk.name}>
              <Link2 size={12} />
              {fk.columns.join(", ")} → {fk.referencedTable}.
              {fk.referencedColumns.join(", ")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
export function ModelView({
  view,
  full = false,
  onOpenSettings,
}: {
  view: OutputTab;
  full?: boolean;
  onOpenSettings?: () => void;
}) {
  const { schema, select, notify } = useProject();
  const engine = projectEngine(schema);
  const relational = useMemo(() => toRelational(schema), [schema]);
  const issues = useMemo(() => validateSchema(schema), [schema]);
  const sql = useMemo(
    () => generateSQL(relational, engine, schema.name),
    [relational, engine, schema.name],
  );
  const errors = issues.filter((i) => i.severity === "error");
  const entityTables = relational.tables.filter(
    (t) => t.kind === "entity" || t.kind === "subtype",
  );
  const previewTables = full
    ? relational.tables
    : [
        ...entityTables.slice(0, 2),
        ...relational.tables.filter(
          (t) => t.kind !== "entity" && t.kind !== "subtype",
        ),
        ...entityTables.slice(2),
      ];
  async function copySQL() {
    if (engine === "none") return;
    if (errors.length) {
      notify("Resolve validation errors before exporting SQL.");
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
      notify("SQL copied to clipboard.");
    } catch {
      notify("Clipboard is unavailable. Download the SQL file instead.");
    }
  }
  function downloadSQL() {
    if (engine === "none") return;
    if (errors.length) {
      notify("Resolve validation errors before exporting SQL.");
      return;
    }
    downloadFile(
      sql,
      `${schema.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}.sql`,
      "application/sql",
    );
    notify("SQL downloaded.");
  }
  if (view === "normalization")
    return <Normalization relational={relational} />;
  if (view === "schema")
    return (
      <div className={`schema-output ${full ? "full-view" : ""}`}>
        <div className="output-description">
          <span>
            <span className="live-dot" />
            Derived from your EER diagram
          </span>
          <span className="schema-legend">
            <KeyRound size={12} />
            Primary key <Link2 size={12} />
            Foreign key <span className="legend-generated" />
            Generated table
          </span>
        </div>
        {relational.tables.length ? (
          <div className={`relational-tables ${full ? "expanded" : ""}`}>
            {previewTables.map((t) => (
              <TableCard key={t.id} table={t} expanded={full} />
            ))}
          </div>
        ) : (
          <div className="output-empty">
            Add an entity to see your relational schema.
          </div>
        )}
      </div>
    );
  if (view === "sql" && engine === "none")
    return (
      <div className="output-empty sql-no-engine">
        <Braces size={24} />
        <strong>Choose a SQL target</strong>
        <p>
          Your diagram and relational schema are ready to design. Select MySQL
          or PostgreSQL in Project settings to generate SQL.
        </p>
        {onOpenSettings && (
          <button className="button" onClick={onOpenSettings}>
            Project settings
          </button>
        )}
      </div>
    );
  if (view === "sql")
    return (
      <div className={`sql-output ${full ? "full-view" : ""}`}>
        <div className="sql-actions">
          <span>
            <span className="file-dot" />
            schema.sql <span className="tag">{engineLabels[engine]}</span>
            <span className="sql-status">
              {errors.length
                ? `${errors.length} error${errors.length > 1 ? "s" : ""} to resolve`
                : "Up to date"}
            </span>
          </span>
          <div>
            <button
              className="button subtle small"
              disabled={errors.length > 0}
              onClick={copySQL}
            >
              <Copy size={13} />
              Copy SQL
            </button>
            <button
              className="button subtle small"
              disabled={errors.length > 0}
              onClick={downloadSQL}
            >
              <Download size={13} />
              Download
            </button>
          </div>
        </div>
        {errors.length > 0 && (
          <div className="sql-error">
            <TriangleAlert size={14} />
            Resolve design errors in Validation before copying or downloading.
          </div>
        )}
        <SQLCode sql={sql} />
      </div>
    );
  return (
    <div className={`validation-output ${full ? "full-view" : ""}`}>
      <div className="validation-summary">
        <CircleCheck size={16} />
        <span>
          {errors.length
            ? `${errors.length} design error${errors.length > 1 ? "s" : ""} to resolve`
            : "Your schema is looking good."}
        </span>
        <small>
          {issues.filter((i) => i.severity === "warning").length} warnings ·{" "}
          {issues.filter((i) => i.severity === "suggestion").length} suggestions
        </small>
      </div>
      {issues.length ? (
        issues.map((issue) => (
          <button
            className={`validation-issue ${issue.severity}`}
            key={issue.id}
            onClick={() => {
              if (issue.entityId)
                select({
                  kind: "entity",
                  id: issue.entityId,
                  attributeId: issue.attributeId,
                });
              else if (issue.relationshipId)
                select({
                  kind: "relationship",
                  id: issue.relationshipId,
                  attributeId: issue.attributeId,
                });
            }}
          >
            {issue.severity === "error" ? (
              <CircleX size={17} />
            ) : issue.severity === "warning" ? (
              <TriangleAlert size={17} />
            ) : (
              <Sparkles size={17} />
            )}
            <span>
              <strong>{issue.title}</strong>
              <p>{issue.message}</p>
            </span>
            <span className="tag">{issue.severity}</span>
          </button>
        ))
      ) : (
        <div className="validation-issue success">
          <CircleCheck size={19} />
          <span>
            <strong>No issues found</strong>
            <p>Your model meets the database rules checked by SchemaForge.</p>
          </span>
        </div>
      )}
    </div>
  );
}
export default function Output({
  onOpenSettings,
}: {
  onOpenSettings?: () => void;
}) {
  const { schema, outputTab, setTab, setMode } = useProject();
  const [collapsed, setCollapsed] = useState(false);
  const relations = toRelational(schema);
  const issues = validateSchema(schema);
  const tabs: [OutputTab, string, typeof Table2, number?][] = [
    ["schema", "Relational schema", Table2, relations.tables.length],
    ["sql", "Generated SQL", Braces],
    ["validation", "Validation", ShieldCheck, issues.length],
    ["normalization", "Normalization", Sparkles],
  ];
  return (
    <section className={`output-panel ${collapsed ? "collapsed" : ""}`}>
      <div className="output-header">
        <div className="output-tabs">
          {tabs.map(([key, label, Icon, count]) => (
            <button
              key={key}
              className={key === outputTab ? "active" : ""}
              onClick={() => {
                setTab(key);
                setCollapsed(false);
              }}
            >
              <Icon size={15} />
              {label}
              {count !== undefined && (
                <span
                  className={`tab-count ${key === "validation" && issues.some((i) => i.severity === "error") ? "error-count" : ""}`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="output-header-actions">
          <IconButton
            label="Expand output"
            disabled={outputTab === "validation"}
            onClick={() => {
              if (outputTab === "validation") {
                setCollapsed(false);
                return;
              }
              setMode(outputTab);
            }}
          >
            <ExternalLink size={14} />
          </IconButton>
          <IconButton
            label={collapsed ? "Show output" : "Collapse output"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </div>
      </div>
      {!collapsed && (
        <ModelView view={outputTab} onOpenSettings={onOpenSettings} />
      )}
    </section>
  );
}
