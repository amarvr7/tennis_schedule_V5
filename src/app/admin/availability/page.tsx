import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildCollectionSummary } from "@/lib/availability/collection";
import {
  CHANNEL_LABELS,
  REQUEST_STATUS_LABELS,
  type AvailabilityCollection,
  type AvailabilityRequest,
  type RequestStatus,
} from "@/lib/availability/types";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { formatWeekRange } from "@/lib/schedule/grid";
import { createClient } from "@/lib/supabase/server";

import { CloseCollectionForm } from "./AvailabilityActions";
import { ResendButton } from "./ResendButton";

export const metadata = {
  title: "Availability · IMG Academy Tennis",
};

const formatTimestamp = (value: string | null): string =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const statusVariant = (
  status: RequestStatus,
): "default" | "secondary" | "destructive" | "outline" => {
  if (status === "responded") return "default";
  if (status === "no_response") return "destructive";
  return "outline";
};

const AvailabilityAdminPage = async () => {
  await requireAdminCoach();
  const supabase = createClient();

  const { data: collection } = await supabase
    .from("availability_collections")
    .select("id, week_start_date, status, opened_at, closed_at")
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle<AvailabilityCollection>();

  if (!collection) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Availability collection</h1>
          <p className="text-sm text-muted-foreground">
            No collections yet. The Monday cron opens a new window automatically.
          </p>
        </header>
      </div>
    );
  }

  const { data: requestRows } = await supabase
    .from("availability_requests")
    .select(
      `id, collection_id, coach_id, channel, token, sent_at, reminder_count, last_reminded_at, responded_at, status,
       coach:coaches ( full_name )`,
    )
    .eq("collection_id", collection.id)
    .order("status");

  type RequestRow = AvailabilityRequest & { coach?: { full_name: string } };

  const requests: RequestRow[] = (requestRows ?? []).map((row) => {
    const coachRaw = row.coach as { full_name: string } | { full_name: string }[] | null;
    const coach = Array.isArray(coachRaw) ? coachRaw[0] : coachRaw ?? undefined;
    return {
      id: row.id,
      collection_id: row.collection_id,
      coach_id: row.coach_id,
      channel: row.channel,
      token: row.token,
      sent_at: row.sent_at,
      reminder_count: row.reminder_count,
      last_reminded_at: row.last_reminded_at,
      responded_at: row.responded_at,
      status: row.status,
      coach,
    };
  });

  const summary = buildCollectionSummary(collection, requests);
  const isOpen = collection.status === "open";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Availability collection</h1>
          <p className="text-sm text-muted-foreground">
            Week of {formatWeekRange(collection.week_start_date)} ·{" "}
            <Badge variant={isOpen ? "outline" : "secondary"}>
              {isOpen ? "Open" : "Closed"}
            </Badge>
          </p>
        </div>
        <CloseCollectionForm disabled={!isOpen} />
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold text-foreground">{summary.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Responded</p>
          <p className="text-2xl font-semibold text-primary">{summary.responded}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="text-2xl font-semibold text-foreground">{summary.pending}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Response rate</p>
          <p className="text-2xl font-semibold text-foreground">{summary.responseRatePct}%</p>
        </Card>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Coach</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Reminders</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="pl-4 font-medium text-foreground">
                  {request.coach?.full_name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {CHANNEL_LABELS[request.channel] ?? request.channel}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTimestamp(request.sent_at)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {request.reminder_count > 0
                    ? `${request.reminder_count} · ${formatTimestamp(request.last_reminded_at)}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(request.status)}>
                    {REQUEST_STATUS_LABELS[request.status]}
                  </Badge>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <ResendButton
                    requestId={request.id}
                    disabled={!isOpen || request.status === "responded"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default AvailabilityAdminPage;
