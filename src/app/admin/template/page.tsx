import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { loadTemplateSlots } from "@/lib/schedule/load";
import { WeekTemplate, type TemplateProgramOption, type TemplateZoneOption } from "./WeekTemplate";

export const metadata = {
  title: "Week Template · IMG Academy Tennis",
};

/**
 * Master week template editor (CURSOR_ANSWERS.md Q2): one template per
 * season holding every recurring slot. Creating a week CLONES this template;
 * week edits never change the master, and master edits affect only weeks
 * created afterward.
 */
const WeekTemplatePage = async () => {
  await requireAdminCoach();
  const supabase = createClient();

  const [slots, programsRes, zonesRes] = await Promise.all([
    loadTemplateSlots(supabase),
    supabase.from("programs").select("id, name").order("name"),
    supabase.from("court_zones").select("name, surface").order("name"),
  ]);

  const programs: TemplateProgramOption[] = (programsRes.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));

  const zones: TemplateZoneOption[] = (zonesRes.data ?? []).map((row) => ({
    name: row.name as string,
    surface: (row.surface as string | null) ?? null,
  }));

  return <WeekTemplate slots={slots} programs={programs} zones={zones} />;
};

export default WeekTemplatePage;
