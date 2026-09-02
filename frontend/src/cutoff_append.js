
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
