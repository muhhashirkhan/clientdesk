import {test} from "node:test";
import assert from "node:assert/strict";
import {operationMessage} from "../src/lib/errors.ts";
import {readAllRows} from "../src/lib/read-all.ts";
test("provider details stay private while actionable business failures are preserved", () => {
  assert.equal(operationMessage({message:'Internal upstream error: secret token xyz'}), 'The change could not be saved. Please try again.');
  assert.match(operationMessage({code:'42501',message:'permission denied for table private'}), /permission/);
  assert.equal(operationMessage({code:'P0001',message:'This submission already has a decision'}), 'This submission already has a decision');
  assert.equal(operationMessage({code:'P0001',message:'Unknown private schema details'}), 'The change could not be saved. Please try again.');
});
test("related records beyond the row cap are retained and partial failed reads are rejected", async () => {
  const records = Array.from({length:1201}, (_,id) => ({id}));
  const result = await readAllRows((from,to) => Promise.resolve({data:records.slice(from,to+1),error:null}));
  assert.equal(result.data.length,1201);
  const failure = await readAllRows((from,to) => Promise.resolve(from ? {data:null,error:{message:'Unavailable'}} : {data:records.slice(from,to+1),error:null}));
  assert.deepEqual(failure.data,[]); assert(failure.error);
});

test("live mutation tests reject production and mismatched project references", async () => {
  const {spawnSync} = await import("node:child_process");
  for (const ref of ["ycysxbipmjraofdhtzwj", "wrong-project", "gdxkphfogkhyvlwhhvzl"]) {
    const result = spawnSync(process.execPath, ["--input-type=module","-e",'import {assertTestTarget} from "./scripts/test-target.mjs"; assertTestTarget();'], {env:{NODE_ENV:"test",CLIENTDESK_TEST_PROJECT:"true",CLIENTDESK_TEST_PROJECT_ID:ref,NEXT_PUBLIC_SUPABASE_URL:"https://gdxkphfogkhyvlwhhvzl.supabase.co"}});
    assert.equal(result.status === 0, ref === "gdxkphfogkhyvlwhhvzl");
  }
});
