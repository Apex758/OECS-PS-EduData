// Blank user-registration template for institutions/ministries to fill and
// return. Ungated on purpose (it's an empty form, no data). Drag the filled
// file into /admin/access to bulk-register.
export const runtime = "nodejs";

export async function GET() {
  const csv =
    [
      "email,name,role,country_iso,school_codes,can_drill",
      "# role: teacher | minister | admin. country_iso: LC | GD | AG (OECS). school_codes: space/comma separated (teachers). can_drill: yes/no (ministers only).",
      "lecturer1@salcc.edu.lc,Jane Doe,teacher,LC,LC-CC,",
      "minister1@gov.gd,John Roe,minister,GD,,yes",
    ].join("\n") + "\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users-template.csv"',
    },
  });
}
