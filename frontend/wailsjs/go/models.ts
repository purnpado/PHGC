export namespace main {
	
	export class CutoffInfo {
	    year: number;
	    schoolName: string;
	    department: string;
	    track: string;
	    scoreType: string;
	    maxValue: number;
	    minValue: number;
	
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
	
	    static createFrom(source: any = {}) {
	        return new HighSchool(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.area = source["area"];
	        this.note = source["note"];
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
	    Percentile: number;
	    FinalScore: number;
	
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
	        this.Percentile = source["Percentile"];
	        this.FinalScore = source["FinalScore"];
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
	    septAbsenceDays: number;
	    hasSeptAbsence: boolean;
	    volunteerHours: number;
	    addVolunteerHours: number;
	    totalVolunteerHours: number;
	    extraData: Record<string, boolean>;
	    extraPoints: number;
	    extraJSON: string;
	    generalHSPercentile: number;
	    generalHSLevel: string;
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
	        this.septAbsenceDays = source["septAbsenceDays"];
	        this.hasSeptAbsence = source["hasSeptAbsence"];
	        this.volunteerHours = source["volunteerHours"];
	        this.addVolunteerHours = source["addVolunteerHours"];
	        this.totalVolunteerHours = source["totalVolunteerHours"];
	        this.extraData = source["extraData"];
	        this.extraPoints = source["extraPoints"];
	        this.extraJSON = source["extraJSON"];
	        this.generalHSPercentile = source["generalHSPercentile"];
	        this.generalHSLevel = source["generalHSLevel"];
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

