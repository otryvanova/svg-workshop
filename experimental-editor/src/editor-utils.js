function findOpeningTag(source, id) {
  const markers = [
    'data-editor-id="' + id + '"',
    "data-editor-id='" + id + "'",
    'data-id="' + id + '"',
    "data-id='" + id + "'"
  ];
  return [...source.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)]
    .find((match) => markers.some((marker) => match[0].includes(marker))) || null;
}

export function updateElementAttributes(source, id, attributes) {
  const match = findOpeningTag(source, id);
  if (!match) return source;
  let tag = match[0];
  for (const [name, rawValue] of Object.entries(attributes)) {
    if (!/^[a-zA-Z_:][\w:.-]*$/.test(name)) continue;
    const value = String(rawValue)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");
    const pattern = new RegExp("(\\s" + name + "\\s*=\\s*)(['\"])[^'\"]*\\2", "i");
    if (pattern.test(tag)) {
      tag = tag.replace(pattern, (_, prefix, quote) => prefix + quote + value + quote);
    } else {
      tag = tag.replace(/\s*\/?>$/, (end) => " " + name + '="' + value + '"' + end);
    }
  }
  return source.slice(0, match.index) + tag + source.slice(match.index + match[0].length);
}

export function updateCircleAttribute(source, id, attribute, value) {
  if (!["cx", "cy"].includes(attribute)) throw new Error("Unsupported circle attribute");
  return updateElementAttributes(source, id, { [attribute]: value });
}

export function addSvgElement(source, tagName, attributes) {
  if (!["rect", "circle", "ellipse"].includes(tagName)) {
    throw new Error("Unsupported SVG element");
  }
  const attrs = Object.entries(attributes)
    .map(([name, value]) => name + '="' + String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;") + '"')
    .join(" ");
  const element = "<" + tagName + " " + attrs + "/>";
  const closeAt = source.toLowerCase().lastIndexOf("</svg>");
  if (closeAt < 0) throw new Error("SVG closing tag not found");
  return source.slice(0, closeAt) + "  " + element + "\n" + source.slice(closeAt);
}

export function removeSvgElement(source, id) {
  const match = findOpeningTag(source, id);
  if (!match) return source;
  const tagName = match[1];
  const openingTag = match[0];
  let end = match.index + openingTag.length;
  if (!/\/\s*>$/.test(openingTag)) {
    const closingTag = new RegExp("</" + tagName + "\\s*>", "i");
    const closing = closingTag.exec(source.slice(end));
    if (closing) end += closing.index + closing[0].length;
  }
  return source.slice(0, match.index) + source.slice(end);
}

export function countMatches(source, query) {
  if (!query) return 0;
  const haystack = source.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}


function gradientAttribute(tag, name) {
  const re = new RegExp("\\b" + name + "\\s*=\\s*(['\"])(.*?)\\1", "i");
  const match = tag.match(re);
  return match ? match[2] : null;
}

export function upsertGradientDefinition(source, id, type, stops) {
  if (!["linearGradient", "radialGradient"].includes(type)) throw new Error("Unsupported SVG gradient type");
  const safeId = String(id).replace(/[^a-zA-Z0-9_.:-]/g, "-");
  const geometry = type === "linearGradient"
    ? ' x1="0%" y1="0%" x2="100%" y2="0%"'
    : ' cx="50%" cy="50%" r="50%"';
  const stopTags = stops.map((stop) => {
    const offset = Math.max(0, Math.min(100, Number(stop.offset) || 0));
    const color = /^#[0-9a-f]{6}$/i.test(String(stop.color)) ? stop.color : "#000000";
    const opacity = Math.max(0, Math.min(1, Number(stop.opacity ?? 1)));
    return '    <stop offset="' + offset + '%" stop-color="' + color + '" stop-opacity="' + opacity + '"/>';
  }).join("\n");
  const markup = '  <' + type + ' id="' + safeId + '"' + geometry + '>\n' + stopTags + '\n  </' + type + '>';
  const defsMatch = /<defs\b[^>]*>[\s\S]*?<\/defs\s*>/i.exec(source);
  if (defsMatch) {
    const defs = defsMatch[0];
    const gradients = [...defs.matchAll(/<(linearGradient|radialGradient)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)];
    const existing = gradients.find((match) => gradientAttribute(match[0], "id") === safeId);
    const nextDefs = existing
      ? defs.slice(0, existing.index) + markup + defs.slice(existing.index + existing[0].length)
      : defs.replace(/<\/defs\s*>/i, markup + "\n</defs>");
    return source.slice(0, defsMatch.index) + nextDefs + source.slice(defsMatch.index + defs.length);
  }
  const root = /<svg\b[^>]*>/i.exec(source);
  if (!root) throw new Error("SVG root element not found");
  const defs = "<defs>\n" + markup + "\n</defs>";
  const at = root.index + root[0].length;
  return source.slice(0, at) + "\n" + defs + source.slice(at);
}

export function readGradientDefinition(source, id) {
  const gradients = [...source.matchAll(/<(linearGradient|radialGradient)\b[^>]*>[\s\S]*?<\/\1\s*>/gi)];
  const match = gradients.find((entry) => gradientAttribute(entry[0], "id") === id);
  if (!match) return null;
  const stops = [...match[0].matchAll(/<stop\b[^>]*\/?>/gi)].map((entry) => {
    const tag = entry[0];
    const rawOffset = gradientAttribute(tag, "offset") || "0%";
    const parsed = Number.parseFloat(rawOffset);
    return {
      offset: Math.max(0, Math.min(100, rawOffset.trim().endsWith("%") ? parsed : parsed * 100)),
      color: gradientAttribute(tag, "stop-color") || "#000000",
      opacity: Math.max(0, Math.min(1, Number(gradientAttribute(tag, "stop-opacity") ?? 1)))
    };
  });
  return { id, type: match[1], stops };
}
