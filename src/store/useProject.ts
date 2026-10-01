import { create } from "zustand";
import type {
  Attribute,
  ConceptualSchema,
  Entity,
  Relationship,
  Specialization,
} from "../domain/types";
import { attribute, sampleSchema, uid } from "../domain/sample";
import { loadProject, saveProject } from "../lib/persistence";
export type Selection =
  | { kind: "entity"; id: string; attributeId?: string }
  | { kind: "relationship"; id: string; attributeId?: string }
  | { kind: "specialization"; id: string; attributeId?: undefined }
  | null;
export type OutputTab = "schema" | "sql" | "validation" | "normalization";
interface ProjectStore {
  schema: ConceptualSchema;
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
  select: (selection: Selection) => void;
  selectMany: (ids: string[]) => void;
  setTab: (tab: OutputTab) => void;
  setMode: (mode: ProjectStore["mode"]) => void;
  notify: (message: string) => void;
  toggleTheme: () => void;
  setInspectorOpen: (open: boolean) => void;
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
  moveEntities: (
    positions: { id: string; position: Entity["position"] }[],
  ) => void;
  replaceProject: (schema: ConceptualSchema) => void;
}
const loaded = loadProject();
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
  saved: true,
  historyKey: "",
  historyAt: 0,
  inspectorOpen: false,
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
      saved: saveProject(next),
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
      saved: saveProject(next),
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
      saved: saveProject(next),
    });
  },
  checkpoint: () =>
    set({
      past: [...get().past.slice(-59), structuredClone(get().schema)],
      future: [],
      historyKey: "",
    }),
  moveEntities: (positions) => {
    const next = structuredClone(get().schema);
    for (const p of positions) {
      const e = next.entities.find((e) => e.id === p.id);
      if (e) e.position = p.position;
    }
    set({ schema: next, saved: saveProject(next) });
  },
  replaceProject: (schema) => {
    get().mutate((s) =>
      Object.assign(
        s,
        {
          engine: undefined,
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
