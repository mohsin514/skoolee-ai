'use server'

import { cache } from "react"
import { getTeacherDashboardData } from "./dashboard"

export const getTeacherOverview = cache(async () => {
  const full = await getTeacherDashboardData()
  return {
    teacherName: full.teacherName,
    subjects: full.subjects,
    ledClasses: full.ledClasses,
    classHubs: full.classHubs,
    students: full.students,
    exams: full.exams,
    activeExams: full.activeExams,
    lockedExams: full.lockedExams,
    attendanceSummary: full.attendanceSummary,
    recentReportCards: full.recentReportCards,
    totalStudents: full.totalStudents,
    aiInsights: full.aiInsights,
  }
})

export const getTeacherAttendanceData = cache(async () => {
  const full = await getTeacherDashboardData()
  return {
    classHubs: full.classHubs,
    students: full.students,
    attendanceSummary: full.attendanceSummary,
  }
})

export const getTeacherMarksData = cache(async () => {
  const full = await getTeacherDashboardData()
  return {
    classHubs: full.classHubs,
    exams: full.exams,
    activeExams: full.activeExams,
    lockedExams: full.lockedExams,
  }
})

export const getTeacherReportsData = cache(async () => {
  const full = await getTeacherDashboardData()
  return {
    classHubs: full.classHubs,
    exams: full.exams,
    recentReportCards: full.recentReportCards,
  }
})

export const getTeacherAIData = cache(async () => {
  const full = await getTeacherDashboardData()
  return {
    classHubs: full.classHubs,
    subjects: full.subjects,
    attendanceSummary: full.attendanceSummary,
    aiInsights: full.aiInsights,
  }
})
