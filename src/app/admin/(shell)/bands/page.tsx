import { Badge, Card, CardTitle, Field, Input, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/admin/form-bits";
import { requireAdmin } from "@/lib/auth/admin-session";
import { db } from "@/lib/db";
import { saveBandAction } from "@/modules/admin/actions";

export const dynamic = "force-dynamic";

export default async function BandsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const s = await requireAdmin();
  const { edit } = await searchParams;
  const bands = await db.band.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { performances: true, consents: true } } } });
  const editing = edit ? bands.find((b) => b.id === edit) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <Card>
        <CardTitle>Bandas ({bands.length})</CardTitle>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-fg-subtle"><tr><th>Nombre</th><th>Género</th><th>Presentaciones</th><th>Seguidores</th><th></th></tr></thead>
          <tbody className="divide-y divide-border">
            {bands.map((b) => (
              <tr key={b.id}>
                <td className="py-2 font-semibold">{b.name} {b.isTribute && <Badge>tributo</Badge>}<div className="font-mono text-xs text-fg-subtle">?ref=band_{b.slug}</div></td>
                <td>{b.genre}</td>
                <td>{b._count.performances}</td>
                <td>{b._count.consents}</td>
                <td className="text-right"><a className="text-cyan underline" href={`?edit=${b.id}`}>editar</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <CardTitle>{editing ? `Editar: ${editing.name}` : "Nueva banda"}</CardTitle>
        <ActionForm action={saveBandAction} key={editing?.id ?? "new"}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Nombre"><Input name="name" defaultValue={editing?.name} required /></Field>
          <Field label="Género"><Input name="genre" defaultValue={editing?.genre ?? ""} /></Field>
          <Field label="Ciudad"><Input name="city" defaultValue={editing?.city ?? ""} /></Field>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" name="isTribute" defaultChecked={editing?.isTribute} /> Banda tributo</label>
          <Field label="Descripción"><Textarea name="description" defaultValue={editing?.description ?? ""} /></Field>
          <Field label="Imagen (URL)"><Input name="imageUrl" defaultValue={editing?.imageUrl ?? ""} /></Field>
          <Field label="Instagram"><Input name="instagram" defaultValue={editing?.instagram ?? ""} /></Field>
          <Field label="TikTok"><Input name="tiktok" defaultValue={editing?.tiktok ?? ""} /></Field>
          <Field label="Spotify"><Input name="spotify" defaultValue={editing?.spotify ?? ""} /></Field>
          <Field label="YouTube"><Input name="youtube" defaultValue={editing?.youtube ?? ""} /></Field>
          <Field label="Correo de contacto"><Input name="contactEmail" type="email" defaultValue={editing?.contactEmail ?? ""} /></Field>
          <Field label="Teléfono de contacto"><Input name="contactPhone" defaultValue={editing?.contactPhone ?? ""} /></Field>
        </ActionForm>
      </Card>
    </div>
  );
}
