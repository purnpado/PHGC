package main

import "testing"

func TestSpecialHighSchoolFirstStageMaximumScores(t *testing.T) {
	student := &StudentFullData{
		SemesterScores: map[string][]int{
			"1_2": {5, 5}, "2_1": {5, 5}, "2_2": {5, 5}, "3_1": {5, 5},
		},
		NonArtSemesterScores: map[string][]int{
			"1_2": {5, 5}, "2_1": {5, 5}, "2_2": {5, 5}, "3_1": {5, 5},
		},
		ArtPenaltyBySemester: map[string]float64{},
		TotalVolunteerHours:  12,
		HasSeptAbsence:       true,
		HasOctAbsence:        true,
	}

	want := map[string]float64{
		"울산상업고/일반":      100,
		"울산상업고/취업희망자":   60,
		"울산여자상업고/일반":    100,
		"울산여자상업고/취업희망자": 80,
		"울산생활과학고/일반":    100,
		"울산생활과학고/취업희망자": 50,
		"울산공업고/일반":      100,
		"울산공업고/취업희망자":   50,
		"울산산업고/일반":      100,
		"울산산업고/취업희망자":   60,
		"울산미용예술고/일반":    100,
		"울산미용예술고/취업희망자": 50,
		"울산기술공업고/일반":    100,
		"울산기술공업고/취업희망자": 100,
	}

	for _, rule := range AllSchoolRules {
		key := rule.SchoolName + "/" + rule.TrackName
		expected, ok := want[key]
		if !ok {
			continue
		}
		got := calculateForSchool(student, rule).TotalScore
		if got != expected {
			t.Errorf("%s: 만점 학생 1차 점수 = %.2f, want %.2f", key, got, expected)
		}
		delete(want, key)
	}
	for key := range want {
		t.Errorf("규칙을 찾지 못함: %s", key)
	}
}

func TestSpecialHighSchoolAttendanceCutoff(t *testing.T) {
	student := &StudentFullData{
		SemesterScores:       map[string][]int{"1_2": {5}, "2_1": {5}, "2_2": {5}, "3_1": {5}},
		NonArtSemesterScores: map[string][]int{"1_2": {5}, "2_1": {5}, "2_2": {5}, "3_1": {5}},
		ArtPenaltyBySemester: map[string]float64{},
		TotalVolunteerHours:  12,
		SeptAbsenceDays:      1,
		SeptLateEtc:          2,
		HasSeptAbsence:       true,
		OctAbsenceDays:       3,
		OctLateEtc:           2,
		HasOctAbsence:        true,
	}

	for _, rule := range AllSchoolRules {
		if rule.SchoolName == "울산상업고" && rule.TrackName == "취업희망자" {
			if got := calculateForSchool(student, rule).AttendanceScore; got != 27 {
				t.Fatalf("9/30 취업희망 출결 = %.2f, want 27.00", got)
			}
		}
		if rule.SchoolName == "울산상업고" && rule.TrackName == "일반" {
			if got := calculateForSchool(student, rule).AttendanceScore; got != 14 {
				t.Fatalf("10/31 일반 출결 = %.2f, want 14.00", got)
			}
		}
	}
}
