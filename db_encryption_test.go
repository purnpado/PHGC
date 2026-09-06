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
