import { create } from "zustand";
import type {
  Attribute,
  ConceptualSchema,
  Entity,
  Relationship,
  Specialization,
} from "../domain/types";
import { attribute, sampleSchema, uid } from "../domain/sample";
import { saveProject } from "../lib/persistence";
import {
  loadWorkspace,
  saveWorkspace,
  projectRecord,
  nextUpdatedAt,
  workspaceKey,
  type ProjectRecord,
  type WorkspaceData,
} from "../lib/workspace";
export type Selection =
  | { kind: "entity"; id: string; attributeId?: string }
  | { kind: "relationship"; id: string; attributeId?: string }
  | { kind: "specialization"; id: string; attributeId?: undefined }
  | null;
export type OutputTab = "schema" | "sql" | "validation" | "normalization";
interface ProjectStore {
  schema: ConceptualSchema;
  projects: ProjectRecord[];
  deletedIds: string[];
  scope: string;
  activeProjectId: string | null;
  persistSchema: (schema: ConceptualSchema) => boolean;
  openProject: (id: string) => boolean;
  createProject: (schema: ConceptualSchema) => string;
  deleteProject: (id: string) => void;
  setWorkspace: (scope: string, data: WorkspaceData) => void;
  acknowledgeSync: (records: ProjectRecord[], ids: string[]) => void;
  past: ConceptualSchema[];
  future: ConceptualSchema[];
  selection: Selection;
  selectedIds: string[];
  outputTab: OutputTab;
  mode: "diagram" | "schema" | "sql" | "normalization";
  theme: "light" | "dark";
  toast: string;
  saved: boolean;
  historyKey: string;
  historyAt: number;
  inspectorOpen: boolean;
  inspectorCollapsed: boolean;
  select: (selection: Selection) => void;
  selectMany: (ids: string[]) => void;
  setTab: (tab: OutputTab) => void;
  setMode: (mode: ProjectStore["mode"]) => void;
  notify: (message: string) => void;
  toggleTheme: () => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  mutate: (fn: (s: ConceptualSchema) => void, key?: string) => void;
  addEntity: (position?: Entity["position"]) => string;
  updateEntity: (id: string, changes: Partial<Entity>) => void;
  addAttribute: (entityId: string, relationship?: boolean) => void;
  updateAttribute: (
    entityId: string,
    attributeId: string,
    changes: Partial<Attribute>,
    relationship?: boolean,
  ) => void;
  deleteAttribute: (
    entityId: string,
    attributeId: string,
    relationship?: boolean,
  ) => void;
  connect: (
    source: string,
    target: string,
    handles?: Pick<Relationship, "sourceHandle" | "targetHandle">,
  ) => void;
  updateRelationship: (id: string, changes: Partial<Relationship>) => void;
  addSubtype: (supertypeId: string) => void;
  setSupertype: (subtypeId: string, supertypeId: string) => void;
  updateSpecialization: (id: string, changes: Partial<Specialization>) => void;
  removeSelection: () => void;
  duplicate: () => void;
  undo: () => void;
  redo: () => void;
  checkpoint: () => void;
  moveDiagramNodes: (
    positions: {
      kind: "entity" | "relationship";
      id: string;
      position: Entity["position"];
    }[],
  ) => void;
  replaceProject: (schema: ConceptualSchema) => void;
}
const workspace = loadWorkspace();
let initialSaved = true;
// Persist the initial library immediately so starter project URLs survive a reload.
try {
  if (!localStorage.getItem(workspaceKey("local")))
    initialSaved = saveWorkspace("local", workspace);
} catch {
  initialSaved = false;
}
const loaded = workspace.projects[0]?.schema;
const getTheme = (): "light" | "dark" => {
  try {
    return localStorage.getItem("schemaforge.theme") === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
};
export const useProject = create<ProjectStore>((set, get) => ({
  schema: loaded ?? sampleSchema(),
  projects: workspace.projects,
  deletedIds: workspace.deletedIds,
  scope: "local",
  activeProjectId: workspace.projects[0]?.id ?? null,
  persistSchema: (schema) => {
    const { projects, activeProjectId, scope, deletedIds } = get();
    const record = projects.find((p) => p.id === activeProjectId);
    const next = record
      ? projects.map((p) =>
          p.id === activeProjectId
            ? { ...p, schema, updatedAt: nextUpdatedAt(p.updatedAt) }
            : p,
        )
      : [...projects, projectRecord(schema)];
    const saved = saveWorkspace(scope, { projects: next, deletedIds });
    // Retain compatibility with existing single-project backups in local mode.
    if (scope === "local") saveProject(schema);
    set({
      projects: next,
      activeProjectId: record?.id ?? next[next.length - 1].id,
    });
    return saved;
  },
  openProject: (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return false;
    const saved = saveWorkspace(get().scope, {
      projects: get().projects,
      deletedIds: get().deletedIds,
    });
    set({
      activeProjectId: id,
      schema: structuredClone(project.schema),
      past: [],
      future: [],
      selection: null,
      selectedIds: [],
      historyKey: "",
      historyAt: 0,
      inspectorOpen: false,
      mode: "diagram",
      outputTab: "schema",
      toast: "",
      saved,
    });
    return true;
  },
  createProject: (schema) => {
    const record = projectRecord(schema);
    const projects = [...get().projects, record];
    const saved = saveWorkspace(get().scope, {
      projects,
      deletedIds: get().deletedIds,
    });
    set({ projects });
    get().openProject(record.id);
    set({ saved });
    return record.id;
  },
  deleteProject: (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    const deletedIds = [...new Set([...get().deletedIds, id])];
    const saved = saveWorkspace(get().scope, { projects, deletedIds });
    set({
      projects,
      deletedIds,
      saved,
      ...(get().activeProjectId === id ? { activeProjectId: null } : {}),
    });
  },
  setWorkspace: (scope, data) => {
    const saved = saveWorkspace(scope, data);
    set({
      ...data,
      scope,
      activeProjectId: null,
      schema: sampleSchema(),
      past: [],
      future: [],
      selection: null,
      selectedIds: [],
      inspectorOpen: false,
      saved,
    });
  },
  acknowledgeSync: (records, ids) => {
    const synced = new Map(records.map((p) => [p.id, p.updatedAt]));
    const projects = get().projects.map((p) =>
      synced.get(p.id) === p.updatedAt ? { ...p, syncedAt: p.updatedAt } : p,
    );
    const deletedIds = get().deletedIds.filter((id) => !ids.includes(id));
    const saved = saveWorkspace(get().scope, { projects, deletedIds });
    set({ projects, deletedIds, saved });
  },
  past: [],
  future: [],
  selection: loaded?.entities[0]
    ? { kind: "entity", id: loaded.entities[0].id }
    : loaded
      ? null
      : { kind: "entity", id: "students" },
  selectedIds: loaded
    ? loaded.entities[0]
      ? [loaded.entities[0].id]
      : []
    : ["students"],
  outputTab: "schema",
  mode: "diagram",
  theme: getTheme(),
  toast: "",
  saved: initialSaved,
  historyKey: "",
  historyAt: 0,
  inspectorOpen: false,
  inspectorCollapsed: false,
  select: (selection) =>
    set({
      selection,
      selectedIds: selection?.kind === "entity" ? [selection.id] : [],
      inspectorOpen: !!selection,
    }),
  selectMany: (selectedIds) => {
    const current = get().selection;
    const selection: Selection = selectedIds.length
      ? current?.kind === "entity" && selectedIds.includes(current.id)
        ? current
        : { kind: "entity", id: selectedIds[0] }
      : current?.kind === "relationship" || current?.kind === "specialization"
        ? current
        : null;
    set({ selectedIds, selection, inspectorOpen: !!selection });
  },
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
  setTab: (outputTab) => set({ outputTab }),
  setMode: (mode) => set({ mode }),
  notify: (toast) => {
    set({ toast });
    setTimeout(() => {
      if (get().toast === toast) set({ toast: "" });
    }, 3500);
  },
  toggleTheme: () => {
    const theme = get().theme === "light" ? "dark" : "light";
    try {
      localStorage.setItem("schemaforge.theme", theme);
    } catch {
      /* Theme still applies in this session. */
    }
    set({ theme });
  },
  mutate: (fn, key = "") => {
    const { schema, past, historyKey, historyAt } = get();
    const next = structuredClone(schema);
    fn(next);
    if (JSON.stringify(next) === JSON.stringify(schema)) return;
    const grouped = key && key === historyKey && Date.now() - historyAt < 700;
    set({
      schema: next,
      past: grouped ? past : [...past.slice(-59), schema],
      future: [],
      saved: get().persistSchema(next),
      historyKey: key,
      historyAt: Date.now(),
    });
  },
  addEntity: (position) => {
    const id = uid(),
      s = get().schema;
    let num = s.entities.length + 1;
    while (s.entities.some((e) => e.name === `entity_${num}`)) num++;
    get().mutate((s) =>
      s.entities.push({
        id,
        name: `entity_${num}`,
        description: "",
        color: ["orange", "blue", "purple", "green"][s.entities.length % 4],
        position: position ?? {
          x: 100 + (s.entities.length % 3) * 310,
          y: 100 + Math.floor(s.entities.length / 3) * 320,
        },
        attributes: [
          attribute("id", "INT", { primaryKey: true, autoIncrement: true }),
        ],
      }),
    );
    get().select({ kind: "entity", id });
    get().setMode("diagram");
    return id;
  },
  updateEntity: (id, changes) =>
    get().mutate(
      (s) => {
        const entity = s.entities.find((e) => e.id === id);
        if (entity) Object.assign(entity, changes);
      },
      `entity-${id}-${Object.keys(changes).join("-")}`,
    ),
  addAttribute: (entityId, relationship = false) => {
    const id = uid();
    get().mutate((s) => {
      const owner = (relationship ? s.relationships : s.entities).find(
        (e) => e.id === entityId,
      );
      if (owner) {
        let n = owner.attributes.length + 1;
        while (owner.attributes.some((a) => a.name === `attribute_${n}`)) n++;
        owner.attributes.push(attribute(`attribute_${n}`, "VARCHAR", { id }));
      }
    });
    get().select({
      kind: relationship ? "relationship" : "entity",
      id: entityId,
      attributeId: id,
    });
  },
  updateAttribute: (entityId, attributeId, changes, relationship = false) =>
    get().mutate(
      (s) => {
        const a = (relationship ? s.relationships : s.entities)
          .find((e) => e.id === entityId)
          ?.attributes.find((a) => a.id === attributeId);
        if (a) {
          Object.assign(a, changes);
          if (changes.primaryKey === true) a.nullable = false;
          if (changes.primaryKey === false) a.autoIncrement = false;
        }
      },
      `attr-${attributeId}-${Object.keys(changes).join("-")}`,
    ),
  deleteAttribute: (entityId, attributeId, relationship = false) => {
    get().mutate((s) => {
      const owner = (relationship ? s.relationships : s.entities).find(
        (e) => e.id === entityId,
      );
      if (owner)
        owner.attributes = owner.attributes.filter((a) => a.id !== attributeId);
    });
    get().select({
      kind: relationship ? "relationship" : "entity",
      id: entityId,
    });
  },
  connect: (sourceId, targetId, handles) => {
    const id = uid();
    get().mutate((s) =>
      s.relationships.push({
        id,
        name: `relationship_${s.relationships.length + 1}`,
        sourceId,
        targetId,
        cardinality: "1:N",
        sourceParticipation: "optional",
        targetParticipation: "mandatory",
        attributes: [],
        ...handles,
      }),
    );
    get().select({ kind: "relationship", id });
    get().notify("Relationship created. Set its cardinality in the inspector.");
  },
  updateRelationship: (id, changes) =>
    get().mutate(
      (s) => {
        const r = s.relationships.find((r) => r.id === id);
        if (r) Object.assign(r, changes);
      },
      `rel-${id}-${Object.keys(changes).join("-")}`,
    ),
  setSupertype: (subtypeId, supertypeId) => {
    if (subtypeId === supertypeId) return;
    // Reject ancestors before changing the hierarchy.
    let ancestor: string | undefined = supertypeId;
    const seen = new Set<string>();
    while (ancestor) {
      if (ancestor === subtypeId || seen.has(ancestor)) {
        get().notify("A subtype cannot be its own ancestor.");
        return;
      }
      seen.add(ancestor);
      ancestor = get().schema.specializations?.find((g) =>
        g.subtypeIds.includes(ancestor!),
      )?.supertypeId;
    }
    get().mutate((s) => {
      s.specializations = (s.specializations ?? [])
        .map((g) => ({
          ...g,
          subtypeIds: g.subtypeIds.filter((id) => id !== subtypeId),
        }))
        .filter((g) => g.subtypeIds.length);
      if (!supertypeId) return;
      const child = s.entities.find((e) => e.id === subtypeId);
      if (!child || !s.entities.some((e) => e.id === supertypeId)) return;
      child.attributes.forEach((a) => {
        a.primaryKey = false;
        a.autoIncrement = false;
      });
      let group = s.specializations.find((g) => g.supertypeId === supertypeId);
      if (!group) {
        group = {
          id: uid(),
          supertypeId,
          subtypeIds: [],
          exclusivity: "disjoint",
          completeness: "partial",
        };
        s.specializations.push(group);
      }
      group.subtypeIds.push(subtypeId);
    });
  },
  addSubtype: (supertypeId) => {
    const parent = get().schema.entities.find((e) => e.id === supertypeId);
    if (!parent) return;
    const id = uid();
    get().mutate((s) => {
      let name = `${parent.name}_subtype`,
        n = 2;
      while (s.entities.some((e) => e.name === name))
        name = `${parent.name}_subtype_${n++}`;
      s.entities.push({
        id,
        name,
        description: "",
        color: parent.color,
        attributes: [],
        position: {
          x: parent.position.x,
          y:
            Math.max(
              ...s.entities.map(
                (e) => e.position.y + 130 + e.attributes.length * 28,
              ),
            ) + 60,
        },
      });
      s.specializations ??= [];
      let group = s.specializations.find((g) => g.supertypeId === supertypeId);
      if (!group) {
        group = {
          id: uid(),
          supertypeId,
          subtypeIds: [],
          exclusivity: "disjoint",
          completeness: "partial",
        };
        s.specializations.push(group);
      }
      group.subtypeIds.push(id);
    });
    get().select({ kind: "entity", id });
    get().setMode("diagram");
  },
  updateSpecialization: (id, changes) =>
    get().mutate((s) => {
      const group = s.specializations?.find((g) => g.id === id);
      if (group) Object.assign(group, changes);
    }),
  removeSelection: () => {
    const { selection, selectedIds } = get();
    if (!selection && !selectedIds.length) return;
    if (selection?.attributeId) {
      get().deleteAttribute(
        selection.id,
        selection.attributeId,
        selection.kind === "relationship",
      );
      return;
    }
    get().mutate((s) => {
      if (selection?.kind === "specialization")
        s.specializations = s.specializations?.filter(
          (g) => g.id !== selection.id,
        );
      else if (selection?.kind === "relationship")
        s.relationships = s.relationships.filter((r) => r.id !== selection.id);
      else {
        const ids = selectedIds.length ? selectedIds : [selection?.id];
        s.entities = s.entities.filter((e) => !ids.includes(e.id));
        s.relationships = s.relationships.filter(
          (r) => !ids.includes(r.sourceId) && !ids.includes(r.targetId),
        );
        s.specializations = s.specializations
          ?.filter((g) => !ids.includes(g.supertypeId))
          .map((g) => ({
            ...g,
            subtypeIds: g.subtypeIds.filter((id) => !ids.includes(id)),
          }))
          .filter((g) => g.subtypeIds.length);
      }
    });
    get().select(null);
  },
  duplicate: () => {
    const { selection, selectedIds } = get();
    if (selection?.kind !== "entity") return;
    const ids = selectedIds.length ? selectedIds : [selection.id];
    const newIds: string[] = [];
    const copies = new Map<string, string>();
    get().mutate((s) => {
      for (const id of ids) {
        const entity = s.entities.find((e) => e.id === id);
        if (!entity) continue;
        const e = structuredClone(entity);
        e.id = uid();
        let suffix = 1;
        e.name = `${entity.name}_copy`;
        while (s.entities.some((t) => t.name === e.name))
          e.name = `${entity.name}_copy_${suffix++}`;
        e.attributes = e.attributes.map((a) => ({ ...a, id: uid() }));
        e.position = { x: e.position.x + 40, y: e.position.y + 40 };
        s.entities.push(e);
        newIds.push(e.id);
        copies.set(id, e.id);
      }
      for (const group of [...(s.specializations ?? [])]) {
        const children = group.subtypeIds
          .filter((id) => copies.has(id))
          .map((id) => copies.get(id)!);
        if (!children.length) continue;
        if (copies.has(group.supertypeId))
          s.specializations!.push({
            ...structuredClone(group),
            id: uid(),
            supertypeId: copies.get(group.supertypeId)!,
            subtypeIds: children,
          });
        else group.subtypeIds.push(...children);
      }
    });
    if (newIds[0]) get().select({ kind: "entity", id: newIds[0] });
    get().selectMany(newIds);
  },
  undo: () => {
    const { past, schema, future } = get();
    if (!past.length) return;
    const next = past[past.length - 1];
    set({
      schema: next,
      past: past.slice(0, -1),
      future: [schema, ...future],
      selection: null,
      selectedIds: [],
      historyKey: "",
      saved: get().persistSchema(next),
    });
  },
  redo: () => {
    const { past, schema, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({
      schema: next,
      past: [...past, schema],
      future: future.slice(1),
      selection: null,
      selectedIds: [],
      historyKey: "",
      saved: get().persistSchema(next),
    });
  },
  checkpoint: () =>
    set({
      past: [...get().past.slice(-59), structuredClone(get().schema)],
      future: [],
      historyKey: "",
    }),
  moveDiagramNodes: (positions) => {
    const next = structuredClone(get().schema);
    for (const p of positions) {
      if (p.kind === "entity") {
        const e = next.entities.find((e) => e.id === p.id);
        if (e) e.position = p.position;
      } else {
        const r = next.relationships.find((r) => r.id === p.id);
        if (r?.cardinality === "M:N") r.associativePosition = p.position;
      }
    }
    set({ schema: next, saved: get().persistSchema(next) });
  },
  replaceProject: (schema) => {
    get().mutate((s) =>
      Object.assign(
        s,
        {
          engine: undefined,
          relationshipNotation: undefined,
          specializations: undefined,
          functionalDependencies: undefined,
        },
        structuredClone(schema),
      ),
    );
    get().select(null);
    get().setMode("diagram");
    get().notify("Project loaded. Changes are saved on this device.");
  },
}));
