# 서버 동기화 데이터 저장소 (Server-Data)

이 디렉터리는 중앙 프록시 서버(`go.gguk.link`) 및 Gitea 저장소를 통해 모든 클라이언트 프로그램과 실시간 동기화되는 기준 데이터 및 배포 자산이 위치하는 공간입니다.

## 디렉터리 구성

```text
server-data/
├── version.json        # 최신 프로그램 버전, 배포 릴리즈 노트 및 다운로드 링크
├── highschools.json    # 관내 고등학교 목록 및 기본 전형 정보
├── PHGC.exe            # 원클릭 자동 업데이트를 위한 최신 배포 바이너리 실행 파일
└── cutoffs/            # 각 중학교에서 업로드한 연도별/학교별 고교 합격 커트라인 데이터
```

## 주요 파일 설명

### 1. `version.json`
클라이언트 프로그램이 시작되거나 사용자가 [업데이트 확인]을 누를 때 버전을 비교하는 기준 파일입니다.  
`publish.ps1` 배포 스크립트를 통해 자동으로 버전 번호가 증가하고 릴리즈 노트가 갱신됩니다.
*(주의: Go 표준 JSON 파서와의 호환성을 위해 반드시 BOM 없는 순수 UTF-8로 저장되어야 합니다.)*

```json
{
  "latestVersion": "0.5.24",
  "minVersion": "0.5.0",
  "releaseNotes": "v0.5.24 - ...",
  "downloadUrl": "https://go.gguk.link/api/sync/server-data/PHGC.exe"
}
```

### 2. `highschools.json`
울산 관내 전기고(특성화고, 마이스터고, 예체능고, 특목고) 및 후기 일반고의 학교명, 계열, 비고 등이 담긴 마스터 데이터입니다.  
프로그램 실행 시 로컬의 `data/highschools.json`으로 자동 동기화됩니다.

### 3. `PHGC.exe`
배포 시 `publish.ps1`이 최신 빌드된 실행 파일을 이곳에 복사하여 Git에 자동 푸시합니다.  
중앙 서버의 `/api/sync/server-data/PHGC.exe` 엔드포인트를 통해 비공개 저장소 보안을 유지한 채 클라이언트에게 직접 제공됩니다.

### 4. `cutoffs/`
각 중학교의 학년부장 선생님이 입력하여 중앙 서버로 전송한 커트라인 파일(`{연도}_{학교명}.json`)들이 저장됩니다.
