# 빌드 디렉터리 (Build Directory)

이 디렉터리는 PHGC 애플리케이션의 빌드 자산과 패키징 관련 설정을 관리하는 공간입니다.

## 디렉터리 구조

* `bin/` - Wails 빌드 결과물(`PHGC.exe`)이 생성되는 출력 폴더
* `windows/` - Windows 실행 파일 빌드 및 메타데이터 관련 파일
* `darwin/` - macOS 빌드 지원용 파일 (필요 시 활용)
* `appicon.png` - 애플리케이션 기본 아이콘 이미지

## Windows 빌드 설정

`windows/` 디렉터리는 Windows 환경에서 실행 파일(`PHGC.exe`) 생성 시 주입되는 아이콘, 버전 정보, 매니페스트를 정의합니다.

- `icon.ico`: 프로그램의 작업 표시줄, 바탕화면, 실행 파일에 표시되는 아이콘 파일입니다. (아이콘 변경 시 이 파일을 교체합니다.)
- `info.json`: 실행 파일 속성(자세히 탭)에 표기되는 프로그램 설명, 버전, 저작권자(`purnpadosori`) 정보입니다.
- `wails.exe.manifest`: Windows 관리자 권한 및 DPI 인식, 시각적 스타일 등을 정의하는 매니페스트 파일입니다.
- `installer/`: NSIS 기반 Windows 설치 프로그램(Installer) 패키징을 위한 템플릿 파일이 포함되어 있습니다.

## 빌드 방법

Wails CLI가 설치된 환경에서 다음 명령어를 실행합니다:

```bash
# 개발 모드 (Vite 프론트엔드 HMR 핫 리로드 지원)
wails dev

# 배포용 단일 실행 파일(.exe) 빌드
wails build
```

빌드가 성공하면 `build/bin/PHGC.exe`가 생성됩니다.  
원클릭 자동 버전업 및 Gitea 배포를 진행할 경우 루트 디렉터리의 `publish.ps1` 스크립트를 사용합니다.