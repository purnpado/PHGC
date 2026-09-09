# 빌드 및 패키징 — 그래서? 넌 어디 갈래? (PHGC)

이 디렉터리는 **"그래서? 넌 어디 갈래?"** 애플리케이션의 Windows 실행 파일 빌드 자산, 프로그램 아이콘 및 패키징 설정을 관리합니다.

## 디렉터리 구성

- `bin/`: 빌드된 최종 단일 실행 파일(`PHGC.exe`)이 출력되는 폴더입니다.
- `windows/`: Windows 실행 파일 메타데이터 및 리소스 파일
  - `icon.ico`: **Windows 실행 파일(`.exe`) 및 작업 표시줄에 표시되는 아이콘**
  - `info.json`: 실행 파일 버전, 프로그램명, 제작자 정보
  - `wails.exe.manifest`: 관리자 권한 및 고해상도(DPI) 지원 매니페스트
- `appicon.png`: **애플리케이션 대표 PNG 아이콘** (Wails 크로스플랫폼 기본 아이콘)
- `frontend/src/assets/images/logo-universal.png`: 프론트엔드 로그인 및 대시보드 로고 이미지

---

## 🎨 프로그램 아이콘 변경 방법

프로그램의 아이콘을 새로운 이미지로 변경하려면 다음 순서대로 진행합니다.

1. **아이콘 파일 준비**:
   - 정사각 비율의 새 로고 이미지(PNG 형식, 최소 512x512 권장)를 준비합니다.
2. **아이콘 파일 덮어쓰기**:
   - `build/appicon.png`: 새 PNG 파일로 교체합니다.
   - `build/windows/icon.ico`: 다중 해상도(256, 128, 64, 48, 32, 16)가 포함된 `.ico` 파일로 변환하여 교체합니다.
   - `frontend/src/assets/images/logo-universal.png`: 프로그램 UI 내부 로고도 함께 변경하려면 이 파일을 교체합니다.
3. **프로그램 재빌드**:
   - 프로젝트 루트에서 `wails build`를 실행하면 새 아이콘이 적용된 `build/bin/PHGC.exe`가 생성됩니다.

---

## 🚀 빌드 명령어

Wails CLI가 설치된 터미널에서 실행합니다:

```powershell
# 개발 모드 (Vite 실시간 핫리로드 지원)
wails dev

# 배포용 단일 실행 파일(.exe) 빌드
wails build

# 버전 증가, 빌드, 한국어 커밋 및 저장소 동기화
.\publish.ps1 -Notes "아이콘 변경 및 최신 기능 업데이트"
```