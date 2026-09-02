import './style.css';
import './app.css';

import { CheckSetupComplete, GetSchoolConfig, SaveSchoolConfig, VerifyAdminPassword, SyncWithServer, GetAppVersion, OpenExcelFile, ProcessExcel, GetClassStatus, GetClassGrades } from '../wailsjs/go/main/App';
import middleSchools from './assets/middleschools.json';

const app = document.querySelector('#app');

// ===== 화면 렌더링 함수들 =====

// 초기 설정 화면 (관리자 전용)
function renderSetupScreen(existingConfig = null) {
    const schoolName = existingConfig?.schoolName || '';
    const classCount = existingConfig?.classCount || '';
    const isSmallSchool = existingConfig?.isSmallSchool || false;
    const isEdit = existingConfig !== null;

    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <!-- 헤더 -->
            <div class="text-center mb-8">
                <div class="text-5xl mb-4" style="animation: float 3s ease-in-out infinite;">🏫</div>
                <h1 class="text-2xl font-bold text-white mb-2">PHGC 초기 설정</h1>
                <p class="text-text-muted text-sm">관리자(학년부장)가 최초 1회 설정합니다</p>
            </div>

            <!-- 설정 폼 -->
            <form id="setupForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">중학교명</label>
                    <input type="text" id="schoolName" class="input-field" list="schoolList"
                        placeholder="예: 푸른파도소리중학교 (검색 가능)" value="${schoolName}" autocomplete="off" required />
                    <datalist id="schoolList">
                        ${middleSchools.map(school => `<option value="${school}"></option>`).join('')}
                    </datalist>
                    <div id="schoolNameError" class="error-msg">학교명을 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">3학년 학급수</label>
                    <input type="number" id="classCount" class="input-field"
                        placeholder="예: 8" value="${classCount}" min="1" max="30" autocomplete="off" required />
                    <div id="classCountError" class="error-msg">학급수는 1~30 사이로 입력해 주세요.</div>
                </div>

                <div class="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="isSmallSchool" class="w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary focus:ring-offset-slate-900 cursor-pointer" ${isSmallSchool ? 'checked' : ''}>
                    <label for="isSmallSchool" class="text-sm font-medium text-text-muted cursor-pointer hover:text-white transition-colors">소인수 학교 (3학년 전체 10명 미만)</label>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">관리자 비밀번호</label>
                    <input type="password" id="adminPassword" class="input-field"
                        placeholder="관리자 모드 진입 시 사용됩니다" autocomplete="off" required />
                    <div id="passwordError" class="error-msg">비밀번호를 입력해 주세요.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">비밀번호 확인</label>
                    <input type="password" id="adminPasswordConfirm" class="input-field"
                        placeholder="비밀번호를 한 번 더 입력하세요" autocomplete="off" required />
                    <div id="passwordConfirmError" class="error-msg">비밀번호가 일치하지 않습니다.</div>
                </div>

                <div class="pt-3">
                    <button type="submit" id="saveBtn" class="btn-primary">설정 완료</button>
                </div>
                <div id="generalError" class="error-msg text-center"></div>
            </form>

            ${isEdit ? `
            <div class="text-center mt-4">
                <button id="backToModeBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ← 모드 선택으로 돌아가기
                </button>
            </div>` : ''}
        </div>
    `;

    document.getElementById('schoolName').focus();
    document.getElementById('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSetupSubmit(isEdit);
    });

    if (isEdit) {
        document.getElementById('backToModeBtn')?.addEventListener('click', () => {
            renderModeSelectScreen(existingConfig.schoolName);
        });
    }
}

// 설정 폼 제출 처리
async function handleSetupSubmit(isEdit = false) {
    const schoolName = document.getElementById('schoolName').value.trim();
    const classCount = parseInt(document.getElementById('classCount').value, 10);
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    const isSmallSchool = document.getElementById('isSmallSchool').checked;
    const saveBtn = document.getElementById('saveBtn');

    // 에러 초기화
    ['schoolNameError', 'classCountError', 'passwordError', 'passwordConfirmError', 'generalError']
        .forEach(id => document.getElementById(id).classList.remove('show'));

    // 유효성 검사
    let hasError = false;
    if (!schoolName) { document.getElementById('schoolNameError').classList.add('show'); hasError = true; }
    if (!classCount || classCount < 1 || classCount > 30) { document.getElementById('classCountError').classList.add('show'); hasError = true; }
    if (!password) { document.getElementById('passwordError').classList.add('show'); hasError = true; }
    if (password !== passwordConfirm) { document.getElementById('passwordConfirmError').classList.add('show'); hasError = true; }
    if (hasError) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>저장 중...';

    try {
        // App.SetupApp(req) 호출하도록 wails에서 생성한 SetupApp API 사용 (wailsjs/go/main/App 에 바인딩 되어있어야 함)
        // 하지만 기존 코드가 SaveSchoolConfig를 직접 바인딩하여 썼다면, Go에서 SetupApp(SetupRequest)로 바꿨으므로 여기서도 맞춰줘야 함.
        const req = {
            schoolName: schoolName,
            classCount: classCount,
            adminPassword: password,
            isSmallSchool: isSmallSchool
        };
        await window.go.main.App.SetupApp(req); // SetupApp 바인딩 직접 호출

        if (isEdit) {
            renderModeSelectScreen(schoolName);
        } else {
            // 최초 설정 → 서버 동기화
            renderSyncScreen(schoolName);
        }
    } catch (err) {
        const generalError = document.getElementById('generalError');
        generalError.textContent = err;
        generalError.classList.add('show');
        saveBtn.disabled = false;
        saveBtn.textContent = '설정 완료';
    }
}

// ===== 서버 동기화 화면 =====
function renderSyncScreen(schoolName) {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-4xl mb-4 sync-icon">🔄</div>
                <h1 class="text-xl font-bold text-white mb-2">서버 동기화</h1>
                <p class="text-text-muted text-sm">Gitea 서버에서 데이터를 받아오는 중입니다...</p>
            </div>

            <!-- 동기화 단계 표시 -->
            <div class="space-y-4" id="syncSteps">
                <div class="sync-step" id="step-connect">
                    <div class="sync-step-icon"><span class="spinner"></span></div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">서버 연결 중</div>
                        <div class="sync-step-desc text-text-muted text-xs">gitea.gguk.link</div>
                    </div>
                </div>
                <div class="sync-step" id="step-schools">
                    <div class="sync-step-icon pending">⏳</div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">고등학교 정보 다운로드</div>
                        <div class="sync-step-desc text-text-muted text-xs">대기 중</div>
                    </div>
                </div>
                <div class="sync-step" id="step-version">
                    <div class="sync-step-icon pending">⏳</div>
                    <div class="sync-step-text">
                        <div class="sync-step-title">앱 업데이트 확인</div>
                        <div class="sync-step-desc text-text-muted text-xs">대기 중</div>
                    </div>
                </div>
            </div>

            <!-- 결과 영역 (동기화 완료 후 표시) -->
            <div id="syncResult" class="hidden mt-6"></div>
        </div>
    `;

    // 동기화 실행
    performSync(schoolName);
}

// 동기화 실행 로직
async function performSync(schoolName) {
    const stepConnect = document.getElementById('step-connect');
    const stepSchools = document.getElementById('step-schools');
    const stepVersion = document.getElementById('step-version');
    const syncResult = document.getElementById('syncResult');

    try {
        // 약간의 딜레이로 UX 개선
        await delay(800);

        // 연결 성공 표시
        updateSyncStep(stepConnect, 'success', '서버 연결 완료', '✅');

        // 고교 데이터 다운로드 시작
        updateSyncStep(stepSchools, 'loading', '다운로드 중...', null);
        await delay(300);

        // 실제 동기화 실행
        const result = await SyncWithServer();

        if (result.success) {
            // 고교 데이터 성공
            updateSyncStep(stepSchools, 'success', `${result.schoolCount}개 고교 정보 저장 완료`, '✅');
            await delay(500);

            // 버전 확인
            updateSyncStep(stepVersion, 'loading', '확인 중...', null);
            await delay(500);

            if (result.hasUpdate) {
                updateSyncStep(stepVersion, 'update', `새 버전 ${result.latestVersion} 사용 가능`, '⬆️');
            } else {
                updateSyncStep(stepVersion, 'success', `v${result.currentVersion} — 최신 버전`, '✅');
            }

            // 결과 표시
            await delay(600);
            showSyncComplete(syncResult, schoolName, result);

        } else {
            // 동기화 실패
            updateSyncStep(stepSchools, 'error', result.message, '❌');
            updateSyncStep(stepVersion, 'skipped', '건너뜀', '⏭️');

            await delay(500);
            showSyncFailed(syncResult, schoolName, result.message);
        }

    } catch (err) {
        // 서버 연결 자체 실패
        updateSyncStep(stepConnect, 'error', '서버에 연결할 수 없습니다', '❌');
        updateSyncStep(stepSchools, 'skipped', '건너뜀', '⏭️');
        updateSyncStep(stepVersion, 'skipped', '건너뜀', '⏭️');

        await delay(500);
        showSyncFailed(syncResult, schoolName, '서버 연결 실패 — 오프라인 모드로 진행합니다');
    }
}

// 동기화 단계 상태 업데이트
function updateSyncStep(element, status, message, icon) {
    const iconEl = element.querySelector('.sync-step-icon');
    const descEl = element.querySelector('.sync-step-desc');

    if (status === 'loading') {
        iconEl.innerHTML = '<span class="spinner"></span>';
        iconEl.classList.remove('pending');
    } else {
        iconEl.textContent = icon;
        iconEl.classList.remove('pending');
    }

    descEl.textContent = message;

    if (status === 'error') {
        descEl.classList.add('text-danger');
        descEl.classList.remove('text-text-muted');
    } else if (status === 'success') {
        descEl.classList.add('text-success');
        descEl.classList.remove('text-text-muted');
    } else if (status === 'update') {
        descEl.classList.add('text-warning');
        descEl.classList.remove('text-text-muted');
    }
}

// 동기화 완료 UI
function showSyncComplete(container, schoolName, result) {
    let updateNotice = '';
    if (result.hasUpdate) {
        updateNotice = `
            <div class="p-3 rounded-lg bg-warning/10 border border-warning/30 mb-4 text-sm">
                <div class="font-semibold text-warning mb-1">⬆️ 업데이트 안내</div>
                <div class="text-text-muted text-xs">${result.releaseNotes}</div>
                <a href="${result.downloadUrl}" target="_blank"
                   class="inline-block mt-2 text-xs text-primary hover:text-primary-hover transition-colors">
                    다운로드 페이지 열기 →
                </a>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="fade-in">
            ${updateNotice}
            <button id="continueBtn" class="btn-primary">
                시작하기 →
            </button>
        </div>
    `;
    container.classList.remove('hidden');

    document.getElementById('continueBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

// 동기화 실패 UI
function showSyncFailed(container, schoolName, errorMsg) {
    container.innerHTML = `
        <div class="fade-in">
            <div class="p-3 rounded-lg bg-danger/10 border border-danger/30 mb-4 text-sm">
                <div class="text-text-muted text-xs">${errorMsg}</div>
            </div>
            <div class="flex gap-3">
                <button id="retryBtn" class="btn-primary flex-1" style="background: linear-gradient(135deg, #64748b, #475569); box-shadow: none;">
                    다시 시도
                </button>
                <button id="skipBtn" class="btn-primary flex-1">
                    오프라인으로 계속 →
                </button>
            </div>
        </div>
    `;
    container.classList.remove('hidden');

    document.getElementById('retryBtn').addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });
    document.getElementById('skipBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

// ===== 모드 선택 화면 =====
function renderModeSelectScreen(schoolName) {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-lg fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <h1 class="text-2xl font-bold text-white mb-2">📚 ${schoolName}</h1>
                <p class="text-text-muted text-sm">사용할 모드를 선택하세요</p>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="mode-card" id="adminMode">
                    <span class="icon">👔</span>
                    <div class="title">관리자 모드</div>
                    <div class="desc">학년부장용<br/>엑셀 Import · 커트라인 관리</div>
                    <div class="mt-2 text-xs text-text-muted">🔒 비밀번호 필요</div>
                </div>
                <div class="mode-card" id="teacherMode">
                    <span class="icon">📋</span>
                    <div class="title">담임 모드</div>
                    <div class="desc">담임교사용<br/>내신 조회 · 합격 예측</div>
                    <div class="mt-2 text-xs text-success">🔓 바로 접근</div>
                </div>
            </div>

            <div class="flex justify-center gap-4">
                <button id="syncBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    🔄 서버 동기화
                </button>
                <button id="editConfigBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ⚙️ 학교 설정 변경
                </button>
            </div>

            <div class="text-center mt-3" id="versionDisplay"></div>
        </div>
    `;

    // 버전 표시
    GetAppVersion().then(ver => {
        document.getElementById('versionDisplay').innerHTML =
            `<span class="text-text-muted text-[10px]">v${ver}</span>`;
    });

    // 이벤트 바인딩
    document.getElementById('adminMode').addEventListener('click', () => {
        renderAdminLoginScreen(schoolName);
    });
    document.getElementById('teacherMode').addEventListener('click', () => {
        renderTeacherScreen(schoolName);
    });
    document.getElementById('syncBtn').addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });
    document.getElementById('editConfigBtn').addEventListener('click', () => {
        renderAdminLoginScreen(schoolName, 'editConfig');
    });
}

// ===== 관리자 비밀번호 입력 화면 =====
function renderAdminLoginScreen(schoolName, nextAction = 'adminDashboard') {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-sm fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-4xl mb-4">🔐</div>
                <h1 class="text-xl font-bold text-white mb-2">관리자 인증</h1>
                <p class="text-text-muted text-sm">관리자 비밀번호를 입력하세요</p>
            </div>

            <form id="loginForm" class="space-y-5">
                <div>
                    <input type="password" id="loginPassword" class="input-field"
                        placeholder="비밀번호" autocomplete="off" required />
                    <div id="loginError" class="error-msg">비밀번호가 올바르지 않습니다.</div>
                </div>
                <button type="submit" id="loginBtn" class="btn-primary">확인</button>
            </form>

            <div class="text-center mt-4">
                <button id="backBtn" class="text-text-muted text-xs hover:text-primary transition-colors cursor-pointer bg-transparent border-none">
                    ← 모드 선택으로 돌아가기
                </button>
            </div>
        </div>
    `;

    document.getElementById('loginPassword').focus();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const passwordInput = document.getElementById('loginPassword');
        const loginBtn = document.getElementById('loginBtn');
        const loginError = document.getElementById('loginError');

        loginError.classList.remove('show');
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="spinner"></span>확인 중...';

        try {
            const result = await VerifyAdminPassword(passwordInput.value);
            if (result) {
                if (nextAction === 'editConfig') {
                    const config = await GetSchoolConfig();
                    renderSetupScreen(config);
                } else {
                    renderAdminScreen(schoolName);
                }
            } else {
                loginError.classList.add('show');
                loginBtn.disabled = false;
                loginBtn.textContent = '확인';
                passwordInput.value = '';
                passwordInput.focus();
            }
        } catch (err) {
            loginError.textContent = err;
            loginError.classList.add('show');
            loginBtn.disabled = false;
            loginBtn.textContent = '확인';
        }
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });
}

// ===== 관리자 모드 화면 =====
async function renderAdminScreen(schoolName) {
    // 1. 학교 설정(학급수) 가져오기
    let classCount = 8; // 기본값
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error("설정 불러오기 실패:", e);
    }

    // 2. 현재 저장된 학급별 데이터 상태 가져오기
    let status = {};
    try {
        status = await GetClassStatus(classCount);
    } catch (e) {
        console.error("상태 불러오기 실패:", e);
    }

    // 학급 카드 HTML 생성
    let classCardsHTML = '';
    for (let i = 1; i <= classCount; i++) {
        const studentCount = status[i] || 0;
        const isDone = studentCount > 0;
        
        classCardsHTML += `
            <div class="p-4 rounded-xl border ${isDone ? 'border-success/30 bg-success/5' : 'border-slate-700/50 bg-slate-800/30'} flex justify-between items-center transition-all">
                <div class="font-bold text-lg">${i}반</div>
                <div class="text-sm flex items-center gap-2">
                    ${isDone 
                        ? `<span class="text-success font-medium">${studentCount}명 저장됨</span> <span class="text-xl">🟢</span>` 
                        : `<span class="text-text-muted">데이터 없음</span> <span class="text-xl opacity-50 grayscale">🔴</span>`
                    }
                </div>
            </div>
        `;
    }

    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-4xl fade-in" style="margin: 2rem;">
            <!-- 헤더 영역 -->
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👔 관리자 대시보드
                    </h1>
                    <p class="text-text-muted text-sm mt-2">${schoolName} (총 ${classCount}학급)</p>
                </div>
                <div class="flex gap-3">
                    <button id="resetDataBtn" class="text-danger border border-danger/30 hover:bg-danger/10 transition-colors cursor-pointer text-sm px-4 py-2 rounded-lg font-bold">
                        데이터 완전 초기화
                    </button>
                    <button id="backBtn" class="text-text-muted hover:text-white transition-colors cursor-pointer bg-transparent border-none text-sm px-4 py-2 rounded-lg hover:bg-slate-800">
                        ← 모드 선택
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- 왼쪽 패널 (액션) -->
                <div class="space-y-4">
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <h3 class="font-bold mb-2">📥 나이스 엑셀 데이터 연동</h3>
                        <p class="text-xs text-text-muted mb-4 line-clamp-3">
                            3학년 전체 파일, 혹은 담임 선생님이 다운받은 반별 파일을 업로드하세요. 프로그램이 자동으로 '반'을 인식하여 쪼개어 저장합니다.
                        </p>
                        <button id="uploadExcelBtn" class="btn-primary w-full flex justify-center items-center gap-2 text-sm">
                            <span>엑셀 파일 불러오기</span>
                        </button>
                        <div id="uploadStatus" class="mt-3 text-xs text-center hidden"></div>
                    </div>

                    <div class="mode-card" id="cutoffBtn">
                        <span class="icon">🎯</span>
                        <div class="title">고교별 커트라인 관리</div>
                        <div class="desc">커트라인 입력 및 서버 데이터 전송</div>
                    </div>
                </div>

                <!-- 오른쪽 패널 (데이터 현황) -->
                <div class="md:col-span-2">
                    <h3 class="font-bold mb-4 flex items-center justify-between">
                        <span>학급별 데이터 현황</span>
                        <button id="refreshBtn" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded cursor-pointer transition-colors border-none text-white">새로고침</button>
                    </h3>
                    <div class="grid grid-cols-2 gap-3" id="classGrid">
                        ${classCardsHTML}
                    </div>
                </div>
            </div>
        </div>
    `;

    // 이벤트 바인딩
    document.getElementById('backBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });

    document.getElementById('resetDataBtn').addEventListener('click', async () => {
        if (confirm("정말 모든 데이터를 완전 초기화하시겠습니까?\n학교 설정과 업로드된 모든 성적 파일이 삭제되며 되돌릴 수 없습니다.")) {
            try {
                await window.go.main.App.ResetAllData();
                alert("모든 데이터가 초기화되었습니다. 프로그램이 재시작됩니다.");
                window.location.reload();
            } catch (err) {
                alert("데이터 초기화 실패: " + err);
            }
        }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        renderAdminScreen(schoolName);
    });

    document.getElementById('uploadExcelBtn').addEventListener('click', async () => {
        const btn = document.getElementById('uploadExcelBtn');
        const statusDiv = document.getElementById('uploadStatus');
        
        try {
            // 파일 선택 다이얼로그 호출
            const filePath = await OpenExcelFile();
            if (!filePath) return; // 취소한 경우

            // UI 업데이트
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> <span>처리 중...</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-warning';
            statusDiv.textContent = '데이터를 분석하고 저장하는 중입니다...';
            statusDiv.classList.remove('hidden');

            // 엑셀 파싱 및 분할 저장 호출
            const result = await ProcessExcel(filePath);
            
            // 결과 메시지 구성
            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            statusDiv.className = 'mt-3 text-xs text-center text-success';
            statusDiv.textContent = `성공! ${processedClasses}개 학급, 총 ${totalStudents}명의 데이터를 저장했습니다.`;
            
            // 화면 갱신을 위해 약간 대기 후 리렌더링
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1500);

        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>엑셀 파일 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `오류 발생: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });
}

// ===== 담임 교사 모드 화면 =====
async function renderTeacherScreen(schoolName) {
    let classCount = 8;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    let classOptions = '';
    for (let i = 1; i <= classCount; i++) {
        classOptions += `<option value="${i}">${i}반</option>`;
    }

    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-5xl fade-in" style="margin: 2rem; min-height: 80vh;">
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👨‍🏫 진학 상담 대시보드
                    </h1>
                    <p class="text-text-muted text-sm mt-2">${schoolName}</p>
                </div>
                <div class="flex items-center gap-4">
                    <select id="classSelector" class="input-field" style="width: auto;">
                        <option value="">-- 담당 학급 선택 --</option>
                        ${classOptions}
                    </select>
                    <button id="backBtn" class="text-text-muted hover:text-white transition-colors cursor-pointer bg-transparent border-none text-sm px-4 py-2 rounded-lg hover:bg-slate-800">
                        ← 모드 선택
                    </button>
                </div>
            </div>

            <div id="teacherContent" class="text-center py-20 text-text-muted">
                상단에서 담당 학급을 선택해 주세요.
            </div>
        </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => {
        renderModeSelectScreen(schoolName);
    });

    document.getElementById('classSelector').addEventListener('change', async (e) => {
        const classNum = parseInt(e.target.value);
        if (!classNum) {
            document.getElementById('teacherContent').innerHTML = '<div class="text-center py-20 text-text-muted">상단에서 담당 학급을 선택해 주세요.</div>';
            return;
        }

        document.getElementById('teacherContent').innerHTML = '<div class="text-center py-20"><span class="spinner"></span> 데이터를 불러오는 중...</div>';
        
        try {
            const students = await GetClassGrades(classNum);
            renderStudentList(students, classNum);
        } catch (err) {
            document.getElementById('teacherContent').innerHTML = `<div class="text-danger py-20 text-center font-bold">오류 발생: ${err}</div>`;
        }
    });
}

function renderStudentList(students, classNum) {
    if (!students || students.length === 0) {
        document.getElementById('teacherContent').innerHTML = `
            <div class="text-center py-20 text-warning">
                <div class="text-4xl mb-4">📭</div>
                ${classNum}반 학생 데이터가 없습니다. 관리자 모드에서 나이스 엑셀 파일을 업로드해 주세요.
            </div>
        `;
        return;
    }

    let tbody = '';
    students.forEach((s, idx) => {
        tbody += `
            <tr class="hover:bg-slate-800/50 transition-colors cursor-pointer" onclick="openStudentModal('${s.Name}', ${s.FinalScore}, ${s.Percentile})">
                <td class="p-4 border-b border-slate-700/50 text-center">${s.StudentNum || '-'}</td>
                <td class="p-4 border-b border-slate-700/50 font-bold text-white text-center">${s.Name}</td>
                <td class="p-4 border-b border-slate-700/50 text-center text-primary font-medium">${s.TotalSubjectScore.toFixed(2)}</td>
                <td class="p-4 border-b border-slate-700/50 text-center text-success font-bold">${s.Percentile.toFixed(2)}%</td>
                <td class="p-4 border-b border-slate-700/50 text-center font-bold text-lg">${(s.FinalScore + 40).toFixed(2)} <span class="text-xs text-text-muted font-normal">(+비교과 40)</span></td>
            </tr>
        `;
    });

    document.getElementById('teacherContent').innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-800/50 text-text-muted text-sm">
                        <th class="p-4 font-semibold text-center rounded-tl-lg">번호</th>
                        <th class="p-4 font-semibold text-center">성명</th>
                        <th class="p-4 font-semibold text-center">5개 학기 합산 점수</th>
                        <th class="p-4 font-semibold text-center">가산출 백분율(%)</th>
                        <th class="p-4 font-semibold text-center rounded-tr-lg">예상 내신 총점(200점)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>
        </div>
        <div class="mt-4 text-xs text-text-muted text-right">
            * 3학년 2학기 성적은 3학년 1학기 점수를 미러링하여 계산되었습니다.<br>
            * 비교과 성적은 현재 만점(40점)으로 일괄 가산되어 표시됩니다. (클릭 시 진학상담)
        </div>
    `;
}

// 진학 상담 모달 (플레이스홀더)
function openStudentModal(name, finalScore, percentile) {
    alert(`👨‍🎓 ${name} 학생 진학 상담\n\n예상 내신 점수: ${(finalScore + 40).toFixed(2)}점 / 200점\n가산출 백분율: ${percentile.toFixed(2)}%\n\n* 다음 업데이트에서 고교별 커트라인 시각화 게이지가 제공됩니다.`);
}

// ===== 유틸리티 =====
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 앱 시작 =====
async function init() {
    try {
        const isSetup = await CheckSetupComplete();
        if (isSetup) {
            const config = await GetSchoolConfig();
            renderModeSelectScreen(config.schoolName);
        } else {
            renderSetupScreen();
        }
    } catch (err) {
        console.error('초기화 오류:', err);
        renderSetupScreen();
    }
}

init();

// ==========================================
// 글로벌 피드백 모달 로직
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const feedbackModal = document.createElement('div');
    feedbackModal.id = 'feedbackModal';
    feedbackModal.className = 'hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    feedbackModal.innerHTML = `
        <div class="glass-card max-w-2xl w-full flex flex-col fade-in">
            <div class="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30 rounded-t-2xl">
                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                    <span>💬</span> 피드백 및 문의하기
                </h2>
                <button id="closeFeedbackBtn" class="text-text-muted hover:text-white transition-colors bg-transparent border-none text-xl">&times;</button>
            </div>
            <div class="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                
                <div class="flex gap-2 mb-6 border-b border-slate-700/50 pb-2">
                    <button id="tabWrite" class="font-bold text-primary border-b-2 border-primary pb-2 px-2 transition-colors">문의 작성</button>
                    <button id="tabList" class="font-bold text-text-muted hover:text-white pb-2 px-2 transition-colors">내 문의 내역</button>
                </div>

                <div id="feedbackWriteView">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm text-text-muted mb-1">답변 받을 이메일 (선택)</label>
                            <input type="email" id="fbEmail" class="input-field" placeholder="example@email.com">
                        </div>
                        <div>
                            <label class="block text-sm text-text-muted mb-1">제목</label>
                            <input type="text" id="fbTitle" class="input-field" placeholder="개선 사항 또는 버그 제보" required>
                        </div>
                        <div>
                            <label class="block text-sm text-text-muted mb-1">내용</label>
                            <textarea id="fbContent" class="input-field min-h-[150px] resize-none" placeholder="자세한 내용을 적어주세요..." required></textarea>
                        </div>
                        <button id="submitFeedbackBtn" class="btn-primary w-full mt-4">제출하기</button>
                    </div>
                </div>

                <div id="feedbackListView" class="hidden space-y-4">
                    <div id="fbListContent" class="text-center text-text-muted py-8"><span class="spinner"></span> 목록을 불러오는 중...</div>
                </div>

            </div>
        </div>
    `;
    document.body.appendChild(feedbackModal);

    const btn = document.getElementById('globalFeedbackBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            feedbackModal.classList.remove('hidden');
            document.getElementById('tabWrite').click();
        });
    }

    document.getElementById('closeFeedbackBtn').addEventListener('click', () => {
        feedbackModal.classList.add('hidden');
    });

    document.getElementById('tabWrite').addEventListener('click', (e) => {
        e.target.classList.add('text-primary', 'border-b-2', 'border-primary');
        e.target.classList.remove('text-text-muted');
        document.getElementById('tabList').classList.remove('text-primary', 'border-b-2', 'border-primary');
        document.getElementById('tabList').classList.add('text-text-muted');
        document.getElementById('feedbackWriteView').classList.remove('hidden');
        document.getElementById('feedbackListView').classList.add('hidden');
    });

    document.getElementById('tabList').addEventListener('click', async (e) => {
        e.target.classList.add('text-primary', 'border-b-2', 'border-primary');
        e.target.classList.remove('text-text-muted');
        document.getElementById('tabWrite').classList.remove('text-primary', 'border-b-2', 'border-primary');
        document.getElementById('tabWrite').classList.add('text-text-muted');
        document.getElementById('feedbackWriteView').classList.add('hidden');
        document.getElementById('feedbackListView').classList.remove('hidden');
        
        const listContent = document.getElementById('fbListContent');
        listContent.innerHTML = '<div class="text-center py-8"><span class="spinner"></span> 목록을 불러오는 중...</div>';
        
        try {
            const issues = await window.go.main.App.GetLocalFeedbacks();
            if (!issues || issues.length === 0) {
                listContent.innerHTML = '<div class="text-center text-text-muted py-8">작성한 문의 내역이 없습니다.</div>';
                return;
            }
            
            let html = '';
            for (const issue of issues) {
                let statusBadge = issue.status === 'open' ? '<span class="text-xs bg-warning/20 text-warning px-2 py-1 rounded">답변 대기</span>' : '<span class="text-xs bg-success/20 text-success px-2 py-1 rounded">답변 완료</span>';
                html += `
                    <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 cursor-pointer hover:bg-slate-700/50 transition-colors" onclick="loadIssueDetails(${issue.issue_id})">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="font-bold text-white text-sm">${issue.title}</h4>
                            ${statusBadge}
                        </div>
                        <div class="text-xs text-text-muted">${new Date(issue.created_at).toLocaleString()}</div>
                    </div>
                `;
            }
            listContent.innerHTML = html;
        } catch(err) {
            listContent.innerHTML = `<div class="text-danger text-center text-sm">${err}</div>`;
        }
    });

    document.getElementById('submitFeedbackBtn').addEventListener('click', async () => {
        const title = document.getElementById('fbTitle').value.trim();
        const content = document.getElementById('fbContent').value.trim();
        const email = document.getElementById('fbEmail').value.trim();
        
        if (!title || !content) {
            return alert('제목과 내용을 입력해주세요.');
        }

        const btn = document.getElementById('submitFeedbackBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 전송 중...';

        try {
            await window.go.main.App.SubmitFeedback(title, content, email);
            alert('피드백이 성공적으로 등록되었습니다.');
            document.getElementById('fbTitle').value = '';
            document.getElementById('fbContent').value = '';
            document.getElementById('tabList').click();
        } catch(err) {
            alert('등록 실패: ' + err);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '제출하기';
        }
    });
});

window.loadIssueDetails = async (issueID) => {
    const listContent = document.getElementById('fbListContent');
    const originalHTML = listContent.innerHTML;
    listContent.innerHTML = '<div class="text-center py-8"><span class="spinner"></span> 상세 내용을 불러오는 중...</div>';
    
    try {
        const details = await window.go.main.App.GetFeedbackDetails(issueID);
        let commentsHtml = '';
        if (details.comments && details.comments.length > 0) {
            details.comments.forEach(c => {
                commentsHtml += `
                    <div class="mt-4 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                        <div class="font-bold text-xs text-primary mb-1">관리자 답변 (${new Date(c.created_at).toLocaleString()})</div>
                        <div class="text-sm text-white whitespace-pre-wrap">${c.body}</div>
                    </div>
                `;
            });
        } else {
            commentsHtml = '<div class="mt-4 text-xs text-text-muted text-center">아직 답변이 등록되지 않았습니다.</div>';
        }

        listContent.innerHTML = `
            <div class="mb-4">
                <button class="text-xs text-text-muted hover:text-white" onclick="document.getElementById('tabList').click()">← 목록으로 돌아가기</button>
            </div>
            <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50">
                <h3 class="font-bold text-white mb-2">상태: ${details.state === 'open' ? '열림' : '닫힘'}</h3>
                ${commentsHtml}
            </div>
        `;
    } catch(err) {
        alert('상세 내용 불러오기 실패: ' + err);
        listContent.innerHTML = originalHTML;
    }
};


// ==========================================
// 커트라인 모달 로직
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 커트라인 모달 컨테이너 생성
    const cutoffModal = document.createElement('div');
    cutoffModal.id = 'cutoffModal';
    cutoffModal.className = 'hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    cutoffModal.innerHTML = `
        <div class="glass-card max-w-4xl w-full flex flex-col fade-in">
            <div class="p-6 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30 rounded-t-2xl">
                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                    <span>🎯</span> 고교별 커트라인 관리
                </h2>
                <div class="flex items-center gap-4">
                    <select id="cutoffYearSelect" class="input-field py-1 px-2 text-sm">
                        <option value="2024">2024학년도</option>
                        <option value="2025" selected>2025학년도</option>
                        <option value="2026">2026학년도</option>
                    </select>
                    <button id="closeCutoffBtn" class="text-text-muted hover:text-white transition-colors bg-transparent border-none text-xl">&times;</button>
                </div>
            </div>
            
            <div class="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar" id="cutoffFormContainer">
                <div class="text-center py-10"><span class="spinner"></span> 데이터를 불러오는 중...</div>
            </div>

            <div class="p-6 border-t border-slate-700/50 flex justify-between bg-slate-800/30 rounded-b-2xl">
                <div class="text-xs text-text-muted">입력한 커트라인은 로컬에 자동 저장됩니다.</div>
                <button id="exportCutoffBtn" class="btn-primary text-sm flex items-center gap-2">
                    <span>📤</span> 중앙 서버로 전송하기
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(cutoffModal);

    const closeBtn = document.getElementById('closeCutoffBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => cutoffModal.classList.add('hidden'));
    }

    const yearSelect = document.getElementById('cutoffYearSelect');
    if (yearSelect) {
        yearSelect.addEventListener('change', loadCutoffForm);
    }
});

// body 델리게이션을 통한 이벤트 바인딩 (DOM 렌더링 이후 버튼 클릭 잡기 위함)
document.body.addEventListener('click', (e) => {
    const cutoffBtn = e.target.closest('#cutoffBtn');
    if (cutoffBtn) {
        document.getElementById('cutoffModal').classList.remove('hidden');
        loadCutoffForm();
    }
    
    const exportBtn = e.target.closest('#exportCutoffBtn');
    if (exportBtn) {
        handleExportCutoff();
    }
});

async function loadCutoffForm() {
    const container = document.getElementById('cutoffFormContainer');
    const year = parseInt(document.getElementById('cutoffYearSelect').value);
    
    container.innerHTML = '<div class="text-center py-10"><span class="spinner"></span> 데이터를 불러오는 중...</div>';

    try {
        // Fetch raw highschools data
        const res = await fetch('/server-data/highschools.json');
        const highschoolsData = await res.json();
        
        // Fetch saved cutoffs
        const savedCutoffs = await window.go.main.App.GetCutoffs();
        const savedMap = {};
        if (savedCutoffs) {
            savedCutoffs.forEach(c => {
                if (c.year === year) {
                    savedMap[`${c.schoolName}_${c.department}_${c.track}`] = c;
                }
            });
        }

        let html = '<div class="space-y-6">';
        
        highschoolsData.highschools.forEach(school => {
            html += `
                <div class="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50">
                    <h3 class="font-bold text-white mb-3 text-lg">${school.name} <span class="text-xs text-primary bg-primary/10 px-2 py-1 rounded ml-2">${school.type}</span></h3>
                    <div class="space-y-3">
            `;
            
            if (school.type === '일반계고') {
                const key = `${school.name}_공통_일반`;
                const saved = savedMap[key] || { minValue: '' };
                html += `
                    <div class="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700/30">
                        <div class="font-bold text-sm text-text-muted">공통 (후기고)</div>
                        <div class="flex items-center gap-3">
                            <span class="text-xs text-text-muted">최저 커트라인(%)</span>
                            <input type="number" step="0.01" class="cutoff-input w-24 text-right bg-slate-700 border-none rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-primary outline-none" placeholder="예: 85.50" value="${saved.minValue || ''}" data-school="${school.name}" data-dept="공통" data-track="일반" data-type="percentile">
                        </div>
                    </div>
                `;
            } else {
                school.departments.forEach(dept => {
                    const tracks = ['일반전형', '특별전형'];
                    tracks.forEach(track => {
                        const key = `${school.name}_${dept}_${track}`;
                        const saved = savedMap[key] || { minValue: '' };
                        html += `
                            <div class="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-700/30">
                                <div>
                                    <div class="font-bold text-sm text-text-muted">${dept}</div>
                                    <div class="text-xs text-slate-500">${track}</div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <span class="text-xs text-text-muted">최저합격 내신(점)</span>
                                    <input type="number" step="0.1" class="cutoff-input w-24 text-right bg-slate-700 border-none rounded px-2 py-1 text-sm text-white focus:ring-1 focus:ring-primary outline-none" placeholder="예: 150.5" value="${saved.minValue || ''}" data-school="${school.name}" data-dept="${dept}" data-track="${track}" data-type="total_score">
                                </div>
                            </div>
                        `;
                    });
                });
            }
            html += `</div></div>`;
        });
        
        html += '</div>';
        container.innerHTML = html;

        // Add auto-save listeners
        document.querySelectorAll('.cutoff-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                await saveCutoffData(year);
            });
        });

    } catch (err) {
        container.innerHTML = `<div class="text-danger py-10 text-center">데이터 로드 실패: ${err}</div>`;
    }
}

async function saveCutoffData(year) {
    const inputs = document.querySelectorAll('.cutoff-input');
    const cutoffs = [];
    
    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            cutoffs.push({
                year: year,
                schoolName: input.dataset.school,
                department: input.dataset.dept,
                track: input.dataset.track,
                scoreType: input.dataset.type,
                minValue: val,
                maxValue: val // 간소화: 최저점만 사용
            });
        }
    });

    if (cutoffs.length > 0) {
        try {
            await window.go.main.App.SaveCutoffs(cutoffs);
        } catch (e) {
            console.error('커트라인 저장 실패:', e);
        }
    }
}

async function handleExportCutoff() {
    const btn = document.getElementById('exportCutoffBtn');
    const year = parseInt(document.getElementById('cutoffYearSelect').value);
    
    if (!confirm(`${year}학년도 커트라인 데이터를 중앙 데이터베이스로 전송하시겠습니까?`)) {
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>전송 중...';

    try {
        await saveCutoffData(year); // Ensure latest is saved
        await window.go.main.App.SendCutoffsToBridge(year);
        alert('데이터 전송이 완료되었습니다! 협조해 주셔서 감사합니다.');
    } catch(e) {
        alert('전송 실패: ' + e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📤</span> 중앙 서버로 전송하기';
    }
}
