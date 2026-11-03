const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"});

export const jstDateKey=(date=new Date())=>formatter.format(date);

export function previousDateKey(date=new Date()){
  const today=jstDateKey(date);
  return formatter.format(new Date(`${today}T00:00:00+09:00`).getTime()-86400000);
}

export function previousDayValues(history,date=new Date()){
  return history?.[previousDateKey(date)]||{};
}

export function recordDay(history,date,values){
  const next={...(history||{}),[jstDateKey(date)]:{...values,collectedAt:date.toISOString()}};
  const keys=Object.keys(next).sort();
  for(const key of keys.slice(0,-90))delete next[key];
  return next;
}
