# PHGC 중앙 브릿지 서버 (Server)

이 디렉터리는 관내 중학교의 PHGC 클라이언트와 Gitea 비공개(Private) 저장소 간의 통신 및 데이터 동기화를 중계하는 Go Gin 기반 경량 프록시 서버입니다.

## 주요 역할

1. **Gitea 토큰 비공개 보안 유지:**  
   클라이언트 프로그램(`PHGC.exe`)에 관리자 Gitea 토큰을 하드코딩하지 않고, 서버 측 환경변수로 안전하게 보관하면서 승인된 API 요청만 중계합니다.
2. **원클릭 자동 업데이트 프록시 (`/api/sync/*filepath`):**  
   비공개 저장소의 최신 버전 정보(`version.json`) 및 실행 파일(`server-data/PHGC.exe`)을 클라이언트에게 인증 없이 안전하게 스트리밍 전송합니다.
3. **학교별 커트라인 등록/취합/회수 API:**  
   각 학교에서 입력한 고교 합격 커트라인을 `server-data/cutoffs/` 경로에 자동 저장하고, 관내 전체 학교의 커트라인을 실시간 취합하여 일괄 반환합니다.
4. **선생님 의견/오류 피드백 접수 (`/api/feedback`):**  
   클라이언트에서 전송된 건의사항, 버그 신고, 첨부 캡처 이미지를 Gitea Issue 및 자산(Asset)으로 자동 등록하고 관리자 이메일(SMTP)로 알림을 발송합니다.

## 엔드포인트 안내

| 메서드 | 엔드포인트 | 설명 |
| :--- | :--- | :--- |
| `GET` | `/ping` | 서버 헬스체크 (상태 점검) |
| `GET` | `/api/sync/*filepath` | Gitea 저장소 내 raw 파일 동기화 프록시 (최신 버전 및 바이너리 다운로드) |
| `POST` | `/api/cutoff` | 학교별 고교 합격 커트라인 등록 (Gitea 커밋 연동) |
| `GET` | `/api/cutoff` | 관내 등록된 전형별 합격 커트라인 일괄 취합 조회 (`?year=2026`) |
| `DELETE` | `/api/cutoff` | 특정 학교 커트라인 회수(`?school=...`) |
| `POST` | `/api/feedback` | 교사 피드백/문의사항 등록 (Gitea Issue 자동 생성 및 이메일 발송) |

## 환경 변수 설정 (`.env`)

서버 실행 시 다음 환경 변수가 필요합니다:

```env
PORT=8080
GITEA_URL=https://gitea.gguk.link
GITEA_TOKEN=your_private_gitea_token_here
GITEA_OWNER=purnpadosori
GITEA_REPO=PHGC
GITEA_DATA_REPO=PHGC

# 이메일 알림 (선택 사항)
SMTP_USER=admin@example.com
SMTP_PASS=your_smtp_password
```

## 실행 및 배포 방법

```bash
# 로컬 테스트 실행
cd server
go run main.go

# Linux 서버 백그라운드 서비스(systemd 또는 Docker)로 배포
go build -o phgc-server main.go
./phgc-server
```
