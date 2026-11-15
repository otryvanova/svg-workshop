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
