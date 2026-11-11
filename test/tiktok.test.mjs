import { test } from 'node:test';
import assert from 'node:assert/strict';
import {parseTikTokEmbed,parseTikTokPost,parseTikTokProfile,countTikTokPosts,collectTikTok} from '../src/collectors.mjs';
const username='fiteasy_miyazaki_ohashi', now=new Date('2026-11-11T11:03:07Z');
const ts=s=>Date.parse(s)/1000;
const id=n=>String(7700000000000000000n+BigInt(n));
const script=(key,data)=>`<script id="${key}">${JSON.stringify(data)}</script>`;
const embed=(ids=[id(1),id(2)])=>script('__FRONTITY_CONNECT_STATE__',{source:{data:{[`/embed/@${username}`]:{isReady:true,isError:false,userInfo:{uniqueId:username,followerCount:19},videoList:ids.map(id=>({id,authorUniqueId:username}))}}}});
const detail=(id,time,photo=false,author=username)=>script('__UNIVERSAL_DATA_FOR_REHYDRATION__',{__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:{id,author:{uniqueId:author},createTime:ts(time),[photo?'imagePost':'video']:{}}}}}});
const p=(i,time)=>({id:id(i),timestamp:ts(time)});
const good=[p(1,'2026-11-11T10:00:00Z'),p(2,'2026-11-10T15:00:00Z'),p(3,'2026-11-10T14:59:59Z')];
const profile=script('__UNIVERSAL_DATA_FOR_REHYDRATION__',{__DEFAULT_SCOPE__:{'webapp.user-detail':{userInfo:{user:{uniqueId:username,createTime:ts('2026-11-11T00:00:00Z')},stats:{followerCount:19,videoCount:16},itemList:[]}}}});
const response=(body,status=200)=>({ok:status===200,status,text:async()=>body});
test('official creator embed validates owner, duplicates, missing lists',()=>{
 assert.deepEqual(parseTikTokEmbed(embed(),username),{ids:[id(1),id(2)],followers:19});
 for(const html of [embed([id(1),id(1)]),embed([]),embed().replaceAll(username,'other'),'challenge']) assert.equal(parseTikTokEmbed(html,username),null);
});
test('video and photo publication times are validated against exact post and author',()=>{
 for(const photo of [false,true]) assert.deepEqual(parseTikTokPost(detail(id(1),'2026-11-11T10:00:00Z',photo),username,id(1)),good[0]);
 assert.equal(parseTikTokPost(detail(id(1),'2026-11-11T10:00:00Z'),username,id(2)),null);
 assert.equal(parseTikTokPost(detail(id(1),'2026-11-11T10:00:00Z',false,'other'),username,id(1)),null);
 assert.equal(parseTikTokPost('challenge',username,id(1)),null);
});
test('Japan midnight and collection cutoff are respected',()=>{
 assert.equal(countTikTokPosts(good,now),2);
 assert.equal(countTikTokPosts(good,new Date('2026-11-11T09:00:00Z')),1);
});
test('truncated, unordered, duplicated and missing data are unknown, not zero',()=>{
 for(const items of [[],good.slice(0,2),[good[1],good[0],good[2]],[good[0],good[0],good[2]],[null,good[2]],Array.from({length:10},(_,i)=>p(i,'2026-11-11T10:00:00Z'))]) assert.equal(countTikTokPosts(items,now),null);
});
test('verified list reaching prior day can report zero',()=>assert.equal(countTikTokPosts([good[2]],now),0));
test('account creation time is never counted as a post',()=>assert.deepEqual(parseTikTokProfile(profile,username,now),{tiktokFollowers:19,tiktokPostsToday:null}));
test('collection combines embed and actual video/photo dates',async()=>{
 const sources=[embed(good.map(x=>x.id)),detail(id(1),'2026-11-11T10:00:00Z'),detail(id(2),'2026-11-10T15:00:00Z',true),detail(id(3),'2026-11-10T14:59:59Z')];
 const result=await collectTikTok({TIKTOK_USERNAME:username},now,async()=>response(sources.shift()),async()=>{});
 assert.deepEqual(result,{tiktokFollowers:19,tiktokPostsToday:2});assert.equal(sources.length,0);
});
test('transient missing SSR retries then succeeds',async()=>{
 const sources=['empty',embed([id(3)]),detail(id(3),'2026-11-10T14:59:59Z')];let pauses=0;
 assert.equal((await collectTikTok({TIKTOK_USERNAME:username},now,async()=>response(sources.shift()),async()=>pauses++)).tiktokPostsToday,0);assert.equal(pauses,1);
});
test('partial details stay unknown; retry count is bounded',async()=>{
 let calls=0;
 const result=await collectTikTok({TIKTOK_USERNAME:username},now,async url=>{calls++;return response(url.includes('/embed/')?embed():url.includes('/video/')?'missing':profile)},async()=>{});
 assert.deepEqual(result,{tiktokFollowers:19,tiktokPostsToday:null});assert.equal(calls,5);
});
test('access denied and rate limits are not retried',async()=>{
 for(const status of [401,403,429]) {let calls=0;await collectTikTok({TIKTOK_USERNAME:username},now,async()=>{calls++;return response('',status)},async()=>assert.fail('must not retry'));assert.equal(calls,2);}
});

test('security challenge pages are not repeatedly requested',async()=>{
 let calls=0;await collectTikTok({TIKTOK_USERNAME:username},now,async()=>{calls++;return response('<html>SlardarWAF</html>')},async()=>assert.fail('must not retry'));assert.equal(calls,2);
});
