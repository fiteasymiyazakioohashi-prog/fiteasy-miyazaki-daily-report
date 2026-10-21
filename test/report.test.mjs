import test from "node:test";
import assert from "node:assert/strict";
import {formatReport} from "../src/report.mjs";

test("formats the established daily report",()=>{
 const out=formatReport(new Date("2026-10-20T11:00:00Z"),{members:536,provisionalMembers:7,reviews:120,instagramFollowers:451,instagramPostsToday:2,tiktokFollowers:0,tiktokPostsToday:2},{members:531,instagramFollowers:445});
 assert.match(out,/10\/20の報告/); assert.match(out,/536人／750人（\+5人）/); assert.match(out,/451人／500人（\+6人）/);
});
