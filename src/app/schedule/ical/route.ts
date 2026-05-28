import { type NextRequest, NextResponse } from "next/server";

import { getCurrentCoach } from "@/lib/auth/getCurrentCoach";
import { createClient } from "@/lib/supabase/server";
import { normalizeWeekStart, formatWeekRange } from "@/lib/schedule/grid";
import { buildWeekIcs, icsFileName } from "@/lib/schedule/ical";
import { buildMyWeek } from "@/lib/schedule/myWeek";
import { loadMyAssignments } from "../queries";

/**
 * GET /schedule/ical?week=YYYY-MM-DD
 * Streams the signed-in coach's published week as a downloadable .ics file.
 * RLS guarantees the assignments belong to the caller.
 */
export const GET = async (request: NextRequest) => {
  const coach = await getCurrentCoach();
  if (!coach) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const weekParam = request.nextUrl.searchParams.get("week");
  const weekStartDate = normalizeWeekStart(weekParam);

  const supabase = createClient();
  const { rows } = await loadMyAssignments(supabase, weekStartDate);

  const sessions = buildMyWeek(rows).flatMap((day) => day.sessions);
  const calendarName = `${coach.full_name} — ${formatWeekRange(weekStartDate)}`;
  const ics = buildWeekIcs(sessions, weekStartDate, calendarName);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(weekStartDate)}"`,
      "Cache-Control": "no-store",
    },
  });
};
