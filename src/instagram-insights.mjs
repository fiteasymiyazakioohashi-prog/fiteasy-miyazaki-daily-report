const API_VERSION = "v24.0";

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
  const response = await request(`https://graph.instagram.com/${API_VERSION}/${mediaId}/insights?${params}`);
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
  const response = await request(`https://graph.instagram.com/${API_VERSION}/${encodeURIComponent(env.INSTAGRAM_USER_ID)}/media?${params}`);
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
