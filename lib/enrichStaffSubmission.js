// Fill missing territory / institution on staff submission rows from the
// logged-in teacher's assigned school so ministry L2 queues match country scope.
export function enrichStaffRows(rows, ctx) {
  if (!ctx || !Array.isArray(rows)) return rows || [];
  return rows.map((row) => ({
    ...row,
    ...(ctx.countryName ? { territory: ctx.countryName } : {}),
    ...(ctx.schoolName ? { institution: ctx.schoolName } : {}),
  }));
}

export function enrichEnrolmentMeta(meta, ctx) {
  if (!ctx || !meta) return meta || {};
  return {
    ...meta,
    ...(ctx.countryName ? { territory: ctx.countryName } : {}),
    ...(ctx.schoolName ? { institution: ctx.schoolName } : {}),
  };
}
