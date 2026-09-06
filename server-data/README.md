# PHGC 기준 데이터

`server-data`는 PHGC 비공개 저장소에 보관하며 EduBridge-Server가 읽어 클라이언트에 제공하는 **비실행 기준 데이터**입니다.

```text
server-data/
├── version.json        # 최신 버전·릴리즈 노트·다운로드 URL
├── highschools.json    # 고교·학과 마스터 목록
└── cutoffs/            # 학교가 입력한 연도별 고교 커트라인 원자료
```

## 파일별 역할

- `version.json`: `publish.ps1`이 갱신합니다. 앱은 EduBridge의 `/api/sync/server-data/version.json`을 통해 버전을 확인합니다.
- `highschools.json`: 커트라인 입력 화면의 고교·학과 목록 기준입니다.
- `cutoffs/`: 중앙 취합에 필요한 최소 공개 항목만 저장합니다. 학생·학급·교사 정보는 포함하면 안 됩니다.

`PHGC.exe`는 이 폴더에 Git으로 저장하지 않습니다. 자동업데이트용 실행 파일은 **Gitea Release Asset**으로만 업로드하며, EduBridge의 `/api/download/PHGC.exe`가 최신 릴리즈 자산을 스트리밍합니다.

모든 JSON은 BOM 없는 UTF-8로 저장합니다.
