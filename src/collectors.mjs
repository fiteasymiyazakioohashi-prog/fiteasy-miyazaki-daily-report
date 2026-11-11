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

function embeddedJson(html, id) {
  const script=html.match(new RegExp(`<script[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"));
  if(!script) return null;
  try { return JSON.parse(script[1]); } catch { return null; }
}

export function parseTikTokEmbed(html, username) {
  const root=embeddedJson(html,"__FRONTITY_CONNECT_STATE__");
  const page=root?.source?.data?.[`/embed/@${username}`];
  if(!page?.isReady || page.isError || page.userInfo?.privateAccount ||
      page.userInfo?.uniqueId?.toLowerCase()!==username.toLowerCase()) return null;
  const list=page.videoList;
  if(!Array.isArray(list) || !list.length || list.length>10) return null;
  if(list.some(x=>!/^\d{15,22}$/.test(x.id) || x.privateItem || x.authorUniqueId?.toLowerCase()!==username.toLowerCase())) return null;
  const ids=[...new Set(list.map(x=>x.id))];
  if(ids.length!==list.length) return null;
  const followers=page.userInfo.followerCount;
  return {ids,followers:Number.isSafeInteger(followers)&&followers>=0?followers:null};
}

export function parseTikTokPost(html, username, id) {
  const scope=embeddedJson(html,"__UNIVERSAL_DATA_FOR_REHYDRATION__")?.__DEFAULT_SCOPE__;
  const post=scope?.["webapp.video-detail"]?.itemInfo?.itemStruct;
  const timestamp=Number(post?.createTime);
  if(String(post?.id)!==id || post?.author?.uniqueId?.toLowerCase()!==username.toLowerCase() ||
      (!post?.video && !post?.imagePost) || !Number.isSafeInteger(timestamp) || timestamp<1230768000 ||
      timestamp*1000>Date.now()+86400000) return null;
  return {id,timestamp};
}

export function countTikTokPosts(posts, now) {
  if(!posts.length || posts.some(x=>!x)) return null;
  if(new Set(posts.map(x=>x.id)).size!==posts.length) return null;
  // The official creator embed lists at most ten recent posts. Require a
  // chronological list reaching an older Japan date, otherwise it may omit
  // additional posts from today. Never guess zero from incomplete data.
  if(posts.some((x,i)=>i>0 && x.timestamp>posts[i-1].timestamp)) return null;
  const day=jstDay(now);
  if(jstDay(new Date(posts.at(-1).timestamp*1000))>=day) return null;
  return posts.filter(x=>x.timestamp*1000<=now.getTime() && jstDay(new Date(x.timestamp*1000))===day).length;
}

export async function collectTikTok(env, now=new Date(), request=fetch, pause=ms=>new Promise(r=>setTimeout(r,ms))) {
  if (!env.TIKTOK_USERNAME) return {};
  const username=env.TIKTOK_USERNAME.replace(/^@/,"");
  if(!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) throw new Error("tiktok:invalid username");
  const base=`https://www.tiktok.com/@${encodeURIComponent(username)}`;
  let followers=null;
  // One daily collection, bounded retries for transient network/SSR failures.
  // Access-denied or rate-limit responses are not retried.
  async function load(url, parse) {
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await request(url,{headers:{"User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(15000)});
        if([401,403,429].includes(response.status)) return null;
        if(response.ok) {
          const html=await response.text();
          if(/SlardarWAF|_wafchallengeid|captcha-verify/i.test(html)) return null;
          const result=parse(html);
          if(result!==null) return result;
        } else if(response.status<500) return null;
      } catch(error) {
        if(attempt===2) return null;
      }
      if(attempt<2) await pause(500*(attempt+1));
    }
    return null;
  }
  const embed=await load(`https://www.tiktok.com/embed/@${encodeURIComponent(username)}`,html=>parseTikTokEmbed(html,username));
  if(embed) {
    followers=embed.followers;
    const posts=[];
    // Sequential requests avoid burst traffic. This endpoint also returns
    // imagePost for photo posts linked by TikTok's own creator embed.
    for(const id of embed.ids) {
      const post=await load(`${base}/video/${id}`,html=>parseTikTokPost(html,username,id));
      if(!post) break;
      posts.push(post);
    }
    const count=posts.length===embed.ids.length?countTikTokPosts(posts,now):null;
    if(count!==null) return {tiktokFollowers:followers,tiktokPostsToday:count};
  }
  const profile=await load(base,html=>{
    const parsed=parseTikTokProfile(html,username,now);
    return parsed.tiktokFollowers!==null || parsed.tiktokPostsToday!==null?parsed:null;
  });
  if(profile?.tiktokPostsToday===null || !profile) console.warn("::warning::TikTok post list could not be verified; showing unknown, not zero.");
  return {tiktokFollowers:followers??profile?.tiktokFollowers??null,tiktokPostsToday:profile?.tiktokPostsToday??null};
}
