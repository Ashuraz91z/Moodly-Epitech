// Export CSV : séparateur « ; », guillemets échappés, virgule décimale, BOM (Excel en français).
import assert from "node:assert/strict";
let out = "";
(globalThis as any).document = { createElement: () => ({ click() {} }) };
(globalThis as any).URL.createObjectURL = () => "blob:";
(globalThis as any).URL.revokeObjectURL = () => {};
(globalThis as any).Blob = class { constructor(parts: string[]) { out = parts.join(""); } };
const { downloadCsv } = await import("../lib/csv.ts");
downloadCsv("x", [["a;b", 'il dit "oui"', 3.5, null], [1234.5, "ok"]]);
assert.equal(out, '﻿"a;b";"il dit ""oui""";3,5;\r\n1234,5;ok');
console.log("csv OK");
