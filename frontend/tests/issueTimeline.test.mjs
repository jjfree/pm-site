import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(fileURLToPath(new URL("../src/issueTimeline.ts", import.meta.url)), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { issueOwnerDisplay, issueOwnerFilters } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("latest issue owners use aliases and each person can be filtered", () => {
  const row = { owner: "張小明", owner_member_ids: ["member-1", "member-2"],
    owner_people: [{ id: "member-1", label: "Ted" }, { id: "member-2", label: "Alex" }] };
  assert.equal(issueOwnerDisplay(row), "Ted、Alex");
  assert.deepEqual(issueOwnerFilters(row), [
    { value: "member:member-1", label: "Ted" },
    { value: "member:member-2", label: "Alex" },
  ]);
});

test("legacy owners remain visible until reassigned", () => {
  assert.equal(issueOwnerDisplay({ owner: "Old name" }), "Old name");
  assert.deepEqual(issueOwnerFilters({ owner: "Old name" }), [
    { value: "legacy:Old name", label: "Old name（待重新指派）" },
  ]);
});
