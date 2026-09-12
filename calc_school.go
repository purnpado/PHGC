package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// VolunteerTier 봉사시간별 점수 구간
type VolunteerTier struct {
	MinHours int     // 최소 시간 (이상)
	Score    float64 // 부여 점수
}

// SchoolRule 학교별 산출 규칙
type SchoolRule struct {
	SchoolName               string             // 학교명
	TrackName                string             // "일반", "특별", "취업희망자"
	TotalMax                 float64            // 총점 만점 (면접 제외)
	Semesters                []string           // 반영 학기 (예: ["1_2","2_1","2_2","3_1"])
	SemesterWeights          map[string]float64 // 학기별 가중치 비율 (합=1.0, 비어있으면 균등)
	AllSubjectMax            float64            // 전과목 배점 만점
	WeightedSubjects         map[string]float64 // 과목별 가중치 배점 (예: {"영어":20,"수학":20,"기술가정":10})
	AttendanceMax            float64            // 출결 만점
	AbsencePenalty           float64            // 결석 1일당 감점
	VolunteerMax             float64            // 봉사 만점
	VolunteerTable           []VolunteerTier    // 봉사시간별 점수 테이블
	ExcludeArts              bool               // 예체능은 전과목 평균에서 제외하고 별도 감점
	UseScienceForTech        bool               // 기술·가정 미이수 시 과학으로 대체(에너지고)
	LateEtcPenalty           float64            // 지각·조퇴·결과 1회당 직접 감점(현대공고)
	LeadershipMax            float64            // 리더십 배점(한 학기 2.5점)
	AttendanceCutoff         string             // "9/30" 또는 "10/31" (비어 있으면 기존값)
	FinalTermArtsPenaltyOnly bool               // 특성화고: 3-1 예체능 감점만 한 번 차감
}

// SchoolCalcResult 학교별 산출 결과
type SchoolCalcResult struct {
	SchoolName      string             `json:"schoolName"`
	TrackName       string             `json:"trackName"`
	TotalMax        float64            `json:"totalMax"`
	AllSubjectScore float64            `json:"allSubjectScore"` // 전과목 점수
	AllSubjectMax   float64            `json:"allSubjectMax"`   // 전과목 만점
	WeightedScore   float64            `json:"weightedScore"`   // 가중치 점수 합계
	WeightedMax     float64            `json:"weightedMax"`     // 가중치 만점 합계
	WeightedDetails map[string]float64 `json:"weightedDetails"` // 과목별 가중치 점수
	AttendanceScore float64            `json:"attendanceScore"` // 출결 점수
	AttendanceMax   float64            `json:"attendanceMax"`
	VolunteerScore  float64            `json:"volunteerScore"` // 봉사 점수
	VolunteerMax    float64            `json:"volunteerMax"`
	LeadershipScore float64            `json:"leadershipScore"`
	LeadershipMax   float64            `json:"leadershipMax"`
	ExtraScore      float64            `json:"extraScore"` // 창체/행발 가산점 합계
	TotalScore      float64            `json:"totalScore"` // 최종 합계 (가산점 포함)
}

// StudentFullData 학생 1명의 전과목/비교과/고교별 결과 종합 데이터
type StudentFullData struct {
	ClassNum             int                         `json:"classNum"`
	StudentNum           string                      `json:"studentNum"`
	Name                 string                      `json:"name"`
	AllAverage           float64                     `json:"allAverage"`     // 전과목 평균 성취도
	SemesterScores       map[string][]int            `json:"semesterScores"` // 학기별 성취도 목록
	SubjectScores        map[string]map[string][]int `json:"subjectScores"`  // [과목][학기]별 성취도
	NonArtSemesterScores map[string][]int            `json:"-"`
	ArtPenaltyBySemester map[string]float64          `json:"-"`
	AbsenceDays          int                         `json:"absenceDays"`         // 미인정 결석 환산 일수 (결석 + 지각조퇴결과/3)
	RawAbsenceDays       int                         `json:"rawAbsenceDays"`      // 1학기 나이스 순수 결석일수
	RawLateCount         int                         `json:"rawLateCount"`        // 1학기 나이스 지각횟수
	RawEarlyCount        int                         `json:"rawEarlyCount"`       // 1학기 나이스 조퇴횟수
	RawResultCount       int                         `json:"rawResultCount"`      // 1학기 나이스 결과횟수
	SeptAbsenceDays      int                         `json:"septAbsenceDays"`     // 9.30 기준 전기고 미인정 결석일수 수기
	SeptLateEtc          int                         `json:"septLateEtc"`         // 9.30 기준 미인정 지각·조퇴·결과 합산 횟수 수기
	HasSeptAbsence       bool                        `json:"hasSeptAbsence"`      // 9.30 출결 수기 입력 여부
	OctAbsenceDays       int                         `json:"octAbsenceDays"`      // 10.31 기준 미인정 결석일수 수기
	OctLateEtc           int                         `json:"octLateEtc"`          // 10.31 기준 미인정 지각·조퇴·결과 합산 횟수 수기
	HasOctAbsence        bool                        `json:"hasOctAbsence"`       // 10.31 출결 수기 입력 여부
	VolunteerHours       int                         `json:"volunteerHours"`      // 기본 봉사 시간
	AddVolunteerHours    int                         `json:"addVolunteerHours"`   // 수기 추가 봉사 시간
	TotalVolunteerHours  int                         `json:"totalVolunteerHours"` // 최종 봉사 시간 (기본 + 추가)
	LeadershipTerms      int                         `json:"leadershipTerms"`     // 인정 리더십 활동 학기 수

	// 수기 입력 데이터
	ExtraData   map[string]bool `json:"extraData"`   // "창체_1": true 등
	ExtraPoints float64         `json:"extraPoints"` // 창체/행발 가산점 총점
	ExtraJSON   string          `json:"extraJSON"`   // 원본 JSON 문자열

	// 일반고 참고 지표
	GeneralHSPercentile       float64 `json:"generalHSPercentile"` // 일반고 백분율
	GeneralHSLevel            string  `json:"generalHSLevel"`      // "상" "중" "하"
	GeneralHSAcademicScore    float64 `json:"generalHSAcademicScore"`
	GeneralHSNonAcademicScore float64 `json:"generalHSNonAcademicScore"`
	GeneralHSTotalScore       float64 `json:"generalHSTotalScore"`
	GeneralHSDataComplete     bool    `json:"generalHSDataComplete"`
	GeneralHSProjected        bool    `json:"generalHSProjected"`

	// 학교별 산출 결과
	SchoolResults []SchoolCalcResult `json:"schoolResults"`
}

// 전체 학교 규칙 등록부
var AllSchoolRules []SchoolRule

func init() {
	AllSchoolRules = []SchoolRule{
		// ============ 울산마이스터고 ============
		{
			SchoolName: "울산마이스터고", TrackName: "일반",
			TotalMax: 300, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    150,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax:    80, AbsencePenalty: 8,
			VolunteerMax: 20,
			VolunteerTable: []VolunteerTier{
				{12, 20}, {10, 19}, {8, 18}, {6, 17}, {4, 16}, {2, 15}, {0, 14},
			},
		},
		{
			SchoolName: "울산마이스터고", TrackName: "특별",
			TotalMax: 280, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    70,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax:    120, AbsencePenalty: 12,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 38}, {8, 36}, {6, 34}, {4, 32}, {2, 30}, {0, 28},
			},
		},
		// ============ 울산에너지고 ============
		{
			SchoolName: "울산에너지고", TrackName: "일반",
			TotalMax: 230, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    90,
			SemesterWeights:  map[string]float64{"1_2": .10, "2_1": .25, "2_2": .25, "3_1": .40},
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 20},
			AttendanceMax:    30, AbsencePenalty: 5,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 39}, {8, 38}, {6, 37}, {4, 36}, {2, 35}, {0, 34},
			},
			ExcludeArts: true, UseScienceForTech: true, LeadershipMax: 10,
		},
		{
			SchoolName: "울산에너지고", TrackName: "특별",
			TotalMax: 200, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax:    60,
			SemesterWeights:  map[string]float64{"1_2": .10, "2_1": .25, "2_2": .25, "3_1": .40},
			WeightedSubjects: map[string]float64{"영어": 10, "수학": 10, "기술가정": 10},
			AttendanceMax:    60, AbsencePenalty: 5,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 39}, {8, 38}, {6, 37}, {4, 36}, {2, 35}, {0, 34},
			},
			ExcludeArts: true, UseScienceForTech: true, LeadershipMax: 10,
		},
		// ============ 현대공업고 ============
		{
			SchoolName: "현대공업고", TrackName: "일반",
			TotalMax: 200, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights:  map[string]float64{"1_2": 0.10, "2_1": 0.25, "2_2": 0.25, "3_1": 0.40},
			AllSubjectMax:    100,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax:    30, AbsencePenalty: 6,
			VolunteerMax: 15,
			VolunteerTable: []VolunteerTier{
				{12, 15}, {10, 14}, {8, 13}, {6, 12}, {4, 11}, {2, 10}, {0, 9},
			},
			ExcludeArts: true, LateEtcPenalty: 2, LeadershipMax: 5,
		},
		{
			SchoolName: "현대공업고", TrackName: "특별",
			TotalMax: 150, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights:  map[string]float64{"1_2": 0.10, "2_1": 0.25, "2_2": 0.25, "3_1": 0.40},
			AllSubjectMax:    50,
			WeightedSubjects: map[string]float64{"영어": 15, "수학": 15, "기술가정": 10},
			AttendanceMax:    40, AbsencePenalty: 6,
			VolunteerMax: 15,
			VolunteerTable: []VolunteerTier{
				{12, 15}, {10, 14}, {8, 13}, {6, 12}, {4, 11}, {2, 10}, {0, 9},
			},
			ExcludeArts: true, LateEtcPenalty: 2, LeadershipMax: 5,
		},
		// ============ 울산상업고 ============
		{
			SchoolName: "울산상업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80,
			WeightedSubjects: nil, // 가중치 없음
			AttendanceMax:    20, AbsencePenalty: 2, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax: 0,
		},
		{
			SchoolName: "울산상업고", TrackName: "취업희망자",
			TotalMax: 60, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20,
			WeightedSubjects: nil,
			AttendanceMax:    30, AbsencePenalty: 3, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax:   10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산여자상업고 ============
		{
			SchoolName: "울산여자상업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80,
			WeightedSubjects: nil,
			AttendanceMax:    20, AbsencePenalty: 2, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax: 0,
		},
		{
			SchoolName: "울산여자상업고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 40,
			WeightedSubjects: nil,
			AttendanceMax:    30, AbsencePenalty: 3, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerMax:   10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산생활과학고 ============
		{
			SchoolName: "울산생활과학고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산생활과학고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 25, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 5, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 5}, {10, 4.5}, {8, 4}, {7, 3.5}, {6, 3}, {5, 2.5}, {0, 2}},
		},
		// ============ 울산공업고 ============
		{
			SchoolName: "울산공업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산공업고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산산업고 ============
		{
			SchoolName: "울산산업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산산업고", TrackName: "취업희망자",
			TotalMax: 60, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산미용예술고 ============
		{
			SchoolName: "울산미용예술고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 60, AttendanceMax: 40, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산미용예술고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .25, "2_1": .25, "2_2": .25, "3_1": .25}, AllSubjectMax: 20, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
		// ============ 울산기술공업고 ============
		{
			SchoolName: "울산기술공업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0, AttendanceCutoff: "10/31", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
		},
		{
			SchoolName: "울산기술공업고", TrackName: "취업희망자",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": .2, "2_1": .2, "2_2": .2, "3_1": .4}, AllSubjectMax: 40, AttendanceMax: 50, AbsencePenalty: 5, VolunteerMax: 10, AttendanceCutoff: "9/30", ExcludeArts: true, FinalTermArtsPenaltyOnly: true,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 9}, {8, 8}, {7, 7}, {6, 6}, {5, 5}, {0, 4}},
		},
	}
}

// classifySubject 과목명에서 가중치 과목 분류
func classifySubject(subjectName string) string {
	clean := strings.ReplaceAll(subjectName, " ", "")
	clean = strings.ReplaceAll(clean, "·", "")
	clean = strings.ReplaceAll(clean, "‧", "")

	if strings.Contains(clean, "영어") {
		return "영어"
	}
	if strings.Contains(clean, "수학") {
		return "수학"
	}
	if strings.Contains(clean, "기술") || strings.Contains(clean, "가정") {
		return "기술가정"
	}
	if strings.Contains(clean, "과학") {
		return "과학"
	}
	return "" // 가중치 과목 아님
}

func isArtsSubject(subjectName string) bool {
	clean := strings.ReplaceAll(subjectName, " ", "")
	return strings.Contains(clean, "체육") || strings.Contains(clean, "음악") || strings.Contains(clean, "미술")
}

// parseStudentFullData 학생의 원시 데이터를 파싱하여 StudentFullData 생성
func parseStudentFullData(s StudentExcelData) (*StudentFullData, error) {
	result := &StudentFullData{
		ClassNum:             s.ClassNum,
		StudentNum:           s.StudentNum,
		Name:                 s.Name,
		SemesterScores:       make(map[string][]int),
		NonArtSemesterScores: make(map[string][]int),
		ArtPenaltyBySemester: make(map[string]float64),
		SubjectScores:        make(map[string]map[string][]int),
		ExtraData:            make(map[string]bool),
	}

	// 교과 성적 파싱
	var records []map[string]string
	if s.RawData != "" {
		json.Unmarshal([]byte(s.RawData), &records)
	}

	var lastGrade, lastSem string

	for _, rec := range records {
		var grade, sem, achieveRaw, subjectName string
		for k, v := range rec {
			cleanK := strings.ReplaceAll(k, " ", "")
			cleanK = strings.ReplaceAll(cleanK, "\"", "")
			cleanK = strings.ReplaceAll(cleanK, "\r", "")
			cleanK = strings.ReplaceAll(cleanK, "\n", "")
			cleanV := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(v, "\"", ""), "\r", ""), "\n", ""))

			if strings.Contains(cleanK, "학년도") {
				continue
			}
			if cleanK == "학년" || (strings.Contains(cleanK, "학년") && !strings.Contains(cleanK, "학기")) {
				grade = cleanV
			} else if cleanK == "학기" || strings.Contains(cleanK, "학기") {
				sem = cleanV
			} else if strings.Contains(cleanK, "성취도") {
				achieveRaw = cleanV
			} else if (cleanK == "과목" || cleanK == "교과목" || cleanK == "과목명") || (strings.Contains(cleanK, "과목") && !strings.Contains(cleanK, "평균") && !strings.Contains(cleanK, "원점수") && !strings.Contains(cleanK, "교과")) {
				subjectName = cleanV
			}
		}

		if grade != "" {
			lastGrade = grade
		} else {
			grade = lastGrade
		}

		if sem != "" {
			lastSem = sem
		} else {
			sem = lastSem
		}

		if grade == "" || sem == "" || achieveRaw == "" || subjectName == "" || len(subjectName) < 2 {
			continue
		}
		if strings.Contains(subjectName, "/") || strings.Contains(subjectName, "중학교") {
			continue
		}

		achieve := string(achieveRaw[0])
		if strings.EqualFold(achieve, "P") || achieveRaw == "이수" || strings.HasPrefix(achieveRaw, "P") || strings.HasPrefix(achieveRaw, "p") {
			continue // P는 성취도 수치 점수 산출에서 제외 (자유학기 및 이수과목)
		}

		score := 0
		switch achieve {
		case "A":
			score = 5
		case "B":
			score = 4
		case "C":
			score = 3
		case "D":
			score = 2
		case "E":
			score = 1
		default:
			continue
		}

		cleanGrade := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(grade, "학년", ""), " ", ""))
		cleanSem := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(sem, "학기", ""), " ", ""))
		if cleanGrade == "" || cleanSem == "" {
			continue
		}
		key := cleanGrade + "_" + cleanSem
		result.SemesterScores[key] = append(result.SemesterScores[key], score)
		if isArtsSubject(subjectName) {
			// 에너지고·현대공고: 예체능은 평균에서 제외, B/보통 0.1·C/미흡 0.2 감점.
			if score == 4 {
				result.ArtPenaltyBySemester[key] += 0.1
			}
			if score == 3 {
				result.ArtPenaltyBySemester[key] += 0.2
			}
		} else {
			result.NonArtSemesterScores[key] = append(result.NonArtSemesterScores[key], score)
		}

		// 가중치 과목 분류
		category := classifySubject(subjectName)
		if category != "" {
			if result.SubjectScores[category] == nil {
				result.SubjectScores[category] = make(map[string][]int)
			}
			result.SubjectScores[category][key] = append(result.SubjectScores[category][key], score)
		}
	}

	// 전과목 평균 성취도 계산 (A~E 5점 만점 환산)
	totalScore := 0
	totalCount := 0
	for _, scores := range result.SemesterScores {
		for _, s := range scores {
			totalScore += s
			totalCount++
		}
	}
	if totalCount > 0 {
		result.AllAverage = roundToTwoDecimals(float64(totalScore) / float64(totalCount))
	}

	// 출결 파싱
	if s.AttendanceData != "" {
		var attMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.AttendanceData), &attMap); err == nil {
			getInt := func(keys ...string) int {
				for _, k := range keys {
					if v, ok := attMap[k]; ok {
						switch val := v.(type) {
						case float64:
							return int(val)
						case int:
							return val
						case string:
							if iv, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
								return iv
							}
						}
					}
				}
				return 0
			}
			abs := getInt("absence", "absent")
			if abs == 0 {
				abs = getInt("1_absence") + getInt("2_absence") + getInt("3_absence")
			}
			late := getInt("late")
			if late == 0 {
				late = getInt("1_late") + getInt("2_late") + getInt("3_late")
			}
			early := getInt("early")
			if early == 0 {
				early = getInt("1_early") + getInt("2_early") + getInt("3_early")
			}
			resultCount := getInt("result")
			if resultCount == 0 {
				resultCount = getInt("1_result") + getInt("2_result") + getInt("3_result")
			}

			result.RawAbsenceDays = abs
			result.RawLateCount = late
			result.RawEarlyCount = early
			result.RawResultCount = resultCount
			tardyDays := (result.RawLateCount + result.RawEarlyCount + result.RawResultCount) / 3
			result.AbsenceDays = result.RawAbsenceDays + tardyDays
		}
	}

	// 봉사 파싱
	if s.VolunteerData != "" {
		var volMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.VolunteerData), &volMap); err == nil {
			for _, k := range []string{"total_time", "totalTime", "total", "hours"} {
				if v, ok := volMap[k]; ok {
					switch val := v.(type) {
					case float64:
						result.VolunteerHours = int(val)
					case int:
						result.VolunteerHours = val
					case string:
						if iv, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
							result.VolunteerHours = iv
						}
					}
					if result.VolunteerHours > 0 {
						break
					}
				}
			}
		}
	}

	// 수기 입력 가산점 및 추가 봉사시간, 9.30 전기고 출결 파싱
	result.ExtraJSON = s.ExtraData
	extraSum := 0.0
	if s.ExtraData != "" {
		var extraMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.ExtraData), &extraMap); err == nil {
			for k, v := range extraMap {
				if k == "add_volunteer" {
					if vf, ok := v.(float64); ok {
						result.AddVolunteerHours = int(vf)
					}
				} else if k == "sept_absence" {
					if vf, ok := v.(float64); ok {
						result.SeptAbsenceDays = int(vf)
						result.HasSeptAbsence = true
					}
				} else if k == "sept_late_etc" {
					if vf, ok := v.(float64); ok {
						result.SeptLateEtc = int(vf)
						result.HasSeptAbsence = true
					}
				} else if k == "oct_absence" {
					if vf, ok := v.(float64); ok {
						result.OctAbsenceDays = int(vf)
						result.HasOctAbsence = true
					}
				} else if k == "oct_late_etc" {
					if vf, ok := v.(float64); ok {
						result.OctLateEtc = int(vf)
						result.HasOctAbsence = true
					}
				} else if k == "leadership_terms" {
					if vf, ok := v.(float64); ok {
						result.LeadershipTerms = int(vf)
					}
				} else if vb, ok := v.(bool); ok {
					result.ExtraData[k] = vb
					// 창체 및 행발 가산점 항목당 1점 가산
					if vb && (strings.HasPrefix(k, "changche") || strings.HasPrefix(k, "haengbal") || strings.Contains(k, "창체") || strings.Contains(k, "행발")) {
						extraSum += 1.0
					}
				}
			}
		}
	}
	result.ExtraPoints = extraSum
	result.TotalVolunteerHours = result.VolunteerHours + result.AddVolunteerHours

	// 모든 학교에 대한 점수 산출
	for _, rule := range AllSchoolRules {
		calcResult := calculateForSchool(result, rule)
		result.SchoolResults = append(result.SchoolResults, calcResult)
	}

	// 일반고 참고 지표 (전과목 평균으로 대략 추정)
	if result.AllAverage > 0 {
		// 평균 성취도 기준 대략적 백분율 추정
		pct := (1 - (result.AllAverage-1)/4) * 100
		result.GeneralHSPercentile = roundToTwoDecimals(pct)
		if pct <= 80 {
			result.GeneralHSLevel = "상"
		} else if pct <= 90 {
			result.GeneralHSLevel = "중"
		} else {
			result.GeneralHSLevel = "하"
		}
	}

	return result, nil
}

// calculateForSchool 특정 학교 규칙에 따라 점수를 산출
func calculateForSchool(student *StudentFullData, rule SchoolRule) SchoolCalcResult {
	result := SchoolCalcResult{
		SchoolName:      rule.SchoolName,
		TrackName:       rule.TrackName,
		TotalMax:        rule.TotalMax,
		AllSubjectMax:   rule.AllSubjectMax,
		AttendanceMax:   rule.AttendanceMax,
		VolunteerMax:    rule.VolunteerMax,
		LeadershipMax:   rule.LeadershipMax,
		WeightedDetails: make(map[string]float64),
	}

	// === 1. 전과목 점수 ===
	if len(rule.SemesterWeights) > 0 {
		// 학기별 차등 가중치 (현대공고)
		var totalWeightedAvg float64
		for _, sem := range rule.Semesters {
			scores := ruleSemesterScores(student, rule, sem)
			if len(scores) == 0 {
				continue
			}
			avg := calcAverage(scores)
			weight := rule.SemesterWeights[sem]
			totalWeightedAvg += (avg / 5.0) * weight
			if rule.ExcludeArts && !rule.FinalTermArtsPenaltyOnly {
				totalWeightedAvg -= student.ArtPenaltyBySemester[sem] / rule.AllSubjectMax
			}
		}
		result.AllSubjectScore = roundToTwoDecimals(totalWeightedAvg * rule.AllSubjectMax)
		if rule.FinalTermArtsPenaltyOnly && len(student.SemesterScores["3_1"]) > 0 {
			result.AllSubjectScore = roundToTwoDecimals(math.Max(0, result.AllSubjectScore-student.ArtPenaltyBySemester["3_1"]/float64(len(student.SemesterScores["3_1"]))))
		}
	} else {
		// 학기별 균등 (마이스터고, 에너지고, 상업고 등)
		allScores := []int{}
		for _, sem := range rule.Semesters {
			allScores = append(allScores, student.SemesterScores[sem]...)
		}
		if len(allScores) > 0 {
			avg := calcAverage(allScores)
			result.AllSubjectScore = roundToTwoDecimals((avg / 5.0) * rule.AllSubjectMax)
		}
	}

	// === 2. 가중치 과목 점수 ===
	if rule.WeightedSubjects != nil && len(rule.WeightedSubjects) > 0 {
		weightedTotal := 0.0
		maxWeighted := 0.0
		hasKiga := false

		for subjectName, maxPoints := range rule.WeightedSubjects {
			maxWeighted += maxPoints
			subjectSemData := student.SubjectScores[subjectName]
			allSubjectScores := []int{}
			for _, sem := range rule.Semesters {
				if scores, ok := subjectSemData[sem]; ok {
					allSubjectScores = append(allSubjectScores, scores...)
				}
			}
			// 에너지고는 기술·가정을 이수하지 않은 경우 같은 학기의 과학 성취도를 사용한다.
			if rule.UseScienceForTech && subjectName == "기술가정" && len(allSubjectScores) == 0 {
				for _, sem := range rule.Semesters {
					allSubjectScores = append(allSubjectScores, student.SubjectScores["과학"][sem]...)
				}
			}
			if len(allSubjectScores) > 0 {
				avg := calcAverage(allSubjectScores)
				score := roundToTwoDecimals((avg / 5.0) * maxPoints)
				result.WeightedDetails[subjectName] = score
				weightedTotal += score
			}
			if subjectName == "기술가정" && len(allSubjectScores) > 0 {
				hasKiga = true
			}
		}

		// 기술가정 예외 처리 (기가 성적이 없으면 영/수로 재분배)
		_, kigaExists := rule.WeightedSubjects["기술가정"]
		if kigaExists && !hasKiga {
			kigaMax := rule.WeightedSubjects["기술가정"]
			engMax, engOk := rule.WeightedSubjects["영어"]
			mathMax, mathOk := rule.WeightedSubjects["수학"]

			if engOk && mathOk {
				extraEach := kigaMax / 2.0
				newEngMax := engMax + extraEach
				newMathMax := mathMax + extraEach

				// 영어 재계산
				engScores := []int{}
				for _, sem := range rule.Semesters {
					if scores, ok := student.SubjectScores["영어"][sem]; ok {
						engScores = append(engScores, scores...)
					}
				}
				if len(engScores) > 0 {
					avg := calcAverage(engScores)
					result.WeightedDetails["영어"] = roundToTwoDecimals((avg / 5.0) * newEngMax)
				}

				// 수학 재계산
				mathScores := []int{}
				for _, sem := range rule.Semesters {
					if scores, ok := student.SubjectScores["수학"][sem]; ok {
						mathScores = append(mathScores, scores...)
					}
				}
				if len(mathScores) > 0 {
					avg := calcAverage(mathScores)
					result.WeightedDetails["수학"] = roundToTwoDecimals((avg / 5.0) * newMathMax)
				}

				delete(result.WeightedDetails, "기술가정")

				// 재합산
				weightedTotal = 0
				for _, v := range result.WeightedDetails {
					weightedTotal += v
				}
			}
		}

		result.WeightedScore = roundToTwoDecimals(weightedTotal)
		result.WeightedMax = maxWeighted
	}

	// === 3. 출결 점수 ===
	absenceDays := student.AbsenceDays
	lateEtc := student.RawLateCount + student.RawEarlyCount + student.RawResultCount
	// 전기고(마이스터고 및 특성화고)의 경우 9.30 기준 결석 일수 및 지각·조퇴·결과(3회당 1일)가 수기 입력되었으면 우선 적용
	if rule.AttendanceCutoff == "10/31" && student.HasOctAbsence {
		absenceDays = student.OctAbsenceDays + (student.OctLateEtc / 3)
		lateEtc = student.OctLateEtc
	} else if (rule.AttendanceCutoff == "9/30" || rule.AttendanceCutoff == "") && student.HasSeptAbsence {
		absenceDays = student.SeptAbsenceDays + (student.SeptLateEtc / 3)
		lateEtc = student.SeptLateEtc
	}
	result.AttendanceScore = math.Max(0, rule.AttendanceMax-float64(absenceDays)*rule.AbsencePenalty-float64(lateEtc)*rule.LateEtcPenalty)
	result.AttendanceScore = roundToTwoDecimals(result.AttendanceScore)

	// === 4. 봉사 점수 ===
	if rule.VolunteerMax > 0 && len(rule.VolunteerTable) > 0 {
		for _, tier := range rule.VolunteerTable {
			if student.TotalVolunteerHours >= tier.MinHours {
				result.VolunteerScore = tier.Score
				break
			}
		}
	}

	// === 5. 리더십 및 총점 합산 ===
	if rule.LeadershipMax > 0 {
		result.LeadershipScore = math.Min(rule.LeadershipMax, float64(student.LeadershipTerms)*2.5)
	}
	// 창체/행발은 일반계고 비교과 항목이며 전기고 1차 점수에 더하지 않는다.
	calcTotal := result.AllSubjectScore + result.WeightedScore + result.AttendanceScore + result.VolunteerScore + result.LeadershipScore
	// 총점이 배점 만점을 초과할 수 없음
	if rule.TotalMax > 0 && calcTotal > rule.TotalMax {
		calcTotal = rule.TotalMax
	}
	result.TotalScore = roundToTwoDecimals(calcTotal)

	return result
}

// ruleSemesterScores는 전형요강의 결측 성적 인정 원칙을 적용한다.
// 해당 학기 성적이 없으면 같은 학년의 반대 학기, 그마저 없으면 인접 학기의
// 성적을 사용한다. 예체능 제외 전형은 NonArtSemesterScores를 우선 사용한다.
func ruleSemesterScores(student *StudentFullData, rule SchoolRule, semester string) []int {
	scoreMap := student.SemesterScores
	if rule.ExcludeArts && len(student.NonArtSemesterScores) > 0 {
		scoreMap = student.NonArtSemesterScores
	}
	if scores := scoreMap[semester]; len(scores) > 0 {
		return scores
	}

	// 자유학기 및 한 학년 전체 결측 시, 전형요강에 맞춰 가까운 학기의
	// 성적을 인정한다. 순서는 같은 학년 반대 학기를 먼저 둔다.
	candidates := map[string][]string{
		"1_2": {"1_1", "2_1", "2_2"},
		"2_1": {"2_2", "1_2", "3_1"},
		"2_2": {"2_1", "3_1", "1_2"},
		"3_1": {"3_2", "2_2", "2_1"},
	}
	for _, candidate := range candidates[semester] {
		if scores := scoreMap[candidate]; len(scores) > 0 {
			return scores
		}
	}
	return nil
}

// calcAverage 정수 배열의 평균
func calcAverage(scores []int) float64 {
	if len(scores) == 0 {
		return 0
	}
	sum := 0
	for _, s := range scores {
		sum += s
	}
	return float64(sum) / float64(len(scores))
}

// GetAllSchoolRules 프론트엔드에서 학교 목록 조회용
func GetAllSchoolRuleNames() []map[string]string {
	var names []map[string]string
	for _, r := range AllSchoolRules {
		names = append(names, map[string]string{
			"schoolName": r.SchoolName,
			"trackName":  r.TrackName,
			"totalMax":   fmt.Sprintf("%.0f", r.TotalMax),
		})
	}
	return names
}
