import {mkdir,writeFile} from "node:fs/promises";
import {collectInstagramInsights,formatInstagramInsightsCsv,formatInstagramInsightsMarkdown,formatInstagramInsightsHtml} from "./instagram-insights.mjs";

const now=new Date();
const insights=await collectInstagramInsights(process.env);
if(!insights.length) throw new Error("Instagramインサイトを取得できませんでした");
await mkdir("data",{recursive:true});
await mkdir("docs",{recursive:true});
await writeFile("data/instagram-insights.csv",formatInstagramInsightsCsv(insights,now.toISOString()));
await writeFile("data/instagram-insights.md",formatInstagramInsightsMarkdown(insights,now.toISOString()));
await writeFile("docs/index.html",formatInstagramInsightsHtml(insights,now.toISOString()));
console.log(`${insights.length}件のInstagramインサイトを更新しました`);
