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
  const userId=encodeURIComponent(env.INSTAGRAM_USER_ID);
  const params = new URLSearchParams({fields:"followers_count,follows_count,media.limit(50){timestamp}",access_token:env.INSTAGRAM_ACCESS_TOKEN});
  const res = await request(`https://graph.instagram.com/v24.0/${userId}?${params}`);
  if (!res.ok) throw new Error(`instagram:${res.status}`);
  const data = await res.json();
  const day=jstDay(now), media=Array.isArray(data.media?.data)?data.media.data:[];
  let instagramStoriesToday=null;
  try{
    const storyParams=new URLSearchParams({fields:"timestamp",access_token:env.INSTAGRAM_ACCESS_TOKEN});
    const storyRes=await request(`https://graph.instagram.com/v24.0/${userId}/stories?${storyParams}`);
    if(storyRes.ok){
      const stories=await storyRes.json();
      const items=Array.isArray(stories.data)?stories.data:[];
      instagramStoriesToday=items.filter(x=>x.timestamp&&jstDay(new Date(x.timestamp))===day).length;
    }
  }catch{}
  return {
    instagramFollowing:Number.isFinite(Number(data.follows_count))?Number(data.follows_count):null,
    instagramFollowers:Number(data.followers_count),
    instagramPostsToday:media.filter(x=>x.timestamp&&jstDay(new Date(x.timestamp))===day).length,
    instagramStoriesToday
  };
}

// Profile/account createTime is not a publication date. Count only the
// requested author's complete post collection; missing lists are unknown.
export function parseTikTokProfile(html, username, now=new Date()) {
  const unknown={tiktokFollowers:null,tiktokPostsToday:null};
  const script=html.match(/<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!script) return unknown;
  let root;
  try { root=JSON.parse(script[1]); } catch { return unknown; }
  const info=root.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
  if(!info || info.user?.uniqueId?.toLowerCase()!==username.toLowerCase()) return unknown;
  const integer=value=>value!==null && value!==undefined && value!=="" && Number.isSafeInteger(Number(value)) && Number(value)>=0 ? Number(value) : null;
  const followers=integer(info.stats?.followerCount ?? info.statsV2?.followerCount);
  const total=integer(info.stats?.videoCount ?? info.statsV2?.videoCount);
  const posts=new Map();
  function visit(value) {
    if(!value || typeof value!=="object") return;
    if(value.id && (value.video || value.imagePost) && value.createTime) {
      const author=typeof value.author==="string"?value.author:value.author?.uniqueId;
      const authorId=typeof value.author==="string"?value.author:value.author?.id;
      if(author?.toLowerCase()===username.toLowerCase() || (info.user.id && authorId===info.user.id)) {
        const timestamp=integer(value.createTime);
        if(timestamp && Number.isFinite(new Date(timestamp*1000).getTime())) posts.set(String(value.id), timestamp);
      }
    }
    for(const child of Object.values(value)) visit(child);
  }
  visit(root);
  // Even a nonempty list may be truncated or pinned: require all published
  // posts before reporting an exact number, including an exact zero.
  const complete=total!==null && posts.size===total;
  const day=jstDay(now);
  return {tiktokFollowers:followers,tiktokPostsToday:complete
    ? [...posts.values()].filter(t=>jstDay(new Date(t*1000))===day && t*1000<=now.getTime()).length : null};
}

export async function collectTikTok(env, now=new Date(), request=fetch) {
  if (!env.TIKTOK_USERNAME) return {};
  const res=await request(`https://www.tiktok.com/@${encodeURIComponent(env.TIKTOK_USERNAME)}`,{headers:{"User-Agent":"Mozilla/5.0"}});
  if(!res.ok)throw new Error(`tiktok:${res.status}`);
  return parseTikTokProfile(await res.text(), env.TIKTOK_USERNAME, now);
}
