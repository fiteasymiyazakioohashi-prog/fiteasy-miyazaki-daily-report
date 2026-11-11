import {createPrivateKey, sign} from "node:crypto";

const b64=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
const excludedNames=new Set(["濵島陸人"]);
const displayName=user=>`${user.userName?.lastName??""}${user.userName?.firstName??""}`.replaceAll(" ","");
export function selectRecipientUserIds(users){
  const ids=[],seenNames=new Set();
  for(const user of users??[]){
    if(!user.userId||user.isDeleted||user.isSuspended||user.isPending)continue;
    const name=displayName(user);
    if(excludedNames.has(name)||(name&&seenNames.has(name)))continue;
    if(name)seenNames.add(name);
    ids.push(user.userId);
  }
  return ids;
}
export async function sendLineWorks(env,text,request=fetch,recipients){
  const scope=env.LINEWORKS_RECIPIENT_SCOPE||(env.GITHUB_EVENT_NAME==="workflow_dispatch"?"owner":"all");
  if(!["owner","others","all","late_and_owner"].includes(scope))throw new Error("Unknown recipient scope");
  if(scope==="owner"&&!env.LINEWORKS_USER_ID)throw new Error("Owner recipient missing");
  if(scope==="late_and_owner"&&(!Array.isArray(recipients)||!recipients.length||recipients.some(r=>typeof r.userId!=="string"||!r.userId.trim())||!env.LINEWORKS_USER_ID||!recipients.some(r=>r.userId===env.LINEWORKS_USER_ID)))throw new Error("Late shift recipients and owner must be provided by attendance server");
  const required=["LINEWORKS_CLIENT_ID","LINEWORKS_CLIENT_SECRET","LINEWORKS_SERVICE_ACCOUNT","LINEWORKS_PRIVATE_KEY","LINEWORKS_BOT_ID"];
  for(const k of required)if(!env[k])throw new Error(`missing:${k}`);
  const now=Math.floor(Date.now()/1000),body=`${b64({alg:"RS256",typ:"JWT"})}.${b64({iss:env.LINEWORKS_CLIENT_ID,sub:env.LINEWORKS_SERVICE_ACCOUNT,iat:now,exp:now+300})}`;
  const assertion=`${body}.${sign("RSA-SHA256",Buffer.from(body),createPrivateKey(env.LINEWORKS_PRIVATE_KEY.replaceAll("\\n","\n"))).toString("base64url")}`;
  const tokenRes=await request("https://auth.worksmobile.com/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({assertion,grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",client_id:env.LINEWORKS_CLIENT_ID,client_secret:env.LINEWORKS_CLIENT_SECRET,scope:"bot user.read"})});
  if(!tokenRes.ok)throw new Error(`lineworks-auth:${tokenRes.status}`);
  const {access_token}=await tokenRes.json();
  const headers={Authorization:`Bearer ${access_token}`};
  const userIds=[];
  if(scope==="late_and_owner"){
    userIds.push(...new Set(recipients.map(r=>r.userId)));
  }else if(scope==="owner"&&env.LINEWORKS_USER_ID){
    userIds.push(env.LINEWORKS_USER_ID);
  }else{
    let cursor="";
    do {
      const params=new URLSearchParams({count:"100"});
      if(cursor)params.set("cursor",cursor);
      const usersRes=await request(`https://www.worksapis.com/v1.0/users?${params}`,{headers});
      if(!usersRes.ok)throw new Error(`lineworks-users:${usersRes.status}:${await usersRes.text()}`);
      const data=await usersRes.json();
      userIds.push(...selectRecipientUserIds(data.users).filter(id=>!userIds.includes(id)));
      cursor=data.responseMetaData?.nextCursor??"";
    } while(cursor);
    if(scope==="others"&&env.LINEWORKS_USER_ID){
      const ownerIndex=userIds.indexOf(env.LINEWORKS_USER_ID);
      if(ownerIndex>=0)userIds.splice(ownerIndex,1);
    }
  }
  if(!userIds.length)throw new Error("lineworks-users:empty");
  const failures=[];
  for(const userId of userIds){
    const sendRes=await request(`https://www.worksapis.com/v1.0/bots/${env.LINEWORKS_BOT_ID}/users/${encodeURIComponent(userId)}/messages`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({content:{type:"text",text}})});
    if(sendRes.status!==201)failures.push(`${userId}:${sendRes.status}`);
  }
  if(failures.length)throw new Error(`lineworks-send:${failures.join(",")}`);
  console.log(`LINE WORKS: ${userIds.length}人へ送信しました`);
}
