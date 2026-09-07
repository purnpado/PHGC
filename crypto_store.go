package main

// 암호화 저장 포맷의 기반 구현이다. Windows 계정·기기 키를 사용하지 않고,
// 전달 가능한 공용 데이터 잠금 비밀번호만으로 파일을 암복호화한다.

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"golang.org/x/crypto/argon2"
)

const encryptedFileMagic = "PHGC-GCM-1"

type encryptedFileHeader struct {
	Magic string `json:"magic"`
	Salt  []byte `json:"salt"`
	Nonce []byte `json:"nonce"`
}

// DataManifest is intentionally non-sensitive: it only identifies the
// encrypted package format and carries the random password-derivation salt.
type DataManifest struct {
	Format        string `json:"format"`
	Salt          []byte `json:"salt"`
	PackageID     string `json:"packageId"`
	Revision      int    `json:"revision"`
	AdmissionYear int    `json:"admissionYear"`
}

// PatchChange is the class-scoped mutation that a homeroom teacher may export.
// It is encrypted and merged only by the grade head on an offline computer.
// Application records never leave the school through the central server.
type PatchChange struct {
	ClassNum     int                 `json:"classNum"`
	StudentNum   string              `json:"studentNum"`
	StudentName  string              `json:"studentName"`
	Attendance   string              `json:"attendance,omitempty"`
	Volunteer    string              `json:"volunteer,omitempty"`
	Extra        string              `json:"extra,omitempty"`
	Applications []ApplicationRecord `json:"applications,omitempty"`
}

type PatchFile struct {
	PackageID      string        `json:"packageId"`
	BaseRevision   int           `json:"baseRevision"`
	SourceUsername string        `json:"sourceUsername"`
	ClassNum       int           `json:"classNum"`
	Changes        []PatchChange `json:"changes"`
}

// UserKeyEnvelope lets a teacher unlock the shared package with a personal
// password after completing the one-time shared-password onboarding.
type UserKeyEnvelope struct {
	Username string `json:"username"`
	Salt     []byte `json:"salt"`
	Nonce    []byte `json:"nonce"`
	Data     []byte `json:"data"`
}

// PasswordResetPackage contains only the encrypted account/configuration
// snapshot needed to reset a teacher's local login.  It intentionally never
// contains a class database or plaintext student information.
type PasswordResetPackage struct {
	Format         string `json:"format"`
	Username       string `json:"username"`
	ConfigDatabase []byte `json:"configDatabase"`
}

func sealDataKeyForUser(username, personalPassword string, dataKey []byte) (UserKeyEnvelope, error) {
	salt, nonce := make([]byte, 16), make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return UserKeyEnvelope{}, err
	}
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return UserKeyEnvelope{}, err
	}
	block, err := aes.NewCipher(deriveDataKey(personalPassword, salt))
	if err != nil {
		return UserKeyEnvelope{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return UserKeyEnvelope{}, err
	}
	data := gcm.Seal(nil, nonce, dataKey, []byte(username))
	return UserKeyEnvelope{Username: username, Salt: salt, Nonce: nonce, Data: data}, nil
}

func openDataKeyForUser(envelope UserKeyEnvelope, personalPassword string) ([]byte, error) {
	block, err := aes.NewCipher(deriveDataKey(personalPassword, envelope.Salt))
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, envelope.Nonce, envelope.Data, []byte(envelope.Username))
}

func userEnvelopePath(dataDir, username string) string {
	return filepath.Join(dataDir, "keys", username+".json")
}

func sharedEnvelopePath(dataDir string) string { return filepath.Join(dataDir, "shared-key.json") }

func saveSharedKeyEnvelope(dataDir, sharedPassword string, dataKey []byte) error {
	envelope, err := sealDataKeyForUser("shared-data", sharedPassword, dataKey)
	if err != nil {
		return err
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return os.WriteFile(sharedEnvelopePath(dataDir), data, 0600)
}

func openSharedKeyEnvelope(dataDir, sharedPassword string) ([]byte, error) {
	data, err := os.ReadFile(sharedEnvelopePath(dataDir))
	if err != nil {
		return nil, err
	}
	var envelope UserKeyEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return nil, err
	}
	if envelope.Username != "shared-data" {
		return nil, fmt.Errorf("공용 데이터 잠금 정보가 올바르지 않습니다")
	}
	return openDataKeyForUser(envelope, sharedPassword)
}

func saveUserKeyEnvelope(dataDir string, envelope UserKeyEnvelope) error {
	if envelope.Username == "" {
		return fmt.Errorf("사용자명이 없습니다")
	}
	if err := os.MkdirAll(filepath.Dir(userEnvelopePath(dataDir, envelope.Username)), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return writePrivateFileAtomically(userEnvelopePath(dataDir, envelope.Username), data)
}

// writePrivateFileAtomically prevents a password change from leaving a
// half-written key envelope behind if the program is closed or the computer
// loses power during the write.
func writePrivateFileAtomically(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func loadUserKeyEnvelope(dataDir, username string) (UserKeyEnvelope, error) {
	data, err := os.ReadFile(userEnvelopePath(dataDir, username))
	if err != nil {
		return UserKeyEnvelope{}, err
	}
	var envelope UserKeyEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return UserKeyEnvelope{}, err
	}
	if envelope.Username != username {
		return UserKeyEnvelope{}, fmt.Errorf("사용자 잠금 정보가 일치하지 않습니다")
	}
	return envelope, nil
}

func manifestPath(dataDir string) string { return filepath.Join(dataDir, "manifest.json") }

func deriveDataKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
}

func newDataKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	return key, nil
}

func encryptFileGCM(password, sourcePath, encryptedPath string) error {
	plain, err := os.ReadFile(sourcePath)
	if err != nil {
		return err
	}
	salt, nonce := make([]byte, 16), make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return err
	}
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	block, err := aes.NewCipher(deriveDataKey(password, salt))
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	header, err := json.Marshal(encryptedFileHeader{Magic: encryptedFileMagic, Salt: salt, Nonce: nonce})
	if err != nil {
		return err
	}
	ciphertext := gcm.Seal(nil, nonce, plain, header)
	return os.WriteFile(encryptedPath, append(append(header, '\n'), ciphertext...), 0600)
}

func decryptFileGCM(password, encryptedPath, destinationPath string) error {
	payload, err := os.ReadFile(encryptedPath)
	if err != nil {
		return err
	}
	var header encryptedFileHeader
	separator := 0
	for separator < len(payload) && payload[separator] != '\n' {
		separator++
	}
	if separator == len(payload) {
		return fmt.Errorf("암호화 파일 형식이 올바르지 않습니다")
	}
	head := payload[:separator]
	if err := json.Unmarshal(head, &header); err != nil || header.Magic != encryptedFileMagic {
		return fmt.Errorf("암호화 파일 형식이 올바르지 않습니다")
	}
	block, err := aes.NewCipher(deriveDataKey(password, header.Salt))
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	plain, err := gcm.Open(nil, header.Nonce, payload[separator+1:], head)
	if err != nil {
		return fmt.Errorf("데이터 잠금 비밀번호가 올바르지 않거나 파일이 손상되었습니다")
	}
	return os.WriteFile(destinationPath, plain, 0600)
}

func encryptPatchGCM(password string, patch PatchFile, path string) error {
	plain, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	temporary := path + ".plain"
	if err := os.WriteFile(temporary, plain, 0600); err != nil {
		return err
	}
	defer os.Remove(temporary)
	return encryptFileGCM(password, temporary, path)
}

func decryptPatchGCM(password, path string) (PatchFile, error) {
	temporary := path + ".plain"
	defer os.Remove(temporary)
	if err := decryptFileGCM(password, path, temporary); err != nil {
		return PatchFile{}, err
	}
	plain, err := os.ReadFile(temporary)
	if err != nil {
		return PatchFile{}, err
	}
	var patch PatchFile
	if err := json.Unmarshal(plain, &patch); err != nil {
		return PatchFile{}, err
	}
	return patch, nil
}

// sealDatabaseFile replaces a plaintext SQLite file with an AES-256-GCM
// package. The plaintext is removed only after the encrypted file is written.
func sealDatabaseFile(password, dbPath string) (string, error) {
	encryptedPath := dbPath + ".phgc"
	if err := encryptFileGCM(password, dbPath, encryptedPath); err != nil {
		return "", err
	}
	if err := os.Remove(dbPath); err != nil {
		return "", err
	}
	return encryptedPath, nil
}

// unsealDatabaseFile restores a database only to the caller-specified working
// path; it never overwrites an existing encrypted package.
func unsealDatabaseFile(password, encryptedPath, workingPath string) error {
	if _, err := os.Stat(workingPath); err == nil {
		return fmt.Errorf("평문 작업 DB가 이미 존재합니다")
	}
	return decryptFileGCM(password, encryptedPath, workingPath)
}

func removePlainDatabaseArtifacts(dbPath string) {
	for _, suffix := range []string{"", "-wal", "-shm"} {
		_ = os.Remove(dbPath + suffix)
	}
}
