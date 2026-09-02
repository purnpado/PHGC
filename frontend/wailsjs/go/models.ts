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

}

