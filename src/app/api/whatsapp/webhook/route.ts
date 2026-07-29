import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { generateAIDraft } from "@/lib/ai/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "skoolee-webhook-verify";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const entries = body?.entry;
    if (!Array.isArray(entries)) return Response.json({ status: "ok" });

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) continue;

      for (const change of changes) {
        if (change?.field !== "messages") continue;
        const messages = change?.value?.messages;
        if (!Array.isArray(messages)) continue;

        for (const msg of messages) {
          if (msg.type !== "text") continue;
          const from = msg.from as string;
          const text = (msg.text?.body || "") as string;
          if (!from || !text) continue;

          await handleParentMessage(from, text);
        }
      }
    }

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "ok" });
  }
}

async function handleParentMessage(phone: string, message: string) {
  const normalizedPhone = phone.replace(/^\+/, "");

  const student = await prisma.student.findFirst({
    where: {
      OR: [
        { guardianWhatsapp: { contains: normalizedPhone } },
        { guardianPhone: { contains: normalizedPhone } },
      ],
    },
    include: {
      class: { select: { name: true, section: true } },
      campus: { select: { name: true, schoolId: true } },
      reportCards: {
        orderBy: { generatedAt: "desc" },
        take: 3,
        include: {
          exam: { select: { title: true, term: true, academicYear: true } },
        },
      },
      marks: {
        take: 10,
        include: {
          subject: { select: { name: true, totalMarks: true } },
          exam: { select: { title: true } },
        },
      },
      attendance: {
        orderBy: { date: "desc" },
        take: 30,
      },
    },
  });

  if (!student) {
    await sendWhatsAppMessage({
      to: phone,
      text:
        "Assalamu Alaikum! SkooleeAI system mein aapka number kisi student se linked nahi hai. " +
        "Baraaye meherbani school administration se rabta karein.\n\n" +
        "Your number is not linked to any student in our system. Please contact your school administration.",
    });
    return;
  }

  const presentCount = student.attendance.filter((a) => a.status === "PRESENT").length;
  const totalAttendance = student.attendance.length;
  const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : null;

  const marksContext = student.marks
    .map((m) => `${m.subject.name} (${m.exam.title}): ${m.marksObtained}/${m.subject.totalMarks}`)
    .join("\n");

  const reportContext = student.reportCards
    .map(
      (r) =>
        `${r.exam.title} (${r.exam.term} ${r.exam.academicYear}): ${r.percentage.toFixed(1)}% - Grade ${r.grade || "N/A"} - Rank ${r.rank || "N/A"}`
    )
    .join("\n");

  const context = [
    `Student: ${student.fullName}`,
    `Class: ${[student.class.name, student.class.section].filter(Boolean).join(" - ")}`,
    `School: ${student.campus.name}`,
    `Roll No: ${student.rollNo}`,
    attendanceRate !== null ? `Recent Attendance: ${attendanceRate}% (last ${totalAttendance} days)` : "",
    marksContext ? `\nRecent Marks:\n${marksContext}` : "",
    reportContext ? `\nReport Cards:\n${reportContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateAIDraft({
      system:
        "You are SkooleeAI, a school information assistant replying to a parent via WhatsApp. " +
        "Reply in Urdu (Roman Urdu script) with English terms for academic words. " +
        "Be warm, respectful, and concise. Use the student data provided to answer. " +
        "If the parent asks something not in the data, politely say you don't have that information and suggest contacting the school. " +
        "Keep the response under 300 words. Start with 'Assalamu Alaikum'.",
      prompt: `Parent's message: "${message}"\n\nStudent Data:\n${context}`,
      temperature: 0.5,
      maxTokens: 400,
    });

    await sendWhatsAppMessage({ to: phone, text: result.text });

    await prisma.parentCommunication.create({
      data: {
        schoolId: student.campus.schoolId,
        studentId: student.id,
        campusId: student.campusId,
        channel: "WHATSAPP",
        templateKey: "WHATSAPP_CHATBOT",
        recipient: phone,
        body: message,
        status: "DELIVERED",
        metadata: {
          direction: "INBOUND",
          phone,
          responseContent: result.text,
          aiModel: result.model,
          tokensUsed: result.tokensUsed,
        },
      },
    });
  } catch {
    await sendWhatsAppMessage({
      to: phone,
      text:
        "Muafi chahte hain, is waqt jawab dene mein masla aa raha hai. " +
        "Baraaye meherbani thodi der baad dubara koshish karein ya school se rabta karein.\n\n" +
        "Sorry, we're unable to process your request right now. Please try again later or contact the school.",
    });
  }
}
