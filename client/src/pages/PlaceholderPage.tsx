export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="board" style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
      <h2 style={{ marginBottom: 8 }}>{title}</h2>
      <p>Этот раздел появится в следующих версиях продукта.</p>
    </div>
  );
}
