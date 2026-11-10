# 채팅방

닉네임으로 입장해서 여러 사람이 대화하는 간단한 채팅방입니다.
Express 서버와 MariaDB(MySQL 호환)로 만들었고, Vercel에 배포할 수 있습니다.

## 구조

```
브라우저 (public/js/chat.js)
   │  GET  /api/messages?after=<마지막 id>   ← 2초마다 폴링
   │  POST /api/messages { nickname, content }
   ▼
Express 앱 (app.js)
   ├─ 로컬:  server.js 가 app.listen()
   └─ Vercel: api/index.js 가 서버리스 함수로 실행
   ▼
MariaDB / MySQL (db.js, 접속 정보는 환경변수)
```

- Vercel 서버리스 함수는 WebSocket 같은 지속 연결을 유지할 수 없어서 폴링 방식을 씁니다.
- 메시지는 화면에 `textContent`로 넣기 때문에 HTML을 보내도 그대로 문자로 표시됩니다.

## 파일 구성

| 경로 | 설명 |
| --- | --- |
| `app.js` | Express 앱과 `/api/messages` 엔드포인트 |
| `server.js` | 로컬 실행용 진입점 |
| `api/index.js` | Vercel 서버리스 함수 진입점 |
| `vercel.json` | `/api/*` 요청을 서버리스 함수로 연결 |
| `db.js` | DB 커넥션 풀 |
| `sql/schema.sql` | `messages` 테이블 정의 |
| `scripts/init-db.js` | DB와 테이블 생성 스크립트 |
| `public/` | 채팅 화면 (HTML/CSS/JS) |

## 로컬 실행

1. 의존성 설치

   ```
   npm install
   ```

2. `.env.example`을 `.env`로 복사하고 DB 접속 정보를 입력합니다.

3. DB와 테이블 생성

   ```
   npm run db:init
   ```

4. 서버 실행 후 http://localhost:3000 접속

   ```
   npm start
   ```

   포트가 사용 중이면 `.env`의 `PORT`를 바꿉니다.

## Vercel 배포

Vercel 서버는 인터넷에 있으므로 내 PC의 로컬 MariaDB에는 접속할 수 없습니다.
배포할 때는 인터넷에서 접속 가능한 MySQL 호환 DB(TiDB Cloud, Aiven 등)를 준비합니다.

1. 클라우드 DB를 만들고, 로컬 `.env`를 그 접속 정보로 잠시 바꿔서 `npm run db:init`을 실행합니다.
2. GitHub 저장소를 Vercel에 연결합니다(Framework Preset: Other, 빌드 설정은 기본값).
3. Vercel 프로젝트의 Environment Variables에 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`를 등록합니다.
4. 배포합니다. 이후에는 GitHub에 push할 때마다 자동 배포됩니다.
