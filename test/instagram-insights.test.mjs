import test from "node:test";
import assert from "node:assert/strict";
import {collectInstagramInsights,formatInstagramInsightsCsv} from "../src/instagram-insights.mjs";

test("collects media metadata and available insights",async()=>{
  const request=async url=>{
    if(url.includes("/media?"))return new Response(JSON.stringify({data:[{id:"1",caption:'Hello, "Miyazaki"',media_type:"VIDEO",media_product_type:"REELS",permalink:"https://example.com/1",timestamp:"2026-10-22T10:00:00Z",like_count:12,comments_count:3}]}));
    const metric=new URL(url).searchParams.get("metric");
    if(metric==="views")return new Response(JSON.stringify({data:[{name:"views",values:[{value:345}]}]}));
    return new Response("{}",{status:400});
  };
  const rows=await collectInstagramInsights({INSTAGRAM_ACCESS_TOKEN:"token",INSTAGRAM_USER_ID:"user"},request);
  assert.equal(rows[0].type,"REELS");
  assert.equal(rows[0].views,345);
  const output=formatInstagramInsightsCsv(rows,"2026-10-23T11:00:00Z");
  assert.match(output,/REELS/);
  assert.match(output,/"Hello, ""Miyazaki"""/);
});
