import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const source = readFileSync(fileURLToPath(new URL("../src/issueTimeline.ts", import.meta.url)), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { ownerLabelIndexes } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("free-text and linked records with the same visible owner get one label", () => {
  const events = [
    { owner: "Ted" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
  ];
  assert.deepEqual(ownerLabelIndexes(events), [0]);
});

test("a visible owner change gets a new label", () => {
  const events = [
    { owner: "Rainer" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
  ];
  assert.deepEqual(ownerLabelIndexes(events), [0, 1]);
});
