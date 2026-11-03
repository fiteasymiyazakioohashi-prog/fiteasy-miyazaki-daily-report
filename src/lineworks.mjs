import {createPrivateKey, sign} from "node:crypto";

const b64=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
export async function sendLineWorks(env,text,request=fetch){
  const required=["LINEWORKS_CLIENT_ID","LINEWORKS_CLIENT_SECRET","LINEWORKS_SERVICE_ACCOUNT","LINEWORKS_PRIVATE_KEY","LINEWORKS_BOT_ID"];
  for(const k of required)if(!env[k])throw new Error(`missing:${k}`);
  const now=Math.floor(Date.now()/1000),body=`${b64({alg:"RS256",typ:"JWT"})}.${b64({iss:env.LINEWORKS_CLIENT_ID,sub:env.LINEWORKS_SERVICE_ACCOUNT,iat:now,exp:now+300})}`;
  const assertion=`${body}.${sign("RSA-SHA256",Buffer.from(body),createPrivateKey(env.LINEWORKS_PRIVATE_KEY.replaceAll("\\n","\n"))).toString("base64url")}`;
  const tokenRes=await request("https://auth.worksmobile.com/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({assertion,grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",client_id:env.LINEWORKS_CLIENT_ID,client_secret:env.LINEWORKS_CLIENT_SECRET,scope:"bot user.read"})});
  if(!tokenRes.ok)throw new Error(`lineworks-auth:${tokenRes.status}`);
  const {access_token}=await tokenRes.json();
  const headers={Authorization:`Bearer ${access_token}`};
  const userIds=[];
  let cursor="";
  do {
    const params=new URLSearchParams({count:"100"});
    if(cursor)params.set("cursor",cursor);
    const usersRes=await request(`https://www.worksapis.com/v1.0/users?${params}`,{headers});
    if(!usersRes.ok)throw new Error(`lineworks-users:${usersRes.status}:${await usersRes.text()}`);
    const data=await usersRes.json();
    for(const user of data.users??[]){
      if(user.userId&&!user.isDeleted&&!user.isSuspended&&!user.isPending)userIds.push(user.userId);
    }
    cursor=data.responseMetaData?.nextCursor??"";
  } while(cursor);
  if(!userIds.length)throw new Error("lineworks-users:empty");
  const failures=[];
  for(const userId of userIds){
    const sendRes=await request(`https://www.worksapis.com/v1.0/bots/${env.LINEWORKS_BOT_ID}/users/${encodeURIComponent(userId)}/messages`,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({content:{type:"text",text}})});
    if(sendRes.status!==201)failures.push(`${userId}:${sendRes.status}`);
  }
  if(failures.length)throw new Error(`lineworks-send:${failures.join(",")}`);
  console.log(`LINE WORKS: ${userIds.length}人へ送信しました`);
}
