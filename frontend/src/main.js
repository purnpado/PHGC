import './style.css';
import './app.css';

import { CheckSetupComplete, GetSchoolConfig, SaveSchoolConfig, VerifyAdminPassword, SyncWithServer, GetAppVersion, OpenExcelFile, ProcessExcel, GetClassStatus, GetClassGrades } from '../wailsjs/go/main/App';
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
        const admissionYear = new Date().getFullYear();
        await window.go.main.App.SetupApp({
            schoolName: schoolName,
            classCount: classCount,
            adminPassword: password,
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
                    <button id="syncBtn" class="btn-primary px-3 py-2 rounded-lg font-bold text-xs" style="width: auto;">
                        🔄 서버 동기화
                    </button>
                    <button id="resetYearBtn" class="text-warning border border-warning/30 hover:bg-warning/10 transition-colors cursor-pointer text-xs px-3 py-2 rounded-lg font-bold" style="width: auto;" title="커트라인은 유지하고 학생 데이터만 삭제">
                        📅 새 입시년도 전환
                    </button>
                    <button id="resetDataBtn" class="text-danger border border-danger/30 hover:bg-danger/10 transition-colors cursor-pointer text-xs px-3 py-2 rounded-lg font-bold" style="width: auto;">
                        전체 초기화
                    </button>
                    ` : ''}
                    <button id="backBtn" class="text-text-muted hover:text-white transition-colors cursor-pointer bg-transparent border-none text-xs px-3 py-2 rounded-lg hover:bg-slate-800">
                        ← 로그아웃
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
                        <h3 class="font-bold mb-2">📥 나이스 엑셀 데이터 연동</h3>
                        <p class="text-xs text-text-muted mb-4 line-clamp-3">
                            교과 성적, 출결, 봉사 파일을 각각 업로드하세요. 프로그램이 자동으로 '반'을 인식하여 쪼개어 저장합니다.
                        </p>
                        <div class="flex flex-col gap-2">
                            <button id="uploadExcelBtn" class="btn-primary w-full flex justify-center items-center gap-2 text-sm">
                                <span>교과성적 불러오기</span>
                            </button>
                            <div class="flex gap-2">
                                <button id="uploadAttendanceBtn" class="btn-secondary w-full flex justify-center items-center gap-1 text-xs">
                                    <span>출결 불러오기</span>
                                </button>
                                <button id="uploadVolunteerBtn" class="btn-secondary w-full flex justify-center items-center gap-1 text-xs">
                                    <span>봉사 불러오기</span>
                                </button>
                            </div>
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
                        <div class="desc">담임 및 뷰어 계정 비밀번호 설정</div>
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

    let classOptions = '';
    if (window.currentUser && window.currentUser.Role === 'homeroom') {
        // 담임인 경우 자기 반만 선택 가능
        const myClass = window.currentUser.ClassNum;
        classOptions = `<option value="${myClass}">${myClass}반</option>`;
        targetClassNum = myClass; // 강제로 타겟 클래스 변경
    } else {
        // 마스터나 뷰어는 전반 조회 가능
        for (let i = 1; i <= classCount; i++) {
            classOptions += `<option value="${i}">${i}반</option>`;
        }
    }

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
                        <span>🏫</span> 담당 학급을 선택해 주세요
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
                <div class="flex items-center gap-3">
                    <button id="classGridHomeBtn" class="btn-secondary whitespace-nowrap text-xs px-3 py-2 flex items-center gap-1.5" style="display: none;">
                        <span>🗂️</span> 학급 목록
                    </button>
                    <select id="classSelector" class="input-field" style="width: auto;" ${window.currentUser && window.currentUser.Role === 'homeroom' ? 'disabled' : ''}>
                        <option value="">-- 담당 학급 선택 --</option>
                        ${classOptions}
                    </select>
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

    // 학급 카드 클릭 시 학급 로드 함수
    const loadClass = async (classNum) => {
        if (!classNum) {
            document.getElementById('classGridHomeBtn').style.display = 'none';
            document.getElementById('teacherContent').innerHTML = getClassGridHTML();
            bindGridEvents();
            return;
        }

        document.getElementById('classGridHomeBtn').style.display = 'inline-flex';
        document.getElementById('classSelector').value = classNum;
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
        document.getElementById('classSelector').value = '';
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

    const classSelector = document.getElementById('classSelector');
    classSelector.addEventListener('change', (e) => {
        const classNum = parseInt(e.target.value);
        loadClass(classNum);
    });

    // 담임교사인 경우 본인 반 자동 선택
    if (targetClassNum) {
        loadClass(targetClassNum);
    }
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
    students.forEach((s) => {
        let generalBadge = '';
        if (s.Percentile <= 80) {
            generalBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 일반고 안정 (${s.Percentile.toFixed(1)}%)</span>`;
        } else if (s.Percentile <= 90) {
            generalBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 일반고 경계 (${s.Percentile.toFixed(1)}%)</span>`;
        } else {
            generalBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 일반고 불안 (${s.Percentile.toFixed(1)}%)</span>`;
        }

        tbody += `
            <tr class="hover:bg-slate-800/60 transition-colors border-b border-slate-700/50">
                <td class="p-4 text-center font-medium text-slate-400">${s.StudentNum || '-'}</td>
                <td class="p-4 font-bold text-white text-center text-lg cursor-pointer hover:underline text-student-name"
                    data-class="${classNum}" data-num="${s.StudentNum}" data-name="${s.Name}">
                    ${s.Name}
                </td>
                <td class="p-4 text-center">${generalBadge}</td>
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
                        <th class="p-4 font-semibold text-center">후기 일반계고 지원 가이드</th>
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

    // 학생 상담 버튼 및 이름 클릭 이벤트 바인딩 (인라인 onclick 대신 안정적인 리스너 바인딩)
    document.querySelectorAll('.btn-student-counsel, .text-student-name').forEach(el => {
        el.addEventListener('click', (e) => {
            const target = e.currentTarget;
            const cNum = parseInt(target.dataset.class);
            const sNum = target.dataset.num;
            const sName = target.dataset.name;
            openStudentModal(cNum, sNum, sName);
        });
    });
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
    
    data.schoolResults.forEach(r => {
        // 커트라인 찾기
        let cutoffMin = null;
        let cutoffMax = null;
        if (cutoffs && cutoffs.length > 0) {
            const found = cutoffs.find(c => c.schoolName.includes(r.schoolName.substring(0, 4)) && c.track.includes(r.trackName));
            if (found) {
                cutoffMin = found.minValue;
                cutoffMax = found.maxValue;
            }
        }

        // 합격 가능성 판단
        let statusBadge = '';
        let gaugeColor = 'bg-primary';
        let pct = (r.totalScore / r.totalMax) * 100;
        
        if (cutoffMin && cutoffMin > 0) {
            if (r.totalScore >= cutoffMin + 5) {
                statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-success/20 text-success border border-success/30">🟢 안정권</span>';
                gaugeColor = 'bg-success';
            } else if (r.totalScore >= cutoffMin) {
                statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning/20 text-warning border border-warning/30">🟡 적정/경계</span>';
                gaugeColor = 'bg-warning';
            } else {
                statusBadge = '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger/20 text-danger border border-danger/30">🔴 소신/주의</span>';
                gaugeColor = 'bg-danger';
            }
        } else {
            // 커트라인 데이터가 아직 없으면 점수 비율로 표시
            statusBadge = `<span class="text-xs text-text-muted">만점의 ${pct.toFixed(1)}%</span>`;
        }

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
            <div class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-white text-base">${r.schoolName}</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">${r.trackName}전형</span>
                    </div>
                    <div>${statusBadge}</div>
                </div>

                <div class="flex items-baseline justify-between">
                    <div class="text-xs text-text-muted">
                        교과 ${r.allSubjectScore.toFixed(1)}${r.weightedScore > 0 ? ` + 가중치 ${r.weightedScore.toFixed(1)}` : ''} 
                        | 출결 ${r.attendanceScore.toFixed(1)} | 봉사 ${r.volunteerScore.toFixed(1)}
                        ${weightDetailText}
                    </div>
                    <div class="text-lg font-black text-white">
                        ${r.totalScore.toFixed(2)} <span class="text-xs text-slate-400 font-normal">/ ${r.totalMax}점</span>
                    </div>
                </div>

                <!-- 게이지 바 -->
                <div class="w-full bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                    <div class="${gaugeColor} h-2.5 rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(5, pct))}%;"></div>
                </div>

                ${cutoffMin ? `
                <div class="flex justify-between text-[11px] text-slate-400 pt-0.5">
                    <span>최근 커트라인: ${cutoffMin}점 ~ ${cutoffMax}점</span>
                    <span>차이: <strong class="${r.totalScore >= cutoffMin ? 'text-success' : 'text-danger'}">${(r.totalScore - cutoffMin) >= 0 ? '+' : ''}${(r.totalScore - cutoffMin).toFixed(2)}점</strong></span>
                </div>
                ` : ''}
            </div>
        `;
    });

    const extra = data.extraData || {};

    modalEl.innerHTML = `
        <div class="glass-card p-6 md:p-8 w-full max-w-4xl max-h-[92vh] overflow-y-auto space-y-6 print-modal" id="printReportArea">
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
                    <div class="text-xs text-text-muted mb-1">미인정 결석</div>
                    <div class="text-xl font-bold ${data.absenceDays > 0 ? 'text-danger' : 'text-success'}">${data.absenceDays}일</div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">인정 봉사시간</div>
                    <div class="text-xl font-bold text-white">${data.totalVolunteerHours}시간 <span class="text-[11px] text-slate-400 font-normal">(기본${data.volunteerHours}+추가${data.addVolunteerHours})</span></div>
                </div>
                <div class="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <div class="text-xs text-text-muted mb-1">일반고 추정 백분율</div>
                    <div class="text-xl font-bold text-success">${data.generalHSPercentile.toFixed(1)}%</div>
                </div>
            </div>

            <!-- 2. 수기 입력 가산점 영역 (담임용) -->
            <div class="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-sm text-indigo-300 flex items-center gap-1.5">
                        ✏️ 9/30까지 추가사항 및 비교과 가산점 수기 입력 (담임 체크)
                    </h3>
                    <button id="saveExtraBtn" class="btn-primary text-xs px-3 py-1.5 font-bold no-print">
                        💾 저장 후 재계산
                    </button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                        <label class="block text-slate-400 mb-1">추가 봉사시간 (9/30까지)</label>
                        <div class="flex items-center gap-1.5">
                            <input type="number" id="inputAddVolunteer" min="0" max="100" class="input-field text-center py-1.5"
                                   value="${data.addVolunteerHours || 0}" style="width: 80px;" />
                            <span class="text-slate-300">시간 추가</span>
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-400 mb-1">창의적체험활동 (임원/반장)</label>
                        <div class="flex items-center gap-3 pt-1">
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" id="checkChangche1" ${extra['changche_1'] ? 'checked' : ''} /> 1학년
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" id="checkChangche2" ${extra['changche_2'] ? 'checked' : ''} /> 2학년
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" id="checkChangche3" ${extra['changche_3'] ? 'checked' : ''} /> 3학년
                            </label>
                        </div>
                    </div>

                    <div>
                        <label class="block text-slate-400 mb-1">행동발달상황 (학교장 표창)</label>
                        <div class="flex items-center gap-3 pt-1">
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" id="checkHaengbal1" ${extra['haengbal_1'] ? 'checked' : ''} /> 1학년
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" id="checkHaengbal2" ${extra['haengbal_2'] ? 'checked' : ''} /> 2학년
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" id="checkHaengbal3" ${extra['haengbal_3'] ? 'checked' : ''} /> 3학년
                            </label>
                        </div>
                    </div>
                </div>
            </div>

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

    // 수기 가산점 저장
    document.getElementById('saveExtraBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveExtraBtn');
        btn.disabled = true;
        btn.textContent = '저장 중...';

        const addVol = parseInt(document.getElementById('inputAddVolunteer').value) || 0;
        const newExtra = {
            add_volunteer: addVol,
            changche_1: document.getElementById('checkChangche1').checked,
            changche_2: document.getElementById('checkChangche2').checked,
            changche_3: document.getElementById('checkChangche3').checked,
            haengbal_1: document.getElementById('checkHaengbal1').checked,
            haengbal_2: document.getElementById('checkHaengbal2').checked,
            haengbal_3: document.getElementById('checkHaengbal3').checked,
        };

        try {
            await window.go.main.App.SaveStudentExtra(classNum, studentNum, name, JSON.stringify(newExtra));
            // 새로고침하여 재계산된 모달 띄우기
            const updated = await window.go.main.App.GetStudentFullDetail(classNum, studentNum, name);
            renderStudentModalContent(modalEl, classNum, studentNum, name, updated, cutoffs);
        } catch (err) {
            alert('저장 실패: ' + err);
            btn.disabled = false;
            btn.textContent = '💾 저장 후 재계산';
        }
    });

    // 인쇄/PDF 저장
    document.getElementById('printReportBtn').addEventListener('click', () => {
        window.print();
    });
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
                        return `<span class="text-success font-bold" title="최저선: ${foundCutoff.minValue}점 (안정)">🟢 ${r.totalScore.toFixed(0)}</span>`;
                    } else if (r.totalScore >= foundCutoff.minValue) {
                        return `<span class="text-warning font-bold" title="최저선: ${foundCutoff.minValue}점 (경계)">🟡 ${r.totalScore.toFixed(0)}</span>`;
                    } else {
                        return `<span class="text-danger font-bold" title="최저선: ${foundCutoff.minValue}점 (주의)">🔴 ${r.totalScore.toFixed(0)}</span>`;
                    }
                }
                return `<span class="text-slate-300 font-medium">${r.totalScore.toFixed(0)}점</span>`;
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
                    <td class="p-2.5 font-bold whitespace-nowrap">${general} <span class="text-[11px] text-slate-400">(${s.generalHSPercentile.toFixed(1)}%)</span></td>
                </tr>
            `;
        });

        modalEl.innerHTML = `
            <div class="glass-card p-6 md:p-8 w-full max-w-[1760px] max-h-[92vh] overflow-y-auto space-y-5">
                <div class="flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <div>
                        <h2 class="text-2xl font-black text-white flex items-center gap-2">
                            📊 ${classNum}반 전체 관내 고교별 진학 신호등 매트릭스
                        </h2>
                        <p class="text-xs text-text-muted mt-1">학생 이름을 클릭하면 해당 학생의 세부 상담창으로 즉시 이동합니다. (초록: 안정 / 노랑: 경계 / 빨강: 주의 ※ 실기고사를 치르는 학교는 제외)</p>
                    </div>
                    <button id="closeMatrixBtn" class="text-slate-400 hover:text-white p-2 text-xl font-bold bg-transparent border-none cursor-pointer">✕</button>
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
                    <button id="matrixPrintBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold">🖨️ 매트릭스 인쇄</button>
                </div>
            </div>
        `;

        document.getElementById('closeMatrixBtn').addEventListener('click', () => modalEl.remove());
        document.getElementById('matrixPrintBtn').addEventListener('click', () => window.print());

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
async function checkUpdateOnStartup() {
    try {
        if (window.go?.main?.App?.SyncWithServer) {
            const result = await window.go.main.App.SyncWithServer();
            if (result && result.hasUpdate) {
                showStartupUpdateModal(result);
            }
        }
    } catch (e) {
        console.log("시작 시 업데이트 확인 건너뜀:", e);
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
            const config = await GetSchoolConfig();
            renderLoginScreen(config.schoolName);
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
                            <textarea id="fbContent" class="input-field min-h-[150px] resize-none" placeholder="자세한 내용을 적어주세요..." required></textarea>
                        </div>
                        <div>
                            <label class="block text-sm text-text-muted mb-1">사진 첨부 (선택)</label>
                            <input type="file" id="fbImage" accept="image/*" class="w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer">
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

            <div class="p-4 border-t border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-800/30 rounded-b-2xl gap-3">
                <div class="text-xs text-text-muted">입력한 커트라인은 로컬 DB에 자동 저장됩니다.</div>
                <div class="flex items-center gap-2">
                    <button id="importCutoffBtn" class="btn-secondary text-xs px-3 py-1.5 font-bold flex items-center gap-1.5" style="width: auto;">
                        <span>📥</span> 서버 데이터 내려받기
                    </button>
                    <button id="exportCutoffBtn" class="btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1.5" style="width: auto; box-shadow: none;">
                        <span>📤</span> 중앙 서버로 전송
                    </button>
                </div>
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

    const importBtn = e.target.closest('#importCutoffBtn');
    if (importBtn) {
        handleImportCutoff();
    }
});

async function loadCutoffForm(selectedCategory = 'all') {
    const container = document.getElementById('cutoffFormContainer');
    const year = parseInt(document.getElementById('cutoffYearSelect').value);
    
    container.innerHTML = '<div class="text-center py-10"><span class="spinner"></span> 데이터를 불러오는 중...</div>';

    try {
        // 1. 고교 목록 가져오기
        let highschoolsList = [];
        try {
            const data = await window.go.main.App.GetHighSchoolsData();
            if (data && data.schools && data.schools.length > 0) {
                highschoolsList = data.schools;
            }
        } catch (e) {
            console.warn("GetHighSchoolsData 실패, 기본 목록 사용:", e);
        }

        if (highschoolsList.length === 0) {
            highschoolsList = [
                { name: "울산 후기 일반계고", type: "일반계고", area: "울산전역", departments: ["공통"] },
                { name: "울산마이스터고등학교", type: "마이스터고", area: "북구", departments: ["정밀기계과", "자동화시스템과", "전기시스템제어과"] },
                { name: "울산에너지고등학교", type: "마이스터고", area: "북구", departments: ["전기에너지과", "신재생에너지과"] },
                { name: "현대공업고등학교", type: "마이스터고", area: "동구", departments: ["정밀기계과", "산업설비과", "전기제어과"] },
                { name: "울산상업고등학교", type: "특성화고", area: "중구", departments: ["군사경영과", "물류경영과", "IT콘텐츠과"] },
                { name: "울산여자상업고등학교", type: "특성화고", area: "남구", departments: ["관광경영과", "SNS마케팅과", "AI금융회계과", "스마트공공행정과"] },
                { name: "울산생활과학고등학교", type: "특성화고", area: "동구", departments: ["보건간호과", "조리과", "사무행정과"] },
                { name: "울산공업고등학교", type: "특성화고", area: "남구", departments: ["건축과", "기계과", "전기과", "전자통신과", "토목과", "화공과"] }
            ];
        }

        // 2. 저장된 커트라인 데이터 가져오기
        const savedCutoffs = await window.go.main.App.GetCutoffs().catch(() => []);
        const savedMap = {};
        if (savedCutoffs) {
            savedCutoffs.forEach(c => {
                if (c.year === year) {
                    savedMap[`${c.schoolName}_${c.department}_${c.track}`] = c;
                }
            });
        }

        // 3. 학교 유형별 분리
        const meisterSchools = highschoolsList.filter(s => s.type === '마이스터고');
        const specializedSchools = highschoolsList.filter(s => s.type === '특성화고');
        const generalSchools = highschoolsList.filter(s => s.type === '일반계고');

        // 상단 카테고리 탭 UI
        let html = `
            <div class="flex items-center gap-2 mb-5 pb-3 border-b border-slate-700/60 overflow-x-auto">
                <button class="cutoff-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === 'all' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}" data-category="all">
                    전체 보기
                </button>
                <button class="cutoff-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === 'meister' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}" data-category="meister">
                    🎓 마이스터고 (${meisterSchools.length})
                </button>
                <button class="cutoff-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === 'specialized' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}" data-category="specialized">
                    🛠️ 특성화고 (${specializedSchools.length})
                </button>
                <button class="cutoff-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedCategory === 'general' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}" data-category="general">
                    🏫 후기 일반계고 (${generalSchools.length})
                </button>
            </div>
            <div class="space-y-6">
        `;

        // 학교 카드 렌더링 헬퍼 함수 (원서대장 맞춤형: 학교 공통행 + 학과별 행 정규 테이블)
        const renderSchoolCard = (school, tracks) => {
            const depts = school.departments && school.departments.length > 0 ? school.departments : ["공통"];

            let cardHtml = `
                <div class="bg-slate-800/60 p-4 sm:p-5 rounded-xl border border-slate-700/60 space-y-3">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-700/40">
                        <h4 class="font-bold text-white text-base flex items-center gap-2">
                            ${school.name}
                            <span class="text-[11px] text-primary bg-primary/15 px-2.5 py-0.5 rounded-full font-semibold border border-primary/30">${school.type}</span>
                        </h4>
                        <span class="text-xs text-slate-400 font-medium">${school.area || ''}</span>
                    </div>
            `;

            if (school.type === '일반계고') {
                const key = `${school.name}_공통_일반계고`;
                const saved = savedMap[key] || savedMap[`${school.name}_공통_일반`] || { minValue: '' };
                cardHtml += `
                    <div class="flex items-center justify-between bg-slate-900/60 p-3.5 rounded-lg border border-slate-700/40">
                        <div>
                            <div class="font-bold text-sm text-emerald-300">📌 후기 일반계고 합격선 전망치(%)</div>
                            <div class="text-[11px] text-text-muted mt-0.5">중학교 원서대장 및 진학 전망치 입력 (예: 85.0% - 낮을수록 상위권)</div>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-text-muted font-bold">합격선(%)</span>
                            <input type="number" step="0.1" min="0" max="100" class="cutoff-input w-28 text-right bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-white font-bold focus:ring-1 focus:ring-primary outline-none" placeholder="예: 85.0" value="${saved.minValue || ''}" data-school="${school.name}" data-dept="공통" data-track="일반계고" data-type="percentile">
                        </div>
                    </div>
                `;
            } else {
                // 마이스터고 및 특성화고: 학교 공통 + 학과별 정규 테이블
                cardHtml += `
                    <div class="overflow-x-auto rounded-lg border border-slate-700/50 bg-slate-900/40">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr class="bg-slate-800/90 text-text-muted border-b border-slate-700/70">
                                    <th class="p-2.5 font-bold text-slate-300 w-44">학과 구분</th>
                `;

                tracks.forEach(track => {
                    const isEmployment = track.includes('취업');
                    const isSpecial = track.includes('특별');
                    let trackBadgeColor = 'text-slate-300';
                    if (isEmployment) trackBadgeColor = 'text-emerald-400';
                    else if (isSpecial) trackBadgeColor = 'text-amber-400';

                    cardHtml += `<th class="p-2.5 font-bold text-center ${trackBadgeColor}">${track} 최저점</th>`;
                });

                cardHtml += `
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-800">
                                <!-- 1) 학교 전체 공통 행 (원서대장에 과 구분이 없을 때) -->
                                <tr class="bg-indigo-950/20 hover:bg-indigo-950/40 transition-colors">
                                    <td class="p-2.5 font-bold text-indigo-300 flex items-center gap-1.5">
                                        <span>📌</span> 학교 전체 공통 (과 미구분 시)
                                    </td>
                `;

                tracks.forEach(track => {
                    const commonKey = `${school.name}_공통_${track}`;
                    const saved = savedMap[commonKey] || { minValue: '' };
                    cardHtml += `
                        <td class="p-2 text-center">
                            <input type="number" step="0.01" class="cutoff-input w-28 text-right bg-slate-800 border border-indigo-500/40 rounded px-2 py-1 text-xs text-indigo-200 font-bold focus:ring-1 focus:ring-primary outline-none inline-block" placeholder="학교최저점" value="${saved.minValue || ''}" data-school="${school.name}" data-dept="공통" data-track="${track}" data-type="total_score">
                        </td>
                    `;
                });

                cardHtml += `</tr>`;

                // 2) 학과별 세부 행 (원서대장에 학과가 명시되어 있을 때)
                depts.forEach(dept => {
                    cardHtml += `
                        <tr class="hover:bg-slate-800/40 transition-colors">
                            <td class="p-2.5 font-semibold text-slate-200">${dept}</td>
                    `;

                    tracks.forEach(track => {
                        const key = `${school.name}_${dept}_${track}`;
                        const saved = savedMap[key] || { minValue: '' };
                        cardHtml += `
                            <td class="p-2 text-center">
                                <input type="number" step="0.01" class="cutoff-input w-28 text-right bg-slate-700/80 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:ring-1 focus:ring-primary outline-none inline-block" placeholder="학과최저점" value="${saved.minValue || ''}" data-school="${school.name}" data-dept="${dept}" data-track="${track}" data-type="total_score">
                            </td>
                        `;
                    });

                    cardHtml += `</tr>`;
                });

                cardHtml += `
                            </tbody>
                        </table>
                    </div>
                `;
            }

            cardHtml += `</div>`;
            return cardHtml;
        };

        // 1) 🎓 마이스터고 섹션 (하위: 일반전형 / 특별전형)
        if (selectedCategory === 'all' || selectedCategory === 'meister') {
            html += `
                <div class="space-y-3">
                    <div class="flex items-center gap-2 text-sm font-black text-amber-400 bg-amber-950/20 px-3 py-2 rounded-lg border border-amber-500/20">
                        <span>🎓 마이스터고</span>
                        <span class="text-xs text-slate-400 font-normal">(하위 전형: 일반전형 / 특별전형)</span>
                    </div>
                    ${meisterSchools.map(s => renderSchoolCard(s, ['일반전형', '특별전형'])).join('')}
                </div>
            `;
        }

        // 2) 🛠️ 특성화고 섹션 (하위: 일반전형 / 취업희망자 특별전형)
        if (selectedCategory === 'all' || selectedCategory === 'specialized') {
            html += `
                <div class="space-y-3">
                    <div class="flex items-center gap-2 text-sm font-black text-indigo-400 bg-indigo-950/20 px-3 py-2 rounded-lg border border-indigo-500/20">
                        <span>🛠️ 특성화고</span>
                        <span class="text-xs text-slate-400 font-normal">(하위 전형: 일반전형 / 취업희망자 특별전형)</span>
                    </div>
                    ${specializedSchools.map(s => renderSchoolCard(s, ['일반전형', '취업희망자 특별전형'])).join('')}
                </div>
            `;
        }

        // 3) 🏫 후기 일반계고 섹션
        if (selectedCategory === 'all' || selectedCategory === 'general') {
            html += `
                <div class="space-y-3">
                    <div class="flex items-center gap-2 text-sm font-black text-emerald-400 bg-emerald-950/20 px-3 py-2 rounded-lg border border-emerald-500/20">
                        <span>🏫 후기 일반계고</span>
                        <span class="text-xs text-slate-400 font-normal">(석차백분율 기준 커트라인 설정)</span>
                    </div>
                    ${generalSchools.map(s => renderSchoolCard(s, ['일반계고'])).join('')}
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;

        // 탭 버튼 클릭 이벤트 바인딩
        document.querySelectorAll('.cutoff-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = e.target.dataset.category;
                loadCutoffForm(cat);
            });
        });

        // 자동 저장 리스너 바인딩
        document.querySelectorAll('.cutoff-input').forEach(input => {
            input.addEventListener('change', async () => {
                await saveCutoffData(year);
            });
        });

    } catch (err) {
        container.innerHTML = `<div class="text-danger py-10 text-center font-bold">데이터 로드 실패: ${err}</div>`;
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
        btn.innerHTML = '<span>📤</span> 중앙 서버로 전송';
    }
}

async function handleImportCutoff() {
    const btn = document.getElementById('importCutoffBtn');
    const year = parseInt(document.getElementById('cutoffYearSelect').value);

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 내려받는 중...';

    try {
        const count = await window.go.main.App.FetchCutoffsFromBridge(year);
        alert(`중앙 서버에서 총 ${count}건의 ${year}학년도 커트라인 데이터를 성공적으로 내려받았습니다!`);
        await loadCutoffForm();
    } catch(e) {
        alert('서버 데이터 내려받기 실패: ' + e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📥</span> 서버 데이터 내려받기';
    }
}

// ===== 로그인 화면 =====
export async function renderLoginScreen(schoolName) {
    app.className = '';
    try {
        const users = await window.go.main.App.GetUsers();
        let localVer = '0.5.5';
        try {
            localVer = await window.go.main.App.GetAppVersion();
        } catch (e) {
            console.warn(e);
        }
        
        let adminOptions = '';
        let viewerOptions = '';
        let teacherOptions = '';

        users.forEach(u => {
            if (u.Role === 'master') {
                adminOptions += `<option value="${u.Username}">마스터 (${u.Username})</option>`;
            } else if (u.Role === 'viewer') {
                viewerOptions += `<option value="${u.Username}">뷰어 (${u.Username})</option>`;
            } else if (u.Role === 'homeroom') {
                teacherOptions += `<option value="${u.Username}">${u.ClassNum}반 담임</option>`;
            }
        });

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
                        <select id="loginUsername" class="input-field cursor-pointer py-2 text-xs">
                            <optgroup label="관리자">
                                ${adminOptions}
                            </optgroup>
                            <optgroup label="뷰어(조회 전용)">
                                ${viewerOptions}
                            </optgroup>
                            <optgroup label="담임 교사">
                                ${teacherOptions}
                            </optgroup>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-text-muted mb-1.5">비밀번호</label>
                        <input type="password" id="loginPassword" class="input-field py-2 text-xs" placeholder="비밀번호 입력" required />
                    </div>
                    <div class="pt-2">
                        <button type="submit" id="loginBtn" class="btn-primary py-2 text-xs font-bold">로그인</button>
                    </div>
                    <div id="loginError" class="error-msg text-center text-xs"></div>
                </form>

                <!-- 현재 설치된 버전 및 업데이트 확인 영역 -->
                <div class="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-text-muted">
                    <div>현재 버전: <strong class="text-indigo-300 font-mono font-bold">v${localVer}</strong></div>
                    <button id="manualUpdateCheckBtn" type="button" class="text-primary hover:underline bg-transparent border-none cursor-pointer flex items-center gap-1 font-bold text-xs">
                        <span>🔄</span> 업데이트 확인
                    </button>
                </div>
            </div>
        `;

        document.getElementById('manualUpdateCheckBtn').addEventListener('click', async () => {
            const btn = document.getElementById('manualUpdateCheckBtn');
            btn.innerHTML = '<span class="spinner"></span> 확인 중...';
            try {
                const res = await window.go.main.App.SyncWithServer();
                if (res && res.hasUpdate) {
                    showStartupUpdateModal(res);
                } else {
                    alert(`현재 최신 버전(v${localVer})을 사용하고 계십니다!`);
                }
            } catch (err) {
                alert('업데이트 확인 실패: ' + err);
            } finally {
                btn.innerHTML = '<span>🔄</span> 업데이트 확인';
            }
        });

        document.getElementById('loginPassword').focus();
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const btn = document.getElementById('loginBtn');
            const errorDiv = document.getElementById('loginError');
            
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span>확인 중...';
            errorDiv.classList.remove('show');

            try {
                const user = await window.go.main.App.VerifyUserLogin(username, password);
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
                let roleLabel = '관리자';
                if (u.Role === 'homeroom') roleLabel = `${u.ClassNum}반 담임`;
                else if (u.Role === 'viewer') roleLabel = '진학/학년부장 (뷰어)';

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
