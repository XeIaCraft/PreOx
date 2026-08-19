import { getCurrentProfile } from "@/lib/auth/dal";
import { getATableData } from "@/lib/a-table/dal";
import { ATableBoard } from "@/components/a-table/board";
import { ToastProvider } from "@/components/ui/toast";

export default async function ATablePage() {
  const profile = (await getCurrentProfile())!;
  const data = await getATableData(profile.id);

  return (
    <ToastProvider>
      <ATableBoard initialData={data} />
    </ToastProvider>
  );
}
