package main

import "testing"

func TestStudentSchoolScoreCache(t *testing.T) {
	dm := &DBManager{dataDir: t.TempDir()}
	dm.setDataKey(make([]byte, 32))
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	results := []SchoolCalcResult{
		{SchoolName: "울산공업고", TrackName: "일반", TotalScore: 82.5, TotalMax: 100},
		{SchoolName: "울산공업고", TrackName: "취업희망자", TotalScore: 47.25, TotalMax: 50},
	}
	if err := dm.ReplaceStudentSchoolScores(1, "1", "홍길동", results); err != nil {
		t.Fatal(err)
	}
	score, err := dm.GetStudentSchoolScore(1, "1", "홍길동", "울산공업고", "취업희망자")
	if err != nil {
		t.Fatal(err)
	}
	if score.TotalScore != 47.25 || score.TotalMax != 50 {
		t.Fatalf("unexpected cached score: %#v", score)
	}
}

func TestApplicationScoreSnapshotUsesCachedSchoolScore(t *testing.T) {
	dm := &DBManager{dataDir: t.TempDir()}
	dm.setDataKey(make([]byte, 32))
	app := &App{db: dm}
	student := StudentExcelData{
		ClassNum: 1, StudentNum: "1", Name: "홍길동",
		RawData: `[{"학년":"1","학기":"2","과목":"국어","성취도":"A"}]`,
	}
	if err := dm.SaveClassStudents(1, []StudentExcelData{student}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := app.GetStudentApplicationScoreSnapshot(1, "1", "홍길동", "special", "울산공업고등학교", "일반")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Score <= 0 || snapshot.TotalMax != 100 {
		t.Fatalf("unexpected snapshot: %#v", snapshot)
	}
}
