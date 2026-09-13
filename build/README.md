# 빌드 및 패키징

`build`는 PHGC Windows 실행 파일의 아이콘·메타데이터와 빌드 결과를 관리하는 폴더입니다.

## 구성

- `appicon.png`: 앱 기본 아이콘
- `windows/icon.ico`: Windows 실행 파일·작업표시줄 아이콘
- `windows/info.json`: Windows 파일 정보 템플릿
- `windows/wails.exe.manifest`: DPI 등 실행 매니페스트
- `bin/PHGC.exe`: Wails가 생성하는 최종 실행 파일(저장소 추적 제외)

## 로컬 빌드

프로젝트 루트에서 실행합니다.

```powershell
wails build -trimpath -ldflags "-s -w"
```

결과 파일은 `build/bin/PHGC.exe`입니다. 실행 중인 PHGC가 있으면 종료한 뒤 빌드해야 파일 교체가 안전합니다.

## 공식 릴리즈

```powershell
.\publish.ps1 -Version "1.6.0" -Notes "한국어 릴리즈 노트"
```

파이프라인은 다음을 수행합니다.

1. `server-data/version.json`과 앱 버전을 지정 버전으로 갱신
2. `PHGC.exe` 빌드 및 버전별 ZIP 생성
3. GitHub와 Gitea에 커밋·태그·푸시
4. 두 릴리즈에 `PHGC.exe`, `phgc_v버전.zip` 업로드

학교별 `data` 폴더, 나이스 엑셀, DB, 암호화 배포·취합 파일은 릴리즈 산출물에 포함하지 않습니다.
