import './style.css';
import './app.css';

import { CheckSetupComplete, GetSchoolConfig, VerifyAdminPassword, SyncWithServer, GetAppVersion, OpenExcelFile, ProcessExcel, GetClassStatus, GetClassGrades } from '../wailsjs/go/main/App';
import middleSchools from './assets/middleschools.json';

const app = document.querySelector('#app');

// 현재 로그인한 사용자 세션 (role, classNum, username 등 저장)
window.currentUser = null;

// ===== 화면 렌더링 함수들 =====

// 초기 설정 화면 (관리자 전용)
function renderSetupScreen(existingConfig = null) {
    const schoolName = existingConfig?.schoolName || '';
    const classCount = existingConfig?.classCount || '';
    const isSmallSchool = existingConfig?.isSmallSchool || false;
	const admissionYear = existingConfig?.admissionYear || (new Date().getFullYear() + 1);
    const isEdit = existingConfig !== null;

    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-xl fade-in" style="margin: 2rem;">
            <!-- 헤더 -->
            <div class="text-center mb-8">
                <div class="text-5xl mb-4" style="animation: float 3s ease-in-out infinite;">🏫</div>
                <h1 class="text-2xl font-bold text-white mb-2">그래서? 넌 어디갈래? 🏫 초기 설정</h1>
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

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">고교 입학년도</label>
                    <input type="text" inputmode="numeric" id="admissionYear" class="input-field" value="${admissionYear}" maxlength="4" required />
                    <p class="text-xs text-text-muted mt-1">현재 중3 학생이 다음 해 3월에 고등학교에 입학하는 연도입니다. 예: 2026년 중3 → 2027학년도</p>
                    <div id="admissionYearError" class="error-msg">입학년도는 2000~2100년 사이로 입력해 주세요.</div>
                </div>

                <div class="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="isSmallSchool" class="w-4 h-4 rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary focus:ring-offset-slate-900 cursor-pointer" ${isSmallSchool ? 'checked' : ''}>
                    <label for="isSmallSchool" class="text-sm font-medium text-text-muted cursor-pointer hover:text-white transition-colors">소인수 학교 (3학년 전체 10명 미만)</label>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">마스터(학년부장) 비밀번호</label>
                    <input type="password" id="adminPassword" class="input-field"
                        placeholder="마스터 계정 (admin) 진입 시 사용됩니다" autocomplete="off" required />
                    <div id="passwordError" class="error-msg">비밀번호를 입력해 주세요.</div>
                </div>



                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">비밀번호 확인</label>
                    <input type="password" id="adminPasswordConfirm" class="input-field"
                        placeholder="비밀번호를 한 번 더 입력하세요" autocomplete="off" required />
                    <div id="passwordConfirmError" class="error-msg">비밀번호가 일치하지 않습니다.</div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">공용 데이터 암호</label>
                    <input type="password" id="sharedDataPassword" class="input-field" placeholder="data 폴더 수령 교사가 최초 1회 입력" autocomplete="off" required />
                    <p class="text-xs text-text-muted mt-1">개인 로그인 비밀번호와 별도이며, 전달되는 data 폴더의 AES 잠금을 엽니다.</p>
                    <div id="sharedDataPasswordError" class="error-msg">공용 데이터 암호를 입력해 주세요.</div>
                </div>

                <div class="pt-3">
                    <button type="submit" id="saveBtn" class="btn-primary">설정 완료</button>
                </div>
                <div id="generalError" class="error-msg text-center"></div>
            </form>

            ${isEdit ? `
            <div class="text-center mt-5">
                <button id="backToModeBtn" type="button" class="btn-secondary text-xs px-4 py-2 font-bold inline-flex items-center gap-1.5" style="width: auto;">
                    <span>↩️</span> 모드 선택으로 돌아가기
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
	const sharedDataPassword = document.getElementById('sharedDataPassword').value;
    const isSmallSchool = document.getElementById('isSmallSchool').checked;
	const admissionYear = parseInt(document.getElementById('admissionYear').value, 10);
    const saveBtn = document.getElementById('saveBtn');

    // 에러 초기화
    ['schoolNameError', 'classCountError', 'admissionYearError', 'passwordError', 'passwordConfirmError', 'sharedDataPasswordError', 'generalError']
        .forEach(id => document.getElementById(id).classList.remove('show'));

    // 유효성 검사
    let hasError = false;
    if (!schoolName) { document.getElementById('schoolNameError').classList.add('show'); hasError = true; }
    if (!classCount || classCount < 1 || classCount > 30) { document.getElementById('classCountError').classList.add('show'); hasError = true; }
	if (!admissionYear || admissionYear < 2000 || admissionYear > 2100) { document.getElementById('admissionYearError').classList.add('show'); hasError = true; }
    if (!password) { document.getElementById('passwordError').classList.add('show'); hasError = true; }
    if (password !== passwordConfirm) { document.getElementById('passwordConfirmError').classList.add('show'); hasError = true; }
	if (!sharedDataPassword) { document.getElementById('sharedDataPasswordError').classList.add('show'); hasError = true; }
    if (hasError) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>저장 중...';

    try {
        await window.go.main.App.SetupApp({
            schoolName: schoolName,
            classCount: classCount,
            adminPassword: password,
			sharedDataPassword: sharedDataPassword,
            isSmallSchool: isSmallSchool,
            admissionYear: admissionYear
        });

        // 설정 후 무조건 로그인 화면으로 이동
        renderLoginScreen(schoolName);
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
            <div class="p-4 rounded-xl bg-warning/10 border border-warning/30 mb-4 text-sm space-y-3 text-left">
                <div class="font-bold text-warning flex items-center justify-between text-base">
                    <span>⬆️ 새 버전 업데이트 발견 (${result.latestVersion})</span>
                    <span class="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning">v${result.latestVersion}</span>
                </div>
                <div class="text-text-muted text-xs leading-relaxed">${result.releaseNotes}</div>
                <div class="flex items-center gap-3 pt-1">
                    <button id="autoUpdateBtn" class="btn-primary text-xs px-4 py-2.5 font-bold flex items-center gap-2" style="background: linear-gradient(135deg, #f59e0b, #d97706); width: auto;">
                        🚀 원클릭 자동 업데이트 실행
                    </button>
                    <a href="${result.downloadUrl}" target="_blank"
                       class="text-xs text-text-muted hover:text-slate-200 transition-colors underline">
                        수동 다운로드
                    </a>
                </div>
                <div id="updateStatusMsg" class="text-xs font-bold text-warning hidden"></div>
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

    // 원클릭 자동 업데이트 버튼 이벤트
    document.getElementById('autoUpdateBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('autoUpdateBtn');
        const statusMsg = document.getElementById('updateStatusMsg');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> <span>최신 파일 다운로드 중...</span>';
        statusMsg.className = 'text-xs font-bold text-warning';
        statusMsg.textContent = '최신 업데이트 파일을 다운로드하고 있습니다. 다운로드가 완료되면 프로그램이 자동으로 재시작됩니다...';
        statusMsg.classList.remove('hidden');

        try {
            await window.go.main.App.PerformAutoUpdate(result.downloadUrl);
        } catch (err) {
            btn.disabled = false;
            btn.textContent = '🚀 다시 시도';
            statusMsg.className = 'text-xs font-bold text-danger';
            statusMsg.textContent = '자동 업데이트 실패: ' + err + ' (수동 다운로드를 이용해 주세요)';
        }
    });

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

    document.getElementById('cutoffBtn')?.addEventListener('click', () => {
        renderCutoffScreen(schoolName);
    });
    document.getElementById('userManagementBtn')?.addEventListener('click', () => {
        renderUserManagementScreen(schoolName);
    });
    document.getElementById('retryBtn').addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });
    document.getElementById('skipBtn').addEventListener('click', () => {
        if (window.currentUser) {
            if (window.currentUser.Role === 'master' || window.currentUser.Role === 'viewer') {
                renderAdminScreen(schoolName);
            } else {
                renderTeacherScreen(schoolName, window.currentUser.ClassNum);
            }
        } else {
            renderLoginScreen(schoolName);
        }
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
    let updateStatus = {};
    try {
        status = await GetClassStatus(classCount);
        if (window.go?.main?.App?.GetDataUpdateStatus) {
            updateStatus = await window.go.main.App.GetDataUpdateStatus();
        }
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

    // 데이터 연동 상태 바
    const totalStd = updateStatus.totalStudents || 0;
    const attCount = updateStatus.attendanceCount || 0;
    const volCount = updateStatus.volunteerCount || 0;

    let localVer = '0.5.5';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

    app.className = 'wide-layout';

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <!-- 헤더 영역 -->
            <div class="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👔 관리자 대시보드
                        <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                    </h1>
                    <p class="text-text-muted text-sm mt-1">${schoolName} (총 ${classCount}학급)</p>
                </div>
                <div class="flex gap-2.5 flex-wrap justify-end">
                    ${window.currentUser && window.currentUser.Role === 'master' ? `
                    <button id="goToTeacherBtn" class="btn-secondary px-3 py-2 rounded-lg font-bold text-xs" style="width: auto;">
                        👩‍🏫 진학 상담 모드
                    </button>
                    <button id="importPatchBtn" class="btn-secondary px-3 py-2 rounded-lg font-bold text-xs" style="width: auto;">
                        📥 담임 변경분 가져오기
                    </button>
                    <button id="resetYearBtn" class="text-warning border border-warning/30 hover:bg-warning/10 transition-colors cursor-pointer text-xs px-3 py-2 rounded-lg font-bold" style="width: auto;" title="커트라인은 유지하고 학생 데이터만 삭제">
                        📅 새 입시년도 전환
                    </button>
                    <button id="resetDataBtn" class="text-danger border border-danger/30 hover:bg-danger/10 transition-colors cursor-pointer text-xs px-3 py-2 rounded-lg font-bold" style="width: auto;">
                        전체 초기화
                    </button>
                    ` : ''}
                    <button id="backBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold inline-flex items-center gap-1.5" style="width: auto;">
                        <span>🚪</span> 로그아웃
                    </button>
                </div>
            </div>

            <!-- 데이터 연동 현황 바 -->
            <div class="mb-6 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div class="font-bold text-slate-300">📊 데이터 연동 현황:</div>
                <div class="flex items-center gap-4 flex-wrap">
                    <span class="inline-flex items-center gap-1.5 ${totalStd > 0 ? 'text-success' : 'text-slate-400'}">
                        ${totalStd > 0 ? '✅' : '⚪'} 교과성적: <strong>${totalStd}명</strong>
                    </span>
                    <span class="inline-flex items-center gap-1.5 ${attCount > 0 ? 'text-success' : 'text-slate-400'}">
                        ${attCount > 0 ? '✅' : '⚪'} 출결: <strong>${attCount}명</strong>
                    </span>
                    <span class="inline-flex items-center gap-1.5 ${volCount > 0 ? 'text-success' : 'text-slate-400'}">
                        ${volCount > 0 ? '✅' : '⚪'} 봉사: <strong>${volCount}명</strong>
                    </span>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- 왼쪽 패널 (액션) -->
                <div class="space-y-4">
                    ${window.currentUser && window.currentUser.Role === 'master' ? `
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50">
                        <h3 class="font-bold mb-1.5 flex items-center gap-2">
                            <span>📥</span> 나이스 엑셀 데이터 연동
                        </h3>
                        <p class="text-xs text-text-muted mb-4 leading-relaxed">
                            순서대로 1 ➡️ 2 ➡️ 3단계 파일을 업로드하세요. 프로그램이 자동으로 학급을 인식하여 분류 저장합니다.
                        </p>
                        <div class="space-y-2.5">
                            <!-- 1단계: 교과 성적 -->
                            <button id="uploadExcelBtn" class="btn-primary w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-indigo-400/40 cursor-pointer">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">1</span>
                                    <span class="text-sm">📚 교과 성적 엑셀 불러오기</span>
                                </div>
                                <span class="text-[11px] font-semibold ${totalStd > 0 ? 'text-emerald-300' : 'text-indigo-200'}">${totalStd > 0 ? '✅ 연동됨' : '필수'}</span>
                            </button>

                            <!-- 2단계: 출결 현황 -->
                            <button id="uploadAttendanceBtn" class="w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-sky-500/40 cursor-pointer text-white"
                                    style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">2</span>
                                    <span class="text-sm">📅 출결 현황 엑셀 불러오기</span>
                                </div>
                                <span class="text-[11px] font-semibold ${attCount > 0 ? 'text-emerald-300' : 'text-sky-200'}">${attCount > 0 ? '✅ 연동됨' : '비교과'}</span>
                            </button>

                            <!-- 3단계: 봉사활동 실적 -->
                            <button id="uploadVolunteerBtn" class="w-full py-3 px-4 flex items-center justify-between text-xs font-bold shadow-md hover:brightness-110 transition-all rounded-xl border border-emerald-500/40 cursor-pointer text-white"
                                    style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">3</span>
                                    <span class="text-sm">🕒 봉사활동 엑셀 불러오기</span>
                                </div>
                                <span class="text-[11px] font-semibold ${volCount > 0 ? 'text-emerald-300' : 'text-emerald-200'}">${volCount > 0 ? '✅ 연동됨' : '비교과'}</span>
                            </button>
                        </div>
                        <div id="uploadStatus" class="mt-3 text-xs text-center hidden"></div>
                    </div>
                    <div class="mode-card" id="cutoffBtn">
                        <span class="icon">🎯</span>
                        <div class="title">고교별 커트라인 관리</div>
                        <div class="desc">커트라인 입력 및 서버 데이터 전송</div>
                    </div>

                    <div class="mode-card" id="userManagementBtn">
                        <span class="icon">👥</span>
                        <div class="title">사용자 및 권한 관리</div>
                        <div class="desc">담임 및 진로부장 계정 비밀번호 설정</div>
                    </div>
                    ` : `
                    <div class="p-5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center text-text-muted py-10">
                        <span class="text-2xl block mb-2">👁️</span>
                        조회 전용 계정입니다.
                    </div>
                    `}
                </div>

                <!-- 오른쪽 패널 (데이터 현황) -->
                <div class="md:col-span-2">
                    <h3 class="font-bold mb-4 flex items-center justify-between">
                        <span>학급별 데이터 현황</span>
                        <button id="refreshBtn" class="btn-secondary text-xs px-3 py-1 font-bold inline-flex items-center gap-1" style="width: auto;"><span>🔄</span> 새로고침</button>
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
        window.currentUser = null; // 로그아웃
        renderLoginScreen(schoolName);
    });

    document.getElementById('goToTeacherBtn')?.addEventListener('click', () => {
        renderTeacherScreen(schoolName, null);
    });

    document.getElementById('resetYearBtn')?.addEventListener('click', async () => {
        const nextYear = prompt("새 입시학년도를 입력하세요 (예: 2028):", new Date().getFullYear() + 1);
        if (!nextYear) return;

        if (confirm(`입시년도를 [${nextYear}학년도]로 전환하시겠습니까?\n\n※ 고교별 커트라인 데이터는 안전하게 보존되며, 학생들의 성적/출결/봉사 데이터만 깔끔하게 초기화됩니다.`)) {
            try {
                await window.go.main.App.ResetAcademicYear(parseInt(nextYear));
                alert(`${nextYear}학년도로 성공적으로 전환되었습니다!`);
                renderAdminScreen(schoolName);
            } catch (err) {
                alert("입시년도 전환 실패: " + err);
            }
        }
    });

    document.getElementById('resetDataBtn')?.addEventListener('click', async () => {
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

    document.getElementById('uploadAttendanceBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('uploadAttendanceBtn');
        const statusDiv = document.getElementById('uploadStatus');
        
        if (totalStd === 0) {
            alert('⚠️ 1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.');
            return;
        }

        try {
            const filePath = await window.go.main.App.OpenExcelFile();
            if (!filePath) return;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> <span>처리 중...</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-warning';
            statusDiv.textContent = '출결 데이터를 분석하는 중입니다...';
            statusDiv.classList.remove('hidden');

            const result = await window.go.main.App.ProcessAttendanceExcel(filePath);
            
            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span>출결 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `성공: ${processedClasses}개 학급, 총 ${totalStudents}명 출결 연동 완료!`;

            // 상단 데이터 연동 현황판 갱신
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>출결 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `출결 오류: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('uploadVolunteerBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('uploadVolunteerBtn');
        const statusDiv = document.getElementById('uploadStatus');
        
        if (totalStd === 0) {
            alert('⚠️ 1단계 [교과 성적 엑셀]을 먼저 불러와 학생 명단을 생성해 주세요.');
            return;
        }

        try {
            const filePath = await window.go.main.App.OpenExcelFile();
            if (!filePath) return;

            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> <span>처리 중...</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-warning';
            statusDiv.textContent = '봉사 데이터를 분석하는 중입니다...';
            statusDiv.classList.remove('hidden');

            const result = await window.go.main.App.ProcessVolunteerExcel(filePath);
            
            let processedClasses = Object.keys(result).length;
            let totalStudents = Object.values(result).reduce((a, b) => a + b, 0);

            btn.disabled = false;
            btn.innerHTML = '<span>봉사 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-success font-bold';
            statusDiv.textContent = `성공: ${processedClasses}개 학급, 총 ${totalStudents}명 봉사 연동 완료!`;

            // 상단 데이터 연동 현황판 갱신
            setTimeout(() => {
                renderAdminScreen(schoolName);
            }, 1200);
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = '<span>봉사 불러오기</span>';
            statusDiv.className = 'mt-3 text-xs text-center text-danger font-bold break-all';
            statusDiv.textContent = `봉사 오류: ${err}`;
            statusDiv.classList.remove('hidden');
        }
    });

    document.getElementById('cutoffBtn')?.addEventListener('click', () => {
        renderCutoffScreen(schoolName);
    });
    
    document.getElementById('userManagementBtn')?.addEventListener('click', () => {
        renderUserManagementScreen(schoolName);
    });

    document.getElementById('syncBtn')?.addEventListener('click', () => {
        renderSyncScreen(schoolName);
    });

    document.getElementById('importPatchBtn')?.addEventListener('click', async () => {
        const password = prompt('공용 데이터 잠금 비밀번호를 입력하세요.');
        if (!password) return;
        try {
            const count = await window.go.main.App.OpenTeacherPatch(password);
            alert(`${count}건의 담임 변경분을 병합했습니다. 결과를 확인한 뒤 최신 data 폴더를 재배포하세요.`);
            renderAdminScreen(schoolName);
        } catch (err) {
            alert('변경분 가져오기 실패: ' + err);
        }
    });
}

// ===== 일반고 지원가이드 판정 기준선 전역 헬퍼 (기본 80%) =====
function getGeneralGuideCutoff() {
    const val = localStorage.getItem('phgc_general_guide_cutoff');
    if (val !== null && !isNaN(parseFloat(val))) {
        return parseFloat(val);
    }
    return 80.0;
}

function setGeneralGuideCutoff(val) {
    localStorage.setItem('phgc_general_guide_cutoff', val);
    window.generalGuideCutoff = val;
}

function getGeneralGuideBadge(percentile) {
    const cutoff = getGeneralGuideCutoff();
    const border = Math.min(100, cutoff + 10.0);
    if (percentile <= cutoff) {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 일반고 안정 (${percentile.toFixed(2)}%)</span>`;
    } else if (percentile <= border) {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 일반고 경계 (${percentile.toFixed(2)}%)</span>`;
    } else {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 일반고 주의 (${percentile.toFixed(2)}%)</span>`;
    }
}
window.getGeneralGuideCutoff = getGeneralGuideCutoff;
window.setGeneralGuideCutoff = setGeneralGuideCutoff;
window.getGeneralGuideBadge = getGeneralGuideBadge;

// 화면 전체가 아닌 선택한 문서만 A4로 인쇄한다.
// 매트릭스는 열 수가 많아 A4 가로, 개인 문서는 A4 세로를 기본값으로 사용한다.
function printOnly(kind, orientation = 'portrait') {
    const allowedKinds = new Set(['report', 'transcript', 'matrix']);
    const safeKind = allowedKinds.has(kind) ? kind : 'report';
    const safeOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    const previous = document.getElementById('runtimePrintPageStyle');
    previous?.remove();

    const pageStyle = document.createElement('style');
    pageStyle.id = 'runtimePrintPageStyle';
    pageStyle.textContent = `@page { size: A4 ${safeOrientation}; margin: 10mm; }`;
    document.head.appendChild(pageStyle);
    document.body.classList.add('printing');
    document.body.dataset.printKind = safeKind;

    const cleanup = () => {
        document.body.classList.remove('printing');
        delete document.body.dataset.printKind;
        pageStyle.remove();
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    // 인쇄 CSS가 적용된 뒤 브라우저 미리보기를 열도록 두 프레임을 기다린다.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

// ===== 담임 교사 모드 화면 =====
async function renderTeacherScreen(schoolName, targetClassNum = null) {
    let classCount = 8;
    try {
        const config = await GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    if (window.currentUser && window.currentUser.Role === 'homeroom') {
        // 담임인 경우 자기 반만 선택 가능
        const myClass = window.currentUser.ClassNum;
        targetClassNum = myClass; // 강제로 타겟 클래스 변경
    }
    let activeClassNum = null;

    let localVer = '0.5.6';
    try {
        localVer = await window.go.main.App.GetAppVersion();
    } catch (e) {
        console.warn(e);
    }

    app.className = 'wide-layout';

    // 학급 선택 바둑판 카드 그리드 렌더링 함수
    const getClassGridHTML = () => {
        let cards = '';
        const isHomeroom = window.currentUser && window.currentUser.Role === 'homeroom';
        const myClass = isHomeroom ? window.currentUser.ClassNum : null;

        for (let i = 1; i <= classCount; i++) {
            const isAccessible = !isHomeroom || (i === myClass);
            if (isAccessible) {
                cards += `
                    <div class="class-card-btn bg-slate-800/70 hover:bg-indigo-950/40 border-2 border-slate-700/60 hover:border-primary/80 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group flex flex-col items-center justify-center gap-3 shadow-md"
                         data-class="${i}">
                        <div class="w-14 h-14 rounded-2xl bg-slate-700/60 text-indigo-300 group-hover:bg-primary group-hover:text-white flex items-center justify-center text-2xl font-black transition-all">
                            ${i}
                        </div>
                        <div>
                            <div class="text-lg font-bold text-white group-hover:text-primary transition-colors">3학년 ${i}반</div>
                            <div class="text-xs text-slate-400 mt-1">${isHomeroom ? '⭐ 내 담당 학급' : '진학 상담 및 성적 명단'}</div>
                        </div>
                        <span class="inline-flex items-center gap-1 text-xs text-primary font-bold mt-1 group-hover:translate-x-1 transition-transform">
                            학생 명단 열기 →
                        </span>
                    </div>
                `;
            } else {
                cards += `
                    <div class="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 text-center opacity-40 cursor-not-allowed flex flex-col items-center justify-center gap-3 select-none"
                         title="담당 학급(${myClass}반)만 열람하실 수 있습니다.">
                        <div class="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center text-xl font-bold">
                            🔒
                        </div>
                        <div>
                            <div class="text-lg font-bold text-slate-400">3학년 ${i}반</div>
                            <div class="text-xs text-slate-500 mt-1">타 학급 열람 제한</div>
                        </div>
                        <span class="text-xs text-slate-600 font-medium mt-1">접근 불가</span>
                    </div>
                `;
            }
        }

        const isHomeroomMsg = isHomeroom 
            ? `선생님의 담당 학급인 <strong class="text-indigo-300">3학년 ${myClass}반</strong>을 클릭하여 진학 상담을 시작하세요.`
            : `조회하고자 하는 학급 카드를 클릭하세요. (총 ${classCount}학급)`;

        return `
            <div class="max-w-5xl mx-auto py-8 space-y-6 fade-in">
                <div class="text-center space-y-2">
                    <h2 class="text-2xl font-black text-white flex items-center justify-center gap-2">
                        <span>🏫</span> 상담할 학급을 선택해 주세요
                    </h2>
                    <p class="text-sm text-text-muted">${isHomeroomMsg}</p>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                    ${cards}
                </div>
            </div>
        `;
    };

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex flex-wrap items-center justify-between mb-6 pb-4 border-b border-slate-700/50 gap-4">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👨‍🏫 진학 상담 대시보드
                        <span class="text-xs bg-slate-800 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">v${localVer}</span>
                    </h1>
                    <p class="text-text-muted text-sm mt-1">${schoolName}</p>
                </div>
                <div class="flex items-center gap-3 flex-wrap">
                    <!-- 일반고 지원가이드 판정 기준 커스텀 -->
                    <div class="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/80 shadow-inner">
                        <span class="text-xs text-slate-300 font-bold" title="기본값 80%. 각 학교 상황에 맞춰 일반고 합격 안정선 기준을 조정할 수 있습니다.">🎯 일반고 안정기준:</span>
                        <input type="number" id="generalGuideCutoffInput" min="50" max="99" step="1" 
                               class="w-14 text-center py-0.5 px-1 rounded bg-slate-900 border border-slate-600 text-indigo-300 text-xs font-bold outline-none" 
                               value="${getGeneralGuideCutoff()}" />
                        <span class="text-xs text-slate-400 font-bold">%</span>
                        <button id="saveGuideCutoffBtn" class="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded font-bold transition-colors cursor-pointer" title="클릭 시 전체 학생 판정이 즉시 갱신됩니다">적용</button>
                    </div>

                    <button id="classGridHomeBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" style="display: none;">
                        <span>🗂️</span> 학급 목록
                    </button>
                    <button id="backBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ${window.currentUser && window.currentUser.Role === 'homeroom' ? '← 로그아웃' : '← 돌아가기'}
                    </button>
                </div>
            </div>

            <div id="teacherContent">
                ${getClassGridHTML()}
            </div>
        </div>
    `;

    // 일반고 기준 적용 버튼 이벤트
    document.getElementById('saveGuideCutoffBtn')?.addEventListener('click', () => {
        const inputVal = parseFloat(document.getElementById('generalGuideCutoffInput').value);
        if (isNaN(inputVal) || inputVal < 10 || inputVal > 100) {
            alert('유효한 백분율(10~100 사이)을 입력해 주세요.');
            return;
        }
        setGeneralGuideCutoff(inputVal);
        alert(`후기 일반고 합격 안정선 기준이 [${inputVal}%]로 설정되었습니다.\n(경계선: ${Math.min(100, inputVal + 10)}%까지)`);
        const currentClass = activeClassNum;
        if (currentClass) {
            loadClass(currentClass);
        }
    });

    // 학급 카드 클릭 시 학급 로드 함수
    const loadClass = async (classNum) => {
        if (!classNum) {
            activeClassNum = null;
            document.getElementById('classGridHomeBtn').style.display = 'none';
            document.getElementById('teacherContent').innerHTML = getClassGridHTML();
            bindGridEvents();
            return;
        }

        activeClassNum = classNum;
        document.getElementById('classGridHomeBtn').style.display = 'inline-flex';
        document.getElementById('teacherContent').innerHTML = '<div class="text-center py-20"><span class="spinner"></span> 데이터를 불러오는 중...</div>';
        
        try {
            const students = await window.go.main.App.GetClassGrades(classNum);
            renderStudentList(students, classNum);
        } catch (err) {
            document.getElementById('teacherContent').innerHTML = `<div class="text-danger py-20 text-center font-bold">오류 발생: ${err}</div>`;
        }
    };

    // 학급 카드 클릭 이벤트 바인딩
    const bindGridEvents = () => {
        document.querySelectorAll('.class-card-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cNum = parseInt(btn.dataset.class);
                loadClass(cNum);
            });
        });
    };

    bindGridEvents();

    document.getElementById('classGridHomeBtn')?.addEventListener('click', () => {
        loadClass(null);
    });

    document.getElementById('backBtn').addEventListener('click', () => {
        app.className = '';
        if (window.currentUser && (window.currentUser.Role === 'homeroom' || window.currentUser.Role === 'viewer')) {
            window.currentUser = null;
            renderLoginScreen(schoolName);
        } else {
            renderAdminScreen(schoolName);
        }
    });

    // 담임교사인 경우 본인 반 자동 선택
    if (targetClassNum) {
        loadClass(targetClassNum);
    }
}

function normalizeSchoolName(name) {
    return String(name || '')
        .replace(/고등학교$/u, '')
        .replace(/\s+/gu, '')
        .trim();
}

function isSameTrack(left, right) {
    const a = String(left || '').replace('전형', '');
    const b = String(right || '').replace('전형', '');
    return a.includes(b) || b.includes(a);
}

function renderPredictionBadges(results, cutoffs, schoolGroup) {
    const schoolNames = schoolGroup === 'meister'
        ? new Set(['울산마이스터고', '울산에너지고', '현대공업고'])
        : new Set(['울산상업고', '울산여자상업고', '울산생활과학고', '울산공업고', '울산산업고', '울산미용예술고', '울산기술공업고']);
    const badges = [];
    const seen = new Set();

    (results || []).filter(r => schoolNames.has(normalizeSchoolName(r.schoolName))).forEach(r => {
        const candidates = (cutoffs || [])
            .filter(c => normalizeSchoolName(c.schoolName) === normalizeSchoolName(r.schoolName)
                && isSameTrack(c.track, r.trackName)
                && c.department && c.department !== '공통'
                && Number(c.minValue) > 0)
            .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

        candidates.forEach(c => {
            const key = `${normalizeSchoolName(r.schoolName)}_${c.department}_${r.trackName}`;
            if (!seen.has(key) && Number(r.totalScore) >= Number(c.minValue)) {
                seen.add(key);
                badges.push(`<span class="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[11px] font-bold text-cyan-200">${r.schoolName} · ${c.department}</span>`);
            }
        });
    });

    if (!badges.length) {
        return '<span class="text-xs text-slate-500">커트라인 입력 후 표시</span>';
    }
    const visible = badges.slice(0, 3).join('');
    const extra = badges.length > 3 ? `<span class="text-[11px] text-cyan-300">+${badges.length - 3}</span>` : '';
    return `<div class="flex flex-wrap justify-center gap-1.5">${visible}${extra}</div>`;
}

async function renderStudentList(students, classNum) {
    if (!students || students.length === 0) {
        document.getElementById('teacherContent').innerHTML = `
            <div class="text-center py-20 text-warning">
                <div class="text-4xl mb-4">📭</div>
                ${classNum}반 학생 데이터가 없습니다. 관리자 모드에서 나이스 엑셀 파일을 업로드해 주세요.
            </div>
        `;
        return;
    }

    const [fullStudents, cutoffs] = await Promise.all([
        window.go.main.App.GetClassFullGrades(classNum).catch(() => []),
        window.go.main.App.GetCutoffs().catch(() => []),
    ]);
    const fullByStudent = new Map((fullStudents || []).map(s => [`${s.studentNum}|${s.name}`, s]));

    let tbody = '';
    students.forEach((s) => {
        let generalBadge = getGeneralGuideBadge(s.Percentile);
        const full = fullByStudent.get(`${s.StudentNum}|${s.Name}`);
        const meisterBadges = renderPredictionBadges(full?.schoolResults, cutoffs, 'meister');
        const specialBadges = renderPredictionBadges(full?.schoolResults, cutoffs, 'special');

        tbody += `
            <tr class="hover:bg-slate-800/60 transition-colors border-b border-slate-700/50">
                <td class="p-4 text-center font-medium text-slate-400">${s.StudentNum || '-'}</td>
                <td class="p-4 font-bold text-white text-center text-lg cursor-pointer hover:underline text-student-name"
                    data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}">
                    ${s.Name}
                </td>
                <td class="p-4 text-center">${generalBadge}</td>
                <td class="p-3 text-center min-w-52">${meisterBadges}</td>
                <td class="p-3 text-center min-w-52">${specialBadges}</td>
                <td class="p-4 text-center">
                    <button class="btn-primary text-xs px-4 py-2 font-bold flex items-center justify-center gap-1.5 mx-auto btn-student-counsel"
                            data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}">
                        🎯 고교별 진학상담
                    </button>
                </td>
            </tr>
        `;
    });

    document.getElementById('teacherContent').innerHTML = `
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div class="text-sm text-text-muted">
                총 <span class="font-bold text-white">${students.length}</span>명 (학생 개인정보 보호를 위해 상세 점수는 상담창에서만 노출됩니다)
            </div>
            <button id="openMatrixBtn" class="btn-secondary text-xs px-4 py-2 font-bold flex items-center gap-2">
                📊 우리 반 전체 고교별 신호등 매트릭스 보기
            </button>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-slate-800/80 text-text-muted text-sm border-b border-slate-700/70">
                        <th class="p-4 font-semibold text-center w-20">번호</th>
                        <th class="p-4 font-semibold text-center w-36">성명</th>
                        <th class="p-4 font-semibold text-center">일반계고 합격 예측</th>
                        <th class="p-4 font-semibold text-center">마이스터고 지원 가능</th>
                        <th class="p-4 font-semibold text-center">특성화고 지원 가능</th>
                        <th class="p-4 font-semibold text-center w-44">진학 상담</th>
                    </tr>
                </thead>
                <tbody>
                    ${tbody}
                </tbody>
            </table>
        </div>
        <div class="mt-4 text-xs text-text-muted text-right">
            * 일반고 지표는 3학년 1학기 성적 기준 간이 참고치이며, 정식 일반고 내신은 교육청 프로그램을 따릅니다.
        </div>
    `;

    // 신호등 매트릭스 버튼
    document.getElementById('openMatrixBtn').addEventListener('click', () => {
        openMatrixModal(classNum);
    });

    // 1. 학생 고교별 진학 상담 버튼 클릭 이벤트 바인딩
    document.querySelectorAll('.btn-student-counsel').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const cNum = parseInt(target.dataset.class);
            const sNum = target.dataset.num;
            const sName = target.dataset.name;
            openStudentModal(cNum, sNum, sName);
        });
    });

    // 2. 학생 이름 클릭 시: 전과목 전학년 교과/비교과 종합 성적표 모달 호출
    document.querySelectorAll('.text-student-name').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const cNum = parseInt(target.dataset.class);
            const sNum = target.dataset.num;
            const sName = target.dataset.name;
            openStudentTranscriptModal(cNum, sNum, sName);
        });
    });
}

// ===== 학생 전학년 전과목 교과/비교과 종합 성적표 모달 =====
window.openStudentTranscriptModal = openStudentTranscriptModal;

async function openStudentTranscriptModal(classNum, studentNum, name) {
    document.getElementById('studentTranscriptModal')?.remove();

    const modalEl = document.createElement('div');
    modalEl.id = 'studentTranscriptModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${name} 학생의 전학년 종합 성적표를 조회하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const data = await window.go.main.App.GetStudentTranscript(classNum, studentNum, name);
        
        // 1. 교과 성적 행(Tr) 생성
        let subjectRows = '';
        if (data.subjectRecords && data.subjectRecords.length > 0) {
            let lastGrade = '1';
            let lastSem = '1';

            data.subjectRecords.forEach(rec => {
                let grade = '';
                let sem = '';
                let subject = '';
                let achieve = '';
                let rawScore = '';

                for (const [k, v] of Object.entries(rec)) {
                    // 키와 값의 공백('과 목' -> '과목', '학 년' -> '학년')을 완전히 제거하여 매칭
                    const cleanK = k.replace(/\s+/g, '').replace(/["'\r\n]/g, '');
                    const cleanV = String(v || '').trim().replace(/["'\r\n]/g, '');

                    if (cleanK.includes('학년도')) continue;
                    if (cleanK === '학년' || (cleanK.includes('학년') && !cleanK.includes('학기'))) {
                        grade = cleanV;
                    } else if (cleanK === '학기' || cleanK.includes('학기')) {
                        sem = cleanV;
                    } else if (cleanK.includes('성취도')) {
                        achieve = cleanV;
                    } else if (cleanK.includes('원점수') || cleanK.includes('과목평균') || cleanK.includes('평균')) {
                        rawScore = cleanV;
                    } else if (cleanK === '과목' || cleanK === '교과목' || cleanK.includes('과목명') || (cleanK.includes('과목') && !cleanK.includes('평균'))) {
                        subject = cleanV;
                    }
                }

                // 나이스 엑셀의 병합 셀 처리 (빈칸이면 직전 행의 학년/학기 계승)
                if (grade) lastGrade = grade;
                else grade = lastGrade;

                if (sem) lastSem = sem;
                else sem = lastSem;

                // 유효하지 않은 과목명 또는 잡음 행 필터링 (슬래시, 숫자만 있는 행, 학교명 등)
                if (!subject || !achieve || subject === '/' || !isNaN(Number(subject)) || subject.length < 2) return;
                // 성취도가 A, B, C, D, E, P 로 시작하지 않으면 건너뜀 (예: 수강자수 단독 행 등)
                const firstChar = achieve[0].toUpperCase();
                if (!['A', 'B', 'C', 'D', 'E', 'P'].includes(firstChar)) return;

                let badgeColor = 'text-slate-300';
                if (achieve.startsWith('A')) badgeColor = 'text-emerald-400 font-bold';
                else if (achieve.startsWith('B')) badgeColor = 'text-sky-400 font-bold';
                else if (achieve.startsWith('C')) badgeColor = 'text-amber-400 font-bold';
                else if (achieve.startsWith('D')) badgeColor = 'text-orange-400 font-bold';
                else if (achieve.startsWith('E')) badgeColor = 'text-rose-400 font-bold';
                else if (achieve.startsWith('P')) badgeColor = 'text-indigo-300 font-semibold';

                subjectRows += `
                    <tr class="hover:bg-slate-800/40 border-b border-slate-700/40 text-center">
                        <td class="p-2 text-slate-400">${grade}학년</td>
                        <td class="p-2 text-slate-400">${sem}학기</td>
                        <td class="p-2 font-bold text-white text-left pl-4">${subject}</td>
                        <td class="p-2 ${badgeColor}">${achieve}</td>
                        <td class="p-2 text-slate-400 text-xs font-mono">${rawScore || '-'}</td>
                    </tr>
                `;
            });
        }
        
        if (!subjectRows) {
            subjectRows = `<tr><td colspan="5" class="p-8 text-center text-text-muted">업로드된 교과 성적 데이터가 없거나 파싱할 과목이 없습니다.</td></tr>`;
        }

        // 2. 출결 및 봉사 파싱
        let attObj = {};
        if (data.attendanceRaw) {
            try { attObj = JSON.parse(data.attendanceRaw); } catch(e){}
        }
        let volObj = {};
        if (data.volunteerRaw) {
            try { volObj = JSON.parse(data.volunteerRaw); } catch(e){}
        }

        // 출결 일수 종합 집계
        let totalAbsence = attObj['absence'] || attObj['absent'] || (Number(attObj['1_absence']||0) + Number(attObj['2_absence']||0) + Number(attObj['3_absence']||0));
        let totalLate = attObj['late'] || (Number(attObj['1_late']||0) + Number(attObj['2_late']||0) + Number(attObj['3_late']||0));
        let totalEarly = attObj['early'] || (Number(attObj['1_early']||0) + Number(attObj['2_early']||0) + Number(attObj['3_early']||0));
        let totalResult = attObj['result'] || (Number(attObj['1_result']||0) + Number(attObj['2_result']||0) + Number(attObj['3_result']||0));

        modalEl.innerHTML = `
            <div class="glass-card print-document p-6 md:p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto space-y-6">
                <!-- 헤더 -->
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">
                            <span>📄</span> ${classNum}반 ${studentNum}번 <span class="text-primary font-bold">${name}</span> 종합 성적표
                        </h2>
                        <p class="text-xs text-text-muted mt-1">나이스 생활기록부 교과 성적(전학년) 및 출결·봉사활동 상세 내역</p>
                    </div>
                    <div class="flex items-center gap-2 no-print">
                        <button id="printTranscriptBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1">
                            <span>🖨️</span> 성적표 인쇄
                        </button>
                        <button id="closeTranscriptBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
                    </div>
                </div>

                <!-- 1. 종합 내신 지표 카드 -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                        <div class="text-xl font-bold text-primary">${data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">전교 석차</div>
                        <div class="text-xl font-bold text-white">${data.rank}등 <span class="text-xs text-slate-400 font-normal">/ ${data.totalStudents}명</span></div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">석차 백분율</div>
                        <div class="text-xl font-bold text-indigo-300">${data.percentile.toFixed(2)}%</div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-center">
                        <div class="text-xs text-text-muted mb-1">후기 일반고 판정</div>
                        <div class="text-sm font-bold ${data.percentile <= 80 ? 'text-success' : (data.percentile <= 90 ? 'text-warning' : 'text-danger')}">
                            ${data.percentile <= 80 ? '🟢 합격 안정' : (data.percentile <= 90 ? '🟡 경계선' : '🔴 지원 주의')}
                        </div>
                    </div>
                </div>

                <!-- 2. 전학년 전과목 교과 성적표 -->
                <div class="space-y-2">
                    <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                        <span>📚</span> 전학년 학기별 과목 성적 상세 내역
                    </h3>
                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 max-h-72 custom-scrollbar">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="sticky top-0 bg-slate-800 border-b border-slate-700/70 text-text-muted text-center z-10">
                                <tr>
                                    <th class="p-2.5 w-16">학년</th>
                                    <th class="p-2.5 w-16">학기</th>
                                    <th class="p-2.5 text-left pl-4">교과목명</th>
                                    <th class="p-2.5 w-24">성취도</th>
                                    <th class="p-2.5 w-44">원점수/평균(표준편차)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${subjectRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 3. 비교과 (출결 및 봉사) 요약 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <h4 class="font-bold text-indigo-300 flex items-center gap-1">
                            <span>📅</span> 출결 상황 요약
                        </h4>
                        <div class="grid grid-cols-4 gap-2 text-center pt-2">
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 결석</div>
                                <div class="text-sm font-bold text-danger mt-1">${totalAbsence}일</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 지각</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalLate}회</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 조퇴</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalEarly}회</div>
                            </div>
                            <div class="p-2 rounded bg-slate-900/60 border border-slate-700/40">
                                <div class="text-[10px] text-text-muted">미인정 결과</div>
                                <div class="text-sm font-bold text-warning mt-1">${totalResult}회</div>
                            </div>
                        </div>
                    </div>

                    <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <h4 class="font-bold text-emerald-300 flex items-center gap-1">
                            <span>🕒</span> 봉사활동 실적 요약
                        </h4>
                        <div class="flex items-center justify-between p-3 rounded bg-slate-900/60 border border-slate-700/40 mt-2">
                            <div>
                                <div class="text-xs text-text-muted">나이스 인정 총 봉사시간</div>
                                <div class="text-[10px] text-slate-400 mt-0.5">학교 교육계획 및 개인봉사 합산</div>
                            </div>
                            <div class="text-xl font-black text-emerald-300">
                                ${volObj['total_time'] || 0} <span class="text-xs font-normal text-slate-400">시간</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('closeTranscriptBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('printTranscriptBtn').addEventListener('click', () => printOnly('transcript'));
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) modalEl.remove();
        });

    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">성적표를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${err}</div>
                <button class="btn-secondary w-full" onclick="document.getElementById('studentTranscriptModal').remove()">닫기</button>
            </div>
        `;
    }
}

// ===== 학생 개인 진학상담 종합 모달 =====
window.openStudentModal = openStudentModal;
window.openMatrixModal = openMatrixModal;

async function openStudentModal(classNum, studentNum, name) {
    // 기존 모달 제거
    document.getElementById('studentDetailModal')?.remove();

    // 로딩 모달 표시
    const modalEl = document.createElement('div');
    modalEl.id = 'studentDetailModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-4xl text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${name} 학생의 고교별 산출 데이터를 분석하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const fullData = await window.go.main.App.GetStudentFullDetail(classNum, studentNum, name);
        const cutoffs = await window.go.main.App.GetCutoffs().catch(() => []);

        renderStudentModalContent(modalEl, classNum, studentNum, name, fullData, cutoffs);
    } catch (err) {
        modalEl.innerHTML = `
            <div class="glass-card p-8 w-full max-w-md text-center">
                <div class="text-danger text-4xl mb-3">⚠️</div>
                <div class="text-white font-bold mb-4">데이터를 불러오지 못했습니다</div>
                <div class="text-text-muted text-sm mb-6">${err}</div>
                <button class="btn-secondary w-full" onclick="document.getElementById('studentDetailModal').remove()">닫기</button>
            </div>
        `;
    }
}

// 모달 내용 렌더링
function renderStudentModalContent(modalEl, classNum, studentNum, name, data, cutoffs) {
    // 학교별 합격 가능성 카드 목록 생성
    let cardsHTML = '';
    
    data.schoolResults.forEach((r, rIdx) => {
        // 해당 학교 및 전형의 학과별 커트라인 목록 찾기
        const deptsForSchool = (cutoffs || []).filter(c => 
            c.schoolName.includes(r.schoolName.substring(0, 4)) && 
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.department && c.department !== '공통' && c.minValue > 0
        ).sort((a, b) => b.year - a.year || a.department.localeCompare(b.department, 'ko'));

        let defaultCutoff = null;
        let defaultAvg = null;
        const sameSchoolTrack = (c) =>
            c.schoolName.includes(r.schoolName.substring(0, 4)) &&
            (c.track.includes(r.trackName) || r.trackName.includes(c.track)) &&
            c.minValue > 0;

        // 연도별로 한 건만 표시한다. 학과 자료가 없던 해에는 "학교 전체" 값을
        // 우선 사용하므로, 원서대장에 학과가 없는 학교도 추세에 포함된다.
        const historyByYear = new Map();
        (cutoffs || []).filter(sameSchoolTrack).sort((a, b) => {
            const aWhole = !a.department || a.department === '공통' ? 0 : 1;
            const bWhole = !b.department || b.department === '공통' ? 0 : 1;
            return b.year - a.year || aWhole - bWhole;
        }).forEach(c => {
            if (!historyByYear.has(c.year)) historyByYear.set(c.year, c);
        });
        const cutoffHistory = [...historyByYear.values()].sort((a, b) => b.year - a.year).slice(0, 5);
        const averageMin = (count) => {
            const values = cutoffHistory.slice(0, count).map(c => c.minValue);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        };
        const recent3Average = averageMin(3);
        const recent5Average = averageMin(5);
        if (deptsForSchool.length > 0) {
            defaultCutoff = deptsForSchool[0].minValue;
            defaultAvg = deptsForSchool[0].avgValue;
        } else if (cutoffs && cutoffs.length > 0) {
            const found = cutoffs.find(c => c.schoolName.includes(r.schoolName.substring(0, 4)) && c.track.includes(r.trackName));
            if (found && found.minValue > 0) {
                defaultCutoff = found.minValue;
                defaultAvg = found.avgValue;
            }
        }

        // 합격 가능성 판단 헬퍼
        const getCutoffBadgeAndGauge = (cutoffVal) => {
            let badge = '';
            let color = 'bg-primary';
            let pct = (r.totalScore / r.totalMax) * 100;
            if (cutoffVal && cutoffVal > 0) {
                if (r.totalScore >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (r.totalScore >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}%</span>`;
            }
            return { badge, color, pct };
        };

        const { badge: initialBadge, color: initialColor, pct: initialPct } = getCutoffBadgeAndGauge(defaultCutoff);

        // 가중치 과목 상세 텍스트
        let weightDetailText = '';
        if (r.weightedDetails && Object.keys(r.weightedDetails).length > 0) {
            const parts = [];
            for (let [sub, pts] of Object.entries(r.weightedDetails)) {
                parts.push(`${sub} ${pts.toFixed(1)}점`);
            }
            weightDetailText = `<span class="text-slate-400 text-xs">(${parts.join(', ')})</span>`;
        }

        cardsHTML += `
            <div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-2.5 school-counsel-card" id="card_${rIdx}">
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-white text-base">${r.schoolName}</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-semibold">${r.trackName}전형</span>
                    </div>
                    <div id="badge_${rIdx}">${initialBadge}</div>
                </div>

                <!-- 학과별 커트라인 선택 드롭다운 (학과가 있는 경우) -->
                ${deptsForSchool.length > 0 ? `
                <div class="flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/50 text-xs">
                    <span class="text-indigo-200 font-bold flex items-center gap-1">🎯 목표 학과:</span>
                    <select class="dept-selector bg-slate-800 text-white font-bold border border-slate-600 rounded px-2 py-1 outline-none cursor-pointer"
                            data-card="${rIdx}" data-score="${r.totalScore}" data-max="${r.totalMax}">
                        ${deptsForSchool.map((d, dIdx) => `
                            <option value="${d.minValue}" data-avg="${d.avgValue || 0}" ${dIdx === 0 ? 'selected' : ''}>
                                ${d.department} (최저: ${d.minValue}점${d.avgValue > 0 ? `, 평균: ${d.avgValue}점` : ''})
                            </option>
                        `).join('')}
                    </select>
                </div>
                ` : ''}

				${cutoffHistory.length > 0 ? `
				<div class="text-[11px] text-slate-300 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-700/40 space-y-1">
					<div><span class="font-bold text-indigo-200">연도별 합격선:</span>
					${cutoffHistory.map((c, index) => `<span class="ml-2 ${index === 0 ? 'text-emerald-300 font-bold' : ''}">${c.year} ${c.department || '학교 전체'} ${c.minValue}점</span>`).join('')}</div>
					<div class="text-slate-400">직전 ${cutoffHistory[0].year}학년도 ${cutoffHistory[0].minValue}점 · 최근 ${Math.min(3, cutoffHistory.length)}년 평균 ${recent3Average.toFixed(2)}점${cutoffHistory.length >= 4 ? ` · 최근 ${Math.min(5, cutoffHistory.length)}년 평균 ${recent5Average.toFixed(2)}점` : ''}</div>
				</div>` : ''}

                <div class="flex items-baseline justify-between">
                    <div class="text-xs text-text-muted">
                        교과 ${r.allSubjectScore.toFixed(1)}${r.weightedScore > 0 ? ` + 가중치 ${r.weightedScore.toFixed(1)}` : ''} 
                        | 출결 ${r.attendanceScore.toFixed(1)} | 봉사 ${r.volunteerScore.toFixed(1)}
                        ${r.leadershipMax > 0 ? ` | 리더십 ${r.leadershipScore.toFixed(1)}` : ''}
                        ${weightDetailText}
                    </div>
                    <div class="text-lg font-black text-white">
                        ${r.totalScore.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ ${r.totalMax}점</span>
                    </div>
                </div>

                <!-- 게이지 바 -->
                <div class="w-full bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                    <div id="gauge_${rIdx}" class="${initialColor} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(5, initialPct))}%;"></div>
                </div>

                <div id="diff_${rIdx}" class="flex justify-between text-[11px] text-slate-400 pt-0.5">
                    ${defaultCutoff ? `
                    <span>합격 기준선(최저): <strong class="text-slate-200">${defaultCutoff}점</strong> ${defaultAvg > 0 ? `<span class="text-amber-300 font-medium">(평균 ${defaultAvg}점)</span>` : ''}</span>
                    <span>점수차: <strong class="${r.totalScore >= defaultCutoff ? 'text-success' : 'text-danger'}">${(r.totalScore - defaultCutoff) >= 0 ? '+' : ''}${(r.totalScore - defaultCutoff).toFixed(2)}점</strong></span>
                    ` : '<span class="text-slate-500">※ 등록된 커트라인 점수가 없습니다.</span>'}
                </div>
            </div>
        `;
    });

    const extra = data.extraData || {};

    modalEl.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-6xl max-h-[92vh] overflow-y-auto space-y-6 print-modal" id="printReportArea">
            <!-- 모달 헤더 (인쇄 제외 버튼 포함) -->
            <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                <div>
                    <h2 class="text-2xl font-black text-white flex items-center gap-2">
                        👨‍🎓 ${name} <span class="text-base text-slate-400 font-normal">(${classNum}반 ${studentNum}번)</span>
                    </h2>
                    <p class="text-xs text-text-muted mt-1">울산 특목·마이스터·특성화고 진학 상담 분석표 (3-1 누적)</p>
                </div>
                <div class="flex items-center gap-2 no-print">
                    <button id="printReportBtn" class="btn-secondary text-xs px-3 py-2 font-bold flex items-center gap-1">
                        🖨️ 인쇄 / PDF
                    </button>
                    <button id="closeModalBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">
                        ✕
                    </button>
                </div>
            </div>

            <!-- 1. 기본 성적 요약 카드 -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">전과목 평균 성취도</div>
                    <div class="text-xl font-bold text-primary">${data.allAverage.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ 5.0</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">미인정 출결 (1학기)</div>
                    <div class="text-xl font-bold ${data.absenceDays > 0 ? 'text-danger' : 'text-success'}">
                        ${data.absenceDays}일 <span class="text-[11px] text-slate-400 font-normal">(결석${data.rawAbsenceDays || 0}일, 기타${(data.rawLateCount || 0) + (data.rawEarlyCount || 0) + (data.rawResultCount || 0)}회)</span>
                    </div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">인정 봉사시간</div>
                    <div class="text-xl font-bold text-white">${data.totalVolunteerHours}시간 <span class="text-[11px] text-slate-400 font-normal">(기본${data.volunteerHours}+추가${data.addVolunteerHours})</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">후기 일반고 내신 / 석차백분율</div>
                    <div class="text-xl font-bold ${data.generalHSPercentile <= (window.generalGuideCutoff || 80) ? 'text-success' : (data.generalHSPercentile <= (window.generalGuideCutoff || 80) + 10 ? 'text-warning' : 'text-danger')}">${data.generalHSTotalScore.toFixed(2)}점 <span class="text-[10px] font-normal text-amber-300">${data.generalHSProjected ? '예상' : '확정'}</span></div>
                    <div class="text-[11px] text-slate-400">교과 ${data.generalHSAcademicScore.toFixed(2)} / 비교과 ${data.generalHSNonAcademicScore.toFixed(2)} · ${data.generalHSPercentile.toFixed(2)}%</div>
                </div>
            </div>

            <!-- 2. 수기 입력 가산점 및 9/30 출결 영역 (담임용) -->
            ${(() => {
                const isViewer = window.currentUser && window.currentUser.Role === 'viewer';
                const defaultAbsence = data.hasSeptAbsence ? data.septAbsenceDays : (data.rawAbsenceDays || 0);
                const defaultLateEtc = data.hasSeptAbsence ? (data.septLateEtc || 0) : ((data.rawLateCount || 0) + (data.rawEarlyCount || 0) + (data.rawResultCount || 0));
                const defaultOctAbsence = data.hasOctAbsence ? data.octAbsenceDays : defaultAbsence;
                const defaultOctLateEtc = data.hasOctAbsence ? (data.octLateEtc || 0) : defaultLateEtc;
                
                return `
                <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-sm text-indigo-300 flex items-center gap-1.5">
                            <span>✏️</span> 전형별 비교과 입력
                            ${isViewer ? '<span class="text-[11px] text-warning font-normal ml-2">※ 진로부장은 조회 전용 모드입니다.</span>' : ''}
                        </h3>
                        ${!isViewer ? `
                        <button id="saveExtraBtn" class="btn-primary text-xs font-bold no-print" style="width:auto; min-width:130px; padding:8px 12px;">
                            💾 저장·재계산
                        </button>
                        ` : ''}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                        <div class="rounded-lg border border-indigo-500/30 bg-indigo-950/30 px-3 py-2"><b class="text-indigo-200">마이스터고</b> · 출결·봉사·리더십 <span class="text-amber-300">9/30 마감</span></div>
                        <div class="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2"><b class="text-cyan-200">특성화고</b> · 취업희망자 <span class="text-amber-300">9/30</span> · 일반 <span class="text-amber-300">10/31 마감</span></div>
                        <div class="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2"><b class="text-emerald-200">후기 일반고</b> · 출결·봉사·행발·창체 <span class="text-amber-300">11/30 마감</span></div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
                        <section class="lg:col-span-5 bg-slate-900/60 p-4 rounded-lg border border-indigo-500/30 space-y-3">
                            <div><b class="text-indigo-200 text-sm">① 마이스터·특성화고 비교과</b><span class="ml-2 text-slate-400">취업희망 9/30 · 특성화 일반 10/31</span></div>
                            <div class="grid grid-cols-2 gap-2">
                                <label class="text-slate-300">9/30 결석(일)<input type="number" id="inputSeptAbsence" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultAbsence}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">9/30 지각·조퇴·결과(회)<input type="number" id="inputSeptLateEtc" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultLateEtc}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">10/31 결석(일)<input type="number" id="inputOctAbsence" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultOctAbsence}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">10/31 지각·조퇴·결과(회)<input type="number" id="inputOctLateEtc" min="0" max="100" class="input-field w-full text-center mt-1" value="${defaultOctLateEtc}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">추가 봉사(시간)<input type="number" id="inputAddVolunteer" min="0" max="100" class="input-field w-full text-center mt-1" value="${data.addVolunteerHours || 0}" ${isViewer ? 'disabled' : ''}/></label>
                                <label class="text-slate-300">리더십 인정(학기)<input type="number" id="inputLeadershipTerms" min="0" max="4" step="1" class="input-field w-full text-center mt-1" value="${data.leadershipTerms || 0}" ${isViewer ? 'disabled' : ''}/></label>
                            </div>
                            <p class="text-[10px] text-slate-400">출결은 결석 + 기타 3회당 1일입니다. 10/31 확정 전에는 9/30과 같은 누적값을 넣어 예상 점수로 확인하세요. 리더십은 반장·부반장·전교회장·부회장만, 한 학기 2.5점입니다.</p>
                        </section>

                        <section class="lg:col-span-7 bg-slate-900/60 p-4 rounded-lg border border-emerald-500/30 space-y-3">
                            <div><b class="text-emerald-200 text-sm">② 후기 일반고 비교과</b><span class="ml-2 text-slate-400">11/30 마감 · 현재는 3학년 1학기 누적자료로 예상 산출</span></div>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                                ${[1,2,3].map(g => `<div class="rounded border border-slate-700/70 p-2"><b class="text-slate-200">${g}학년</b><div class="grid grid-cols-2 gap-1 mt-1"><input type="number" id="inputGeneralAbsence${g}" min="0" class="input-field text-center" value="${extra['general_absence_'+g] ?? ''}" placeholder="결석환산일" ${isViewer ? 'disabled' : ''}/><input type="number" id="inputGeneralVolunteer${g}" min="0" class="input-field text-center" value="${extra['general_volunteer_'+g] ?? ''}" placeholder="봉사시간" ${isViewer ? 'disabled' : ''}/></div></div>`).join('')}
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div class="rounded border border-slate-700/70 p-2"><b class="text-emerald-200">창체 가산점</b><span class="ml-1 text-slate-400">(+1점씩)</span><div class="flex gap-3 mt-2">${[1,2,3].map(g => `<label><input type="checkbox" id="checkChangche${g}" ${extra['changche_'+g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/> ${g}학년</label>`).join('')}</div></div>
                                <div class="rounded border border-slate-700/70 p-2"><b class="text-emerald-200">행발 가산점</b><span class="ml-1 text-slate-400">(+1점씩)</span><div class="flex gap-3 mt-2">${[1,2,3].map(g => `<label><input type="checkbox" id="checkHaengbal${g}" ${extra['haengbal_'+g] ? 'checked' : ''} ${isViewer ? 'disabled' : ''}/> ${g}학년</label>`).join('')}</div></div>
                            </div>
                            <p class="text-[10px] text-slate-400">11/30에 학년별 결석 환산일수·봉사시간을 확정 입력하면 예상 점수가 확정 점수로 바뀝니다.</p>
                        </section>
                    </div>
                </div>
                `;
            })()}

            <!-- 3. 학교별 합격 가능성 리스트 -->
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-sm text-white">🏫 목표 고교별 산출 점수 및 합격 가능성</h3>
                    <span class="text-xs text-text-muted">* 면접 점수를 제외한 1차 서류 전형 기준</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${cardsHTML}
                </div>
            </div>
        </div>
    `;

    // 닫기 이벤트
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        modalEl.remove();
    });

    // 배경 클릭 시 닫기
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) modalEl.remove();
    });

    // 학과별 커트라인 선택 변경 이벤트 바인딩
    modalEl.querySelectorAll('.dept-selector').forEach(sel => {
        sel.addEventListener('change', () => {
            const cardIdx = sel.dataset.card;
            const score = parseFloat(sel.dataset.score);
            const totalMax = parseFloat(sel.dataset.max);
            const cutoffVal = parseFloat(sel.value);

            let badge = '';
            let color = 'bg-primary';
            let pct = (score / totalMax) * 100;

            if (cutoffVal && cutoffVal > 0) {
                if (score >= cutoffVal + 5) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                    color = 'bg-success';
                } else if (score >= cutoffVal) {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                    color = 'bg-warning';
                } else {
                    badge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                    color = 'bg-danger';
                }
            } else {
                badge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}%</span>`;
            }

            const badgeEl = document.getElementById(`badge_${cardIdx}`);
            if (badgeEl) badgeEl.innerHTML = badge;

            const gaugeEl = document.getElementById(`gauge_${cardIdx}`);
            if (gaugeEl) {
                gaugeEl.className = `${color} h-2.5 rounded-full transition-all duration-500`;
                gaugeEl.style.width = `${Math.min(100, Math.max(5, pct))}%`;
            }

            const diffEl = document.getElementById(`diff_${cardIdx}`);
            if (diffEl) {
                const diff = score - cutoffVal;
                const opt = sel.selectedOptions[0];
                const avgVal = parseFloat(opt?.dataset.avg || 0);
                diffEl.innerHTML = `
                    <span>합격 기준선(최저): <strong class="text-slate-200">${cutoffVal}점</strong> ${avgVal > 0 ? `<span class="text-amber-300 font-medium">(평균 ${avgVal}점)</span>` : ''}</span>
                    <span>점수차: <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}점</strong></span>
                `;
            }
        });
    });

    // 수기 가산점 및 출결 저장 (담임 및 관리자만 가능)
    const saveBtn = document.getElementById('saveExtraBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중...';

            const addVol = parseInt(document.getElementById('inputAddVolunteer').value) || 0;
            const septAbsence = parseInt(document.getElementById('inputSeptAbsence').value) || 0;
            const septLateEtc = parseInt(document.getElementById('inputSeptLateEtc').value) || 0;
            const octAbsence = parseInt(document.getElementById('inputOctAbsence').value) || 0;
            const octLateEtc = parseInt(document.getElementById('inputOctLateEtc').value) || 0;
            const newExtra = {
                add_volunteer: addVol,
                sept_absence: septAbsence,
                sept_late_etc: septLateEtc,
                oct_absence: octAbsence,
                oct_late_etc: octLateEtc,
                leadership_terms: Math.min(4, Math.max(0, parseInt(document.getElementById('inputLeadershipTerms').value) || 0)),
                general_absence_1: parseInt(document.getElementById('inputGeneralAbsence1').value),
                general_absence_2: parseInt(document.getElementById('inputGeneralAbsence2').value),
                general_absence_3: parseInt(document.getElementById('inputGeneralAbsence3').value),
                general_volunteer_1: parseInt(document.getElementById('inputGeneralVolunteer1').value),
                general_volunteer_2: parseInt(document.getElementById('inputGeneralVolunteer2').value),
                general_volunteer_3: parseInt(document.getElementById('inputGeneralVolunteer3').value),
                changche_1: document.getElementById('checkChangche1').checked,
                changche_2: document.getElementById('checkChangche2').checked,
                changche_3: document.getElementById('checkChangche3').checked,
                haengbal_1: document.getElementById('checkHaengbal1').checked,
                haengbal_2: document.getElementById('checkHaengbal2').checked,
                haengbal_3: document.getElementById('checkHaengbal3').checked,
            };

            try {
                await window.go.main.App.SaveStudentExtra(classNum, studentNum, name, JSON.stringify(newExtra));
                const updatedData = await window.go.main.App.GetStudentFullDetail(classNum, studentNum, name);
                renderStudentModalContent(modalEl, classNum, studentNum, name, updatedData, cutoffs);
            } catch (err) {
                alert('저장 실패: ' + err);
                saveBtn.disabled = false;
                saveBtn.textContent = '💾 저장 후 재계산';
            }
        });
    }

    // 인쇄/PDF 저장
    document.getElementById('printReportBtn').addEventListener('click', () => printOnly('report'));
}

// ===== 우리 반 전체 고교 신호등 매트릭스 모달 =====
async function openMatrixModal(classNum) {
    document.getElementById('matrixModal')?.remove();

    const modalEl = document.createElement('div');
    modalEl.id = 'matrixModal';
    modalEl.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modalEl.innerHTML = `
        <div class="glass-card p-8 w-full max-w-[1680px] text-center">
            <span class="spinner"></span> <span class="text-white ml-2">${classNum}반 학생들의 신호등 매트릭스를 구성하는 중...</span>
        </div>
    `;
    document.body.appendChild(modalEl);

    try {
        const fullGrades = await window.go.main.App.GetClassFullGrades(classNum);
        const cutoffs = await window.go.main.App.GetCutoffs().catch(() => []);

        let matrixRows = '';
        fullGrades.forEach(s => {
            // 고교별 배지 생성 헬퍼 함수
            const getBadge = (schoolSubstr, track = '일반') => {
                const r = s.schoolResults.find(x => x.schoolName.includes(schoolSubstr) && x.trackName.includes(track));
                if (!r) return '<span class="text-slate-500">-</span>';
                
                let foundCutoff = null;
                if (cutoffs) {
                    foundCutoff = cutoffs.find(c => c.schoolName.includes(schoolSubstr) && (c.track.includes(track) || c.department === '공통'));
                }

                if (foundCutoff && foundCutoff.minValue > 0) {
                    if (r.totalScore >= foundCutoff.minValue + 5) {
                        return `<span class="text-success font-bold" title="최저선: ${foundCutoff.minValue}점 (안정)">🟢 ${r.totalScore.toFixed(2)}</span>`;
                    } else if (r.totalScore >= foundCutoff.minValue) {
                        return `<span class="text-warning font-bold" title="최저선: ${foundCutoff.minValue}점 (경계)">🟡 ${r.totalScore.toFixed(2)}</span>`;
                    } else {
                        return `<span class="text-danger font-bold" title="최저선: ${foundCutoff.minValue}점 (주의)">🔴 ${r.totalScore.toFixed(2)}</span>`;
                    }
                }
                return `<span class="text-slate-300 font-medium">${r.totalScore.toFixed(2)}점</span>`;
            };

            const meister = getBadge('마이스터');
            const energy = getBadge('에너지');
            const hyundai = getBadge('현대');
            const sangop = getBadge('상업고');
            const yeosang = getBadge('여자상업고');
            const saenggwa = getBadge('생활과학');
            const gongop = getBadge('공업고');
            const sanup = getBadge('산업고');
            const miyong = getBadge('미용예술');
            const gisul = getBadge('기술공업');
            const general = s.generalHSPercentile <= 80 ? '🟢 안정' : (s.generalHSPercentile <= 90 ? '🟡 경계' : '🔴 주의');

            matrixRows += `
                <tr class="hover:bg-slate-800/60 border-b border-slate-700/50 text-center">
                    <td class="p-2.5 text-slate-400 font-mono">${s.studentNum}</td>
                    <td class="p-2.5 font-bold text-white cursor-pointer hover:underline matrix-student-name"
                        data-class="${classNum}" data-num="${s.studentNum}" data-name="${s.name}">
                        ${s.name}
                    </td>
                    <td class="p-2.5 text-primary font-bold">${s.allAverage.toFixed(2)}</td>
                    <td class="p-2.5">${meister}</td>
                    <td class="p-2.5">${energy}</td>
                    <td class="p-2.5">${hyundai}</td>
                    <td class="p-2.5">${sangop}</td>
                    <td class="p-2.5">${yeosang}</td>
                    <td class="p-2.5">${saenggwa}</td>
                    <td class="p-2.5">${gongop}</td>
                    <td class="p-2.5">${sanup}</td>
                    <td class="p-2.5">${miyong}</td>
                    <td class="p-2.5">${gisul}</td>
                    <td class="p-2.5 font-bold whitespace-nowrap">${general} <span class="text-[11px] text-slate-400">(${s.generalHSPercentile.toFixed(2)}%)</span></td>
                </tr>
            `;
        });

        modalEl.innerHTML = `
            <div class="glass-card print-document p-6 md:p-8 w-full max-w-[1760px] max-h-[92vh] overflow-y-auto space-y-5">
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">
                            📊 ${classNum}반 전체 관내 고교별 진학 신호등 매트릭스
                        </h2>
                        <p class="text-xs text-text-muted mt-1">학생 이름을 클릭하면 해당 학생의 세부 상담창으로 즉시 이동합니다. (초록: 안정 / 노랑: 경계 / 빨강: 주의 ※ 실기고사를 치르는 학교는 제외)</p>
                    </div>
                    <button id="closeMatrixBtn" class="no-print text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
                </div>

                <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-800/30">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-slate-800/80 text-text-muted border-b border-slate-700/70 text-center whitespace-nowrap">
                                <th class="p-2.5 w-10">번호</th>
                                <th class="p-2.5 w-16">성명</th>
                                <th class="p-2.5 w-14">평균</th>
                                <th class="p-2.5 text-amber-400">🎓 마이스터고</th>
                                <th class="p-2.5 text-amber-400">🎓 에너지고</th>
                                <th class="p-2.5 text-amber-400">🎓 현대공고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산상고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산여상</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산생과고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산공고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 울산산업고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 미용예술고</th>
                                <th class="p-2.5 text-indigo-400">🛠️ 기술공고</th>
                                <th class="p-2.5 text-emerald-400">🏫 후기 일반계고</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${matrixRows}
                        </tbody>
                    </table>
                </div>
                <div class="flex justify-between items-center text-xs text-text-muted">
                    <div>* 점수 뒤 신호등은 등록된 커트라인 대비 5점 이상 초과 시 안정(🟢), 기준점 이상 시 경계(🟡), 미만 시 주의(🔴)로 표시됩니다.</div>
                    <button id="matrixPrintBtn" class="no-print btn-secondary text-xs px-3 py-1.5 font-bold">🖨️ 매트릭스 인쇄</button>
                </div>
            </div>
        `;

        document.getElementById('closeMatrixBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('matrixPrintBtn').addEventListener('click', () => printOnly('matrix', 'landscape'));

        // 학생 이름 클릭 시 해당 학생의 상담창으로 이동
        modalEl.querySelectorAll('.matrix-student-name').forEach(el => {
            el.addEventListener('click', (e) => {
                const cNum = parseInt(e.target.dataset.class);
                const sNum = e.target.dataset.num;
                const sName = e.target.dataset.name;
                modalEl.remove();
                openStudentModal(cNum, sNum, sName);
            });
        });

    } catch (err) {
        modalEl.innerHTML = `<div class="glass-card p-8 text-center text-danger font-bold">매트릭스 생성 실패: ${err}</div>`;
    }
}


// ===== 유틸리티 =====
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 앱 시작 시 자동 업데이트 확인 및 모달 팝업 =====
async function checkUpdateOnStartup(localVer) {
    const statusEl = document.getElementById('startupUpdateStatus');
    if (statusEl) {
        statusEl.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 서버 확인 중...';
    }

    // Wails 바인딩 주입 대기 (최대 3초)
    for (let i = 0; i < 30; i++) {
        if (window.go?.main?.App?.SyncWithServer) break;
        await delay(100);
    }

    try {
        if (window.go?.main?.App?.SyncWithServer) {
            const result = await window.go.main.App.SyncWithServer();
            if (result && result.hasUpdate) {
                if (statusEl) {
                    statusEl.innerHTML = `<span class="text-rose-400 font-bold animate-pulse">🚀 새 버전 v${result.latestVersion} 출시!</span>`;
                }
                showStartupUpdateModal(result);
            } else {
                if (statusEl) {
                    const serverVer = result?.latestVersion || localVer || '';
                    statusEl.innerHTML = `<span class="text-emerald-400">✅ 최신 버전 (서버: v${serverVer})</span>`;
                }
            }
        }
    } catch (e) {
        console.log("시작 시 업데이트 확인 실패:", e);
        if (statusEl) {
            statusEl.innerHTML = `<span class="text-slate-400">오프라인 모드</span>`;
        }
    }
}

function showStartupUpdateModal(result) {
    document.getElementById('startupUpdateModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'startupUpdateModal';
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 fade-in';
    modal.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-lg border border-warning/40 space-y-5 text-left">
            <div class="flex items-center gap-3 border-b border-slate-700/60 pb-3">
                <span class="text-3xl">🚀</span>
                <div>
                    <h3 class="text-lg font-black text-white">새로운 버전이 출시되었습니다!</h3>
                    <div class="text-xs text-warning font-bold">v${result.latestVersion} (현재 버전: v${result.currentVersion})</div>
                </div>
            </div>

            <div class="space-y-2">
                <div class="text-xs font-bold text-slate-300">📦 업데이트 주요 내용:</div>
                <div class="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                    ${result.releaseNotes || '새로운 기능 추가 및 시스템 안정화 패치'}
                </div>
            </div>

            <div id="startupUpdateStatusMsg" class="text-xs font-bold text-warning hidden"></div>

            <div class="flex items-center justify-end gap-3 pt-2">
                <button id="skipStartupUpdateBtn" class="btn-secondary text-xs px-4 py-2 font-bold" style="width: auto;">
                    다음에 하기
                </button>
                <button id="applyStartupUpdateBtn" class="btn-primary text-xs px-4 py-2.5 font-bold flex items-center gap-2" style="background: linear-gradient(135deg, #f59e0b, #d97706); width: auto;">
                    🚀 지금 즉시 자동 업데이트 및 재시작
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('skipStartupUpdateBtn').addEventListener('click', () => {
        modal.remove();
    });

    document.getElementById('applyStartupUpdateBtn').addEventListener('click', async () => {
        const btn = document.getElementById('applyStartupUpdateBtn');
        const skipBtn = document.getElementById('skipStartupUpdateBtn');
        const statusMsg = document.getElementById('startupUpdateStatusMsg');

        btn.disabled = true;
        skipBtn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> <span>다운로드 중...</span>';
        statusMsg.className = 'text-xs font-bold text-warning';
        statusMsg.textContent = '최신 업데이트 파일을 다운로드하고 있습니다. 완료되면 프로그램이 자동으로 재시작됩니다...';
        statusMsg.classList.remove('hidden');

        try {
            await window.go.main.App.PerformAutoUpdate(result.downloadUrl);
        } catch (err) {
            btn.disabled = false;
            skipBtn.disabled = false;
            btn.textContent = '🚀 다시 시도';
            statusMsg.className = 'text-xs font-bold text-danger';
            statusMsg.textContent = '자동 업데이트 실패: ' + err;
        }
    });
}

// ===== 앱 시작 =====
async function init() {
    // 프로그램 시작 시 조용히 업데이트 버전 확인 (있으면 모달 팝업)
    checkUpdateOnStartup();

    try {
        const isSetup = await CheckSetupComplete();
        if (isSetup) {
            // 암호화된 data 폴더는 로그인 전에는 열지 않는다. 학교명과
            // 역할 목록은 로그인 후에만 DB에서 읽는다.
            renderLoginScreen(await window.go.main.App.GetLoginIndex());
        } else {
            renderSetupScreen();
        }
    } catch (err) {
        app.innerHTML = `<div class="p-10 text-center text-danger font-bold">계정 정보를 불러올 수 없습니다.<br>${err}</div>`;
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
                            <textarea id="fbContent" class="input-field resize-none" style="min-height: 150px;" placeholder="자세한 내용을 적어주세요..." required></textarea>
                        </div>
                        <div>
                            <label class="block text-sm text-text-muted mb-1">사진 첨부 (선택)</label>
                            <input type="file" id="fbImage" accept="image/*" class="w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer">
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
                let answered = issue.status !== 'open';
                try {
                    const remote = await window.go.main.App.GetFeedbackDetails(issue.issue_id);
                    answered = answered || remote.state === 'closed' || (remote.comments && remote.comments.length > 0);
                } catch (_) {}
                let statusBadge = answered ? '<span class="text-xs bg-success/20 text-success px-2 py-1 rounded">답변 완료</span>' : '<span class="text-xs bg-warning/20 text-warning px-2 py-1 rounded">답변 대기</span>';
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
        const fileInput = document.getElementById('fbImage');
        
        if (!title || !content) {
            return alert('제목과 내용을 입력해주세요.');
        }

        let attachmentName = '';
        let attachmentB64 = '';

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            attachmentName = file.name;
            try {
                attachmentB64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(file);
                });
            } catch (err) {
                return alert('이미지 첨부 오류: ' + err);
            }
        }

        const btn = document.getElementById('submitFeedbackBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 전송 중...';

        try {
            await window.go.main.App.SubmitFeedback(title, content, email, attachmentName, attachmentB64);
            alert('피드백이 성공적으로 등록되었습니다.');
            document.getElementById('fbTitle').value = '';
            document.getElementById('fbContent').value = '';
            if(fileInput) fileInput.value = '';
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
// ===== 로그인 화면 =====
export async function renderLoginScreen(schoolName) {
    app.className = '';
	try {
		const loginIndex = typeof schoolName === 'string' ? { schoolName, accounts: [] } : schoolName;
		schoolName = loginIndex.schoolName || '암호화된 학교 데이터';
		const roleOrder = { master: 0, homeroom: 1, viewer: 2 };
		const loginAccounts = [...(loginIndex.accounts || [])].sort((a, b) => {
			const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
			return roleDiff || (a.classNum || 0) - (b.classNum || 0) || a.username.localeCompare(b.username);
		});
        let localVer = '0.5.5';
        try {
            localVer = await window.go.main.App.GetAppVersion();
        } catch (e) {
            console.warn(e);
        }
        
        app.innerHTML = `
            <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
                <div class="text-center mb-6">
                    <div class="text-5xl mb-4" style="animation: float 3s ease-in-out infinite;">🔐</div>
                    <h1 class="text-2xl font-bold text-white mb-1">그래서? 넌 어디갈래? 🏫</h1>
                    <p class="text-text-muted text-xs">${schoolName}</p>
                </div>
                <form id="loginForm" class="space-y-4">
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">로그인 계정 선택</label>
                        <select id="loginUsername" class="input-field cursor-pointer py-2 text-xs" required>
                            ${loginAccounts.map(account => `<option value="${account.username}">${account.role === 'master' ? '학년부장' : account.role === 'viewer' ? '진로부장' : `${account.username} 담임`}</option>`).join('') || '<option value="admin">학년부장 (admin)</option>'}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">비밀번호</label>
                        <input type="password" id="loginPassword" class="input-field py-2 text-xs" placeholder="비밀번호 입력" required />
                    </div>
                    <div id="sharedPasswordRow" class="hidden">
                        <label class="block text-xs font-semibold text-amber-300 mb-1.5">공용 데이터 암호 <span class="text-slate-400 font-normal">(이 PC 첫 실행만)</span></label>
                        <input type="password" id="sharedLoginPassword" class="input-field py-2 text-xs" placeholder="학년부장에게 받은 공용 데이터 암호" />
                    </div>
                    <div class="pt-2">
                        <button type="submit" id="loginBtn" class="btn-primary py-2 text-xs font-bold">로그인</button>
                    </div>
                    <div id="loginError" class="error-msg text-center text-xs"></div>
                </form>

                <!-- 현재 설치된 버전 및 실시간 자동 업데이트 검사 영역 -->
                <div class="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-text-muted">
                    <div>
                        <div>현재 버전: <strong class="text-indigo-300 font-mono font-bold">v${localVer}</strong></div>
                        <div id="startupUpdateStatus" class="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 업데이트 검사 중...
                        </div>
                    </div>
                    <button id="manualUpdateCheckBtn" type="button" class="btn-secondary text-xs px-2.5 py-1.5 font-bold inline-flex items-center gap-1" style="width: auto;">
                        <span>🔄</span> 업데이트 확인
                    </button>
                </div>
            </div>
        `;

        // 로그인 화면이 로드되면 자동으로 백그라운드 서버 업데이트 검사 실행
        checkUpdateOnStartup(localVer);

        const refreshSharedPasswordRequirement = async () => {
            const username = document.getElementById('loginUsername').value;
            const required = await window.go.main.App.NeedsSharedDataPassword(username);
            document.getElementById('sharedPasswordRow').classList.toggle('hidden', !required);
            document.getElementById('sharedLoginPassword').required = required;
        };
        document.getElementById('loginUsername').addEventListener('change', refreshSharedPasswordRequirement);
        await refreshSharedPasswordRequirement();

        document.getElementById('manualUpdateCheckBtn').addEventListener('click', async () => {
            const btn = document.getElementById('manualUpdateCheckBtn');
            const statusEl = document.getElementById('startupUpdateStatus');
            btn.innerHTML = '<span class="spinner"></span> 확인 중...';
            if (statusEl) statusEl.innerHTML = '<span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> 서버 확인 중...';
            try {
                const res = await window.go.main.App.SyncWithServer();
                if (res && res.hasUpdate) {
                    if (statusEl) statusEl.innerHTML = `<span class="text-rose-400 font-bold animate-pulse">🚀 새 버전 v${res.latestVersion} 출시!</span>`;
                    showStartupUpdateModal(res);
                } else {
                    const serverVer = res && res.latestVersion ? res.latestVersion : localVer;
                    if (statusEl) statusEl.innerHTML = `<span class="text-emerald-400">✅ 최신 버전 (서버: v${serverVer})</span>`;
                    alert(`현재 설치된 버전(v${localVer})은 최신 상태입니다!\n(중앙 서버 최신 버전: v${serverVer})`);
                }
            } catch (err) {
                alert('업데이트 확인 실패: ' + err);
                if (statusEl) statusEl.innerHTML = `<span class="text-slate-400">오프라인 모드</span>`;
            } finally {
                btn.innerHTML = '<span>🔄</span> 업데이트 확인';
            }
        });

        document.getElementById('loginPassword').focus();
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
			const sharedPassword = document.getElementById('sharedLoginPassword').value;
            const btn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');
            
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span>확인 중...';
            errorDiv.classList.remove('show');

            try {
                const user = sharedPassword
                    ? await window.go.main.App.UnlockSharedAndLogin(username, password, sharedPassword)
                    : await window.go.main.App.UnlockAndLogin(username, password);
                window.currentUser = user;

                if (user.MustChangePassword) {
                    renderPasswordChangeScreen(username);
                } else {
                    if (user.Role === 'homeroom') {
                        renderTeacherScreen(schoolName, user.ClassNum);
                    } else if (user.Role === 'viewer') {
                        renderTeacherScreen(schoolName, null);
                    } else {
                        renderAdminScreen(schoolName);
                    }
                }
            } catch (err) {
                errorDiv.textContent = err;
                errorDiv.classList.add('show');
                btn.disabled = false;
                btn.innerHTML = '로그인';
            }
        });
    } catch (err) {
        app.innerHTML = `<div class="text-danger py-10 text-center">계정 정보를 불러오지 못했습니다. 데이터베이스를 확인해주세요.<br>${err}</div>`;
    }
}

// ===== 비밀번호 변경 화면 =====
function renderPasswordChangeScreen(username) {
    app.innerHTML = `
        <div class="glass-card p-10 w-full max-w-md fade-in" style="margin: 2rem;">
            <div class="text-center mb-8">
                <div class="text-5xl mb-4">🔑</div>
                <h1 class="text-2xl font-bold text-white mb-2">초기 비밀번호 변경</h1>
                <p class="text-text-muted text-sm">보안을 위해 비밀번호를 새로 설정해주세요.</p>
            </div>
            <form id="pwChangeForm" class="space-y-5">
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">새 비밀번호</label>
                    <input type="password" id="newPassword" class="input-field" required />
                </div>
                <div>
                    <label class="block text-sm font-semibold text-text-muted mb-2">새 비밀번호 확인</label>
                    <input type="password" id="newPasswordConfirm" class="input-field" required />
                </div>
                <div class="pt-3">
                    <button type="submit" id="pwChangeBtn" class="btn-primary">변경 완료 및 시작</button>
                </div>
                <div id="pwChangeError" class="error-msg text-center"></div>
            </form>
        </div>
    `;

    document.getElementById('newPassword').focus();
    document.getElementById('pwChangeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('newPassword').value;
        const pwC = document.getElementById('newPasswordConfirm').value;
        const btn = document.getElementById('pwChangeBtn');
        const err = document.getElementById('pwChangeError');
        
        if (pw !== pwC) {
            err.textContent = "비밀번호가 일치하지 않습니다.";
            err.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>변경 중...';
        
        try {
            await window.go.main.App.ChangeUserPassword(username, pw);
            window.currentUser.MustChangePassword = false;
            const config = await window.go.main.App.GetSchoolConfig();
            if (window.currentUser.Role === 'homeroom') {
                renderTeacherScreen(config.schoolName, window.currentUser.ClassNum);
            } else if (window.currentUser.Role === 'viewer') {
                renderTeacherScreen(config.schoolName, null);
            } else {
                renderAdminScreen(config.schoolName);
            }
        } catch (e) {
            err.textContent = e;
            err.classList.add('show');
            btn.disabled = false;
            btn.innerHTML = '변경 완료 및 시작';
        }
    });
}

// ===== 사용자 및 권한 관리 화면 =====
export async function renderUserManagementScreen(schoolName) {
    app.className = 'wide-layout';

    let classCount = 8;
    try {
        const config = await window.go.main.App.GetSchoolConfig();
        classCount = config.classCount;
    } catch (e) {
        console.error(e);
    }

    let classOptions = '';
    for (let i = 1; i <= classCount; i++) {
        classOptions += `<option value="${i}">${i}반</option>`;
    }

    app.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-[1700px] mx-auto min-h-[85vh]">
            <div class="flex items-center justify-between mb-8 pb-4 border-b border-slate-700/50">
                <div>
                    <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                        👥 스마트 사용자 및 권한 관리
                    </h1>
                    <p class="text-text-muted text-sm mt-1">${schoolName} — 교사별 권한 및 계정을 자유롭게 추가/삭제/관리합니다.</p>
                </div>
                <div class="flex items-center gap-4">
                    <button id="backToAdminBtn" class="btn-secondary whitespace-nowrap text-xs px-4 py-2.5">
                        ← 대시보드로 돌아가기
                    </button>
                </div>
            </div>

            <div class="space-y-6">
                <!-- 새 사용자 계정 추가 폼 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-4 flex items-center gap-2 text-white text-base">
                        <span>➕</span> 새 교사/관리자 계정 등록
                    </h3>
                    <form id="addUserForm" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label class="block text-xs text-text-muted mb-1">사용자 ID</label>
                            <input type="text" id="newUserId" class="input-field py-2 text-xs" placeholder="예: teacher1" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">초기 비밀번호</label>
                            <input type="password" id="newUserPw" class="input-field py-2 text-xs" placeholder="초기 비밀번호" required />
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">역할 (권한)</label>
                            <select id="newUserRole" class="input-field py-2 text-xs">
                                <option value="viewer">진학/학년부장 (전체 조회)</option>
                                <option value="homeroom">담임교사 (학급 담당)</option>
                                <option value="master">관리자 (전체 관리)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-text-muted mb-1">담당 학급 (담임용)</label>
                            <select id="newUserClass" class="input-field py-2 text-xs" disabled>
                                <option value="0">해당 없음</option>
                                ${classOptions}
                            </select>
                        </div>
                        <div class="pb-0.5">
                            <button type="submit" id="addUserBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap w-full text-xs flex items-center justify-center gap-1.5">
                                <span>➕</span> 계정 생성
                            </button>
                        </div>
                    </form>
                    <div id="addUserError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 담임 계정 일괄 비밀번호 설정 -->
                <div class="p-6 rounded-xl bg-slate-800/50 border border-slate-700/50">
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base">
                        <span>🔑</span> 담임 계정 일괄 비밀번호 발급
                    </h3>
                    <form id="bulkPasswordForm" class="flex gap-4 items-end max-w-xl">
                        <div class="flex-1">
                            <label class="block text-xs text-text-muted mb-1">모든 담임(1반~N반) 공통 초기 비밀번호</label>
                            <input type="password" id="bulkPw" class="input-field py-2 text-xs" placeholder="공통 비밀번호 입력" required />
                        </div>
                        <div class="flex-none pb-0.5">
                            <button type="submit" id="bulkPwBtn" class="btn-primary py-2 px-4 rounded-lg font-bold shadow whitespace-nowrap text-xs" style="width: auto;">일괄 적용</button>
                        </div>
                    </form>
                    <div id="bulkPwError" class="mt-2 text-xs text-danger hidden font-bold"></div>
                </div>

                <!-- 계정 목록 -->
                <div>
                    <h3 class="font-bold mb-3 flex items-center gap-2 text-white text-base"><span>📋</span> 등록된 교사/관리자 계정 목록</h3>
                    <div class="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                        <table class="w-full text-left text-xs sm:text-sm">
                            <thead class="bg-slate-800/80 text-text-muted">
                                <tr>
                                    <th class="p-3.5 font-semibold">구분 (역할)</th>
                                    <th class="p-3.5 font-semibold">사용자 아이디</th>
                                    <th class="p-3.5 font-semibold">비번 상태</th>
                                    <th class="p-3.5 font-semibold text-center">비밀번호 재발급</th>
                                    <th class="p-3.5 font-semibold text-center w-24">계정 삭제</th>
                                </tr>
                            </thead>
                            <tbody id="userListBody" class="divide-y divide-slate-700/50">
                                <tr><td colspan="5" class="p-8 text-center text-text-muted">불러오는 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('backToAdminBtn').addEventListener('click', () => {
        app.className = '';
        renderAdminScreen(schoolName);
    });

    const roleSelect = document.getElementById('newUserRole');
    const classSelect = document.getElementById('newUserClass');
    roleSelect.addEventListener('change', () => {
        if (roleSelect.value === 'homeroom') {
            classSelect.disabled = false;
            classSelect.value = "1";
        } else {
            classSelect.disabled = true;
            classSelect.value = "0";
        }
    });

    // 계정 추가 처리
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('newUserId').value.trim();
        const pw = document.getElementById('newUserPw').value;
        const role = roleSelect.value;
        const classNum = parseInt(classSelect.value) || 0;
        const btn = document.getElementById('addUserBtn');
        const err = document.getElementById('addUserError');
        
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> 생성 중...';
        err.classList.add('hidden');

        try {
            await window.go.main.App.CreateUser(id, pw, role, classNum);
            document.getElementById('newUserId').value = '';
            document.getElementById('newUserPw').value = '';
            alert(`'${id}' 계정이 성공적으로 등록되었습니다.`);
            loadUserList();
        } catch (error) {
            err.textContent = '등록 실패: ' + error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>➕</span> 계정 생성';
        }
    });

    // 담임 일괄 비밀번호 처리
    document.getElementById('bulkPasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('bulkPw').value;
        const btn = document.getElementById('bulkPwBtn');
        const err = document.getElementById('bulkPwError');
        
        if (!confirm('모든 담임(1반~N반)의 비밀번호를 일괄 설정/초기화 하시겠습니까?')) return;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>...';
        err.classList.add('hidden');

        try {
            const users = await window.go.main.App.GetUsers();
            const homerooms = users.filter(u => u.Role === 'homeroom');
            for (const hr of homerooms) {
                await window.go.main.App.SetUserPassword(hr.Username, pw);
            }
            document.getElementById('bulkPw').value = '';
            alert('모든 담임 계정의 비밀번호가 일괄 설정되었습니다.');
            loadUserList();
        } catch (error) {
            err.textContent = error;
            err.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = '일괄 적용';
        }
    });

    // 계정 목록 로드
    async function loadUserList() {
        const tbody = document.getElementById('userListBody');
        try {
            const users = await window.go.main.App.GetUsers();
            tbody.innerHTML = '';
            
            users.forEach(u => {
                const isInitial = u.MustChangePassword;
                let roleLabel = '학년부장 (관리자)';
                if (u.Role === 'homeroom') roleLabel = `${u.ClassNum}반 담임`;
                else if (u.Role === 'viewer') roleLabel = '진로부장 (조회전용)';

                let statusBadge = isInitial 
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning border border-warning/30">초기 상태</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success border border-success/30">사용 중</span>`;

                const isMasterAdmin = u.Username === 'admin';

                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-800/30 transition-colors";
                tr.innerHTML = `
                    <td class="p-3.5 font-bold text-slate-200">${roleLabel}</td>
                    <td class="p-3.5 text-text-muted font-mono">${u.Username}</td>
                    <td class="p-3.5">${statusBadge}</td>
                    <td class="p-3.5 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <input type="password" id="pw_${u.Username}" class="input-field py-1 px-2.5 text-xs w-28" placeholder="새 비번" />
                            <button class="btn-primary py-1 px-2.5 text-xs whitespace-nowrap rounded font-bold" style="width: auto;" onclick="updateUserPassword('${u.Username}')">
                                ${isInitial ? '비번 설정' : '재설정'}
                            </button>
                        </div>
                    </td>
                    <td class="p-3.5 text-center">
                        ${isMasterAdmin 
                            ? '<span class="text-xs text-slate-600 font-bold">보호됨</span>' 
                            : `<button class="text-xs text-danger hover:underline font-bold px-2 py-1 rounded bg-danger/10 hover:bg-danger/20 border border-danger/30 transition-colors" onclick="deleteUserAccount('${u.Username}')">삭제</button>`
                        }
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-danger font-bold">${error}</td></tr>`;
        }
    }

    window.updateUserPassword = async (username) => {
        const input = document.getElementById(`pw_${username}`);
        const pw = input.value;
        if (!pw) {
            alert('새 비밀번호를 입력하세요.');
            return;
        }

        if (confirm(`'${username}' 계정의 비밀번호를 설정하시겠습니까?`)) {
            try {
                await window.go.main.App.SetUserPassword(username, pw);
                alert('비밀번호가 성공적으로 설정되었습니다.');
                input.value = '';
                loadUserList();
            } catch (err) {
                alert('설정 실패: ' + err);
            }
        }
    };

    window.deleteUserAccount = async (username) => {
        if (confirm(`정말로 '${username}' 계정을 삭제하시겠습니까?`)) {
            try {
                await window.go.main.App.DeleteUser(username);
                alert('계정이 삭제되었습니다.');
                loadUserList();
            } catch (err) {
                alert('삭제 실패: ' + err);
            }
        }
    };

    loadUserList();
}

// ===== 고교별 커트라인 관리 화면 (단일 페이지 통합 네비게이션 & 최저/최고/평균 입력 지원) =====
async function renderCutoffScreen(schoolName) {
    app.className = 'wide-layout';

    const currentMiddleSchoolYear = new Date().getFullYear();
    let currentAdmissionYear = currentMiddleSchoolYear + 1;
    try {
        const config = await GetSchoolConfig();
        if (config && config.admissionYear) {
            currentAdmissionYear = config.admissionYear;
        }
    } catch (e) {
        console.warn(e);
    }

    let allSavedCutoffs = [];
    try {
        allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
    } catch (e) {
        console.error(e);
    }

    // 기존 자료의 연도를 보존해 매년 1년씩 누적된 커트라인을 언제든 다시 열고
    // 최근 3년·5년 상담 비교에 사용할 수 있게 한다.
    const admissionYears = Array.from(new Set([
        ...Array.from({ length: 12 }, (_, index) => currentMiddleSchoolYear + 1 - index),
        ...allSavedCutoffs.map(c => Number(c.year))
    ])).filter(year => Number.isInteger(year)).sort((a, b) => b - a);

    // 기본 등록 고교 및 학과 목록
    let defaultSchoolSpecs = [
        // 1. 마이스터고
        {
            name: "울산마이스터고",
            category: "meister",
            categoryLabel: "마이스터고",
            totalMax: "300점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 245.2",
            items: [
                { dept: "정밀기계과", track: "일반" },
                { dept: "정밀기계과", track: "특별" },
                { dept: "산업설비과", track: "일반" },
                { dept: "산업설비과", track: "특별" }
            ]
        },
        {
            name: "울산에너지고",
            category: "meister",
            categoryLabel: "마이스터고",
            totalMax: "230점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 185.0",
            items: [
                { dept: "전력제어과", track: "일반" },
                { dept: "전력제어과", track: "특별" },
                { dept: "신재생에너지과", track: "일반" },
                { dept: "신재생에너지과", track: "특별" }
            ]
        },
        {
            name: "현대공업고",
            category: "meister",
            categoryLabel: "마이스터고",
            totalMax: "200점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 160.0",
            items: [
                { dept: "정밀기계과", track: "일반" },
                { dept: "정밀기계과", track: "특별" },
                { dept: "산업설비과", track: "일반" },
                { dept: "산업설비과", track: "특별" },
                { dept: "전기제어과", track: "일반" },
                { dept: "전기제어과", track: "특별" }
            ]
        },
        // 2. 특성화고
        {
            name: "울산상업고",
            category: "special",
            categoryLabel: "특성화고",
            totalMax: "100점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 75.0",
            items: [
                { dept: "물류경영과", track: "일반" },
                { dept: "물류경영과", track: "취업희망자" },
                { dept: "공공사무행정과", track: "일반" },
                { dept: "공공사무행정과", track: "취업희망자" },
                { dept: "군사행정과", track: "일반" }
            ]
        },
        {
            name: "울산여자상업고",
            category: "special",
            categoryLabel: "특성화고",
            totalMax: "100점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 70.0",
            items: [
                { dept: "금융사무과", track: "일반" },
                { dept: "금융사무과", track: "취업희망자" },
                { dept: "글로벌비즈니스과", track: "일반" },
                { dept: "글로벌비즈니스과", track: "취업희망자" },
                { dept: "관광레저과", track: "일반" },
                { dept: "관광레저과", track: "취업희망자" }
            ]
        },
        {
            name: "울산생활과학고",
            category: "special",
            categoryLabel: "특성화고",
            totalMax: "100점 만점",
            scoreType: "total_score",
            unit: "점",
            placeholder: "예: 68.0",
            items: [
                { dept: "조리과", track: "일반" },
                { dept: "조리과", track: "취업희망자" },
                { dept: "제과제빵과", track: "일반" },
                { dept: "제과제빵과", track: "취업희망자" },
                { dept: "뷰티예술과", track: "일반" },
                { dept: "뷰티예술과", track: "취업희망자" }
            ]
        },
		{
			name: "울산공업고등학교", category: "special", categoryLabel: "특성화고", totalMax: "100점 만점", scoreType: "total_score", unit: "점", placeholder: "예: 70.0",
			items: ["건축과", "기계과", "전기과", "전자통신과", "토목과", "화공과"].map(dept => ({ dept, track: "일반" }))
		},
		{
			name: "울산산업고등학교", category: "special", categoryLabel: "특성화고", totalMax: "100점 만점", scoreType: "total_score", unit: "점", placeholder: "예: 70.0",
			items: ["농식품가공과", "보건간호과", "원예디자인과", "금융경영과"].map(dept => ({ dept, track: "일반" }))
		},
		{
			name: "울산기술공업고등학교", category: "special", categoryLabel: "특성화고", totalMax: "100점 만점", scoreType: "total_score", unit: "점", placeholder: "예: 70.0",
			items: ["기계과", "전기과"].map(dept => ({ dept, track: "일반" }))
		},
        // 3. 후기 일반고
        {
            name: "울산 후기 일반계고",
            category: "general",
            categoryLabel: "후기 일반고",
            totalMax: "석차 백분율",
            scoreType: "percentile",
            unit: "%",
            placeholder: "예: 85.00",
            items: [
                { dept: "공통", track: "일반" }
            ]
        }
    ];

    // 학과·학교명은 화면에 별도 하드코딩하지 않고 공용 고교 목록을 기준으로
    // 구성한다. 이 목록을 바꾸면 커트라인 입력 화면도 함께 바뀐다.
    try {
        const highSchoolData = await window.go.main.App.GetHighSchoolsData();
        const schools = highSchoolData?.schools || [];
        const catalogSpecs = schools
            .filter(s => s.type === '마이스터고' || s.type === '특성화고')
            .map(s => {
                const isMeister = s.type === '마이스터고';
                const tracks = isMeister ? ['일반', '특별'] : ['일반', '취업희망자'];
                const shortName = normalizeSchoolName(s.name);
                const totalMax = shortName === '울산마이스터고' ? '300점 만점'
                    : shortName === '울산에너지고' ? '230점 만점'
                    : shortName === '현대공업고' ? '200점 만점'
                    : '100점 만점';
                return {
                    name: s.name,
                    category: isMeister ? 'meister' : 'special',
                    categoryLabel: s.type,
                    totalMax,
                    scoreType: 'total_score',
                    unit: '점',
                    placeholder: isMeister ? '예: 200.0' : '예: 75.0',
                    items: (s.departments || []).flatMap(dept => tracks.map(track => ({ dept, track }))),
                };
            });
        if (catalogSpecs.length) {
            defaultSchoolSpecs = [
                ...catalogSpecs,
                {
                    name: '울산 후기 일반계고', category: 'general', categoryLabel: '후기 일반고',
                    totalMax: '석차 백분율', scoreType: 'percentile', unit: '%', placeholder: '예: 85.00',
                    items: [{ dept: '공통', track: '일반' }],
                },
            ];
        }
    } catch (e) {
        console.warn('공용 고교 목록을 불러오지 못해 기본 목록을 사용합니다:', e);
    }

    // 공식 공개 입결 레퍼런스 데이터 (최근 3개년 공개 통계)
    const publicOfficialDefaults = [
        { year: 2026, school: "울산마이스터고", track: "일반전형", dept: "공통", min: 245.22, max: 300.00, avg: 272.60, unit: "점", note: "공식 합격선" },
        { year: 2026, school: "울산마이스터고", track: "특별전형", dept: "공통", min: 241.03, max: 260.37, avg: 250.70, unit: "점", note: "공식 합격선" },
        { year: 2025, school: "울산마이스터고", track: "일반전형", dept: "공통", min: 218.04, max: 299.09, avg: 258.50, unit: "점", note: "공식 입결" },
        { year: 2025, school: "울산마이스터고", track: "특별전형", dept: "공통", min: 206.33, max: 285.59, avg: 245.90, unit: "점", note: "공식 입결" },
        { year: 2024, school: "울산마이스터고", track: "일반전형", dept: "공통", min: 215.82, max: 291.69, avg: 253.75, unit: "점", note: "공식 입결" },
        { year: 2024, school: "울산마이스터고", track: "특별전형", dept: "공통", min: 212.85, max: 287.15, avg: 250.00, unit: "점", note: "공식 입결" },
        { year: 2026, school: "울산에너지고", track: "일반전형", dept: "공통", min: 184.50, max: 228.00, avg: 205.30, unit: "점", note: "추정 기준선" },
        { year: 2026, school: "현대공업고", track: "일반전형", dept: "공통", min: 158.00, max: 198.50, avg: 176.40, unit: "점", note: "추정 기준선" },
        { year: 2026, school: "울산상업고", track: "일반전형", dept: "물류경영과", min: 72.50, max: 95.00, avg: 81.20, unit: "점", note: "전년도 참고" },
        { year: 2026, school: "울산 후기 일반계고", track: "일반계고", dept: "공통", min: 85.00, max: 5.00, avg: 50.00, unit: "%", note: "진학 지도 기준선" }
    ];
    let publicOfficialData = publicOfficialDefaults;
    try {
        const savedPublicData = localStorage.getItem('publicOfficialCutoffData');
        if (savedPublicData) publicOfficialData = JSON.parse(savedPublicData);
    } catch (e) {
        console.warn('공개 데이터 불러오기 실패:', e);
    }

    let currentTab = 'all'; // 'all', 'meister', 'special', 'general', 'public'

    const renderMainScreen = () => {
        // 현재 선택된 입학년도의 커트라인 매핑
        const savedMap = {};
        allSavedCutoffs.filter(c => c.year === currentAdmissionYear).forEach(c => {
            savedMap[`${normalizeSchoolName(c.schoolName)}_${c.department}_${c.track}`] = {
                min: c.minValue,
                max: c.maxValue,
                avg: c.avgValue
            };
        });

        // 탭 필터링
        const filteredSchools = defaultSchoolSpecs.filter(sch => {
            if (currentTab === 'all') return true;
            return sch.category === currentTab;
        });

        // 학교 목록 카드 HTML 생성
        let schoolsHTML = '';
        if (currentTab !== 'public') {
            filteredSchools.forEach((sch, sIdx) => {
                // 저장된 커트라인 값 채우기 & 사용자 추가 학과 병합
                const itemsToRender = [...sch.items];
                allSavedCutoffs.filter(c => c.year === currentAdmissionYear && normalizeSchoolName(c.schoolName) === normalizeSchoolName(sch.name)).forEach(c => {
                    const exists = itemsToRender.some(it => it.dept === c.department && it.track === c.track);
					if (!exists && (c.department !== '공통')) {
                        itemsToRender.push({ dept: c.department, track: c.track });
                    }
                });

                // 같은 학과는 하나의 셀로 묶고, 그 아래에서 일반·특별 등 전형별
                // 점수만 구분한다. DB에는 기존처럼 학과+전형 단위로 저장된다.
                const itemGroups = new Map();
                itemsToRender.forEach(item => {
                    const groupKey = item.dept || '';
                    if (!itemGroups.has(groupKey)) itemGroups.set(groupKey, []);
                    itemGroups.get(groupKey).push(item);
                });
                const rowsHTML = [...itemGroups.entries()].map(([dept, group], groupIndex) =>
                    group.map((item, itemIndex) => {
                        const key = `${normalizeSchoolName(sch.name)}_${item.dept}_${item.track}`;
                        const saved = savedMap[key] || {};
                        const minVal = saved.min !== undefined && saved.min > 0 ? saved.min : '';
                        const maxVal = saved.max !== undefined && saved.max > 0 ? saved.max : '';
                        const avgVal = saved.avg !== undefined && saved.avg > 0 ? saved.avg : '';
                        const groupId = `${sIdx}-${groupIndex}`;
                        return `
                            <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row" data-school="${sch.name}" data-type="${sch.scoreType}" data-dept="${dept}" data-dept-group="${groupId}">
                                ${itemIndex === 0 ? `<td class="p-3 align-middle" rowspan="${group.length}">
                                    <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="${dept}" placeholder="비우면 학교 전체" data-dept-group="${groupId}" />
                                </td>` : ''}
                                <td class="p-3"><input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="${item.track}" placeholder="전형 (예: 일반, 특별)" /></td>
                                <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-24 row-min-score" value="${minVal}" placeholder="${sch.placeholder}" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-24 row-max-score" value="${maxVal}" placeholder="선택" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-amber-300 w-24 row-avg-score" value="${avgVal}" placeholder="선택" /><span class="text-xs text-slate-400">${sch.unit}</span></div></td>
                                <td class="p-3 text-center"><button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button></td>
                            </tr>`;
                    }).join('')
                ).join('');

                schoolsHTML += `
                    <div class="p-5 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-3 school-cutoff-card shadow-lg" data-school="${sch.name}">
                        <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-2">
                            <div class="flex items-center gap-2.5">
                                <span class="text-xl">🏫</span>
                                <h3 class="font-bold text-white text-base">${sch.name}</h3>
                                <span class="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 font-semibold">${sch.categoryLabel} (${sch.totalMax})</span>
                            </div>
                            <button class="text-xs btn-secondary py-1.5 px-3 rounded-lg flex items-center gap-1.5 font-bold btn-add-dept" data-school="${sch.name}" data-type="${sch.scoreType}">
                                <span>➕</span> 학과·전형 추가
                            </button>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr class="text-text-muted border-b border-slate-700/60 font-semibold bg-slate-900/40">
								<th class="p-2.5 w-44">학과명 <span class="text-slate-500 font-normal">(비우면 학교 전체)</span></th>
								<th class="p-2.5 w-28">전형</th>
                                        <th class="p-2.5 text-center w-36 text-emerald-300">최저점 (합격선/필수)</th>
								<th class="p-2.5 text-center w-36 text-sky-300">최고 불합격점 (선택)</th>
                                        <th class="p-2.5 text-center w-36 text-amber-300">평균점 (선택)</th>
                                        <th class="p-2.5 text-center w-14">관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        } else {
            // 공식 공개 입결 데이터 탭 뷰
            const publicRowsHTML = publicOfficialData.map((p, index) => `
                <tr class="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors text-center">
                    <td class="p-2"><input type="text" inputmode="numeric" class="input-field py-1 px-2 text-xs text-center text-slate-300 w-20 public-year" value="${p.year}" aria-label="입학년도" /></td>
                    <td class="p-2"><input type="text" class="input-field py-1 px-2 text-xs font-bold text-white w-40 public-school" value="${p.school}" aria-label="고교명" /></td>
                    <td class="p-2"><input type="text" class="input-field py-1 px-2 text-xs text-indigo-300 w-28 public-dept" value="${p.dept === '공통' ? '' : p.dept}" placeholder="학교 전체" aria-label="학과" /></td>
                    <td class="p-2"><input type="text" class="input-field py-1 px-2 text-xs text-slate-300 w-24 public-track" value="${p.track}" aria-label="전형" /></td>
                    <td class="p-2"><input type="text" inputmode="decimal" class="input-field py-1 px-2 text-xs text-right font-bold text-emerald-300 w-20 public-min-score" value="${p.min}" aria-label="${p.school} 최저점" /></td>
                    <td class="p-2"><input type="text" inputmode="decimal" class="input-field py-1 px-2 text-xs text-right text-sky-300 w-20 public-max-score" value="${p.max}" aria-label="${p.school} 최고점" /></td>
                    <td class="p-2"><input type="text" inputmode="decimal" class="input-field py-1 px-2 text-xs text-right text-amber-300 w-20 public-avg-score" value="${p.avg}" aria-label="${p.school} 평균점" /></td>
                    <td class="p-2"><input type="text" class="input-field py-1 px-2 text-xs w-28 public-note" value="${p.note}" aria-label="${p.school} 출처 또는 구분" /></td>
                    <td class="p-3">
                        <button class="btn-secondary text-[11px] px-2.5 py-1 font-bold btn-apply-public-item" 
                                data-index="${index}">
                            내 커트라인 반영
                        </button>
                        <button class="text-danger/80 hover:text-danger ml-1 btn-delete-public-item" data-index="${index}" title="참고자료 행 삭제">🗑️</button>
                    </td>
                </tr>
            `).join('');

            schoolsHTML = `
                <div class="p-6 rounded-2xl bg-slate-800/70 border border-slate-700/60 space-y-4 shadow-lg">
                    <div class="flex items-center justify-between border-b border-slate-700/50 pb-3 flex-wrap gap-2">
                        <div>
                            <h3 class="font-bold text-white text-base flex items-center gap-2">
                                <span>📊</span> 울산광역시 고등학교 공식 공개 합격선 및 입결 데이터
                            </h3>
                            <p class="text-xs text-text-muted mt-1">공개된 자료를 직접 입력·수정해 참고용으로만 보관합니다. 자동 수집은 하지 않으며, 학과가 없으면 비워 두면 됩니다.</p>
                        </div>
                        <button id="addPublicDataBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold">➕ 공개자료 행 추가</button>
                    </div>

                    <div class="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-800/80 text-text-muted font-semibold text-center border-b border-slate-700/60">
                                <tr>
                                    <th class="p-2.5 w-24">입학년도</th>
                                    <th class="p-2.5 text-left pl-4">고교명</th>
                                    <th class="p-2.5 w-28">학과</th>
                                    <th class="p-2.5 w-24">전형</th>
                                    <th class="p-2.5 w-28 text-emerald-300">최저점</th>
                                    <th class="p-2.5 w-28 text-sky-300">최고점</th>
                                    <th class="p-2.5 w-28 text-amber-300">평균점</th>
                                    <th class="p-2.5 w-28">출처/구분</th>
                                    <th class="p-2.5 w-36">내 커트라인 반영</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${publicRowsHTML}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        app.innerHTML = `
            <div class="glass-card p-6 md:p-8 w-full mx-auto min-h-[85vh] space-y-6 fade-in" style="max-width: 1500px;">
                <!-- 1. 상단 타이틀 & 입학년도(입시년도) & 주요 액션 네비게이션 바 -->
                <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
                    <div>
                        <h1 class="text-2xl font-black text-white flex items-center gap-2.5">
                            <span>🎯</span> 고교별·학과별 입학 커트라인 통합 관리
                        </h1>
                        <p class="text-xs text-text-muted mt-1">
                            고교 입학년도별 최저(합격선)·최고·평균점을 한곳에서 편리하게 관리하고 학생 진학 상담 모달의 실시간 판정 기준으로 적용합니다.
                        </p>
                        <p class="text-xs text-indigo-300 mt-1.5 font-semibold">현재 입력 대상: ${currentAdmissionYear}학년도 (${currentAdmissionYear - 1}학년도 중3) · 연도를 바꾸면 해당 연도의 저장값만 표시됩니다.</p>
                    </div>

                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- 입학년도 (입시년도) 선택기: 헷갈림 완전 방지 -->
                        <div class="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-indigo-500/40 shadow-inner">
                            <label class="text-xs font-bold text-indigo-300 whitespace-nowrap">📅 고교 입학년도(입시년도):</label>
                            <select id="admissionYearSelect" class="bg-slate-800 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-slate-700 outline-none cursor-pointer">
                                ${admissionYears.map(year => `<option value="${year}" ${currentAdmissionYear === year ? 'selected' : ''}>${year}학년도 (${year - 1}학년도 중3${year - 1 === currentMiddleSchoolYear ? ' - 현재' : ''})</option>`).join('')}
                            </select>
                        </div>
                        <button id="setDefaultAdmissionYearBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold" title="다음에 커트라인 관리 화면을 열 때 기본으로 선택할 입학년도를 저장합니다.">
                            기본 연도 지정
                        </button>

                        <button id="saveAllCutoffsBtn" class="btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1.5 shadow-sm" style="width: auto;">
                            <span>💾</span> 커트라인 저장
                        </button>
                        <button id="exportBridgeCutoffBtn" class="text-xs bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/50 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors">
                            <span>📤</span> 서버 전송
                        </button>
                        <button id="importBridgeCutoffBtn" class="text-xs bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition-colors">
                            <span>📥</span> 서버 데이터 내려받기
                        </button>
                        <button id="backToAdminBtn" class="btn-secondary text-xs px-3.5 py-2 font-bold">
                            ← 대시보드
                        </button>
                    </div>
                </div>

                <!-- 2. 단일 페이지 카테고리 네비게이션 탭 바 -->
                <div class="flex items-center gap-2 border-b border-slate-700/60 pb-2 overflow-x-auto custom-scrollbar">
                    <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'all' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="all">
                        <span>🏷️</span> 전체 학교
                    </button>
                    <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'meister' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="meister">
                        <span>🏛️</span> 마이스터고
                    </button>
                    <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'special' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="special">
                        <span>🏭</span> 특성화고
                    </button>
                    <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'general' ? 'bg-primary text-white shadow-md' : 'bg-slate-800/60 text-slate-400 hover:text-white'}" data-tab="general">
                        <span>🏫</span> 후기 일반고
                    </button>
                    <button class="nav-tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'public' ? 'bg-amber-500 text-white shadow-md' : 'bg-amber-950/30 text-amber-300 border border-amber-500/30 hover:bg-amber-900/40'}" data-tab="public">
                        <span>📊</span> 고교 공식 공개 데이터 (참고자료)
                    </button>
                </div>

                <!-- 3. 학교별 커트라인 목록 (단일 페이지 1열 통합 레이아웃) -->
                <div class="space-y-5">
                    ${schoolsHTML}
                </div>
            </div>
        `;

        bindEvents();
    };

    const bindEvents = () => {
        // 입학년도 변경 이벤트
        document.getElementById('admissionYearSelect')?.addEventListener('change', (e) => {
            currentAdmissionYear = parseInt(e.target.value, 10);
            renderMainScreen();
        });

        document.getElementById('setDefaultAdmissionYearBtn')?.addEventListener('click', async () => {
            try {
                await window.go.main.App.UpdateAdmissionYear(currentAdmissionYear);
                alert(`${currentAdmissionYear}학년도를 기본 고교 입학년도로 지정했습니다. 기존 계정과 암호화 데이터는 변경되지 않습니다.`);
            } catch (err) {
                alert('기본 입학년도 저장 실패: ' + err);
            }
        });

        // 탭 전환 이벤트
        app.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentTab = btn.dataset.tab;
                renderMainScreen();
            });
        });

        // 행 삭제 이벤트
        app.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tr = e.target.closest('tr');
                if (tr) tr.remove();
            });
        });

        // 병합된 학과 셀을 수정하면 같은 학과의 모든 전형 행에도 저장용 값이 반영된다.
        app.querySelectorAll('.row-dept-name[data-dept-group]').forEach(input => {
            input.addEventListener('input', () => {
                const dept = input.value.trim();
                app.querySelectorAll(`.cutoff-item-row[data-dept-group="${input.dataset.deptGroup}"]`)
                    .forEach(row => { row.dataset.dept = dept; });
            });
        });

        // 학과·전형 추가 이벤트
        app.querySelectorAll('.btn-add-dept').forEach(btn => {
            btn.addEventListener('click', () => {
                const schName = btn.dataset.school;
                const scoreType = btn.dataset.type;
                const card = btn.closest('.school-cutoff-card');
                const tbody = card.querySelector('tbody');
                if (tbody) {
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors cutoff-item-row";
                    tr.dataset.school = schName;
                    tr.dataset.type = scoreType;
                    const unit = scoreType === 'percentile' ? '%' : '점';
                    tr.innerHTML = `
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs font-bold text-white row-dept-name" value="" placeholder="비우면 학교 전체" />
                        </td>
                        <td class="p-3">
                            <input type="text" class="input-field py-1.5 px-2.5 text-xs text-indigo-300 row-track-name" value="일반" placeholder="전형 (예: 일반)" />
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-bold text-emerald-300 w-24 row-min-score" 
                                       value="" placeholder="최저점" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-sky-300 w-24 row-max-score" 
                                       value="" placeholder="선택" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <div class="flex items-center justify-center gap-1">
                                <input type="text" inputmode="decimal" class="input-field py-1.5 px-2 text-xs text-right font-semibold text-amber-300 w-24 row-avg-score" 
                                       value="" placeholder="선택" />
                                <span class="text-xs text-slate-400">${unit}</span>
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            <button class="text-xs text-danger/80 hover:text-danger hover:bg-danger/10 p-1.5 rounded transition-colors btn-delete-row" title="행 삭제">🗑️</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                    tr.querySelector('.btn-delete-row').addEventListener('click', () => tr.remove());
                }
            });
        });

        // 공개 데이터 복사 적용 버튼
        app.querySelectorAll('.btn-apply-public-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('tr');
                const school = row.querySelector('.public-school')?.value.trim();
                const dept = row.querySelector('.public-dept')?.value.trim() || '';
                const track = row.querySelector('.public-track')?.value.trim() || '일반';
                const min = parseFloat(row.querySelector('.public-min-score')?.value);
                const max = parseFloat(row.querySelector('.public-max-score')?.value);
                const avg = parseFloat(row.querySelector('.public-avg-score')?.value);
                if (!school || !Number.isFinite(min) || min <= 0) {
                    alert('고교명과 최저 합격점을 먼저 입력해주세요.');
                    return;
                }
                const scoreType = school.includes('일반계고') ? 'percentile' : 'total_score';

                // 현재 목록에 즉시 추가/갱신 저장
                const newCutoff = {
                    year: currentAdmissionYear,
                    schoolName: school,
                    department: dept,
                    track: track,
                    scoreType: scoreType,
                    minValue: min,
                    maxValue: Number.isFinite(max) && max > 0 ? max : min,
                    avgValue: Number.isFinite(avg) && avg > 0 ? avg : 0
                };

                try {
                    await window.go.main.App.SaveCutoffs([newCutoff]);
                    allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                    alert(`[${school} - ${dept}(${track})] 공개 입결 데이터(최저 ${min} / 최고 ${max} / 평균 ${avg})가 ${currentAdmissionYear}학년도 커트라인으로 성공적으로 적용되었습니다!`);
                    currentTab = 'all';
                    renderMainScreen();
                } catch (err) {
                    alert('적용 실패: ' + err);
                }
            });
        });

        document.getElementById('saveAllCutoffsBtn')?.addEventListener('click', () => saveAllCutoffs(false));

        if (currentTab === 'public') {
            const savePublicData = () => {
                const rows = app.querySelectorAll('.btn-apply-public-item');
                publicOfficialData = publicOfficialData.map((item, index) => {
                    const button = [...rows].find(btn => Number(btn.dataset.index) === index);
                    const row = button?.closest('tr');
                    if (!row) return item;
                    return {
                        ...item,
                        year: parseInt(row.querySelector('.public-year')?.value, 10) || item.year,
                        school: row.querySelector('.public-school')?.value.trim() || item.school,
                        dept: row.querySelector('.public-dept')?.value.trim() || '',
                        track: row.querySelector('.public-track')?.value.trim() || '일반',
                        min: parseFloat(row.querySelector('.public-min-score')?.value) || item.min,
                        max: parseFloat(row.querySelector('.public-max-score')?.value) || item.max,
                        avg: parseFloat(row.querySelector('.public-avg-score')?.value) || item.avg,
                        note: row.querySelector('.public-note')?.value.trim() || item.note
                    };
                });
                localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
            };
            app.querySelectorAll('.public-year, .public-school, .public-dept, .public-track, .public-min-score, .public-max-score, .public-avg-score, .public-note').forEach(input => {
                input.addEventListener('change', savePublicData);
            });
            document.getElementById('addPublicDataBtn')?.addEventListener('click', () => {
                publicOfficialData.unshift({
                    year: currentAdmissionYear,
                    school: '',
                    dept: '',
                    track: '일반',
                    min: '',
                    max: '',
                    avg: '',
                    unit: '점',
                    note: '공식 공개자료'
                });
                localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                renderMainScreen();
            });
            app.querySelectorAll('.btn-delete-public-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = Number(btn.dataset.index);
                    publicOfficialData.splice(index, 1);
                    localStorage.setItem('publicOfficialCutoffData', JSON.stringify(publicOfficialData));
                    renderMainScreen();
                });
            });
        }

        // 1. 입학년도(입시년도) 변경 리스너
        document.getElementById('admissionYearSelect')?.addEventListener('change', (e) => {
            currentAdmissionYear = parseInt(e.target.value);
            renderMainScreen();
        });

        // 2. 전체 저장 함수
        const saveAllCutoffs = async (silent = false) => {
            const rows = app.querySelectorAll('.cutoff-item-row');
            const cutoffs = [];

            rows.forEach(tr => {
                const school = tr.dataset.school;
                const scoreType = tr.dataset.type;
				const dept = tr.querySelector('.row-dept-name')?.value.trim() ?? tr.dataset.dept ?? '';
                const track = tr.querySelector('.row-track-name')?.value.trim() || '일반';
                const minStr = tr.querySelector('.row-min-score')?.value.trim();
                const maxStr = tr.querySelector('.row-max-score')?.value.trim();
                const avgStr = tr.querySelector('.row-avg-score')?.value.trim();

                const minVal = parseFloat(minStr);
                const maxVal = parseFloat(maxStr);
                const avgVal = parseFloat(avgStr);

                if (!isNaN(minVal) && minVal > 0) {
                    cutoffs.push({
                        year: currentAdmissionYear,
                        schoolName: school,
                        department: dept,
                        track: track,
                        scoreType: scoreType,
                        minValue: minVal,
                        maxValue: !isNaN(maxVal) && maxVal > 0 ? maxVal : minVal,
                        avgValue: !isNaN(avgVal) && avgVal > 0 ? avgVal : 0
                    });
                }
            });

            if (cutoffs.length === 0) {
                if (!silent) alert('저장할 유효한 커트라인 점수가 없습니다. 최저 합격선을 입력해주세요.');
                return false;
            }

            try {
                await window.go.main.App.SaveCutoffs(cutoffs);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                if (!silent) {
                    alert(`${currentAdmissionYear}학년도 총 ${cutoffs.length}개의 고교·학과별 커트라인(최저/최고/평균)이 안전하게 저장되었습니다!`);
                }
                return true;
            } catch (err) {
                alert('저장 실패: ' + err);
                return false;
            }
        };

        // 3. 중앙 서버 전송
        document.getElementById('exportBridgeCutoffBtn')?.addEventListener('click', async () => {
            if (!confirm(`${currentAdmissionYear}학년도 제출 중학교명, 고등학교명, 학과(또는 전체), 최저 커트라인 점수만 제출합니다.\n학생·학급·교사 정보는 전송되지 않으며, 운영자 승인 전에는 공개되지 않습니다.\n\n계속하시겠습니까?`)) {
                return;
            }
            const btn = document.getElementById('exportBridgeCutoffBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> 전송 중...';

            try {
                await saveAllCutoffs(true);
                await window.go.main.App.SendCutoffsToBridge(currentAdmissionYear);
                alert('커트라인이 제출되었습니다. 운영자 승인 후 공개 자료에 반영됩니다.');
            } catch (err) {
                alert('서버 전송 실패: ' + err);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>📤</span> 서버 전송';
            }
        });

        // 4. 중앙 서버 데이터 내려받기
        document.getElementById('importBridgeCutoffBtn')?.addEventListener('click', async () => {
            const btn = document.getElementById('importBridgeCutoffBtn');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> 내려받는 중...';

            try {
                const count = await window.go.main.App.FetchCutoffsFromBridge(currentAdmissionYear);
                alert(`${currentAdmissionYear}학년도 중앙 서버에서 총 ${count}건의 커트라인 데이터를 성공적으로 내려받았습니다!`);
                allSavedCutoffs = await window.go.main.App.GetCutoffs() || [];
                renderMainScreen();
            } catch (err) {
                alert('서버 데이터 내려받기 실패: ' + err);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>📥</span> 서버 데이터 내려받기';
            }
        });

        // 5. 대시보드로 돌아가기
        document.getElementById('backToAdminBtn')?.addEventListener('click', () => {
            renderAdminScreen(schoolName);
        });
    };

    renderMainScreen();
}
