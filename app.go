package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/bcrypt"
)

// 브릿지 서버 주소 (배포 환경에 맞게 수정)
const BridgeServerURL = "https://go.gguk.link"

// App struct
type App struct {
	ctx  context.Context
	db   *DBManager
	sync *SyncManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	dbm := NewDBManager()
	return &App{
		db:   dbm,
		sync: NewSyncManager(dbm.dataDir),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// config DB 초기화
	if err := a.db.InitConfigDB(); err != nil {
		fmt.Println("config DB 초기화 오류:", err)
	}
}

// --- 프론트엔드 바인딩 API ---

// CheckSetupComplete 초기 설정 완료 여부 확인
func (a *App) CheckSetupComplete() bool {
	return a.db.HasConfig()
}

// GetSchoolConfig 학교 설정 조회
func (a *App) GetSchoolConfig() (*SchoolConfig, error) {
	return a.db.GetSchoolConfig()
}

// SetupApp 초기 설정 저장
func (a *App) SetupApp(req SetupRequest) error {
	if req.SchoolName == "" || req.ClassCount <= 0 || req.AdminPassword == "" {
		return fmt.Errorf("모든 설정 값을 올바르게 입력해주세요")
	}

	// 비밀번호 해싱 및 설정 저장
	hashedPwd, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("비밀번호 암호화 실패: %w", err)
	}

	// DB에 설정 저장 (입학년도 포함)
	err = a.db.SaveSchoolConfig(req.SchoolName, req.ClassCount, string(hashedPwd), req.IsSmallSchool, req.AdmissionYear)
	if err != nil {
		return fmt.Errorf("설정 저장 실패: %w", err)
	}

	// 사용자 초기 계정 생성 (마스터, 뷰어, 담임) - 비밀번호는 비워둠
	err = a.db.InitUsers(req.ClassCount, req.AdminPassword)
	if err != nil {
		return fmt.Errorf("초기 계정 생성 실패: %w", err)
	}

	return nil
}

// VerifyUserLogin 검증
func (a *App) VerifyUserLogin(username, password string) (*User, error) {
	return a.db.VerifyUserLogin(username, password)
}

// ChangeUserPassword 비밀번호 변경
func (a *App) ChangeUserPassword(username, newPassword string) error {
	return a.db.ChangeUserPassword(username, newPassword)
}

// GetUsers 사용자 목록 조회
func (a *App) GetUsers() ([]User, error) {
	return a.db.GetUsers()
}

// SetUserPassword 특정 사용자 비밀번호 설정 (관리자용)
func (a *App) SetUserPassword(username, newPassword string) error {
	return a.db.SetUserPassword(username, newPassword)
}

// AddViewerUser 뷰어 계정 추가 (관리자용)
func (a *App) AddViewerUser(username, newPassword string) error {
	return a.db.AddViewerUser(username, newPassword)
}

// VerifyAdminPassword 관리자 비밀번호 검증
func (a *App) VerifyAdminPassword(password string) (bool, error) {
	return a.db.VerifyAdminPassword(password)
}

// --- 동기화 API ---

// SyncWithServer Gitea 서버와 동기화 실행
func (a *App) SyncWithServer() *SyncResult {
	return a.sync.FullSync()
}

// GetAppVersion 현재 앱 버전 반환
func (a *App) GetAppVersion() string {
	return AppVersion
}

// --- 엑셀 임포트 API ---

// OpenExcelFile 파일 선택 다이얼로그 열기
func (a *App) OpenExcelFile() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "나이스 성적 엑셀 파일 선택",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Data Files (*.xlsx, *.xls, *.csv)",
				Pattern:     "*.xlsx;*.xls;*.csv",
			},
		},
	})
	return filePath, err
}

// ProcessExcel 엑셀 파일을 읽고 분할 저장 (반환값: 각 반별 업데이트된 학생 수 맵)
func (a *App) ProcessExcel(filePath string) (map[int]int, error) {
	if filePath == "" {
		return nil, fmt.Errorf("파일이 선택되지 않았습니다")
	}

	classData, err := ParseExcel(filePath)
	if err != nil {
		return nil, err
	}

	result := make(map[int]int)

	for classNum, students := range classData {
		err := a.db.SaveClassStudents(classNum, students)
		if err != nil {
			return nil, fmt.Errorf("%d반 데이터 저장 실패: %w", classNum, err)
		}
		result[classNum] = len(students)
	}

	return result, nil
}

// GetClassStatus 전체 학급의 데이터 저장 현황(학생 수) 반환
func (a *App) GetClassStatus(classCount int) map[int]int {
	status := make(map[int]int)
	for i := 1; i <= classCount; i++ {
		status[i] = a.db.GetClassStudentCount(i)
	}
	return status
}

// --- 고입 커트라인 관리 ---

func (a *App) SaveCutoffs(cutoffs []CutoffInfo) error {
	return a.db.SaveCutoffs(cutoffs)
}

func (a *App) GetCutoffs() ([]CutoffInfo, error) {
	return a.db.GetCutoffs()
}

// --- 브릿지 서버(피드백 및 크라우드소싱) API ---

func (a *App) SendCutoffsToBridge(year int) error {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return err
	}
	
	cutoffs, err := a.db.GetCutoffs()
	if err != nil {
		return err
	}

	var yearData []CutoffInfo
	for _, c := range cutoffs {
		if c.Year == year {
			yearData = append(yearData, c)
		}
	}

	if len(yearData) == 0 {
		return fmt.Errorf("해당 연도의 데이터가 없습니다")
	}

	payload := map[string]interface{}{
		"schoolName": config.SchoolName,
		"year":       year,
		"data":       yearData,
	}
	
	jsonBytes, _ := json.Marshal(payload)
	resp, err := http.Post(BridgeServerURL+"/api/cutoff", "application/json", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("서버 오류: %s", string(b))
	}
	return nil
}

func (a *App) SubmitFeedback(title, content, email, attachmentName, attachmentB64 string) (int, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return 0, err
	}

	payload := map[string]interface{}{
		"schoolName":     config.SchoolName,
		"email":          email,
		"title":          title,
		"content":        content,
		"attachmentName": attachmentName,
		"attachmentB64":  attachmentB64,
	}

	jsonBytes, _ := json.Marshal(payload)
	resp, err := http.Post(BridgeServerURL+"/api/feedback", "application/json", bytes.NewBuffer(jsonBytes))
	if err != nil {
		return 0, fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("서버 오류: %s", string(b))
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	issueID := int(result["issue_id"].(float64))
	
	// 로컬 DB에 기록 저장
	a.db.SaveFeedbackIssue(issueID, title)

	return issueID, nil
}

func (a *App) GetLocalFeedbacks() ([]FeedbackIssue, error) {
	return a.db.GetFeedbackIssues()
}

func (a *App) GetFeedbackDetails(issueID int) (map[string]interface{}, error) {
	resp, err := http.Get(fmt.Sprintf("%s/api/feedback/%d", BridgeServerURL, issueID))
	if err != nil {
		return nil, fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("이슈 정보를 가져올 수 없습니다 (상태코드: %d)", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

// GetClassGrades 특정 반의 내신 성적 가산출 결과 반환
func (a *App) GetClassGrades(classNum int) ([]StudentCalcResult, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return nil, fmt.Errorf("설정을 불러올 수 없습니다: %w", err)
	}

	// 1. 전체 학생 데이터 불러오기 (전교 석차 산출을 위함)
	allStudents, err := a.db.GetAllStudents(config.ClassCount)
	if err != nil {
		return nil, fmt.Errorf("학생 데이터를 불러오는 중 오류 발생: %w", err)
	}

	// 2. 성적 산출 및 석차 백분율 계산
	calcResults, err := CalculateGrades(allStudents, config.IsSmallSchool)
	if err != nil {
		return nil, fmt.Errorf("성적 산출 중 오류 발생: %w", err)
	}

	// 3. 요청한 반의 학생들만 필터링하여 반환
	var classResults []StudentCalcResult
	for _, res := range calcResults {
		if res.ClassNum == classNum {
			classResults = append(classResults, res)
		}
	}

	// 번호순으로 정렬
	sort.Slice(classResults, func(i, j int) bool {
		// 번호가 문자열이므로 숫자로 변환하여 비교 (가능한 경우)
		numI, errI := strconv.Atoi(classResults[i].StudentNum)
		numJ, errJ := strconv.Atoi(classResults[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return classResults[i].StudentNum < classResults[j].StudentNum
	})

	return classResults, nil
}
// ResetAllData 데이터 폴더 삭제를 통해 완전 초기화
func (a *App) ResetAllData() error {
	// DB 연결이 열려 있을 수 있으므로 GC를 강제로 호출하거나 그냥 폴더 내용물을 지움
	// 가장 확실한 것은 설정 파일들과 DB 파일들을 지우는 것
	exePath, err := os.Executable()
	if err != nil {
		exePath = "."
	}
	dataDir := filepath.Join(filepath.Dir(exePath), "data")
	
	err = os.RemoveAll(dataDir)
	if err != nil {
		return fmt.Errorf("데이터 삭제 실패: %w", err)
	}

	// dataDir 다시 생성
	os.MkdirAll(dataDir, 0755)
	
	// 테이블 다시 생성
	if err := a.db.InitConfigDB(); err != nil {
		return fmt.Errorf("DB 초기화 실패: %w", err)
	}

	return nil
}

