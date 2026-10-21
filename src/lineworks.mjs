import {createPrivateKey, sign} from "node:crypto";

const b64=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
export async function sendLineWorks(env,text,request=fetch){
  const required=["LINEWORKS_CLIENT_ID","LINEWORKS_CLIENT_SECRET","LINEWORKS_SERVICE_ACCOUNT","LINEWORKS_PRIVATE_KEY","LINEWORKS_BOT_ID","LINEWORKS_USER_ID"];
  for(const k of required)if(!env[k])throw new Error(`missing:${k}`);
  const now=Math.floor(Date.now()/1000),body=`${b64({alg:"RS256",typ:"JWT"})}.${b64({iss:env.LINEWORKS_CLIENT_ID,sub:env.LINEWORKS_SERVICE_ACCOUNT,iat:now,exp:now+300})}`;
  const assertion=`${body}.${sign("RSA-SHA256",Buffer.from(body),createPrivateKey(env.LINEWORKS_PRIVATE_KEY.replaceAll("\\n","\n"))).toString("base64url")}`;
  const tokenRes=await request("https://auth.worksmobile.com/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({assertion,grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",client_id:env.LINEWORKS_CLIENT_ID,client_secret:env.LINEWORKS_CLIENT_SECRET,scope:"bot.message"})});
  if(!tokenRes.ok)throw new Error(`lineworks-auth:${tokenRes.status}`);
  const {access_token}=await tokenRes.json();
  const sendRes=await request(`https://www.worksapis.com/v1.0/bots/${env.LINEWORKS_BOT_ID}/users/${encodeURIComponent(env.LINEWORKS_USER_ID)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${access_token}`,"Content-Type":"application/json"},body:JSON.stringify({content:{type:"text",text}})});
  if(sendRes.status!==201)throw new Error(`lineworks-send:${sendRes.status}`);
}
