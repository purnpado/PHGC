export namespace main {

	export class ApplicationRecord {
	    id: number;
	    classNum: number;
	    studentNum: string;
	    studentName: string;
	    admissionYear: number;
	    category: string;
	    schoolName: string;
	    track: string;
	    status: string;
	    score: number;
	    scoreBasis: string;
	    preferences: string[];
	    assignedDepartment: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new ApplicationRecord(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.classNum = source["classNum"];
	        this.studentNum = source["studentNum"];
	        this.studentName = source["studentName"];
	        this.admissionYear = source["admissionYear"];
	        this.category = source["category"];
	        this.schoolName = source["schoolName"];
	        this.track = source["track"];
	        this.status = source["status"];
	        this.score = source["score"];
	        this.scoreBasis = source["scoreBasis"];
	        this.preferences = source["preferences"];
	        this.assignedDepartment = source["assignedDepartment"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ApplicationSummary {
	    admissionYear: number;
	    category: string;
	    schoolName: string;
	    track: string;
	    department: string;
	    preferenceRank: number;
	    plannedCount: number;
	    submittedCount: number;
	    acceptedCount: number;
	    rejectedCount: number;
	    finalCount: number;
	    minAcceptedScore: number;
	    maxAcceptedScore: number;
	    avgAcceptedScore: number;
	    maxRejectedScore: number;
	    minExpectedScore: number;
	    maxExpectedScore: number;
	    avgExpectedScore: number;

	    static createFrom(source: any = {}) {
	        return new ApplicationSummary(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.admissionYear = source["admissionYear"];
	        this.category = source["category"];
	        this.schoolName = source["schoolName"];
	        this.track = source["track"];
	        this.department = source["department"];
	        this.preferenceRank = source["preferenceRank"];
	        this.plannedCount = source["plannedCount"];
	        this.submittedCount = source["submittedCount"];
	        this.acceptedCount = source["acceptedCount"];
	        this.rejectedCount = source["rejectedCount"];
	        this.finalCount = source["finalCount"];
	        this.minAcceptedScore = source["minAcceptedScore"];
	        this.maxAcceptedScore = source["maxAcceptedScore"];
	        this.avgAcceptedScore = source["avgAcceptedScore"];
	        this.maxRejectedScore = source["maxRejectedScore"];
	        this.minExpectedScore = source["minExpectedScore"];
	        this.maxExpectedScore = source["maxExpectedScore"];
	        this.avgExpectedScore = source["avgExpectedScore"];
	    }
	}
	export class CutoffInfo {
	    year: number;
	    schoolName: string;
	    department: string;
	    track: string;
	    scoreType: string;
	    maxValue: number;
	    minValue: number;
	    avgValue: number;

	    static createFrom(source: any = {}) {
	        return new CutoffInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.year = source["year"];
	        this.schoolName = source["schoolName"];
	        this.department = source["department"];
	        this.track = source["track"];
	        this.scoreType = source["scoreType"];
	        this.maxValue = source["maxValue"];
	        this.minValue = source["minValue"];
	        this.avgValue = source["avgValue"];
	    }
	}
	export class ExpectedSupportAggregate {
	    admissionYear: number;
	    category: string;
	    targetSchool: string;
	    department: string;
	    track: string;
	    preferenceRank: number;
	    plannedCount: number;
	    submittedCount: number;

	    static createFrom(source: any = {}) {
	        return new ExpectedSupportAggregate(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.admissionYear = source["admissionYear"];
	        this.category = source["category"];
	        this.targetSchool = source["targetSchool"];
	        this.department = source["department"];
	        this.track = source["track"];
	        this.preferenceRank = source["preferenceRank"];
	        this.plannedCount = source["plannedCount"];
	        this.submittedCount = source["submittedCount"];
	    }
	}
	export class FeedbackIssue {
	    issue_id: number;
	    title: string;
	    status: string;
	    created_at: string;

	    static createFrom(source: any = {}) {
	        return new FeedbackIssue(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.issue_id = source["issue_id"];
	        this.title = source["title"];
	        this.status = source["status"];
	        this.created_at = source["created_at"];
	    }
	}
	export class HighSchool {
	    name: string;
	    type: string;
	    area: string;
	    note: string;
	    departments: string[];

	    static createFrom(source: any = {}) {
	        return new HighSchool(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.area = source["area"];
	        this.note = source["note"];
	        this.departments = source["departments"];
	    }
	}
	export class HighSchoolData {
	    updatedAt: string;
	    description: string;
	    schools: HighSchool[];

	    static createFrom(source: any = {}) {
	        return new HighSchoolData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.updatedAt = source["updatedAt"];
	        this.description = source["description"];
	        this.schools = this.convertValues(source["schools"], HighSchool);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LoginAccount {
	    username: string;
	    role: string;
	    classNum: number;

	    static createFrom(source: any = {}) {
	        return new LoginAccount(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.username = source["username"];
	        this.role = source["role"];
	        this.classNum = source["classNum"];
	    }
	}
	export class LoginIndex {
	    schoolName: string;
	    accounts: LoginAccount[];

	    static createFrom(source: any = {}) {
	        return new LoginIndex(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolName = source["schoolName"];
	        this.accounts = this.convertValues(source["accounts"], LoginAccount);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OfficialAdmissionData {
	    items: any[];

	    static createFrom(source: any = {}) {
	        return new OfficialAdmissionData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = source["items"];
	    }
	}
	export class PatchChange {
	    classNum: number;
	    studentNum: string;
	    studentName: string;
	    attendance?: string;
	    volunteer?: string;
	    extra?: string;
	    applications?: ApplicationRecord[];

	    static createFrom(source: any = {}) {
	        return new PatchChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.classNum = source["classNum"];
	        this.studentNum = source["studentNum"];
	        this.studentName = source["studentName"];
	        this.attendance = source["attendance"];
	        this.volunteer = source["volunteer"];
	        this.extra = source["extra"];
	        this.applications = this.convertValues(source["applications"], ApplicationRecord);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PatchPreview {
	    path: string;
	    sourceUsername: string;
	    classNum: number;
	    changeCount: number;
	    studentNames: string[];
	    baseRevision: number;
	    currentRevision: number;
	    hasRevisionConflict: boolean;

	    static createFrom(source: any = {}) {
	        return new PatchPreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.sourceUsername = source["sourceUsername"];
	        this.classNum = source["classNum"];
	        this.changeCount = source["changeCount"];
	        this.studentNames = source["studentNames"];
	        this.baseRevision = source["baseRevision"];
	        this.currentRevision = source["currentRevision"];
	        this.hasRevisionConflict = source["hasRevisionConflict"];
	    }
	}
	export class SchoolCalcResult {
	    schoolName: string;
	    trackName: string;
	    totalMax: number;
	    allSubjectScore: number;
	    allSubjectMax: number;
	    weightedScore: number;
	    weightedMax: number;
	    weightedDetails: Record<string, number>;
	    attendanceScore: number;
	    attendanceMax: number;
	    volunteerScore: number;
	    volunteerMax: number;
	    leadershipScore: number;
	    leadershipMax: number;
	    extraScore: number;
	    totalScore: number;

	    static createFrom(source: any = {}) {
	        return new SchoolCalcResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolName = source["schoolName"];
	        this.trackName = source["trackName"];
	        this.totalMax = source["totalMax"];
	        this.allSubjectScore = source["allSubjectScore"];
	        this.allSubjectMax = source["allSubjectMax"];
	        this.weightedScore = source["weightedScore"];
	        this.weightedMax = source["weightedMax"];
	        this.weightedDetails = source["weightedDetails"];
	        this.attendanceScore = source["attendanceScore"];
	        this.attendanceMax = source["attendanceMax"];
	        this.volunteerScore = source["volunteerScore"];
	        this.volunteerMax = source["volunteerMax"];
	        this.leadershipScore = source["leadershipScore"];
	        this.leadershipMax = source["leadershipMax"];
	        this.extraScore = source["extraScore"];
	        this.totalScore = source["totalScore"];
	    }
	}
	export class SchoolConfig {
	    schoolName: string;
	    classCount: number;
	    isSmallSchool: boolean;
	    admissionYear: number;

	    static createFrom(source: any = {}) {
	        return new SchoolConfig(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolName = source["schoolName"];
	        this.classCount = source["classCount"];
	        this.isSmallSchool = source["isSmallSchool"];
	        this.admissionYear = source["admissionYear"];
	    }
	}
	export class SetupRequest {
	    schoolName: string;
	    classCount: number;
	    adminPassword: string;
	    sharedDataPassword: string;
	    isSmallSchool: boolean;
	    admissionYear: number;

	    static createFrom(source: any = {}) {
	        return new SetupRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolName = source["schoolName"];
	        this.classCount = source["classCount"];
	        this.adminPassword = source["adminPassword"];
	        this.sharedDataPassword = source["sharedDataPassword"];
	        this.isSmallSchool = source["isSmallSchool"];
	        this.admissionYear = source["admissionYear"];
	    }
	}
	export class StudentCalcResult {
	    ClassNum: number;
	    StudentNum: string;
	    Name: string;
	    S11: number;
	    S12: number;
	    S13: number;
	    S21: number;
	    S22: number;
	    TotalSubjectScore: number;
	    Rank: number;
	    TotalStudents: number;
	    Percentile: number;
	    FinalScore: number;
	    AttendanceScore: number;
	    VolunteerScore: number;
	    BehaviorScore: number;
	    CreativeScore: number;
	    NonAcademicScore: number;
	    GeneralTotalScore: number;
	    GeneralDataComplete: boolean;
	    GeneralProjected: boolean;

	    static createFrom(source: any = {}) {
	        return new StudentCalcResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ClassNum = source["ClassNum"];
	        this.StudentNum = source["StudentNum"];
	        this.Name = source["Name"];
	        this.S11 = source["S11"];
	        this.S12 = source["S12"];
	        this.S13 = source["S13"];
	        this.S21 = source["S21"];
	        this.S22 = source["S22"];
	        this.TotalSubjectScore = source["TotalSubjectScore"];
	        this.Rank = source["Rank"];
	        this.TotalStudents = source["TotalStudents"];
	        this.Percentile = source["Percentile"];
	        this.FinalScore = source["FinalScore"];
	        this.AttendanceScore = source["AttendanceScore"];
	        this.VolunteerScore = source["VolunteerScore"];
	        this.BehaviorScore = source["BehaviorScore"];
	        this.CreativeScore = source["CreativeScore"];
	        this.NonAcademicScore = source["NonAcademicScore"];
	        this.GeneralTotalScore = source["GeneralTotalScore"];
	        this.GeneralDataComplete = source["GeneralDataComplete"];
	        this.GeneralProjected = source["GeneralProjected"];
	    }
	}
	export class StudentFullData {
	    classNum: number;
	    studentNum: string;
	    name: string;
	    allAverage: number;
	    semesterScores: Record<string, Array<number>>;
	    subjectScores: Record<string, any>;
	    absenceDays: number;
	    rawAbsenceDays: number;
	    rawLateCount: number;
	    rawEarlyCount: number;
	    rawResultCount: number;
	    septAbsenceDays: number;
	    septLateEtc: number;
	    hasSeptAbsence: boolean;
	    octAbsenceDays: number;
	    octLateEtc: number;
	    hasOctAbsence: boolean;
	    volunteerHours: number;
	    addVolunteerHours: number;
	    totalVolunteerHours: number;
	    leadershipTerms: number;
	    extraData: Record<string, boolean>;
	    extraPoints: number;
	    extraJSON: string;
	    generalHSPercentile: number;
	    generalHSLevel: string;
	    generalHSAcademicScore: number;
	    generalHSNonAcademicScore: number;
	    generalHSTotalScore: number;
	    generalHSDataComplete: boolean;
	    generalHSProjected: boolean;
	    schoolResults: SchoolCalcResult[];

	    static createFrom(source: any = {}) {
	        return new StudentFullData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.classNum = source["classNum"];
	        this.studentNum = source["studentNum"];
	        this.name = source["name"];
	        this.allAverage = source["allAverage"];
	        this.semesterScores = source["semesterScores"];
	        this.subjectScores = source["subjectScores"];
	        this.absenceDays = source["absenceDays"];
	        this.rawAbsenceDays = source["rawAbsenceDays"];
	        this.rawLateCount = source["rawLateCount"];
	        this.rawEarlyCount = source["rawEarlyCount"];
	        this.rawResultCount = source["rawResultCount"];
	        this.septAbsenceDays = source["septAbsenceDays"];
	        this.septLateEtc = source["septLateEtc"];
	        this.hasSeptAbsence = source["hasSeptAbsence"];
	        this.octAbsenceDays = source["octAbsenceDays"];
	        this.octLateEtc = source["octLateEtc"];
	        this.hasOctAbsence = source["hasOctAbsence"];
	        this.volunteerHours = source["volunteerHours"];
	        this.addVolunteerHours = source["addVolunteerHours"];
	        this.totalVolunteerHours = source["totalVolunteerHours"];
	        this.leadershipTerms = source["leadershipTerms"];
	        this.extraData = source["extraData"];
	        this.extraPoints = source["extraPoints"];
	        this.extraJSON = source["extraJSON"];
	        this.generalHSPercentile = source["generalHSPercentile"];
	        this.generalHSLevel = source["generalHSLevel"];
	        this.generalHSAcademicScore = source["generalHSAcademicScore"];
	        this.generalHSNonAcademicScore = source["generalHSNonAcademicScore"];
	        this.generalHSTotalScore = source["generalHSTotalScore"];
	        this.generalHSDataComplete = source["generalHSDataComplete"];
	        this.generalHSProjected = source["generalHSProjected"];
	        this.schoolResults = this.convertValues(source["schoolResults"], SchoolCalcResult);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StudentTranscriptData {
	    classNum: number;
	    studentNum: string;
	    name: string;
	    subjectRecords: any[];
	    attendanceRaw: string;
	    volunteerRaw: string;
	    allAverage: number;
	    percentile: number;
	    rank: number;
	    totalStudents: number;

	    static createFrom(source: any = {}) {
	        return new StudentTranscriptData(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.classNum = source["classNum"];
	        this.studentNum = source["studentNum"];
	        this.name = source["name"];
	        this.subjectRecords = source["subjectRecords"];
	        this.attendanceRaw = source["attendanceRaw"];
	        this.volunteerRaw = source["volunteerRaw"];
	        this.allAverage = source["allAverage"];
	        this.percentile = source["percentile"];
	        this.rank = source["rank"];
	        this.totalStudents = source["totalStudents"];
	    }
	}
	export class SyncResult {
	    success: boolean;
	    message: string;
	    schoolCount: number;
	    hasUpdate: boolean;
	    latestVersion: string;
	    currentVersion: string;
	    releaseNotes: string;
	    downloadUrl: string;

	    static createFrom(source: any = {}) {
	        return new SyncResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.message = source["message"];
	        this.schoolCount = source["schoolCount"];
	        this.hasUpdate = source["hasUpdate"];
	        this.latestVersion = source["latestVersion"];
	        this.currentVersion = source["currentVersion"];
	        this.releaseNotes = source["releaseNotes"];
	        this.downloadUrl = source["downloadUrl"];
	    }
	}
	export class User {
	    ID: number;
	    Username: string;
	    PasswordHash: string;
	    Role: string;
	    ClassNum: number;
	    MustChangePassword: boolean;

	    static createFrom(source: any = {}) {
	        return new User(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Username = source["Username"];
	        this.PasswordHash = source["PasswordHash"];
	        this.Role = source["Role"];
	        this.ClassNum = source["ClassNum"];
	        this.MustChangePassword = source["MustChangePassword"];
	    }
	}

}
