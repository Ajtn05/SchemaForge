export type DataType =
  | "INT"
  | "BIGINT"
  | "DECIMAL"
  | "VARCHAR"
  | "TEXT"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "TIMESTAMP";
export type Cardinality = "1:1" | "1:N" | "M:N";
export type Participation = "optional" | "mandatory";
export type DatabaseEngine = "none" | "mysql" | "postgresql";
export interface Attribute {
  id: string;
  name: string;
  type: DataType;
  length?: number;
  precision?: number;
  scale?: number;
  primaryKey: boolean;
  unique: boolean;
  nullable: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  multivalued: boolean;
  derived: boolean;
  storeDerived: boolean;
}
export interface Entity {
  id: string;
  name: string;
  description: string;
  color: string;
  attributes: Attribute[];
  position: { x: number; y: number };
}
export interface Relationship {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  cardinality: Cardinality;
  sourceParticipation: Participation;
  targetParticipation: Participation;
  fkSide?: "source" | "target";
  attributes: Attribute[];
  sourceHandle?: string;
  targetHandle?: string;
  associativePosition?: Entity["position"];
}
export interface ConceptualSchema {
  version: 1;
  engine?: DatabaseEngine;
  relationshipNotation?: "cardinality" | "crow-foot";
  name: string;
  description: string;
  entities: Entity[];
  relationships: Relationship[];
  specializations?: Specialization[];
  functionalDependencies?: FunctionalDependency[];
}
export interface Specialization {
  id: string;
  supertypeId: string;
  subtypeIds: string[];
  exclusivity: "disjoint" | "overlapping";
  completeness: "total" | "partial";
}
export interface FunctionalDependency {
  id: string;
  tableId: string;
  determinantIds: string[];
  dependentIds: string[];
}
export interface RelationalColumn extends Attribute {
  generated: boolean;
  references?: { table: string; column: string };
}
export interface ForeignKey {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
}
export interface RelationalTable {
  id: string;
  name: string;
  kind: "entity" | "subtype" | "associative" | "multivalued";
  sourceId: string;
  columns: RelationalColumn[];
  foreignKeys: ForeignKey[];
  uniqueGroups: string[][];
  explanation?: string;
}
export interface RelationalSchema {
  tables: RelationalTable[];
  enforcementNotes?: string[];
}
export interface ValidationIssue {
  id: string;
  severity: "error" | "warning" | "suggestion";
  title: string;
  message: string;
  entityId?: string;
  relationshipId?: string;
  attributeId?: string;
  specializationId?: string;
}
export const DATA_TYPES: DataType[] = [
  "INT",
  "BIGINT",
  "DECIMAL",
  "VARCHAR",
  "TEXT",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
];
