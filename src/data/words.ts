import { WordCategory } from '../game/types';

export const categories: WordCategory[] = [
  {
    name: "음식",
    pairs: [
      { citizen: "커피", liar: "홍차" },
      { citizen: "피자", liar: "파스타" },
      { citizen: "치킨", liar: "오리구이" },
      { citizen: "김치찌개", liar: "된장찌개" },
      { citizen: "햄버거", liar: "샌드위치" },
      { citizen: "초밥", liar: "회" },
      { citizen: "짜장면", liar: "짬뽕" },
      { citizen: "떡볶이", liar: "라볶이" },
      { citizen: "삼겹살", liar: "목살" },
      { citizen: "비빔밥", liar: "돌솥밥" },
      { citizen: "라면", liar: "우동" },
      { citizen: "김밥", liar: "유부초밥" },
      { citizen: "아이스크림", liar: "빙수" },
      { citizen: "케이크", liar: "파이" },
      { citizen: "도넛", liar: "베이글" }
    ]
  },
  {
    name: "동물",
    pairs: [
      { citizen: "강아지", liar: "고양이" },
      { citizen: "사자", liar: "호랑이" },
      { citizen: "토끼", liar: "햄스터" },
      { citizen: "독수리", liar: "매" },
      { citizen: "돌고래", liar: "고래" },
      { citizen: "펭귄", liar: "바다표범" },
      { citizen: "기린", liar: "얼룩말" },
      { citizen: "코끼리", liar: "하마" },
      { citizen: "원숭이", liar: "침팬지" },
      { citizen: "늑대", liar: "여우" },
      { citizen: "곰", liar: "판다" },
      { citizen: "뱀", liar: "도마뱀" },
      { citizen: "상어", liar: "가오리" },
      { citizen: "앵무새", liar: "카나리아" },
      { citizen: "거북이", liar: "악어" }
    ]
  },
  {
    name: "장소",
    pairs: [
      { citizen: "학교", liar: "학원" },
      { citizen: "병원", liar: "약국" },
      { citizen: "카페", liar: "레스토랑" },
      { citizen: "도서관", liar: "서점" },
      { citizen: "영화관", liar: "극장" },
      { citizen: "공원", liar: "놀이터" },
      { citizen: "마트", liar: "편의점" },
      { citizen: "헬스장", liar: "수영장" },
      { citizen: "은행", liar: "우체국" },
      { citizen: "공항", liar: "기차역" },
      { citizen: "해변", liar: "수영장" },
      { citizen: "산", liar: "언덕" },
      { citizen: "놀이공원", liar: "동물원" },
      { citizen: "박물관", liar: "미술관" },
      { citizen: "호텔", liar: "모텔" }
    ]
  },
  {
    name: "직업",
    pairs: [
      { citizen: "의사", liar: "간호사" },
      { citizen: "선생님", liar: "교수" },
      { citizen: "경찰", liar: "소방관" },
      { citizen: "요리사", liar: "제빵사" },
      { citizen: "가수", liar: "배우" },
      { citizen: "변호사", liar: "검사" },
      { citizen: "기자", liar: "작가" },
      { citizen: "디자이너", liar: "개발자" },
      { citizen: "파일럿", liar: "승무원" },
      { citizen: "축구선수", liar: "야구선수" },
      { citizen: "사진가", liar: "화가" },
      { citizen: "건축가", liar: "인테리어 디자이너" },
      { citizen: "수의사", liar: "조련사" },
      { citizen: "판사", liar: "변호사" },
      { citizen: "약사", liar: "의사" }
    ]
  },
  {
    name: "스포츠",
    pairs: [
      { citizen: "축구", liar: "풋살" },
      { citizen: "농구", liar: "배구" },
      { citizen: "야구", liar: "소프트볼" },
      { citizen: "테니스", liar: "배드민턴" },
      { citizen: "수영", liar: "다이빙" },
      { citizen: "골프", liar: "미니골프" },
      { citizen: "스키", liar: "스노보드" },
      { citizen: "마라톤", liar: "조깅" },
      { citizen: "복싱", liar: "태권도" },
      { citizen: "탁구", liar: "스쿼시" },
      { citizen: "볼링", liar: "당구" },
      { citizen: "요가", liar: "필라테스" },
      { citizen: "하키", liar: "아이스하키" },
      { citizen: "레슬링", liar: "유도" },
      { citizen: "양궁", liar: "사격" }
    ]
  },
  {
    name: "영화/드라마",
    pairs: [
      { citizen: "아이언맨", liar: "배트맨" },
      { citizen: "해리포터", liar: "반지의 제왕" },
      { citizen: "어벤져스", liar: "저스티스리그" },
      { citizen: "기생충", liar: "올드보이" },
      { citizen: "타이타닉", liar: "노트북" },
      { citizen: "겨울왕국", liar: "모아나" },
      { citizen: "토이스토리", liar: "슈렉" },
      { citizen: "스타워즈", liar: "스타트렉" },
      { citizen: "매트릭스", liar: "인셉션" },
      { citizen: "쥬라기공원", liar: "킹콩" }
    ]
  },
  {
    name: "브랜드",
    pairs: [
      { citizen: "애플", liar: "삼성" },
      { citizen: "나이키", liar: "아디다스" },
      { citizen: "코카콜라", liar: "펩시" },
      { citizen: "맥도날드", liar: "버거킹" },
      { citizen: "스타벅스", liar: "투썸플레이스" },
      { citizen: "넷플릭스", liar: "디즈니플러스" },
      { citizen: "구글", liar: "네이버" },
      { citizen: "유튜브", liar: "틱톡" },
      { citizen: "인스타그램", liar: "페이스북" },
      { citizen: "카카오톡", liar: "라인" }
    ]
  },
  {
    name: "악기",
    pairs: [
      { citizen: "피아노", liar: "오르간" },
      { citizen: "기타", liar: "베이스" },
      { citizen: "바이올린", liar: "첼로" },
      { citizen: "드럼", liar: "봉고" },
      { citizen: "플루트", liar: "클라리넷" },
      { citizen: "트럼펫", liar: "트롬본" },
      { citizen: "하프", liar: "가야금" },
      { citizen: "색소폰", liar: "오보에" },
      { citizen: "우쿨렐레", liar: "만돌린" },
      { citizen: "하모니카", liar: "아코디언" }
    ]
  }
];

export function getRandomWordPair(categoryName: string): { citizen: string; liar: string } | null {
  const category = categories.find(c => c.name === categoryName);
  if (!category || category.pairs.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * category.pairs.length);
  return category.pairs[randomIndex];
}

export function getCategoryNames(): string[] {
  return categories.map(c => c.name);
}
