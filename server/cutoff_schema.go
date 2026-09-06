package main

import (
	"crypto/sha256"
	"fmt"
	"strings"
)

// PublicCutoff is the complete and exclusive central-collection schema.
// Student, class, teacher, account and device fields are deliberately absent.
type PublicCutoff struct {
	AdmissionYear          int     `json:"admissionYear"`
	SourceMiddleSchoolName string  `json:"sourceMiddleSchoolName"`
	TargetHighSchoolName   string  `json:"targetHighSchoolName"`
	Department             string  `json:"department"`
	CutoffScore            float64 `json:"cutoffScore"`
}

type CutoffSubmission struct {
	AdmissionYear int            `json:"admissionYear"`
	Items         []PublicCutoff `json:"items"`
}

func validatePublicCutoffs(items []PublicCutoff, requiredYear int) ([]PublicCutoff, error) {
	if requiredYear < 2000 || requiredYear > 2100 || len(items) == 0 {
		return nil, fmt.Errorf("입학년도와 커트라인 자료를 확인해주세요")
	}
	clean := make([]PublicCutoff, 0, len(items))
	seen := make(map[string]struct{})
	for _, item := range items {
		item.AdmissionYear = requiredYear
		item.SourceMiddleSchoolName = strings.TrimSpace(item.SourceMiddleSchoolName)
		item.TargetHighSchoolName = strings.TrimSpace(item.TargetHighSchoolName)
		item.Department = strings.TrimSpace(item.Department)
		if item.SourceMiddleSchoolName == "" || item.TargetHighSchoolName == "" || item.CutoffScore < 0 {
			return nil, fmt.Errorf("중학교명, 고등학교명, 커트라인 점수를 확인해주세요")
		}
		if len([]rune(item.SourceMiddleSchoolName)) > 100 || len([]rune(item.TargetHighSchoolName)) > 100 || len([]rune(item.Department)) > 100 {
			return nil, fmt.Errorf("학교명 또는 학과명이 너무 깁니다")
		}
		key := item.SourceMiddleSchoolName + "\x00" + item.TargetHighSchoolName + "\x00" + item.Department
		if _, ok := seen[key]; ok {
			return nil, fmt.Errorf("동일한 고등학교·학과 커트라인이 중복되어 있습니다")
		}
		seen[key] = struct{}{}
		clean = append(clean, item)
	}
	return clean, nil
}

func cutoffSubmissionPath(year int, middleSchool string) string {
	digest := sha256.Sum256([]byte(middleSchool))
	return fmt.Sprintf("server-data/cutoffs/%d_%x.json", year, digest[:12])
}
