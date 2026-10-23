const API_VERSION = "v24.0";
const GRAPH_BASE_URL = "https://graph.instagram.com";

const metrics = [
  "views", "reach", "saved", "shares", "total_interactions",
  "likes", "comments", "plays", "total_watch_time", "average_watch_time"
];

const csv = value => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function insight(mediaId, metric, token, request) {
  const params = new URLSearchParams({metric, access_token:token});
  const response = await request(`${GRAPH_BASE_URL}/${API_VERSION}/${mediaId}/insights?${params}`);
  if (!response.ok) return null;
  const body = await response.json();
  const item = body.data?.[0];
  const value = item?.total_value?.value ?? item?.values?.at(-1)?.value;
  return typeof value === "number" ? value : null;
}

export async function collectInstagramInsights(env, request=fetch) {
  if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_USER_ID) return [];
  const params = new URLSearchParams({
    fields:"id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
    limit:"100",
    access_token:env.INSTAGRAM_ACCESS_TOKEN
  });
  const response = await request(`${GRAPH_BASE_URL}/${API_VERSION}/${encodeURIComponent(env.INSTAGRAM_USER_ID)}/media?${params}`);
  if (!response.ok) throw new Error(`instagram-media:${response.status}`);
  const body = await response.json();
  const rows=[];
  for (const media of body.data || []) {
    const values = await Promise.all(metrics.map(name=>insight(media.id,name,env.INSTAGRAM_ACCESS_TOKEN,request)));
    const insights=Object.fromEntries(metrics.map((name,index)=>[name,values[index]]));
    rows.push({
      id:media.id,
      publishedAt:media.timestamp,
      type:media.media_product_type || media.media_type,
      permalink:media.permalink,
      caption:(media.caption || "").replaceAll(/\s+/g," ").trim(),
      likeCount:Number(media.like_count || insights.likes || 0),
      commentCount:Number(media.comments_count || insights.comments || 0),
      ...insights
    });
  }
  return rows;
}

export function formatInstagramInsightsCsv(rows, collectedAt=new Date().toISOString()) {
  const columns=["collected_at","media_id","published_at","type","permalink","caption","likes","comments","views","reach","saved","shares","total_interactions","plays","total_watch_time","average_watch_time"];
  const lines=rows.map(row=>[
    collectedAt,row.id,row.publishedAt,row.type,row.permalink,row.caption,row.likeCount,row.commentCount,
    row.views,row.reach,row.saved,row.shares,row.total_interactions,row.plays,row.total_watch_time,row.average_watch_time
  ].map(csv).join(","));
  return [columns.join(","),...lines].join("\n")+"\n";
}

const md = value => String(value ?? "-").replaceAll("|","\\|").replaceAll(/\s+/g," ").trim();
const number = value => typeof value === "number" ? value.toLocaleString("ja-JP") : "-";

export function formatInstagramInsightsMarkdown(rows, collectedAt=new Date().toISOString()) {
  const updated=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"long",timeStyle:"short"}).format(new Date(collectedAt));
  const lines=rows.map((row,index)=>{
    const date=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric"}).format(new Date(row.publishedAt));
    const caption=md(row.caption).slice(0,42)+(md(row.caption).length>42?"…":"");
    return `| ${index+1} | ${date} | ${md(row.type)} | [投稿を見る](${row.permalink}) | ${caption} | ${number(row.views)} | ${number(row.reach)} | ${number(row.likeCount)} | ${number(row.commentCount)} | ${number(row.saved)} | ${number(row.shares)} | ${number(row.total_interactions)} |`;
  });
  return [
    "# Instagram 投稿別インサイト", "", `最終更新：${updated}　／　取得件数：${rows.length}件`, "",
    "| # | 投稿日 | 種類 | 投稿 | 内容 | 閲覧数 | リーチ | いいね | コメント | 保存 | シェア | 反応数 |",
    "|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|", ...lines, "",
    "> 数値が取得できない項目は「-」と表示します。詳細データは `instagram-insights.csv` に保存されています。", ""
  ].join("\n");
}
