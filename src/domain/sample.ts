import type { Attribute, ConceptualSchema, Entity, DataType } from "./types";
export const uid = () => crypto.randomUUID();
export function attribute(
  name = "new_attribute",
  type: DataType = "VARCHAR",
  extra: Partial<Attribute> = {},
): Attribute {
  return {
    id: uid(),
    name,
    type,
    length: type === "VARCHAR" ? 255 : undefined,
    precision: type === "DECIMAL" ? 10 : undefined,
    scale: type === "DECIMAL" ? 2 : undefined,
    primaryKey: false,
    unique: false,
    nullable: false,
    autoIncrement: false,
    multivalued: false,
    derived: false,
    storeDerived: false,
    ...extra,
  };
}
const key = (name: string) =>
  attribute(name, "INT", { primaryKey: true, autoIncrement: true });
export function sampleSchema(): ConceptualSchema {
  const entities: Entity[] = [
    {
      id: "students",
      name: "students",
      description: "Students enrolled in the university.",
      color: "orange",
      position: { x: 60, y: 45 },
      attributes: [
        key("student_id"),
        attribute("first_name", "VARCHAR", { length: 100 }),
        attribute("last_name", "VARCHAR", { length: 100 }),
        attribute("email", "VARCHAR", { unique: true }),
        attribute("enrolled_at", "DATE"),
        attribute("status", "VARCHAR", { length: 30, defaultValue: "active" }),
      ],
    },
    {
      id: "courses",
      name: "courses",
      description: "Courses available for student enrollment.",
      color: "blue",
      position: { x: 450, y: 45 },
      attributes: [
        key("course_id"),
        attribute("course_name", "VARCHAR", { length: 150 }),
        attribute("course_code", "VARCHAR", { length: 20, unique: true }),
        attribute("credits", "INT"),
        attribute("description", "TEXT", { nullable: true }),
      ],
    },
    {
      id: "programs",
      name: "programs",
      description: "Academic programs offered by the university.",
      color: "purple",
      position: { x: 60, y: 375 },
      attributes: [
        key("program_id"),
        attribute("program_name", "VARCHAR", { length: 100 }),
        attribute("degree", "VARCHAR", { length: 50 }),
        attribute("duration_years", "INT"),
      ],
    },
    {
      id: "instructors",
      name: "instructors",
      description: "Faculty members who teach courses.",
      color: "green",
      position: { x: 450, y: 375 },
      attributes: [
        key("instructor_id"),
        attribute("full_name", "VARCHAR", { length: 150 }),
        attribute("email", "VARCHAR", { unique: true }),
        attribute("joined_at", "DATE"),
      ],
    },
  ];
  return {
    version: 1,
    name: "University management",
    description:
      "A relational model for students, courses, and academic programs.",
    entities,
    relationships: [
      {
        id: "enrollment",
        name: "enrollment",
        sourceId: "students",
        targetId: "courses",
        cardinality: "M:N",
        sourceParticipation: "optional",
        targetParticipation: "optional",
        sourceHandle: "right",
        targetHandle: "left",
        attributes: [
          attribute("enrolled_on", "DATE", { defaultValue: "CURRENT_DATE" }),
        ],
      },
      {
        id: "belongs_to",
        name: "belongs to",
        sourceId: "programs",
        targetId: "students",
        cardinality: "1:N",
        sourceParticipation: "optional",
        targetParticipation: "mandatory",
        sourceHandle: "top",
        targetHandle: "bottom",
        attributes: [],
      },
      {
        id: "teaches",
        name: "teaches",
        sourceId: "instructors",
        targetId: "courses",
        cardinality: "1:N",
        sourceParticipation: "optional",
        targetParticipation: "mandatory",
        sourceHandle: "top",
        targetHandle: "bottom",
        attributes: [],
      },
    ],
  };
}
export function emptySchema(): ConceptualSchema {
  return {
    version: 1,
    name: "Untitled project",
    description: "",
    entities: [],
    relationships: [],
  };
}
