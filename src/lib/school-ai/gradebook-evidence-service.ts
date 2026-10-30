import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { assertSchoolAiAccess,assertWorkspacePermission,assertWorkspaceSubject,loadWorkspacePermissionSnapshot } from "./access";
import { ApiError } from "@/lib/api/scope";
import { gradebookPublicationSchema } from "./exam-gradebook";
import { frozenMarkMaximum,legacyExamMetrics } from "./gradebook-evidence";
/** Called only after current curriculum, subject and student/exam permissions are checked. */
export async function moderatedGradebookEvidence(user:AuthUser,scope:{campusId:string;classId:string;subjectId:string},students:Array<{id:string;fullName:string;rollNo:string}>,tx:TxClient){
 const actor=await tx.user.findFirst({where:{id:user.userId,schoolId:user.schoolId,campusId:user.campusId,role:user.role,isActive:true},select:{accessVersion:true}});if(!actor||user.accessVersion!==undefined&&actor.accessVersion!==user.accessVersion||user.role!=="SUPER_ADMIN"&&user.campusId!==scope.campusId)throw new ApiError("Your access changed. Sign in again.",403);
 const permissions=await loadWorkspacePermissionSnapshot(user,tx);await assertSchoolAiAccess(user,"view",permissions);for(const permissionModule of ["exams","students","reports"] as const)await assertWorkspacePermission(user,permissionModule,"view",permissions);await assertWorkspaceSubject(user,scope.campusId,scope,tx);
 const cls=await tx.class.findFirst({where:{id:scope.classId,schoolId:user.schoolId,campusId:scope.campusId},select:{academicYear:true}});if(!cls)throw new ApiError("The class is unavailable.",404);
 const exams=await tx.exam.findMany({where:{schoolId:user.schoolId,campusId:scope.campusId,classId:scope.classId,academicYear:cls.academicYear,isLocked:true,status:{in:["PRINCIPAL_REVIEWED","PUBLISHED"]},reviewedBy:{not:null},reviewedAt:{not:null},OR:[{subjectId:null},{subjectId:scope.subjectId}]},select:{id:true,title:true,term:true,academicYear:true,examType:true,status:true,reviewedBy:true,reviewedAt:true,publishedAt:true},orderBy:[{reviewedAt:"desc"},{id:"asc"}],take:201});if(exams.length>200)throw new ApiError("This gradebook scope exceeds 200 moderated exams. Narrow the academic scope.",422);
 const filter={schoolId:user.schoolId,campusId:scope.campusId,examId:{in:exams.map(row=>row.id)},studentId:{in:students.map(row=>row.id)}};
 const [marks,reports,imports]=await Promise.all([
  tx.mark.findMany({where:{...filter,subjectId:scope.subjectId},select:{id:true,examId:true,studentId:true,subjectId:true,marksObtained:true,isAbsent:true,isExempt:true,correctionVersion:true,enteredBy:true},take:5001}),
  tx.reportCard.findMany({where:filter,select:{id:true,examId:true,studentId:true,versions:{where:{schoolId:user.schoolId,approvedAt:{not:null},approvedBy:{not:null}},orderBy:{number:"desc"},take:1,select:{id:true,number:true,snapshot:true,approvedAt:true}}},take:5001}),
  tx.schoolAiExamAssignment.findMany({where:{schoolId:user.schoolId,campusId:scope.campusId,classId:scope.classId,paper:{subjectId:scope.subjectId},gradebookPublication:{not:Prisma.DbNull}},select:{gradebookPublication:true},take:501}),
 ]);
 if(marks.length>5000||reports.length>5000||imports.length>500)throw new ApiError("This gradebook scope exceeds the evidence limit. Narrow the academic scope.",422);
 const importedIds=new Set(imports.flatMap(row=>{const parsed=gradebookPublicationSchema.safeParse(row.gradebookPublication);return parsed.success&&parsed.data.subjectId===scope.subjectId?parsed.data.rows.map(mark=>mark.markId):[];}));
 const reviewerIds=[...new Set(exams.flatMap(row=>row.reviewedBy?[row.reviewedBy]:[]))],reviewers=await tx.user.findMany({where:{schoolId:user.schoolId,id:{in:reviewerIds}},select:{id:true,fullName:true}});
 return{academicYear:cls.academicYear,subjectId:scope.subjectId,exams:exams.map(exam=>{
  const examMarks=marks.filter(row=>row.examId===exam.id),imported=examMarks.filter(row=>importedIds.has(row.id)).length;
  const rows=examMarks.filter(mark=>!importedIds.has(mark.id)).map(mark=>{const learner=students.find(row=>row.id===mark.studentId)!,report=reports.find(row=>row.examId===exam.id&&row.studentId===mark.studentId),version=report?.versions[0],maximum=frozenMarkMaximum(mark,version?.snapshot);return{markId:mark.id,correctionVersion:mark.correctionVersion,studentId:mark.studentId,fullName:learner.fullName,rollNo:learner.rollNo,state:mark.isExempt?"EXEMPT" as const:mark.isAbsent?"ABSENT" as const:"SCORED" as const,marks:mark.marksObtained,maximum,percentage:maximum&&!mark.isAbsent&&!mark.isExempt?Math.round(mark.marksObtained/maximum*1000)/10:null,report:maximum&&version?{id:report!.id,versionId:version.id,version:version.number,approvedAt:version.approvedAt!.toISOString()}:null};});
  return{...exam,reviewedAt:exam.reviewedAt!.toISOString(),publishedAt:exam.publishedAt?.toISOString()??null,reviewer:reviewers.find(row=>row.id===exam.reviewedBy)?.fullName??null,metrics:legacyExamMetrics(rows,students.length,imported),rows};
 })};
}
export type GradebookEvidence=Awaited<ReturnType<typeof moderatedGradebookEvidence>>;
