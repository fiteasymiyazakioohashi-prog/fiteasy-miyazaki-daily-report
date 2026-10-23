const jstDay = date => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);

export async function collectMembers(env, request=fetch) {
  if (!env.MEMBERS_ENDPOINT) return {};
  const res = await request(env.MEMBERS_ENDPOINT, {headers: env.MEMBERS_TOKEN ? {Authorization:`Bearer ${env.MEMBERS_TOKEN}`} : {}});
  if (!res.ok) throw new Error(`members:${res.status}`);
  const data = await res.json();
  return {members:Number(data.members), provisionalMembers:Number(data.provisionalMembers)};
}

export async function collectInstagram(env, now=new Date(), request=fetch) {
  if (!env.INSTAGRAM_ACCESS_TOKEN || !env.INSTAGRAM_USER_ID) return {};
  const params = new URLSearchParams({fields:"followers_count,media.limit(50){timestamp}",access_token:env.INSTAGRAM_ACCESS_TOKEN});
  const res = await request(`https://graph.instagram.com/v24.0/${encodeURIComponent(env.INSTAGRAM_USER_ID)}?${params}`);
  if (!res.ok) throw new Error(`instagram:${res.status}`);
  const data = await res.json();
  const day=jstDay(now), media=Array.isArray(data.media?.data)?data.media.data:[];
  return {instagramFollowers:Number(data.followers_count),instagramPostsToday:media.filter(x=>x.timestamp&&jstDay(new Date(x.timestamp))===day).length};
}

export async function collectTikTok(env, now=new Date(), request=fetch) {
  if (!env.TIKTOK_USERNAME) return {};
  const res=await request(`https://www.tiktok.com/@${encodeURIComponent(env.TIKTOK_USERNAME)}`,{headers:{"User-Agent":"Mozilla/5.0"}});
  if(!res.ok)throw new Error(`tiktok:${res.status}`);
  const html=await res.text();
  const stats=html.match(/"followerCount":(\d+)/), day=jstDay(now);
  const timestamps=[...html.matchAll(/"createTime":"?(\d{10})"?/g)].map(m=>new Date(Number(m[1])*1000));
  return {tiktokFollowers:stats?Number(stats[1]):null,tiktokPostsToday:[...new Set(timestamps.filter(d=>jstDay(d)===day).map(d=>d.getTime()))].length};
}
