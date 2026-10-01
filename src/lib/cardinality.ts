import type { Attribute, Relationship } from "../domain/types";
export interface EndpointCardinality {
  minimum: 0 | 1;
  maximum: 1 | "many";
}
// Participation describes whether an instance must have a related instance.
// The glyph next to A shows how many A instances one B may have, so its minimum
// comes from B's participation. This agrees with FK nullability on the B side.
export function relationshipEndpoints(r: Relationship): {
  source: EndpointCardinality;
  target: EndpointCardinality;
} {
  return {
    source: {
      minimum: r.targetParticipation === "mandatory" ? 1 : 0,
      maximum: r.cardinality === "M:N" ? "many" : 1,
    },
    target: {
      minimum: r.sourceParticipation === "mandatory" ? 1 : 0,
      maximum: r.cardinality === "1:1" ? 1 : "many",
    },
  };
}
export function cardinalityLabel(c: EndpointCardinality): string {
  return c.maximum === 1
    ? c.minimum === 1
      ? "exactly one"
      : "zero or one"
    : c.minimum === 1
      ? "one or many"
      : "zero or many";
}
export const attributeLabel = (a: Attribute): string => {
  let label = a.derived ? `[${a.name}]` : a.name;
  if (a.multivalued) label = `{${label}}`;
  return label;
};
