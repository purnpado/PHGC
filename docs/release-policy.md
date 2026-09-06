# Release Asset 정책

Gitea Release에는 `PHGC.exe` 하나만 올린다. `publish.ps1`은 `build/bin/PHGC.exe`만 Release Asset으로 업로드한다.

다음 항목은 Release에 첨부하거나 포함하지 않는다.

- `docs/`의 기획·개발 문서
- 소스코드 및 서버 소스
- `.env`, API 토큰, 비밀번호
- `data/`, `*.db`, 나이스 엑셀 자료, 학교별 운영 자료
- 개발용 관리자 프로그램과 의존성 폴더
