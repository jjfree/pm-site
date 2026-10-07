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

test("unchanged owner appears once in the latest right-hand segment", () => {
  const events = [
    { owner: "Ted" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
  ];
  assert.deepEqual(ownerLabelIndexes(events), [2]);
});

test("each changed owner appears in the rightmost segment of that assignment", () => {
  const events = [
    { owner: "Rainer" },
    { owner: "Rainer" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
    { owner: "張小明", owner_member_id: "member-1", owner_alias: "Ted" },
  ];
  assert.deepEqual(ownerLabelIndexes(events), [1, 3]);
});
