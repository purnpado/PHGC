package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDatabaseSealAndUnsealLifecycle(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{dataDir: dir}
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	dm.setDataKey(key)

	if err := dm.InitConfigDB(); err != nil {
		t.Fatalf("InitConfigDB: %v", err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 2, "hash", false, 2026); err != nil {
		t.Fatalf("SaveSchoolConfig: %v", err)
	}
	if err := dm.SealAllDatabases(); err != nil {
		t.Fatalf("SealAllDatabases: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.db")); !os.IsNotExist(err) {
		t.Fatalf("plaintext config.db must not remain, err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.db.phgc")); err != nil {
		t.Fatalf("encrypted config DB missing: %v", err)
	}

	reopened := &DBManager{dataDir: dir}
	reopened.setDataKey(key)
	if err := reopened.UnsealAllDatabases(); err != nil {
		t.Fatalf("UnsealAllDatabases: %v", err)
	}
	config, err := reopened.GetSchoolConfig()
	if err != nil {
		t.Fatalf("GetSchoolConfig: %v", err)
	}
	if config.SchoolName != "테스트중학교" || config.ClassCount != 2 {
		t.Fatalf("unexpected restored config: %#v", config)
	}
}

func TestChangedPasswordUnlocksEncryptedDataAfterRestart(t *testing.T) {
	dir := t.TempDir()
	app := &App{db: &DBManager{dataDir: dir}}
	if err := app.db.InitConfigDB(); err != nil {
		t.Fatalf("InitConfigDB: %v", err)
	}
	if err := app.SetupApp(SetupRequest{
		SchoolName:         "테스트중학교",
		ClassCount:         1,
		AdminPassword:      "before-change",
		SharedDataPassword: "shared-password",
		AdmissionYear:      2027,
	}); err != nil {
		t.Fatalf("SetupApp: %v", err)
	}
	if _, err := app.UnlockAndLogin("admin", "before-change"); err != nil {
		t.Fatalf("login before password change: %v", err)
	}
	if err := app.ChangeUserPassword("admin", "after-change"); err != nil {
		t.Fatalf("ChangeUserPassword: %v", err)
	}
	if err := app.db.SealAllDatabases(); err != nil {
		t.Fatalf("SealAllDatabases: %v", err)
	}

	// A fresh application instance has no in-memory data key.  This is the
	// same state as launching the program again after a password change.
	restarted := &App{db: &DBManager{dataDir: dir}}
	user, err := restarted.UnlockAndLogin("admin", "after-change")
	if err != nil {
		t.Fatalf("login after restart with changed password: %v", err)
	}
	if user.Username != "admin" || user.MustChangePassword {
		t.Fatalf("unexpected user after password change: %#v", user)
	}
	if _, err := restarted.UnlockAndLogin("admin", "before-change"); err == nil {
		t.Fatal("previous password must not unlock changed account")
	}
}

func TestAdministratorPasswordResetUnlocksEncryptedDataAfterRestart(t *testing.T) {
	dir := t.TempDir()
	app := &App{db: &DBManager{dataDir: dir}}
	if err := app.db.InitConfigDB(); err != nil {
		t.Fatalf("InitConfigDB: %v", err)
	}
	if err := app.SetupApp(SetupRequest{
		SchoolName:         "테스트중학교",
		ClassCount:         1,
		AdminPassword:      "initial-admin-password",
		SharedDataPassword: "shared-password",
		AdmissionYear:      2027,
	}); err != nil {
		t.Fatalf("SetupApp: %v", err)
	}
	if err := app.SetUserPassword("admin", "reset-admin-password"); err != nil {
		t.Fatalf("SetUserPassword(admin): %v", err)
	}
	if err := app.db.SealAllDatabases(); err != nil {
		t.Fatalf("SealAllDatabases: %v", err)
	}

	restarted := &App{db: &DBManager{dataDir: dir}}
	user, err := restarted.UnlockAndLogin("admin", "reset-admin-password")
	if err != nil {
		t.Fatalf("login after administrator reset: %v", err)
	}
	if user.Username != "admin" || user.MustChangePassword {
		t.Fatalf("unexpected administrator after reset: %#v", user)
	}
}

func TestTeacherPasswordResetPackageRestoresLoginWithoutClassDatabase(t *testing.T) {
	adminDir := t.TempDir()
	admin := &App{db: &DBManager{dataDir: adminDir}}
	if err := admin.db.InitConfigDB(); err != nil {
		t.Fatalf("InitConfigDB: %v", err)
	}
	if err := admin.SetupApp(SetupRequest{
		SchoolName:         "테스트중학교",
		ClassCount:         1,
		AdminPassword:      "admin-password",
		SharedDataPassword: "shared-password",
		AdmissionYear:      2027,
	}); err != nil {
		t.Fatalf("SetupApp: %v", err)
	}
	if err := admin.db.SealAllDatabases(); err != nil {
		t.Fatalf("Seal baseline: %v", err)
	}

	// This represents the teacher's existing package.  It deliberately has no
	// class DB copied in this test: the reset flow must only need config/key data.
	teacherDir := t.TempDir()
	copyTestFile(t, filepath.Join(adminDir, "config.db.phgc"), filepath.Join(teacherDir, "config.db.phgc"))
	copyTestFile(t, filepath.Join(adminDir, "shared-key.json"), filepath.Join(teacherDir, "shared-key.json"))

	if err := admin.db.UnsealAllDatabases(); err != nil {
		t.Fatalf("Unseal admin package: %v", err)
	}
	if err := admin.SetUserPassword("301", "teacher-initial-password"); err != nil {
		t.Fatalf("SetUserPassword(301): %v", err)
	}
	resetPath := filepath.Join(adminDir, "PHGC-301-reset.phgcreset")
	if err := admin.ExportPasswordResetPackage("301", resetPath); err != nil {
		t.Fatalf("ExportPasswordResetPackage: %v", err)
	}

	teacher := &App{db: &DBManager{dataDir: teacherDir}}
	username, err := teacher.ImportPasswordResetPackage(resetPath)
	if err != nil {
		t.Fatalf("ImportPasswordResetPackage: %v", err)
	}
	if username != "301" {
		t.Fatalf("unexpected reset username: %q", username)
	}
	user, err := teacher.UnlockSharedAndLogin("301", "teacher-initial-password", "shared-password")
	if err != nil {
		t.Fatalf("teacher login after reset: %v", err)
	}
	if user.Username != "301" || !user.MustChangePassword {
		t.Fatalf("unexpected teacher after reset: %#v", user)
	}
}

func TestApplicationRecordPersistsAndTeacherPatchMerges(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{dataDir: dir}
	dm.setDataKey(make([]byte, 32))
	if err := dm.InitClassDB(301); err != nil {
		t.Fatalf("InitClassDB: %v", err)
	}
	record := ApplicationRecord{
		ClassNum: 301, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027,
		Category: "special", SchoolName: "울산산업고등학교", Track: "일반전형",
		Status: "지원 예정", Score: 81.25, ScoreBasis: "3-1 누적 예상", Preferences: []string{"보건간호과", "식품가공과", "반려동물과", "원예디자인과", "그린스마트팜과"},
	}
	if err := dm.ApplyPatchChange(PatchChange{ClassNum: 301, StudentNum: "1", StudentName: "홍길동", Applications: []ApplicationRecord{record}}); err != nil {
		t.Fatalf("ApplyPatchChange: %v", err)
	}
	records, err := dm.GetStudentApplications(301, "1", "홍길동")
	if err != nil {
		t.Fatalf("GetStudentApplications: %v", err)
	}
	if len(records) != 1 || records[0].SchoolName != "울산산업고등학교" || len(records[0].Preferences) != 5 {
		t.Fatalf("unexpected application records: %#v", records)
	}
	if err := dm.SaveApplication(ApplicationRecord{ClassNum: 301, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027, Category: "general", Status: "지원 예정", Score: 123.45, ScoreBasis: "3-1 누적 예상"}); err != nil {
		t.Fatalf("Save general application: %v", err)
	}
	if err := dm.SaveApplication(ApplicationRecord{ClassNum: 301, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Status: "지원 예정", Preferences: []string{"1", "2", "3", "4", "5", "6"}}); err == nil {
		t.Fatal("more than five department preferences must be rejected")
	}
}

func TestApplicationSummaryCalculatesAcceptedAndRejectedScores(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{dataDir: dir}
	dm.setDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 2, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	for _, classNum := range []int{1, 2} {
		if err := dm.InitClassDB(classNum); err != nil {
			t.Fatal(err)
		}
	}
	entries := []ApplicationRecord{
		{ClassNum: 1, StudentNum: "1", StudentName: "가", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "합격", Score: 82, Preferences: []string{"보건간호과"}},
		{ClassNum: 2, StudentNum: "1", StudentName: "나", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "최종 진학", Score: 86, Preferences: []string{"보건간호과"}},
		{ClassNum: 2, StudentNum: "2", StudentName: "다", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반", Status: "불합격", Score: 88, Preferences: []string{"보건간호과"}},
	}
	for _, entry := range entries {
		if err := dm.SaveApplication(entry); err != nil {
			t.Fatal(err)
		}
	}
	summaries, err := dm.GetApplicationSummaries()
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected one summary, got %#v", summaries)
	}
	s := summaries[0]
	if s.AcceptedCount != 2 || s.RejectedCount != 1 || s.MinAcceptedScore != 82 || s.AvgAcceptedScore != 84 || s.MaxRejectedScore != 88 {
		t.Fatalf("unexpected summary: %#v", s)
	}
}

func TestSelectedTeacherPatchMergeAndExpectedSupportToken(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{dataDir: dir}
	dm.setDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 1, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	app := &App{db: dm}
	token1, err := dm.GetExpectedSupportToken()
	if err != nil || len(token1) < 32 {
		t.Fatalf("expected support token: %q, %v", token1, err)
	}
	token2, err := dm.GetExpectedSupportToken()
	if err != nil || token1 != token2 {
		t.Fatalf("participation token must remain stable: %q / %q, %v", token1, token2, err)
	}
	patchPath := filepath.Join(dir, "teacher.phgcpatch")
	patch := PatchFile{SourceUsername: "301", ClassNum: 1, Changes: []PatchChange{{
		ClassNum: 1, StudentNum: "1", StudentName: "홍길동", Attendance: `{"absence":1}`,
		Applications: []ApplicationRecord{{AdmissionYear: 2027, Category: "self_foreign", SchoolName: "울산외국어고등학교", Status: "지원 예정", Score: 91.5}},
	}}}
	if err := encryptPatchGCM("shared-password", patch, patchPath); err != nil {
		t.Fatal(err)
	}
	preview, err := app.InspectTeacherPatch("shared-password", patchPath)
	if err != nil || len(preview.Items) != 1 || !preview.Items[0].Attendance || !preview.Items[0].Applications {
		t.Fatalf("unexpected patch preview: %#v, %v", preview, err)
	}
	count, err := app.ImportTeacherPatchSelected("shared-password", patchPath, []PatchMergeSelection{{StudentNum: "1", Applications: true}})
	if err != nil || count != 1 {
		t.Fatalf("selected merge: %d, %v", count, err)
	}
	records, err := dm.GetStudentApplications(1, "1", "홍길동")
	if err != nil || len(records) != 1 || records[0].SchoolName != "울산외국어고등학교" {
		t.Fatalf("application-only merge failed: %#v, %v", records, err)
	}
}

func TestTeacherDistributionPackageContainsOnlyTargetData(t *testing.T) {
	masterDir := t.TempDir()
	master := &App{db: &DBManager{dataDir: masterDir}}
	if err := master.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := master.SetupApp(SetupRequest{
		SchoolName:         "배포테스트중학교",
		ClassCount:         2,
		AdminPassword:      "admin-password",
		SharedDataPassword: "shared-password",
		AdmissionYear:      2027,
	}); err != nil {
		t.Fatalf("SetupApp: %v", err)
	}
	if _, err := master.UnlockAndLogin("admin", "admin-password"); err != nil {
		t.Fatalf("master login: %v", err)
	}
	if err := master.SetUserPassword("301", "teacher-initial-password"); err != nil {
		t.Fatalf("set teacher password: %v", err)
	}
	for _, classNum := range []int{1, 2} {
		if err := master.db.InitClassDB(classNum); err != nil {
			t.Fatalf("InitClassDB(%d): %v", classNum, err)
		}
	}
	pkgPath := filepath.Join(masterDir, "PHGC-301.phgcpkg")
	if err := master.ExportDistributionPackage("301", pkgPath); err != nil {
		t.Fatalf("ExportDistributionPackage: %v", err)
	}

	archive, err := zip.OpenReader(pkgPath)
	if err != nil {
		t.Fatal(err)
	}
	entryNames := map[string]bool{}
	for _, entry := range archive.File {
		entryNames[entry.Name] = true
		if strings.HasPrefix(entry.Name, "keys/") {
			t.Fatalf("personal key envelope must not be distributed: %s", entry.Name)
		}
	}
	archive.Close()
	if !entryNames["config.db.phgc"] || !entryNames["class_1.db.phgc"] || entryNames["class_2.db.phgc"] {
		t.Fatalf("unexpected homeroom package entries: %#v", entryNames)
	}

	receiverDir := t.TempDir()
	receiver := &App{db: &DBManager{dataDir: receiverDir}}
	if err := receiver.db.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	username, err := receiver.ImportDistributionPackage(pkgPath)
	if err != nil || username != "301" {
		t.Fatalf("ImportDistributionPackage: %q, %v", username, err)
	}
	if !receiver.NeedsSharedDataPassword("301") {
		t.Fatal("recipient must be enrolled with the shared password on first login")
	}
	user, err := receiver.UnlockSharedAndLogin("301", "teacher-initial-password", "shared-password")
	if err != nil || user.Username != "301" || user.Role != "homeroom" {
		t.Fatalf("recipient first login: %#v, %v", user, err)
	}
	users, err := receiver.db.GetUsers()
	if err != nil || len(users) != 1 || users[0].Username != "301" {
		t.Fatalf("recipient must contain only the target account: %#v, %v", users, err)
	}
}

func TestAdmissionClosureLocksCompletedYearAndAppliesCutoff(t *testing.T) {
	dir := t.TempDir()
	dm := &DBManager{dataDir: dir}
	dm.setDataKey(make([]byte, 32))
	if err := dm.InitConfigDB(); err != nil {
		t.Fatal(err)
	}
	if err := dm.SaveSchoolConfig("테스트중학교", 1, "", false, 2027); err != nil {
		t.Fatal(err)
	}
	if err := dm.InitClassDB(1); err != nil {
		t.Fatal(err)
	}
	record := ApplicationRecord{ClassNum: 1, StudentNum: "1", StudentName: "홍길동", AdmissionYear: 2027, Category: "special", SchoolName: "울산산업고등학교", Track: "일반전형", Status: "지원 완료", Score: 81.25, Preferences: []string{"보건간호과"}}
	if err := dm.SaveApplication(record); err != nil {
		t.Fatal(err)
	}
	if _, err := dm.CloseAdmissionYear(2027, "admin", "결과 확인 전"); err == nil {
		t.Fatal("closing must reject applications still in progress")
	}
	record.Status = "합격"
	record.AssignedDepartment = "보건간호과"
	if err := dm.SaveApplication(record); err != nil {
		t.Fatal(err)
	}
	closure, err := dm.CloseAdmissionYear(2027, "admin", "최종 결과 확정")
	if err != nil {
		t.Fatalf("CloseAdmissionYear: %v", err)
	}
	if closure.Status != "closed" || closure.CutoffsApplied != 1 {
		t.Fatalf("unexpected closure: %#v", closure)
	}
	if err := dm.SaveApplication(record); err == nil {
		t.Fatal("closed admission year must reject edits")
	}
	if err := dm.ReopenAdmissionYear(2027); err != nil {
		t.Fatalf("ReopenAdmissionYear: %v", err)
	}
	record.Status = "최종 진학"
	if err := dm.SaveApplication(record); err != nil {
		t.Fatalf("edit after reopening: %v", err)
	}
	cutoffs, err := dm.GetCutoffs()
	if err != nil || len(cutoffs) == 0 {
		t.Fatalf("result cutoff must be persisted: %#v, %v", cutoffs, err)
	}
}

func copyTestFile(t *testing.T, source, destination string) {
	t.Helper()
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatalf("read %s: %v", source, err)
	}
	if err := os.WriteFile(destination, data, 0600); err != nil {
		t.Fatalf("write %s: %v", destination, err)
	}
}
