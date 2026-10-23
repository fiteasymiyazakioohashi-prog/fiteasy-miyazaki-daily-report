const API_VERSION = "v24.0";
const GRAPH_BASE_URL = "https://graph.instagram.com";

const metrics = [
  "views", "reach", "saved", "shares", "total_interactions",
  "likes", "comments", "ig_reels_video_view_total_time", "ig_reels_avg_watch_time"
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
    fields:"id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url",
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
      thumbnailUrl:media.thumbnail_url || media.media_url || "",
      caption:(media.caption || "").replaceAll(/\s+/g," ").trim(),
      likeCount:Number(media.like_count || insights.likes || 0),
      commentCount:Number(media.comments_count || insights.comments || 0),
      ...insights,
      plays:(media.media_product_type || media.media_type)==="REELS" ? insights.views : null,
      total_watch_time:insights.ig_reels_video_view_total_time,
      average_watch_time:insights.ig_reels_avg_watch_time
    });
  }
  return rows;
}

export function formatInstagramInsightsCsv(rows, collectedAt=new Date().toISOString()) {
  const columns=["collected_at","media_id","published_at","type","permalink","thumbnail_url","caption","likes","comments","views","reach","saved","shares","total_interactions","plays","total_watch_time","average_watch_time"];
  const lines=rows.map(row=>[
    collectedAt,row.id,row.publishedAt,row.type,row.permalink,row.thumbnailUrl,row.caption,row.likeCount,row.commentCount,
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

const html = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const duration = milliseconds => {
  if (typeof milliseconds !== "number") return "-";
  const seconds=Math.round(milliseconds/1000), hours=Math.floor(seconds/3600), minutes=Math.floor(seconds%3600/60), rest=seconds%60;
  return hours ? `${hours}時間${minutes}分${rest}秒` : minutes ? `${minutes}分${rest}秒` : `${rest}秒`;
};

export function formatInstagramInsightsHtml(rows, collectedAt=new Date().toISOString()) {
  const updated=new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"long",timeStyle:"short"}).format(new Date(collectedAt));
  const sum=key=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);
  const count=key=>rows.filter(row=>typeof row[key]==="number").length;
  const average=key=>count(key)?Math.round(sum(key)/count(key)):0;
  const display=(row,key)=>["total_watch_time","average_watch_time"].includes(key)?duration(row[key]):typeof row[key]==="number"?row[key].toLocaleString("ja-JP"):"-";
  const tableRows=rows.map((row,index)=>`<tr><td>${index+1}</td><td>${row.thumbnailUrl?`<a href="${html(row.permalink)}" target="_blank" rel="noopener"><img src="${html(row.thumbnailUrl)}" alt="投稿サムネイル" loading="lazy"></a>`:"-"}</td><td data-sort="${html(row.publishedAt)}">${new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",dateStyle:"short"}).format(new Date(row.publishedAt))}</td><td>${html(row.type)}</td><td class="caption">${html(row.caption)}</td><td><a href="${html(row.permalink)}" target="_blank" rel="noopener">見る</a></td>${["views","reach","likeCount","commentCount","saved","shares","total_interactions","plays","total_watch_time","average_watch_time"].map(key=>`<td data-value="${Number(row[key])||0}">${display(row,key)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram 投稿別インサイト</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202124;background:#f6f7f9}body{margin:0;padding:24px}.wrap{max-width:1800px;margin:auto}h1{margin:0 0 6px}.updated{color:#687078}.refresh{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0}.refresh a,.refresh button{border:0;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer;text-decoration:none}.refresh a{color:white;background:#218838}.refresh button{color:#333;background:#e7e9ec}.refresh small{color:#687078}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0}.card,.basis{background:white;border-radius:12px;padding:16px;box-shadow:0 1px 5px #0001}.card b{display:block;font-size:24px;margin-top:5px}.basis{margin:0 0 18px}.basis h2{font-size:17px;margin:0 0 8px}.basis p{margin:5px 0;color:#555;font-size:13px}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.controls input,.controls select{padding:10px 12px;border:1px solid #ccd1d7;border-radius:8px;background:white;font-size:15px}.table{overflow:auto;background:white;border-radius:12px;box-shadow:0 1px 5px #0001}table{border-collapse:collapse;width:100%;min-width:1800px}th,td{padding:10px;border-bottom:1px solid #e8eaed;text-align:right;white-space:nowrap;font-size:13px}th{position:sticky;top:0;background:#30343b;color:white;cursor:pointer}th:nth-child(2),th:nth-child(3),th:nth-child(4),th:nth-child(5),th:nth-child(6),td:nth-child(2),td:nth-child(3),td:nth-child(4),td:nth-child(5),td:nth-child(6){text-align:left}.caption{max-width:430px;overflow:hidden;text-overflow:ellipsis}td img{width:72px;height:72px;object-fit:cover;border-radius:8px;background:#eee}a{color:#1268d3}.note{color:#687078;font-size:13px;margin-top:12px}@media(max-width:600px){body{padding:14px}h1{font-size:22px}}
  </style></head><body><main class="wrap"><h1>Instagram 投稿別インサイト</h1><div class="updated">最終更新：${updated} ／ 集計対象：${rows.length}投稿</div><div class="refresh"><a href="https://github.com/fiteasymiyazakioohashi-prog/fiteasy-miyazaki-daily-report/actions/workflows/refresh-instagram.yml" target="_blank" rel="noopener">最新データを取得</a><button type="button" onclick="location.reload()">ページを再読み込み</button><small>GitHub画面で「Run workflow」を押すと、通常1〜3分で反映されます。</small></div><section class="cards"><div class="card">総閲覧数<b>${sum("views").toLocaleString("ja-JP")}</b></div><div class="card">平均閲覧数<b>${average("views").toLocaleString("ja-JP")}</b></div><div class="card">リール総再生数<b>${sum("plays").toLocaleString("ja-JP")}</b></div><div class="card">平均再生数<b>${average("plays").toLocaleString("ja-JP")}</b></div><div class="card">総再生時間<b>${duration(sum("total_watch_time"))}</b></div><div class="card">平均再生時間<b>${duration(average("average_watch_time"))}</b></div><div class="card">合計リーチ<b>${sum("reach").toLocaleString("ja-JP")}</b></div><div class="card">合計いいね<b>${sum("likeCount").toLocaleString("ja-JP")}</b></div><div class="card">合計保存<b>${sum("saved").toLocaleString("ja-JP")}</b></div><div class="card">合計シェア<b>${sum("shares").toLocaleString("ja-JP")}</b></div><div class="card">合計反応数<b>${sum("total_interactions").toLocaleString("ja-JP")}</b></div></section><section class="basis"><h2>数字の根拠</h2><p>取得元：Instagram API（FIT-EASY宮崎大橋店のプロアカウント）／ 取得日時：${updated}</p><p>総数＝取得できた各投稿の値の合計。平均＝合計 ÷ その指標を取得できた投稿数（閲覧数 ${count("views")}件、再生数 ${count("plays")}件、再生時間 ${count("average_watch_time")}件）。</p><p>「再生数」はリールの views、「総再生時間」は ig_reels_video_view_total_time、「平均再生時間」は ig_reels_avg_watch_time を使用しています。時間はAPIのミリ秒値を時・分・秒へ換算しています。投稿形式やAPI仕様により取得できない項目は「-」になります。<a href="https://raw.githubusercontent.com/fiteasymiyazakioohashi-prog/fiteasy-miyazaki-daily-report/main/data/instagram-insights.csv" download="instagram-insights.csv">CSVをダウンロード</a></p></section><div class="controls"><input id="q" placeholder="投稿内容を検索"><select id="kind"><option value="">すべての種類</option><option>FEED</option><option>REELS</option><option>STORY</option></select></div><div class="table"><table id="insights"><thead><tr>${["#","画像","投稿日","種類","内容","投稿","閲覧数","リーチ","いいね","コメント","保存","シェア","反応数","再生数","総再生時間","平均再生時間"].map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div><p class="note">見出しを押すと並べ替えできます。数値が取得できない項目は「-」です。</p></main><script>
  const tbody=document.querySelector('tbody'),rows=[...tbody.rows],q=document.querySelector('#q'),kind=document.querySelector('#kind');function filter(){const text=q.value.toLowerCase(),type=kind.value;rows.forEach(r=>r.hidden=!(r.cells[4].textContent.toLowerCase().includes(text)&&(!type||r.cells[3].textContent===type)))}q.oninput=filter;kind.onchange=filter;document.querySelectorAll('th').forEach((th,i)=>{let asc=false;th.onclick=()=>{asc=!asc;[...tbody.rows].sort((a,b)=>{const av=a.cells[i].dataset.value??a.cells[i].dataset.sort??a.cells[i].textContent,bv=b.cells[i].dataset.value??b.cells[i].dataset.sort??b.cells[i].textContent;return (Number(av)||Number(bv)?Number(av)-Number(bv):av.localeCompare(bv,'ja'))*(asc?1:-1)}).forEach(r=>tbody.append(r))}});
  </script></body></html>`;
}
