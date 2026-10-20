# 나의 할 일

혼자 쓰는 할 일 관리 웹사이트. 달력에서 날짜를 골라 그날의 할 일을 보고 관리한다.

- 사이트: https://parksol9oo.github.io/icp13-psh/
- 기획: [기획서.md](기획서.md)
- Supabase 설정 순서: [docs/supabase-설정.md](docs/supabase-설정.md)

## 파일

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면의 뼈대 |
| `style.css` | 색, 글꼴, 배치 |
| `app.js` | 동작 (할 일 추가·수정·완료, 달력 이동) |
| `config.js` | Supabase 연결 주소와 공개 키 |
| `supabase/schema.sql` | Supabase에 할 일 보관함을 만드는 명령 |

## 내 컴퓨터에서 열어 보기

터미널에서 이 폴더로 들어가서:

```
python3 -m http.server 8000
```

그다음 브라우저에서 http://localhost:8000 을 열면 된다.
