package main

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// VolunteerTier 봉사시간별 점수 구간
type VolunteerTier struct {
	MinHours int     // 최소 시간 (이상)
	Score    float64 // 부여 점수
}

// SchoolRule 학교별 산출 규칙
type SchoolRule struct {
	SchoolName       string             // 학교명
	TrackName        string             // "일반", "특별", "취업희망자"
	TotalMax         float64            // 총점 만점 (면접 제외)
	Semesters        []string           // 반영 학기 (예: ["1_2","2_1","2_2","3_1"])
	SemesterWeights  map[string]float64 // 학기별 가중치 비율 (합=1.0, 비어있으면 균등)
	AllSubjectMax    float64            // 전과목 배점 만점
	WeightedSubjects map[string]float64 // 과목별 가중치 배점 (예: {"영어":20,"수학":20,"기술가정":10})
	AttendanceMax    float64            // 출결 만점
	AbsencePenalty   float64            // 결석 1일당 감점
	VolunteerMax     float64            // 봉사 만점
	VolunteerTable   []VolunteerTier    // 봉사시간별 점수 테이블
}

// SchoolCalcResult 학교별 산출 결과
type SchoolCalcResult struct {
	SchoolName       string  `json:"schoolName"`
	TrackName        string  `json:"trackName"`
	TotalMax         float64 `json:"totalMax"`
	AllSubjectScore  float64 `json:"allSubjectScore"`  // 전과목 점수
	AllSubjectMax    float64 `json:"allSubjectMax"`     // 전과목 만점
	WeightedScore    float64 `json:"weightedScore"`     // 가중치 점수 합계
	WeightedMax      float64 `json:"weightedMax"`       // 가중치 만점 합계
	WeightedDetails  map[string]float64 `json:"weightedDetails"` // 과목별 가중치 점수
	AttendanceScore  float64 `json:"attendanceScore"`   // 출결 점수
	AttendanceMax    float64 `json:"attendanceMax"`
	VolunteerScore   float64 `json:"volunteerScore"`    // 봉사 점수
	VolunteerMax     float64 `json:"volunteerMax"`
	TotalScore       float64 `json:"totalScore"`        // 최종 합계
}

// StudentRawData 학생의 원시 데이터 (프론트엔드에서 모달 렌더링용)
type StudentFullData struct {
	ClassNum        int                `json:"classNum"`
	StudentNum      string             `json:"studentNum"`
	Name            string             `json:"name"`

	// 교과 성적 (학기별 과목별 성취도)
	SemesterScores  map[string][]int   `json:"semesterScores"`  // "2_1" -> [5,4,5,3,...] 전과목
	SubjectScores   map[string]map[string][]int `json:"subjectScores"` // "영어" -> {"2_1": [5], "2_2": [4], ...}
	AllAverage      float64            `json:"allAverage"`      // 전과목 평균 성취도

	// 비교과
	AbsenceDays        int                `json:"absenceDays"`        // 미인정 결석 일수
	VolunteerHours     int                `json:"volunteerHours"`     // 기본 봉사 시간
	AddVolunteerHours  int                `json:"addVolunteerHours"`  // 수기 추가 봉사 시간
	TotalVolunteerHours int               `json:"totalVolunteerHours"` // 최종 봉사 시간 (기본 + 추가)

	// 수기 입력 데이터
	ExtraData       map[string]bool    `json:"extraData"`       // "창체_1": true 등
	ExtraJSON       string             `json:"extraJSON"`       // 원본 JSON 문자열

	// 일반고 참고 지표
	GeneralHSPercentile float64        `json:"generalHSPercentile"` // 일반고 백분율
	GeneralHSLevel      string         `json:"generalHSLevel"`      // "상" "중" "하"

	// 학교별 산출 결과
	SchoolResults   []SchoolCalcResult `json:"schoolResults"`
}

// 전체 학교 규칙 등록부
var AllSchoolRules []SchoolRule

func init() {
	AllSchoolRules = []SchoolRule{
		// ============ 울산마이스터고 ============
		{
			SchoolName: "울산마이스터고", TrackName: "일반",
			TotalMax: 300, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 150,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax: 80, AbsencePenalty: 8,
			VolunteerMax: 20,
			VolunteerTable: []VolunteerTier{
				{12, 20}, {10, 16}, {8, 12}, {6, 8}, {4, 4}, {0, 0},
			},
		},
		{
			SchoolName: "울산마이스터고", TrackName: "특별",
			TotalMax: 280, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 70,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax: 120, AbsencePenalty: 12,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 32}, {8, 24}, {6, 16}, {4, 8}, {0, 0},
			},
		},
		// ============ 울산에너지고 ============
		{
			SchoolName: "울산에너지고", TrackName: "일반",
			TotalMax: 230, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 90,
			WeightedSubjects: map[string]float64{"영어": 25, "수학": 25, "기술가정": 10},
			AttendanceMax: 40, AbsencePenalty: 5,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 36}, {8, 32}, {6, 28}, {4, 24}, {2, 20}, {0, 0},
			},
		},
		{
			SchoolName: "울산에너지고", TrackName: "특별",
			TotalMax: 200, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 60,
			WeightedSubjects: map[string]float64{"영어": 15, "수학": 15},
			AttendanceMax: 70, AbsencePenalty: 5,
			VolunteerMax: 40,
			VolunteerTable: []VolunteerTier{
				{12, 40}, {10, 36}, {8, 32}, {6, 28}, {4, 24}, {2, 20}, {0, 0},
			},
		},
		// ============ 현대공업고 ============
		{
			SchoolName: "현대공업고", TrackName: "일반",
			TotalMax: 200, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": 0.20, "2_1": 0.20, "2_2": 0.20, "3_1": 0.40},
			AllSubjectMax: 100,
			WeightedSubjects: map[string]float64{"영어": 20, "수학": 20, "기술가정": 10},
			AttendanceMax: 35, AbsencePenalty: 3,
			VolunteerMax: 15,
			VolunteerTable: []VolunteerTier{
				{12, 15}, {10, 12}, {8, 9}, {6, 6}, {4, 3}, {0, 0},
			},
		},
		{
			SchoolName: "현대공업고", TrackName: "특별",
			TotalMax: 150, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			SemesterWeights: map[string]float64{"1_2": 0.20, "2_1": 0.20, "2_2": 0.20, "3_1": 0.40},
			AllSubjectMax: 50,
			WeightedSubjects: map[string]float64{"영어": 16, "수학": 16, "기술가정": 8},
			AttendanceMax: 45, AbsencePenalty: 4,
			VolunteerMax: 15,
			VolunteerTable: []VolunteerTier{
				{12, 15}, {10, 12}, {8, 9}, {6, 6}, {4, 3}, {0, 0},
			},
		},
		// ============ 울산상업고 ============
		{
			SchoolName: "울산상업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80,
			WeightedSubjects: nil, // 가중치 없음
			AttendanceMax: 20, AbsencePenalty: 2,
			VolunteerMax: 0,
		},
		{
			SchoolName: "울산상업고", TrackName: "취업희망자",
			TotalMax: 50, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 20,
			WeightedSubjects: nil,
			AttendanceMax: 20, AbsencePenalty: 3,
			VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{
				{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0},
			},
		},
		// ============ 울산여자상업고 ============
		{
			SchoolName: "울산여자상업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80,
			WeightedSubjects: nil,
			AttendanceMax: 20, AbsencePenalty: 2,
			VolunteerMax: 0,
		},
		{
			SchoolName: "울산여자상업고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 40,
			WeightedSubjects: nil,
			AttendanceMax: 30, AbsencePenalty: 3,
			VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{
				{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0},
			},
		},
		// ============ 울산생활과학고 ============
		{
			SchoolName: "울산생활과학고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0,
		},
		{
			SchoolName: "울산생활과학고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 40, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0}},
		},
		// ============ 울산공업고 ============
		{
			SchoolName: "울산공업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0,
		},
		{
			SchoolName: "울산공업고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 40, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0}},
		},
		// ============ 울산산업고 ============
		{
			SchoolName: "울산산업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0,
		},
		{
			SchoolName: "울산산업고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 40, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0}},
		},
		// ============ 울산미용예술고 ============
		{
			SchoolName: "울산미용예술고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0,
		},
		{
			SchoolName: "울산미용예술고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 40, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0}},
		},
		// ============ 울산기술공업고 ============
		{
			SchoolName: "울산기술공업고", TrackName: "일반",
			TotalMax: 100, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 80, AttendanceMax: 20, AbsencePenalty: 2, VolunteerMax: 0,
		},
		{
			SchoolName: "울산기술공업고", TrackName: "취업희망자",
			TotalMax: 80, Semesters: []string{"1_2", "2_1", "2_2", "3_1"},
			AllSubjectMax: 40, AttendanceMax: 30, AbsencePenalty: 3, VolunteerMax: 10,
			VolunteerTable: []VolunteerTier{{12, 10}, {10, 8}, {8, 6}, {6, 4}, {4, 2}, {0, 0}},
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
	return "" // 가중치 과목 아님
}

// parseStudentFullData 학생의 원시 데이터를 파싱하여 StudentFullData 생성
func parseStudentFullData(s StudentExcelData) (*StudentFullData, error) {
	result := &StudentFullData{
		ClassNum:       s.ClassNum,
		StudentNum:     s.StudentNum,
		Name:           s.Name,
		SemesterScores: make(map[string][]int),
		SubjectScores:  make(map[string]map[string][]int),
		ExtraData:      make(map[string]bool),
	}

	// 교과 성적 파싱
	var records []map[string]string
	if s.RawData != "" {
		json.Unmarshal([]byte(s.RawData), &records)
	}

	freeSemesters := make(map[string]bool)

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
			if strings.Contains(cleanK, "학년") {
				grade = cleanV
			} else if strings.Contains(cleanK, "학기") {
				sem = cleanV
			} else if strings.Contains(cleanK, "성취도") {
				achieveRaw = cleanV
			} else if strings.Contains(cleanK, "과목") {
				subjectName = cleanV
			}
		}

		if grade == "" || sem == "" || achieveRaw == "" {
			continue
		}

		key := grade + "_" + sem
		achieve := string(achieveRaw[0])

		if achieve == "P" {
			freeSemesters[key] = true
			continue
		}

		score := 0
		switch achieve {
		case "A": score = 5
		case "B": score = 4
		case "C": score = 3
		case "D": score = 2
		case "E": score = 1
		default: continue
		}

		result.SemesterScores[key] = append(result.SemesterScores[key], score)

		// 가중치 과목 분류
		category := classifySubject(subjectName)
		if category != "" {
			if result.SubjectScores[category] == nil {
				result.SubjectScores[category] = make(map[string][]int)
			}
			result.SubjectScores[category][key] = append(result.SubjectScores[category][key], score)
		}
	}

	// 자유학기 처리: 해당 학기를 제거
	for k := range freeSemesters {
		delete(result.SemesterScores, k)
		for cat := range result.SubjectScores {
			delete(result.SubjectScores[cat], k)
		}
	}

	// 전과목 평균 성취도 계산
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
		var attendanceMap map[string]int
		json.Unmarshal([]byte(s.AttendanceData), &attendanceMap)
		result.AbsenceDays = attendanceMap["absence"]
		// 지각/조퇴/결과 3회 = 결석 1일
		tardyDays := (attendanceMap["late"] + attendanceMap["early"] + attendanceMap["result"]) / 3
		result.AbsenceDays += tardyDays
	}

	// 봉사 파싱
	if s.VolunteerData != "" {
		var volunteerMap map[string]int
		json.Unmarshal([]byte(s.VolunteerData), &volunteerMap)
		result.VolunteerHours = volunteerMap["total_time"]
	}

	// 수기 입력 가산점 및 추가 봉사시간 파싱
	result.ExtraJSON = s.ExtraData
	if s.ExtraData != "" {
		var extraMap map[string]interface{}
		if err := json.Unmarshal([]byte(s.ExtraData), &extraMap); err == nil {
			for k, v := range extraMap {
				if k == "add_volunteer" {
					if vf, ok := v.(float64); ok {
						result.AddVolunteerHours = int(vf)
					}
				} else if vb, ok := v.(bool); ok {
					result.ExtraData[k] = vb
				}
			}
		}
	}
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
		WeightedDetails: make(map[string]float64),
	}

	// === 1. 전과목 점수 ===
	if len(rule.SemesterWeights) > 0 {
		// 학기별 차등 가중치 (현대공고)
		var totalWeightedAvg float64
		for _, sem := range rule.Semesters {
			scores := student.SemesterScores[sem]
			if len(scores) == 0 {
				continue
			}
			avg := calcAverage(scores)
			weight := rule.SemesterWeights[sem]
			totalWeightedAvg += (avg / 5.0) * weight
		}
		result.AllSubjectScore = roundToTwoDecimals(totalWeightedAvg * rule.AllSubjectMax)
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
	result.AttendanceScore = math.Max(0, rule.AttendanceMax-float64(student.AbsenceDays)*rule.AbsencePenalty)
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

	// === 5. 총점 합산 ===
	result.TotalScore = roundToTwoDecimals(
		result.AllSubjectScore + result.WeightedScore +
		result.AttendanceScore + result.VolunteerScore,
	)

	return result
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
