package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"time"

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

// ProcessAttendanceExcel 출결 엑셀 파싱 후 DB 병합
func (a *App) ProcessAttendanceExcel(filePath string) (map[int]int, error) {
	if filePath == "" {
		return nil, fmt.Errorf("파일이 선택되지 않았습니다")
	}

	classData, err := ParseAttendanceExcel(filePath)
	if err != nil {
		return nil, err
	}

	result := make(map[int]int)
	for classNum, students := range classData {
		err := a.db.UpdateStudentAttendance(classNum, students)
		if err != nil {
			return nil, fmt.Errorf("%d반 출결 데이터 저장 실패: %w", classNum, err)
		}
		result[classNum] = len(students)
	}

	return result, nil
}

// ProcessVolunteerExcel 봉사 엑셀 파싱 후 DB 병합
func (a *App) ProcessVolunteerExcel(filePath string) (map[int]int, error) {
	if filePath == "" {
		return nil, fmt.Errorf("파일이 선택되지 않았습니다")
	}

	classData, err := ParseVolunteerExcel(filePath)
	if err != nil {
		return nil, err
	}

	result := make(map[int]int)
	for classNum, students := range classData {
		err := a.db.UpdateStudentVolunteer(classNum, students)
		if err != nil {
			return nil, fmt.Errorf("%d반 봉사 데이터 저장 실패: %w", classNum, err)
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

// FetchCutoffsFromBridge 중앙 서버에서 취합된 커트라인 데이터를 다운로드하여 로컬 DB에 반영
func (a *App) FetchCutoffsFromBridge(year int) (int, error) {
	url := fmt.Sprintf("%s/api/cutoff?year=%d", BridgeServerURL, year)
	resp, err := http.Get(url)
	if err != nil {
		return 0, fmt.Errorf("중앙 서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("서버 응답: %s", string(b))
	}

	var resData struct {
		Success bool         `json:"success"`
		Data    []CutoffInfo `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return 0, fmt.Errorf("데이터 파싱 실패: %w", err)
	}

	if len(resData.Data) == 0 {
		return 0, fmt.Errorf("중앙 서버에 등록된 %d학년도 커트라인 데이터가 아직 없습니다.", year)
	}

	if err := a.db.SaveCutoffs(resData.Data); err != nil {
		return 0, fmt.Errorf("로컬 DB 저장 실패: %w", err)
	}

	return len(resData.Data), nil
}

// RollbackSchoolCutoffs 우리 학교가 중앙 서버에 전송했던 커트라인 데이터를 회수(삭제)
func (a *App) RollbackSchoolCutoffs(year int) (string, error) {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return "", err
	}

	url := fmt.Sprintf("%s/api/cutoff?year=%d&school=%s", BridgeServerURL, year, url.QueryEscape(config.SchoolName))
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	var resData struct {
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&resData)

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf(resData.Error)
	}

	return resData.Message, nil
}

// ResetServerCutoffs 중앙 서버의 해당 연도 모든 커트라인 데이터를 초기화 (테스트용)
func (a *App) ResetServerCutoffs(year int) (string, error) {
	url := fmt.Sprintf("%s/api/cutoff?year=%d&all=true", BridgeServerURL, year)
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("서버 연결 실패: %w", err)
	}
	defer resp.Body.Close()

	var resData struct {
		Message string `json:"message"`
		Error   string `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&resData)

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf(resData.Error)
	}

	return resData.Message, nil
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

// GetStudentFullDetail 학생 1명의 10개 고교별 산출 결과 및 상세 내역 반환
func (a *App) GetStudentFullDetail(classNum int, studentNum, name string) (*StudentFullData, error) {
	s, err := a.db.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}

	full, err := parseStudentFullData(*s)
	if err != nil {
		return nil, err
	}

	// 대시보드와 동일한 정확한 전교 석차 백분율 동기화
	classGrades, _ := a.GetClassGrades(classNum)
	for _, cg := range classGrades {
		if cg.StudentNum == studentNum {
			full.GeneralHSPercentile = cg.Percentile
			if cg.Percentile <= 80 {
				full.GeneralHSLevel = "상"
			} else if cg.Percentile <= 90 {
				full.GeneralHSLevel = "중"
			} else {
				full.GeneralHSLevel = "하"
			}
			break
		}
	}

	return full, nil
}

// SaveStudentExtra 학생의 수기 가산점 및 추가 봉사시간 저장
func (a *App) SaveStudentExtra(classNum int, studentNum, name, extraJSON string) error {
	return a.db.UpdateStudentExtra(classNum, studentNum, name, extraJSON)
}

// StudentTranscriptData 학생의 전학년 교과/비교과 전체 상세 성적표
type StudentTranscriptData struct {
	ClassNum       int                 `json:"classNum"`
	StudentNum     string              `json:"studentNum"`
	Name           string              `json:"name"`
	SubjectRecords []map[string]string `json:"subjectRecords"`
	AttendanceRaw  string              `json:"attendanceRaw"`
	VolunteerRaw   string              `json:"volunteerRaw"`
	AllAverage     float64             `json:"allAverage"`
	Percentile     float64             `json:"percentile"`
	Rank           int                 `json:"rank"`
	TotalStudents  int                 `json:"totalStudents"`
}

// GetStudentTranscript 학생 1명의 전과목 전학년 성적과 출결/봉사 원시 데이터 일체 반환
func (a *App) GetStudentTranscript(classNum int, studentNum, name string) (*StudentTranscriptData, error) {
	s, err := a.db.GetStudent(classNum, studentNum, name)
	if err != nil {
		return nil, fmt.Errorf("학생 정보를 찾을 수 없습니다: %w", err)
	}

	res := &StudentTranscriptData{
		ClassNum:      s.ClassNum,
		StudentNum:    s.StudentNum,
		Name:          s.Name,
		AttendanceRaw: s.AttendanceData,
		VolunteerRaw:  s.VolunteerData,
	}

	if s.RawData != "" {
		_ = json.Unmarshal([]byte(s.RawData), &res.SubjectRecords)
	}

	// 평균 성취도 산출
	if fullData, err := parseStudentFullData(*s); err == nil && fullData != nil {
		res.AllAverage = fullData.AllAverage
	}

	// 전교 석차 및 백분율 정보 산출
	config, _ := a.db.GetSchoolConfig()
	if config != nil {
		allStudents, _ := a.db.GetAllStudents(config.ClassCount)
		if len(allStudents) > 0 {
			calcResults, _ := CalculateGrades(allStudents, config.IsSmallSchool)
			res.TotalStudents = len(calcResults)
			for idx, cg := range calcResults {
				if cg.ClassNum == classNum && cg.StudentNum == studentNum {
					res.Rank = idx + 1
					res.Percentile = cg.Percentile
					break
				}
			}
		}
	}

	return res, nil
}

// GetClassFullGrades 특정 반 전체 학생의 고교별 산출 결과 목록 반환 (신호등 매트릭스용)
func (a *App) GetClassFullGrades(classNum int) ([]StudentFullData, error) {
	students, err := a.db.GetClassStudents(classNum)
	if err != nil {
		return nil, err
	}

	// 1. 전교생 기준 정확한 내신 산출 결과(석차백분율) 가져오기
	classGrades, _ := a.GetClassGrades(classNum)
	pctMap := make(map[string]float64)
	for _, cg := range classGrades {
		pctMap[cg.StudentNum] = cg.Percentile
	}

	var results []StudentFullData
	for _, s := range students {
		full, err := parseStudentFullData(s)
		if err == nil {
			// 대시보드 표와 동일한 정확한 전교 석차 백분율 동기화
			if realPct, ok := pctMap[full.StudentNum]; ok {
				full.GeneralHSPercentile = realPct
			}
			results = append(results, *full)
		}
	}

	// 번호순 정렬
	sort.Slice(results, func(i, j int) bool {
		numI, errI := strconv.Atoi(results[i].StudentNum)
		numJ, errJ := strconv.Atoi(results[j].StudentNum)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return results[i].StudentNum < results[j].StudentNum
	})

	return results, nil
}

// ResetAcademicYear 입시년도 전환 시 커트라인을 제외한 모든 학급 데이터 삭제
func (a *App) ResetAcademicYear(newYear int) error {
	return a.db.ResetAcademicYear(newYear)
}

// GetDataUpdateStatus 교과, 출결, 봉사 데이터의 저장 상태 반환
func (a *App) GetDataUpdateStatus() map[string]interface{} {
	config, err := a.db.GetSchoolConfig()
	if err != nil {
		return map[string]interface{}{"error": err.Error()}
	}

	totalStudents := 0
	attendanceCount := 0
	volunteerCount := 0

	for i := 1; i <= config.ClassCount; i++ {
		students, err := a.db.GetClassStudents(i)
		if err == nil {
			totalStudents += len(students)
			for _, s := range students {
				if s.AttendanceData != "" {
					attendanceCount++
				}
				if s.VolunteerData != "" {
					volunteerCount++
				}
			}
		}
	}

	return map[string]interface{}{
		"totalStudents":   totalStudents,
		"hasGrades":       totalStudents > 0,
		"attendanceCount": attendanceCount,
		"hasAttendance":   attendanceCount > 0,
		"volunteerCount":  volunteerCount,
		"hasVolunteer":    volunteerCount > 0,
		"classCount":      config.ClassCount,
		"schoolName":      config.SchoolName,
		"admissionYear":   config.AdmissionYear,
	}
}

// GetSchoolRuleList 지원 고교 및 전형 목록 반환
func (a *App) GetSchoolRuleList() []map[string]string {
	return GetAllSchoolRuleNames()
}

// PerformAutoUpdate 원클릭 자동 업데이트 실행
func (a *App) PerformAutoUpdate(downloadURL string) error {
	return DownloadAndApplyUpdate(downloadURL)
}

// GetHighSchoolsData 고교 목록 데이터 반환 (후기 일반고 포함)
func (a *App) GetHighSchoolsData() (*HighSchoolData, error) {
	data, err := a.sync.GetHighSchools()
	if err != nil {
		return nil, err
	}

	// 후기 일반계고가 목록에 없으면 맨 앞에 추가
	hasGeneral := false
	for _, s := range data.Schools {
		if s.Name == "울산 후기 일반계고" {
			hasGeneral = true
			break
		}
	}

	if !hasGeneral {
		generalSchool := HighSchool{
			Name: "울산 후기 일반계고",
			Type: "일반계고",
			Area: "울산전역",
			Note: "석차백분율(%) 기준",
		}
		data.Schools = append([]HighSchool{generalSchool}, data.Schools...)
	}

	return data, nil
}

// CreateUser 새 사용자 등록 (관리자, 뷰어, 담임교사 등)
func (a *App) CreateUser(username, password, role string, classNum int) error {
	return a.db.CreateUser(username, password, role, classNum)
}

// DeleteUser 사용자 삭제
func (a *App) DeleteUser(username string) error {
	return a.db.DeleteUser(username)
}





