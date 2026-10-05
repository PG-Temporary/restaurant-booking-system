// <option> lists for half-hour pickers.
export function timeOptions(): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export function TimeSelect({ name, defaultValue, anyLabel }: { name: string; defaultValue?: string; anyLabel: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""}>
      <option value="">{anyLabel}</option>
      {timeOptions().map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}
