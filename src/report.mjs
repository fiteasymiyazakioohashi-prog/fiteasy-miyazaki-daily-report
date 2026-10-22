export function delta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "";
  const value = current - previous;
  return `（${value >= 0 ? "+" : ""}${value}人）`;
}

export function formatReport(date, values, previous = {}) {
  const md = values.members == null ? "取得できませんでした" : `${values.members}人／750人${delta(values.members, previous.members)}`;
  const provisional = values.provisionalMembers == null ? "取得できませんでした" : `${values.provisionalMembers}人`;
  const ig = values.instagramFollowers == null ? "取得できませんでした" : `${values.instagramFollowers}人／500人${delta(values.instagramFollowers, previous.instagramFollowers)}`;
  const igPosts = values.instagramPostsToday == null ? "取得できませんでした" : `${values.instagramPostsToday}本`;
  const tt = values.tiktokFollowers == null ? "取得できませんでした" : `${values.tiktokFollowers}人／100人`;
  const ttPosts = values.tiktokPostsToday == null ? "取得できませんでした" : `${values.tiktokPostsToday}本`;
  return `お疲れ様です。\n${date.getMonth()+1}/${date.getDate()}の報告です。\n\n【会員数】\n${md}\n仮会員数：${provisional}\n\n【Instagram】\n${ig}\n本日投稿：${igPosts}\n\n【TikTok】\nフォロワー：${tt}\n本日投稿：${ttPosts}\n\nよろしくお願いいたします。`;
}
