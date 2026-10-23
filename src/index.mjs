import {readFile,writeFile,mkdir} from "node:fs/promises";
import {collectMembers,collectInstagram,collectTikTok} from "./collectors.mjs";
import {formatReport} from "./report.mjs";
import {sendLineWorks} from "./lineworks.mjs";
import {collectInstagramInsights,formatInstagramInsightsCsv,formatInstagramInsightsMarkdown,formatInstagramInsightsHtml} from "./instagram-insights.mjs";

const env=process.env, now=new Date();
let previous={};
try{previous=JSON.parse(await readFile("data/latest.json","utf8"));}catch{}
const values={};
const jobs=[()=>collectMembers(env),()=>collectInstagram(env,now),()=>collectTikTok(env,now)];
for(const job of jobs){
  try{Object.assign(values,await job());}catch(e){console.error(e instanceof Error?e.message:String(e));}
}
const text=formatReport(now,values,previous);
console.log(text);
if(env.DRY_RUN!=="1")await sendLineWorks(env,text);
await mkdir("data",{recursive:true});
await mkdir("docs",{recursive:true});
await writeFile("data/latest.json",JSON.stringify({...values,collectedAt:now.toISOString()},null,2)+"\n");
try {
  const insights=await collectInstagramInsights(env);
  if(insights.length){
    await writeFile("data/instagram-insights.csv",formatInstagramInsightsCsv(insights,now.toISOString()));
    await writeFile("data/instagram-insights.md",formatInstagramInsightsMarkdown(insights,now.toISOString()));
    await writeFile("docs/index.html",formatInstagramInsightsHtml(insights,now.toISOString()));
  }
} catch(e) { console.error(e instanceof Error?e.message:String(e)); }
