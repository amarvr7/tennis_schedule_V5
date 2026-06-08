import { ReportsDashboard } from "./ReportsDashboard";
import { loadReportsData } from "./actions";

export const metadata = {
  title: "Reports · IMG Academy Tennis",
};

type PageProps = {
  searchParams: { week?: string };
};

const ReportsPage = async ({ searchParams }: PageProps) => {
  const data = await loadReportsData(searchParams.week);

  return <ReportsDashboard data={data} />;
};

export default ReportsPage;
