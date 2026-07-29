'use server'

import { cache } from "react"
import { getStudentDashboardData } from "./dashboard"

export const getStudentOverview = cache(async () => {
  const full = await getStudentDashboardData()
  return {
    profileMissing: full.profileMissing,
    user: {
      id: full.user.id,
      fullName: full.user.fullName,
      email: full.user.email,
      profileImageUrl: full.user.profileImageUrl,
      rollNo: full.user.rollNo,
      campusName: full.user.campusName,
      campusCity: full.user.campusCity,
      className: full.user.className,
      classTeacher: full.user.classTeacher,
      subjects: full.user.subjects,
      attendanceRate: full.user.attendanceRate,
      balanceDue: full.user.balanceDue,
      aiInsights: full.user.aiInsights,
      marks: full.user.marks,
    },
  }
})

export const getStudentCourseworkData = cache(async () => {
  const full = await getStudentDashboardData()
  return { subjects: full.user.subjects, marks: full.user.marks }
})

export const getStudentScheduleData = cache(async () => {
  const full = await getStudentDashboardData()
  return {
    attendance: full.user.attendance,
    className: full.user.className,
    classTeacher: full.user.classTeacher,
    subjects: full.user.subjects,
    fullName: full.user.fullName,
    rollNo: full.user.rollNo,
    campusName: full.user.campusName,
    attendanceRate: full.user.attendanceRate,
  }
})

export const getStudentReportsData = cache(async () => {
  const full = await getStudentDashboardData()
  return { reportCards: full.user.reportCards }
})

export const getStudentFeesData = cache(async () => {
  const full = await getStudentDashboardData()
  return { invoices: full.user.invoices, balanceDue: full.user.balanceDue }
})
