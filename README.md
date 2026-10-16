# ReadersBank

다양한 아이클을 옮겨 모아 두는 개인용 리딩 뱅크입니다. 링크나 파일을 올리면 Claude가 글 전체 맥락을 보고 의역하고, 교정한 뒤 제목·한 줄 소개·요약·태그를 붙여 게시합니다. 글 등록과 관리는 소유자 한 명만 하고, 공개한 글은 누구나 읽을 수 있습니다.

A personal "reading bank" that turns foreign-language articles into Korean web-magazine posts with Claude. Self-host it on Vercel with your own API keys.

## 무엇을 할 수 있나

- **글 담기**: 웹 페이지 URL, Notion 공유 링크, Google 문서, 붙여넣은 텍스트, txt·md·html·docx·pdf 파일. 본문 그림·캡션·표·수식·유튜브 영상을 살립니다.
- **번역**: 글 전체를 읽고 번역 브리프(주제·독자·문체·용어집)를 만든 뒤, 원문 전체를 문맥으로 주고 조각별로 의역합니다. 번역 뒤에는 교정 단계가 원문과 대조해 오역·누락·번역투를 고칩니다. 원문 보기도 남습니다.
- **요약·분류**: 한국어 제목, 한 줄 소개, 핵심 요점, 태그. 글 끝에는 웹 검색으로 찾은 "더 읽어볼 글".
- **읽기**: 글자 크기·배경·글꼴·줄간격 설정, 읽던 위치 기억, 검색, 오프라인 읽기(PWA), 브라우저 음성 읽기.
- **관리**: 공개/비공개, 태그 편집, 본문 마크다운 편집, 다시 처리, 처리 비용 표, 주제어로 새 글 찾기.
- **선택 기능**(OpenAI 키 필요): AI 표지 그림, 낭독 오디오. 웹 푸시 알림과 주간 요약(VAPID 키 필요).
- **iOS 단축어**: API 토큰을 만들어 공유 시트에서 바로 글을 보낼 수 있습니다(관리 → API 토큰에 만드는 법).

## 구성

Next.js 16(App Router) · Tailwind CSS 4 · Postgres(Neon) + Drizzle · Vercel Blob · Vercel Workflow · Anthropic Claude(Sonnet·Haiku·Opus) · OpenAI(선택).

## 필요한 것

- Vercel 계정(Hobby로 충분)
- [Anthropic API 키](https://console.anthropic.com)
- (선택) [OpenAI API 키](https://platform.openai.com) — 표지 그림·낭독 오디오

## Vercel에 배포하기

1. 이 저장소를 Fork한 뒤 Vercel에서 **Add New → Project**로 가져옵니다.
2. 프로젝트의 **Storage** 탭에서 두 가지를 연결합니다. 연결하면 환경 변수가 자동으로 들어갑니다.
   - **Neon**(Postgres) → `DATABASE_URL`. DB 연결은 Neon의 HTTP 드라이버를 쓰므로 다른 Postgres 대신 Neon이 필요합니다.
   - **Blob** → `BLOB_READ_WRITE_TOKEN`
3. **Settings → Environment Variables**에 아래 값을 넣습니다. 전체 목록과 설명은 [`.env.example`](.env.example)에 있습니다.

   | 이름 | 필수 | 설명 |
   | --- | --- | --- |
   | `ANTHROPIC_API_KEY` | 필수 | 번역·요약·추천 글 |
   | `ADMIN_PASSWORD` | 필수 | 관리 화면 비밀번호 |
   | `SESSION_SECRET` | 필수 | 임의 문자열. `openssl rand -base64 32` |
   | `OPENAI_API_KEY` | 선택 | AI 표지 그림, 낭독 오디오 |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | 선택 | 웹 푸시 알림. `npx web-push generate-vapid-keys` |
   | `CRON_SECRET` | 선택 | 매주 월요일 주간 요약 알림(cron) 인증 |
   | `SITE_AUTHOR` | 선택 | 소개 화면 서명과 미리보기 이미지의 @핸들. 빈 값이면 숨김 |
   | `SITE_URL` | 선택 | 사이트 주소. 비우면 Vercel 운영 주소 |

4. 데이터베이스 표를 만듭니다. 로컬에서 한 번 실행하면 됩니다.

   ```bash
   npm install
   npx vercel link
   npx vercel env pull .env.local
   npm run db:migrate
   ```

5. **Deployments**에서 다시 배포(Redeploy)한 뒤 `/admin/login`에서 `ADMIN_PASSWORD`로 로그인합니다. 오른쪽 아래 + 버튼으로 첫 글을 등록해 보세요.

> `drizzle/0001_search_trgm.sql`은 검색용 `pg_trgm` 확장을 만드는 커스텀 마이그레이션입니다. `drizzle-kit push`는 쓰지 말고 항상 `npm run db:migrate`로 적용하세요.

## 로컬 개발

```bash
cp .env.example .env.local   # 값 채우기(또는 npx vercel env pull .env.local)
npm install
npm run db:migrate
npm run dev                  # http://localhost:3000
```

```bash
npm test            # 단위 테스트(Vitest)
npm run typecheck   # 타입 검사
npm run lint
```

Anthropic API 연결만 따로 확인하려면:

```bash
npx tsx --tsconfig tsconfig.json --env-file=.env.local scripts/llm-smoke.ts
```

E2E(Playwright)는 `npx playwright install chromium webkit`로 브라우저를 설치한 뒤 `npm run build && npm run e2e`로 돌립니다. 테스트는 `.env.local`의 DB에 `[E2E TEST]` 표식이 붙은 글·토큰을 만들고 끝나면 지웁니다. 운영 DB 대신 테스트용 DB를 쓰기를 권합니다.

## 비용 참고

API 비용은 모두 본인 키로 청구됩니다. 관리 화면의 글 상세에서 단계별 추정 비용을 볼 수 있습니다.

- 영어 글 1만 자(한국어 약 1만 자) 한 편: 번역·교정·요약·추천 글 합계 약 $0.5~0.7(Sonnet 기준)
- 주제어로 글 찾기 1회: 약 $0.1
- 낭독 오디오: 약 27분 분량에 $0.4 안팎(OpenAI TTS)
- Vercel·Neon·Blob은 개인 사용 규모라면 무료 플랜 안에서 대부분 해결됩니다.

## 쓸 때 주의할 점

- 다른 사람이 쓴 글을 번역해 **공개**하면 원저작자의 권리를 침해할 수 있습니다. 공개 전에 원문의 이용 조건을 확인하고, 개인 보관용이라면 글을 **비공개**로 등록하세요(비공개 글은 소유자만 보고 검색엔진·미리보기에도 나오지 않습니다).
- 유료 구독 사이트나 로그인이 필요한 페이지는 본문을 제대로 가져오지 못합니다.
- 소개 화면(`src/app/(site)/about/page.tsx`)의 문구는 원작자의 것입니다. 직접 운영할 때는 자기 문구로 바꾸세요.

## 라이선스

[MIT](LICENSE)
