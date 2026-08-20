import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Actor {
  id: string;
  label: string;
}

export function ActivityFilters({
  actors,
  actions,
  current,
}: {
  actors: Actor[];
  actions: { value: string; label: string }[];
  current: { actor?: string; action?: string; from?: string; to?: string };
}) {
  return (
    <form method="get" className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="actor" className="text-xs">
          Acteur
        </Label>
        <Select id="actor" name="actor" defaultValue={current.actor ?? ""}>
          <option value="">Tous</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="action" className="text-xs">
          Action
        </Label>
        <Select id="action" name="action" defaultValue={current.action ?? ""}>
          <option value="">Toutes</option>
          {actions.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="from" className="text-xs">
          Depuis le
        </Label>
        <Input id="from" name="from" type="date" defaultValue={current.from ?? ""} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to" className="text-xs">
          Jusqu&rsquo;au
        </Label>
        <Input id="to" name="to" type="date" defaultValue={current.to ?? ""} />
      </div>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
        <Button type="submit" variant="secondary" size="sm">
          Filtrer
        </Button>
        <a href="/admin/activity" className="text-xs text-foreground-subtle underline hover:text-foreground">
          Réinitialiser
        </a>
      </div>
    </form>
  );
}
