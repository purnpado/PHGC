package main

import (
	"os"
	"path/filepath"
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
