export function delta(current, previous, unit="人") {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "";
  const value = current - previous;
  return `（${value >= 0 ? "+" : ""}${value}${unit}）`;
}

export function formatReport(date, values, previous = {}) {
  const value=(number,unit)=>number == null ? "取得できませんでした" : `${number}${unit}`;
  const igFollowers=values.instagramFollowers == null ? "取得できませんでした" : `${values.instagramFollowers}人${delta(values.instagramFollowers,previous.instagramFollowers)}`;
  const ttFollowers=values.tiktokFollowers == null ? "取得できませんでした" : `${values.tiktokFollowers}件${delta(values.tiktokFollowers,previous.tiktokFollowers,"件")}`;
  return `お疲れ様です。\n${date.getMonth()+1}/${date.getDate()}の報告です。\n\nインスタ\nフォローした数：${value(values.instagramFollowing,"人")}\nインスタ投稿：${value(values.instagramPostsToday,"件")}\nストーリー投稿：${value(values.instagramStoriesToday,"件")}\nフォロワー数：${igFollowers}\n\nティックトック\n投稿：${value(values.tiktokPostsToday,"件")}\nフォロワー数：${ttFollowers}\n\nよろしくお願いいたします。`;
}
