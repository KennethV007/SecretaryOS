export function StatCard({
  label,
  value,
  helpText,
}: {
  label: string;
  value: string;
  helpText: string;
}) {
  return (
    <section className="panel">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-help">{helpText}</p>
    </section>
  );
}
