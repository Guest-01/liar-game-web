// 랜덤 한글 닉네임 생성기
const adjectives = [
  '행복한', '용감한', '빠른', '느긋한', '귀여운',
  '멋진', '신나는', '졸린', '배고픈', '슬기로운',
  '즐거운', '차분한', '활발한', '똑똑한', '엉뚱한',
  '수줍은', '씩씩한', '당당한', '재빠른', '느린'
];

const nouns = [
  '호랑이', '토끼', '사자', '펭귄', '고양이',
  '강아지', '판다', '여우', '곰', '다람쥐',
  '코끼리', '기린', '원숭이', '부엉이', '앵무새',
  '햄스터', '고슴도치', '수달', '너구리', '미어캣'
];

function generateRandomNickname() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return adj + noun;
}
