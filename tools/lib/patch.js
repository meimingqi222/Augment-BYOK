"use strict";

function ensureMarker(src, marker) {
  if (src.includes(marker)) return src;
  return `${src}\n;/*${marker}*/\n`;
}

function insertBeforeSourceMappingURL(src, injection) {
  const idx = src.lastIndexOf("\n//# sourceMappingURL=");
  if (idx < 0) return src + injection;
  return src.slice(0, idx) + injection + src.slice(idx);
}

module.exports = { ensureMarker, insertBeforeSourceMappingURL };
