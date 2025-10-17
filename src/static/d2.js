const { D2 } = await import("https://esm.sh/@terrastruct/d2");

const d2 = new D2();

const textDecoder = new TextDecoder();

function extractSvg(value) {
  const visited = new Set();
  const queue = [value];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) continue;

    if (typeof current === "string") {
      if (current.includes("<svg")) return current;
      continue;
    }

    if (current instanceof Uint8Array) {
      const decoded = textDecoder.decode(current);
      if (decoded.includes("<svg")) return decoded;
      continue;
    }

    if (typeof current === "object") {
      if (visited.has(current)) continue;
      visited.add(current);

      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }

      for (const value of Object.values(current)) {
        queue.push(value);
      }

      if (current instanceof Map) {
        for (const entry of current.values()) {
          queue.push(entry);
        }
      } else if (
        typeof current[Symbol.iterator] === "function" &&
        !(current instanceof Map)
      ) {
        for (const entry of current) {
          if (Array.isArray(entry)) {
            queue.push(...entry);
          } else {
            queue.push(entry);
          }
        }
      }
    }
  }

  return "";
}

export async function compileD2(source) {
  const compiled = await d2.compile(source, { layout: "dagre", pad: 0 });
  const rendered = await d2.render(compiled.diagram, compiled.renderOptions);
  const svg = extractSvg(rendered);
  if (!svg) {
    console.warn("[d2] Unable to locate SVG output in render result", rendered);
  }
  return svg;
}
