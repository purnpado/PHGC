package main

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
)

// SubjectRecord 파싱된 과목 성적 1개
type SubjectRecord struct {
	Grade      string // 학년 (1, 2, 3)
	Semester   string // 학기 (1, 2)
	Subject    string // 과목
	AchieveStr string // 성취도(수강자수) 예: "A(150)", "P"
}

// StudentCalcResult 가산출된 학생 성적 결과
type StudentCalcResult struct {
	ClassNum   int
	StudentNum string
	Name       string
	
	S11 float64
	S12 float64
	S13 float64
	S21 float64
	S22 float64
	
	TotalSubjectScore float64 // 5개 학기 합산
	Percentile        float64 // 백분율
	FinalScore        float64 // 160 - 0.96 * 백분율
}

// CalculateGrades 전체 학생들의 내신 성적을 계산하여 석차 및 최종 점수를 반환
func CalculateGrades(allStudents map[int][]StudentExcelData, isSmallSchool bool) ([]StudentCalcResult, error) {
	var results []StudentCalcResult

	// 1. 개별 학생의 교과 성적 산출 (S11 ~ S22)
	for _, students := range allStudents {
		for _, s := range students {
			calc, err := calcSingleStudent(s)
			if err != nil {
				// 에러 시 무시하거나 0점 처리
				continue
			}
			results = append(results, calc)
		}
	}

	// 2. 총점(TotalSubjectScore) 기준으로 정렬하여 석차 구하기
	// (동점자 처리: S22(가산출) > S21 > S13 > S12)
	sort.Slice(results, func(i, j int) bool {
		a, b := results[i], results[j]
		if math.Abs(a.TotalSubjectScore - b.TotalSubjectScore) > 0.0001 {
			return a.TotalSubjectScore > b.TotalSubjectScore
		}
		// 총점이 같을 경우 동점자 우선순위
		if math.Abs(a.S22 - b.S22) > 0.0001 {
			return a.S22 > b.S22
		}
		if math.Abs(a.S21 - b.S21) > 0.0001 {
			return a.S21 > b.S21
		}
		if math.Abs(a.S13 - b.S13) > 0.0001 {
			return a.S13 > b.S13
		}
		return a.S12 > b.S12
	})

	// 3. 백분율 및 최종 교과점수 산출
	totalStudents := len(results)
	if totalStudents == 0 {
		return nil, fmt.Errorf("계산할 학생 데이터가 없습니다")
	}

	for i := range results {
		rank := float64(i + 1)
		
		// 동점자 처리: 이전 학생과 점수가 완전히 같으면 같은 등수 부여
		if i > 0 {
			prev := results[i-1]
			curr := results[i]
			if math.Abs(prev.TotalSubjectScore-curr.TotalSubjectScore) < 0.0001 &&
			   math.Abs(prev.S22-curr.S22) < 0.0001 &&
			   math.Abs(prev.S21-curr.S21) < 0.0001 &&
			   math.Abs(prev.S13-curr.S13) < 0.0001 &&
			   math.Abs(prev.S12-curr.S12) < 0.0001 {
				// 같은 등수 찾기 (동석차)
				// 실제 등수는 i+1 이지만, 화면상 표시나 백분율에 쓰일 등수는 prev의 등수를 따라야 할 수도 있음.
				// 울산 지침상 동점자가 발생할 수 있으나, 여기서는 안전하게 i번째 등수를 그대로 쓰거나 
				// 엄격한 동점자 처리가 필요하다면 로직 보강 필요 (우선순위 규정을 적용했으므로 대부분 갈라짐)
			}
		}

		baseCount := float64(totalStudents)
		if isSmallSchool && totalStudents < 10 {
			baseCount = 10.0 // 소인수 학교 10명 보정
		}

		// 석차 백분율 = (개인석차 / 재적수) * 100 (소수 셋째자리 반올림)
		percentile := (rank / baseCount) * 100
		percentile = roundToTwoDecimals(percentile)

		// 160 - (0.96 * 백분율) (소수 셋째자리 반올림)
		finalScore := 160.0 - (0.96 * percentile)
		finalScore = roundToTwoDecimals(finalScore)

		results[i].Percentile = percentile
		results[i].FinalScore = finalScore
	}

	return results, nil
}

// calcSingleStudent 학생 1명의 5개 학기 교과 점수 산출
func calcSingleStudent(s StudentExcelData) (StudentCalcResult, error) {
	var records []map[string]string
	err := json.Unmarshal([]byte(s.RawData), &records)
	
	res := StudentCalcResult{
		ClassNum:   s.ClassNum,
		StudentNum: s.StudentNum,
		Name:       s.Name,
	}

	if err != nil {
		return res, err
	}

	// 학기별로 과목 성적 분류
	// grade_semester -> list of achievement strings
	semesters := make(map[string][]int)
	freeSemesters := make(map[string]bool)

	for _, rec := range records {
		var grade, sem, achieveRaw string
		for k, v := range rec {
			cleanK := strings.ReplaceAll(k, " ", "")
			if strings.Contains(cleanK, "학년") {
				grade = strings.TrimSpace(v)
			} else if strings.Contains(cleanK, "학기") {
				sem = strings.TrimSpace(v)
			} else if strings.Contains(cleanK, "성취도") {
				achieveRaw = strings.TrimSpace(v)
			}
		}
		
		if grade == "" || sem == "" || achieveRaw == "" {
			continue
		}

		key := grade + "_" + sem

		// 성취도 추출 (예: "A(123)" -> "A")
		achieve := string(achieveRaw[0])
		
		if achieve == "P" {
			freeSemesters[key] = true
			continue // P는 점수 산출에서 제외
		}

		score := 0
		switch achieve {
		case "A": score = 5
		case "B": score = 4
		case "C": score = 3
		case "D": score = 2
		case "E": score = 1
		default:
			// 성취도가 아닌 원점수만 있는 예체능이나 기타 과목은 제외 (울산 지침 확인 필요, 보통 A-E)
			continue
		}
		
		semesters[key] = append(semesters[key], score)
	}

	// S11: 1학년 중 자유학기가 아닌 학기
	s11Scores := []int{}
	if !freeSemesters["1_1"] && len(semesters["1_1"]) > 0 {
		s11Scores = semesters["1_1"]
	} else if !freeSemesters["1_2"] && len(semesters["1_2"]) > 0 {
		s11Scores = semesters["1_2"]
	}
	res.S11 = calcSemesterScore(s11Scores, 5.44)

	// S12: 2학년 1학기
	res.S12 = calcSemesterScore(semesters["2_1"], 5.44)

	// S13: 2학년 2학기
	res.S13 = calcSemesterScore(semesters["2_2"], 5.44)

	// S21: 3학년 1학기
	res.S21 = calcSemesterScore(semesters["3_1"], 7.84)

	// S22: 3학년 2학기 (성적이 없으므로 S21 미러링)
	res.S22 = res.S21
	
	// 소수 셋째자리 반올림 (5개 학기 모두 합산)
	res.TotalSubjectScore = roundToTwoDecimals(res.S11 + res.S12 + res.S13 + res.S21 + res.S22)

	return res, nil
}

// calcSemesterScore (학기 성취점수 총합 / 이수과목 수) * 비율 (소수 셋째자리 반올림 불가 - 지침상 최종만 하는지 중간도 하는지, 여기선 중간 소수유지)
// 수정: 울산 지침에 따르면 각 학기별 산출 후 최종 합산시 반올림. S21, S22도 마찬가지.
func calcSemesterScore(scores []int, ratio float64) float64 {
	if len(scores) == 0 {
		return 0
	}
	sum := 0
	for _, s := range scores {
		sum += s
	}
	val := (float64(sum) / float64(len(scores))) * ratio
	// 울산 지침상 S11 등 각 학기 점수에 대한 반올림 규정이 없다면そのまま 사용, 있다면 여기서 반올림.
	// 일반적으로 소수 셋째자리에서 반올림 적용.
	return roundToTwoDecimals(val)
}

func roundToTwoDecimals(val float64) float64 {
	return math.Round(val*100) / 100
}
