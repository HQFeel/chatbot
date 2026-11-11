# 채팅

회원가입·로그인 후 채팅방을 만들고, 아이디로 다른 사용자를 초대해 대화하는 간단한 채팅 프로그램입니다.
Express 서버와 MariaDB(MySQL 호환)로 만들었고, Vercel에 배포할 수 있습니다.

## 구조

```
브라우저 (public/js/chat.js)
   │  /api/auth/*    회원가입, 로그인, 로그아웃
   │  /api/rooms/*   방, 참여자, 메시지   ← 메시지 2초 / 방 목록 10초마다 폴링
   ▼
Express 앱 (app.js → routes/)
   ├─ 로컬:  server.js 가 app.listen()
   └─ Vercel: api/index.js 가 서버리스 함수로 실행
   ▼
MariaDB / MySQL (db.js, 접속 정보는 환경변수)
```

- Vercel 서버리스 함수는 WebSocket 같은 지속 연결을 유지할 수 없어서 폴링 방식을 씁니다.
- 서버리스라 세션 저장소를 두지 않고, 사용자 번호와 만료 시각을 `SESSION_SECRET`으로 서명한 토큰을 httpOnly 쿠키에 담습니다. 유효 기간은 7일입니다.
- 비밀번호는 Node 내장 `crypto.scrypt`로 해시해서 저장합니다.
- 메시지는 화면에 `textContent`로 넣기 때문에 HTML을 보내도 그대로 문자로 표시됩니다.

## 화면

- 카카오톡 스타일 메신저 UI입니다. 기본은 다크 모드이고, 해/달 버튼으로 라이트 모드와 전환합니다(선택은 브라우저에 저장).
- 같은 사람이 같은 분에 연달아 보낸 메시지는 묶어서, 프로필·이름은 처음에만, 시간은 마지막에만 표시합니다.
- 방 목록은 마지막 메시지와 시간을 보여주고, 최근 대화가 있는 방이 위로 옵니다.
- 대화상대 목록, 초대, 나가기는 채팅방 오른쪽 위 메뉴(서랍)에 있습니다.
- Enter로 전송, Shift+Enter로 줄바꿈합니다.
- 720px 이하에서는 목록과 채팅방이 한 화면씩 나옵니다.

## 테이블

| 테이블 | 설명 | 주요 컬럼 |
| --- | --- | --- |
| `USER` | 사용자 | `USER_NO`(PK), `LOGIN_ID`(유니크), `PASSWORD_HASH`, `NICKNAME` |
| `MESSAGE_MST` | 채팅방 | `ROOM_NO`(PK), `ROOM_NAME`, `CREATE_USER_NO` |
| `MESSAGE_MEMBER` | 방 참여자 | (`ROOM_NO`, `USER_NO`) PK |
| `MESSAGE_DTL` | 메시지 | `MSG_NO`(PK), `ROOM_NO`, `USER_NO`, `CONTENT` |

정의는 [sql/schema.sql](sql/schema.sql)에 있습니다. `USER`는 MariaDB 키워드라서 쿼리에서 항상 백틱으로 감쌉니다.

> Windows의 MariaDB는 테이블 이름을 소문자로 저장합니다(`lower_case_table_names=1`). 쿼리는 대소문자 구분 없이 동작하지만,
> Linux 기반 클라우드 DB에서는 대소문자를 구분하므로 코드에서는 항상 대문자 이름을 씁니다.

## API

참여하지 않은 방의 `/api/rooms/:roomNo/*` 요청은 403을 돌려줍니다.

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| POST | `/api/auth/signup` | 회원가입 `{ loginId, password, nickname }` |
| POST | `/api/auth/login` | 로그인 `{ loginId, password }` |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 사용자 |
| GET | `/api/rooms` | 내가 참여한 방 목록 (마지막 메시지 `lastContent`, `lastAt` 포함) |
| POST | `/api/rooms` | 방 만들기 `{ roomName }` (만든 사람이 자동 참여) |
| GET | `/api/rooms/:roomNo/members` | 참여자 목록 |
| POST | `/api/rooms/:roomNo/members` | 아이디로 초대 `{ loginId }` |
| DELETE | `/api/rooms/:roomNo/members/me` | 방 나가기 |
| GET | `/api/rooms/:roomNo/messages?after=<MSG_NO>` | 메시지 조회 (`after` 없으면 최근 50건) |
| POST | `/api/rooms/:roomNo/messages` | 메시지 전송 `{ content }` |

## 파일 구성

| 경로 | 설명 |
| --- | --- |
| `app.js` | Express 앱, 라우터 연결, 에러 처리 |
| `routes/auth.js` | 회원가입, 로그인, 로그아웃 |
| `routes/rooms.js` | 방, 참여자, 메시지 |
| `lib/auth.js` | 비밀번호 해시, 로그인 토큰, 로그인 확인 미들웨어 |
| `server.js` | 로컬 실행용 진입점 |
| `api/index.js` | Vercel 서버리스 함수 진입점 |
| `vercel.json` | `/api/*` 요청을 서버리스 함수로 연결 |
| `db.js` | DB 커넥션 풀 |
| `sql/schema.sql` | 테이블 정의 |
| `scripts/init-db.js` | DB와 테이블 생성 스크립트 |
| `scripts/check-db.js` | DB 접속과 테이블 확인 스크립트 |
| `public/` | 화면 (HTML/CSS/JS) |

## 로컬 실행

1. 의존성 설치

   ```
   npm install
   ```

2. `.env.example`을 `.env`로 복사하고 DB 접속 정보와 `SESSION_SECRET`을 입력합니다.

3. DB와 테이블 생성(확인은 `npm run db:check`)

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
운영 DB는 TiDB Cloud Starter(MySQL 호환, AWS 도쿄 `ap-northeast-1`, 포트 4000, TLS 필수)를 씁니다.
DB와 가까운 곳에서 실행되도록 `vercel.json`에서 서버리스 함수 리전을 도쿄(`hnd1`)로 지정했습니다.

1. 클라우드 DB 접속 정보를 `.env.cloud`에 넣습니다(git 제외). 형식은 `.env.example`과 같고 `DB_SSL=true`입니다.
2. 테이블을 만들고 확인합니다.

   ```
   npm run db:init:cloud
   npm run db:check:cloud
   ```

3. GitHub 저장소를 Vercel에 연결합니다(Framework Preset: Other, 빌드 설정은 기본값).
4. Vercel 프로젝트의 Environment Variables에 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`, `SESSION_SECRET`을 등록합니다.
   `SESSION_SECRET`은 로컬과 다른 값을 새로 만들어 씁니다.
5. 배포합니다. 이후에는 GitHub에 push할 때마다 자동 배포됩니다.
