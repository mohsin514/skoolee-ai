// Only the label formatter is stubbed to keep server-action imports out of the browser fixture.
export function classLabel(value: { name?: string; section?: string; academicYear?: string } | undefined) {
  if (!value) return 'Unassigned';
  const name = [value.name, value.section].filter(Boolean).join(' ');
  return value.academicYear ? `${name} - ${value.academicYear}` : name;
}
