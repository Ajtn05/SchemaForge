import type { EndpointCardinality } from "../../lib/cardinality";
export const endpointAngle = (position: string): number =>
  ({ right: 0, bottom: 90, left: 180, top: -90 })[position] ?? 0;
// Local +x points away from the entity. The maximum mark is closest to it;
// the minimum mark sits farther along the relationship line.
export function CrowFootGlyph({ minimum, maximum }: EndpointCardinality) {
  return (
    <>
      {maximum === "many" ? (
        <path className="crow-foot-many" d="M 3 -7 L 14 0 L 3 7 M 3 0 L 14 0" />
      ) : (
        <path className="crow-foot-one" d="M 5 -7 V 7" />
      )}
      {minimum === 0 ? (
        <circle
          className="crow-foot-zero"
          cx={maximum === "many" ? 23 : 17}
          cy="0"
          r="3.5"
          fill="var(--canvas)"
        />
      ) : (
        <path
          className="crow-foot-required"
          d={maximum === "many" ? "M 23 -7 V 7" : "M 17 -7 V 7"}
        />
      )}
    </>
  );
}
export function CrowFootEndpoint({
  x,
  y,
  position,
  cardinality,
  selected = false,
  side,
}: {
  x: number;
  y: number;
  position: string;
  cardinality: EndpointCardinality;
  selected?: boolean;
  side: "source" | "target";
}) {
  return (
    <g
      className="crow-foot-endpoint"
      data-side={side}
      data-minimum={cardinality.minimum}
      data-maximum={cardinality.maximum}
      transform={`translate(${x},${y}) rotate(${endpointAngle(position)})`}
      style={{ stroke: selected ? "var(--accent)" : "var(--edge)" }}
      strokeWidth={selected ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      pointerEvents="none"
      aria-hidden="true"
    >
      <CrowFootGlyph {...cardinality} />
    </g>
  );
}
export function CrowFootKey({
  cardinality,
}: {
  cardinality: EndpointCardinality;
}) {
  return (
    <svg className="crow-foot-key" viewBox="0 0 55 22" aria-hidden="true">
      <g
        transform="translate(4,11)"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M 0 0 H 45" />
        <CrowFootGlyph {...cardinality} />
      </g>
    </svg>
  );
}
