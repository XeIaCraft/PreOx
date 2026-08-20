import { getCurrentProfile } from "@/lib/auth/dal";
import { getATableData } from "@/lib/a-table/dal";
import { ATableBoard } from "@/components/a-table/board";
import { ToastProvider } from "@/components/ui/toast";
import { recordAppVisit } from "@/app/actions/discovery";

export default async function ATablePage() {
  const profile = (await getCurrentProfile())!;
  const [data] = await Promise.all([getATableData(profile.id), recordAppVisit("a-table")]);

  return (
    <ToastProvider>
      <ATableBoard initialData={data} />
    </ToastProvider>
  );
}
