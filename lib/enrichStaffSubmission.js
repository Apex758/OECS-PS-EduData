// Fill missing territory / institution on staff submission rows from the
// logged-in teacher's assigned school so ministry L2 queues match country scope.
export function enrichStaffRows(rows, ctx) {
  if (!ctx || !Array.isArray(rows)) return rows || [];
  return rows.map((row) => {
    const next = { ...row };
    if (!String(next.territory || "").trim() && ctx.countryName) {
      next.territory = ctx.countryName;
    }
    if (!String(next.institution || "").trim() && ctx.schoolName) {
      next.institution = ctx.schoolName;
    }
    return next;
  });
}

export function enrichEnrolmentMeta(meta, ctx) {
  if (!ctx || !meta) return meta || {};
  const next = { ...meta };
  if (!String(next.territory || "").trim() && ctx.countryName) {
    next.territory = ctx.countryName;
  }
  if (!String(next.institution || "").trim() && ctx.schoolName) {
    next.institution = ctx.schoolName;
  }
  return next;
}
