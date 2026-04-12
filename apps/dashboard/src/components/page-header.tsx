export function PageHeader({
  title,
  description,
  chip,
}: {
  title: string;
  description: string;
  chip: string;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-chip">{chip}</div>
    </header>
  );
}
