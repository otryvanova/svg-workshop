export function updateCircleAttribute(source, id, attribute, value) {
  if (!["cx", "cy"].includes(attribute)) throw new Error("Unsupported circle attribute");
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp("<circle\\b(?=[^>]*\\bdata-id=(['\"])"+escaped+"\\1)[^>]*>", "i");
  const match = source.match(tagPattern);
  if (!match) return source;
  const tag = match[0];
  const attrPattern = new RegExp("(\\b"+attribute+"\\s*=\\s*)(['\"])[^'\"]*\\2", "i");
  const replacement = attrPattern.test(tag)
    ? tag.replace(attrPattern, "$1\""+String(value)+"\"")
    : tag.replace(/\s*\/?>$/, (end) => " "+attribute+"=\""+String(value)+"\""+end);
  return source.replace(tag, replacement);
}

export function countMatches(source, query) {
  if (!query) return 0;
  let count = 0;
  let index = 0;
  while ((index = source.indexOf(query, index)) !== -1) {
    count += 1;
    index += query.length;
  }
  return count;
}
