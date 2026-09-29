import { Badge, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/admin/form-bits";
import { hasRole, requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { createUserAction, savePersonAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const s = await requireAdmin();
  const { edit } = await searchParams;
  const [people, users] = await Promise.all([
    db.person.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" }, include: { assignments: { include: { event: true } } } }),
    db.user.findMany({ where: { organizationId: s.organizationId }, include: { roles: true }, orderBy: { name: "asc" } }),
  ]);
  const editing = edit ? people.find((p) => p.id === edit) : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardTitle>Jurado y staff (personas)</CardTitle>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Nombre</th><th>Contacto</th><th>Eventos</th><th></th></tr></thead>
            <tbody className="divide-y divide-border">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 font-semibold">{p.name}</td>
                  <td className="text-fg-muted">{p.email} {p.phone}</td>
                  <td>{p.assignments.map((a) => <Badge key={a.id} tone={a.group === "JUDGE" ? "cyan" : "neutral"} className="mr-1">{a.group} · {a.event.name}</Badge>)}</td>
                  <td className="text-right"><a className="text-cyan underline" href={`?edit=${p.id}`}>editar</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>{editing ? "Editar persona" : "Nueva persona"}</CardTitle>
          <ActionForm action={savePersonAction} key={editing?.id ?? "new"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Nombre"><Input name="name" defaultValue={editing?.name} required /></Field>
            <Field label="Correo"><Input name="email" type="email" defaultValue={editing?.email ?? ""} /></Field>
            <Field label="Teléfono / WhatsApp"><Input name="phone" defaultValue={editing?.phone ?? ""} /></Field>
            <Field label="Notas"><Textarea name="notes" defaultValue={editing?.notes ?? ""} /></Field>
          </ActionForm>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardTitle>Usuarios administrativos</CardTitle>
          <ul className="divide-y divide-border text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex justify-between py-2"><span>{u.name} <span className="text-fg-subtle">{u.email}</span></span><span>{u.roles.map((r) => <Badge key={r.id} className="ml-1">{r.role}{r.eventId ? " (evento)" : ""}</Badge>)}</span></li>
            ))}
          </ul>
        </Card>
        {hasRole(s, "ORGANIZATION_ADMIN") && (
          <Card>
            <CardTitle>Nuevo usuario</CardTitle>
            <ActionForm action={createUserAction} submitLabel="Crear usuario">
              <Field label="Nombre"><Input name="name" required /></Field>
              <Field label="Correo"><Input name="email" type="email" required /></Field>
              <Field label="Contraseña (≥10)"><Input name="password" type="password" required minLength={10} /></Field>
              <Field label="Rol"><Select name="role"><option>EVENT_MANAGER</option><option>STAGE_OPERATOR</option><option>STAFF_COORDINATOR</option><option>ORGANIZATION_ADMIN</option></Select></Field>
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
